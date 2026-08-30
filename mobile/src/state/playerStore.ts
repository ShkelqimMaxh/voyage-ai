import { Platform } from "react-native";
import { create } from "zustand";

import type { AudioMode, DrivePace, GeoPoint, NarrationScript, Place, PlaceContext, PlayerPhase, Topic } from "../core/types";
import { paceFromSpeed } from "../core/geo";
import { audioMixer } from "../engine/audio/AudioMixer";
import { warmWebSpeech } from "../engine/audio/WebSpeechPlayer";
import { carPlayBridge } from "../engine/carplay/CarPlayBridge";
import { routeCache } from "../engine/cache/RouteCache";
import { GeofenceManager } from "../engine/location/GeofenceManager";
import { locationEngine } from "../engine/location/LocationEngine";
import { PEJA_ISTOG_DURATION_MS, PEJA_ISTOG_ROAD_WAYPOINTS, PEJA_ISTOG_SPEED_MPS } from "../engine/location/pejaIstogDemo";
import { SF_OAKLAND_WAYPOINTS, US_DEMO_DURATION_MS, US_DEMO_SPEED_MPS } from "../engine/location/usDemoRoute";
import { lookaheadPlaces } from "../engine/location/RouteMatcher";
import { roadPlace } from "../engine/scripting/fillScript";
import { scriptService } from "../engine/scripting/ScriptService";
import { ttsService } from "../engine/tts/TtsService";
import { fetchWeather } from "../engine/weather/WeatherService";

const geofence = new GeofenceManager();

interface PlayerState {
  live: boolean;
  demo: boolean;
  audioMode: AudioMode;
  topic: Topic;
  phase: PlayerPhase;
  point: GeoPoint | null;
  context: PlaceContext | null;
  script: NarrationScript | null;
  weather?: string;
  error?: string;
  busy: boolean;
  demoPath: Array<{ latitude: number; longitude: number }>;
  startDemo: (route?: "peja-istog" | "sf-oakland") => Promise<void>;
  startLive: () => Promise<void>;
  stop: () => Promise<void>;
  setTopic: (topic: Topic) => void;
  setAudioMode: (mode: AudioMode) => Promise<void>;
  skipNarration: () => Promise<void>;
  rerollTopic: () => Promise<void>;
  tellMeMore: () => Promise<void>;
  toggleMusic: () => Promise<void>;
  testVoice: () => Promise<void>;
  musicOn: boolean;
}

let unpoint: (() => void) | null = null;
let unphase: (() => void) | null = null;
let uncarplay: (() => void) | null = null;
const previousIds: string[] = [];
const alreadySaid: string[] = [];
const TOPIC_WHEEL: Topic[] = ["culture", "food", "history", "surprise"];
let topicIndex = 0;
let scriptTail: Promise<void> = Promise.resolve();
let hostAlive = false;
let hostEpoch = 0;
let loopRunning = false;
let latestPoint: GeoPoint | null = null;
let pumping = false;

type ReadyClip = { script: NarrationScript; place: Place };

function pickPlace(get: () => PlayerState): Place {
  const context = get().context;
  const current = context?.current ?? null;
  const nearby = (context?.nearby ?? []).filter((item) => item.id !== current?.id);
  if (topicIndex % 4 === 3 && nearby[0]) return nearby[0];
  return roadPlace(get().point, current);
}

function nextTopic(): Topic {
  const topic = TOPIC_WHEEL[topicIndex % TOPIC_WHEEL.length];
  topicIndex += 1;
  return topic;
}

async function buildScript(get: () => PlayerState, place: Place, topic: Topic): Promise<NarrationScript> {
  return scriptService.create({
    place,
    topic,
    pace: paceFromSpeed(get().point?.speedMps),
    weather: get().weather,
    previousPlaceIds: previousIds,
    alreadySaid,
    continuation: alreadySaid.length > 0,
  });
}

function rememberSaid(text: string): void {
  if (!text || alreadySaid.includes(text)) return;
  alreadySaid.push(text);
  if (alreadySaid.length > 12) alreadySaid.shift();
}

async function enqueueScript<T>(work: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const previous = scriptTail;
  scriptTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function prepareClip(get: () => PlayerState, place: Place, topic: Topic): Promise<ReadyClip> {
  const script = await enqueueScript(async () => {
    const next = await withDeadline(buildScript(get, place, topic), 25000);
    rememberSaid(next.spokenText);
    return next;
  });
  const resolved = await ttsService.resolveAudio(script);
  if (!resolved.audioUrl) {
    throw new Error("gemini voice missing");
  }
  if (Platform.OS === "web") {
    void warmWebSpeech(resolved.audioUrl);
  }
  return { script: resolved, place };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("deadline")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function playClip(
  set: (partial: Partial<PlayerState>) => void,
  get: () => PlayerState,
  script: NarrationScript,
  place: Place,
): Promise<void> {
  set({ script, busy: true, error: undefined });
  void carPlayBridge.sync({
    script,
    place,
    nearby: get().context?.nearby ?? [],
    speaking: true,
  });
  try {
    await audioMixer.speak(script);
  } catch {
    // next loop iteration speaks immediately
  }
  rememberSaid(script.spokenText);
  previousIds.push(place.id);
  if (previousIds.length > 8) previousIds.shift();
  set({ busy: false });
}

async function runHostForever(set: (partial: Partial<PlayerState>) => void, get: () => PlayerState): Promise<void> {
  const epoch = hostEpoch;
  if (loopRunning) return;
  loopRunning = true;
  const queue: ReadyClip[] = [];
  let inflight = 0;
  const ahead = 2;

  const prefetch = () => {
    while (inflight + queue.length < ahead && hostAlive && hostEpoch === epoch) {
      inflight += 1;
      const place = pickPlace(get);
      const topic = nextTopic();
      void prepareClip(get, place, topic)
        .then((clip) => {
          if (hostAlive && hostEpoch === epoch) queue.push(clip);
        })
        .catch(() => undefined)
        .finally(() => {
          inflight -= 1;
        });
    }
  };

  prefetch();
  try {
    while (hostAlive && hostEpoch === epoch) {
      prefetch();
      while (hostAlive && hostEpoch === epoch && queue.length === 0) {
        await sleep(120);
        prefetch();
      }
      const clip = queue.shift();
      if (!clip) continue;
      prefetch();
      await playClip(set, get, clip.script, clip.place);
    }
  } finally {
    if (hostEpoch === epoch) loopRunning = false;
  }
}

async function handlePoint(set: (partial: Partial<PlayerState>) => void, get: () => PlayerState, point: GeoPoint): Promise<void> {
  set({ point });
  const context = await locationEngine.context(point);
  set({ context });
  geofence.ingest(point, context.current);
  void carPlayBridge.sync({
    script: get().script,
    place: context.current,
    nearby: lookaheadPlaces(point, context.nearby),
    speaking: audioMixer.speaking,
  });
}

function queuePoint(set: (partial: Partial<PlayerState>) => void, get: () => PlayerState, point: GeoPoint): void {
  latestPoint = point;
  if (pumping) return;
  pumping = true;
  void (async () => {
    try {
      while (latestPoint) {
        const next = latestPoint;
        latestPoint = null;
        await handlePoint(set, get, next);
      }
    } finally {
      pumping = false;
    }
  })();
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  live: false,
  demo: false,
  audioMode: "builtin",
  topic: "surprise",
  phase: "idle",
  point: null,
  context: null,
  script: null,
  weather: undefined,
  error: undefined,
  busy: false,
  musicOn: true,
  demoPath: PEJA_ISTOG_ROAD_WAYPOINTS,

  async startDemo(routeId: "peja-istog" | "sf-oakland" = "peja-istog") {
    await get().stop();
    await audioMixer.prepare(get().audioMode);
    unphase = audioMixer.onPhase((phase) => set({ phase }));
    uncarplay = carPlayBridge.subscribe((command) => {
      if (command.type === "playPause") void get().toggleMusic();
      if (command.type === "skip") void get().skipNarration();
      if (command.type === "reroll") void get().rerollTopic();
      if (command.type === "tellMeMore") void get().tellMeMore();
      if (command.type === "topic") get().setTopic(command.topic);
    });
    geofence.reset();
    routeCache.clear();
    hostEpoch += 1;
    hostAlive = true;
    alreadySaid.length = 0;
    topicIndex = 0;
    scriptTail = Promise.resolve();
    const path = routeId === "sf-oakland" ? SF_OAKLAND_WAYPOINTS : PEJA_ISTOG_ROAD_WAYPOINTS;
    const durationMs = routeId === "sf-oakland" ? US_DEMO_DURATION_MS : PEJA_ISTOG_DURATION_MS;
    const speedMps = routeId === "sf-oakland" ? US_DEMO_SPEED_MPS : PEJA_ISTOG_SPEED_MPS;
    set({ demo: true, live: false, error: undefined, demoPath: path });
    const polyline = path.map((item, index) => ({
      ...item,
      timestamp: Date.now() + index * 1000,
    }));
    void routeCache.prefetch(polyline);
    void fetchWeather(polyline[0]).then((weather) => set({ weather }));
    unpoint = locationEngine.onPoint((point) => queuePoint(set, get, point));
    locationEngine.startDemo(path, durationMs, speedMps);
    for (let i = 0; i < 40 && !get().context?.current; i += 1) {
      await sleep(200);
    }
    void runHostForever(set, get);
  },

  async startLive() {
    await get().stop();
    await audioMixer.prepare(get().audioMode);
    unphase = audioMixer.onPhase((phase) => set({ phase }));
    uncarplay = carPlayBridge.subscribe((command) => {
      if (command.type === "playPause") void get().toggleMusic();
      if (command.type === "skip") void get().skipNarration();
      if (command.type === "reroll") void get().rerollTopic();
      if (command.type === "tellMeMore") void get().tellMeMore();
      if (command.type === "topic") get().setTopic(command.topic);
    });
    geofence.reset();
    hostEpoch += 1;
    hostAlive = true;
    alreadySaid.length = 0;
    topicIndex = 0;
    scriptTail = Promise.resolve();
    set({ live: true, demo: false, error: undefined });
    unpoint = locationEngine.onPoint((point) => queuePoint(set, get, point));
    void runHostForever(set, get);
    try {
      await locationEngine.startLive();
      if (locationEngine.lastPoint) {
        void fetchWeather(locationEngine.lastPoint).then((weather) => set({ weather }));
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Location failed" });
    }
  },

  async stop() {
    unpoint?.();
    unpoint = null;
    unphase?.();
    unphase = null;
    uncarplay?.();
    uncarplay = null;
    locationEngine.stop();
    geofence.reset();
    hostAlive = false;
    hostEpoch += 1;
    loopRunning = false;
    latestPoint = null;
    pumping = false;
    await audioMixer.teardown();
    set({ live: false, demo: false, phase: "idle" });
  },

  setTopic(topic) {
    set({ topic });
  },

  async setAudioMode(mode) {
    set({ audioMode: mode });
    await audioMixer.prepare(mode);
  },

  async skipNarration() {
    await audioMixer.skipSpeech();
    set({ busy: false });
  },

  async rerollTopic() {
    set({ topic: get().topic === "surprise" ? "history" : "surprise" });
    await audioMixer.skipSpeech();
  },

  async tellMeMore() {
    await audioMixer.skipSpeech();
  },

  async toggleMusic() {
    const next = !get().musicOn;
    set({ musicOn: next });
    await audioMixer.toggleMusic(next);
  },

  async testVoice() {
    const spokenText = "This is RouteRadio. If you can hear this, the host is on the air.";
    const script: NarrationScript = {
      id: `voice-check-${Date.now()}`,
      placeId: "voice-check",
      topic: "culture",
      title: "Voice check",
      spokenText,
      durationHintS: 6,
      bridgeIn: "Radio check.",
      tags: ["test"],
      cached: false,
      source: "gemini",
    };
    set({ script, error: undefined });
    try {
      const resolved = await ttsService.resolveAudio(script);
      await audioMixer.speak(resolved);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Voice check failed" });
    }
  },
}));
