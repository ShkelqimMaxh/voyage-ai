import { Platform } from "react-native";
import { create } from "zustand";

import type { AudioMode, DrivePace, GeoPoint, NarrationScript, Place, PlaceContext, PlayerPhase, Topic } from "../core/types";
import { paceFromSpeed } from "../core/geo";
import { audioMixer } from "../engine/audio/AudioMixer";
import { warmWebSpeech } from "../engine/audio/WebSpeechPlayer";
import { carPlayBridge } from "../engine/carplay/CarPlayBridge";
import { routeCache } from "../engine/cache/RouteCache";
import { GeofenceManager } from "../engine/location/GeofenceManager";
import { placeKey } from "../engine/location/placeKey";
import { locationEngine } from "../engine/location/LocationEngine";
import { PEJA_ISTOG_DURATION_MS, PEJA_ISTOG_ROAD_WAYPOINTS, PEJA_ISTOG_SPEED_MPS } from "../engine/location/pejaIstogDemo";
import {
  PRISHTINA_SKOPJE_DURATION_MS,
  PRISHTINA_SKOPJE_SPEED_MPS,
  PRISHTINA_SKOPJE_WAYPOINTS,
} from "../engine/location/prishtinaSkopjeDemo";
import { SF_OAKLAND_WAYPOINTS, US_DEMO_DURATION_MS, US_DEMO_SPEED_MPS } from "../engine/location/usDemoRoute";
import {
  VRELLE_ISTOGCENTER_DURATION_MS,
  VRELLE_ISTOGCENTER_SPEED_MPS,
  VRELLE_ISTOGCENTER_WAYPOINTS,
} from "../engine/location/vrelleIstogcenterDemo";
import {
  VRELLE_CERRCE_DURATION_MS,
  VRELLE_CERRCE_SPEED_MPS,
  VRELLE_CERRCE_WAYPOINTS,
} from "../engine/location/vrelleCerrceDemo";
import { lookaheadPlaces } from "../engine/location/RouteMatcher";
import { roadPlace } from "../engine/scripting/fillScript";
import { scriptService } from "../engine/scripting/ScriptService";
import { ttsService } from "../engine/tts/TtsService";
import { fetchWeather } from "../engine/weather/WeatherService";

const geofence = new GeofenceManager();

export type DemoRouteId =
  | "peja-istog"
  | "sf-oakland"
  | "prishtina-skopje"
  | "vrelle-cerrce"
  | "vrelle-istogcenter";

const DEMO_ROUTES: Record<
  DemoRouteId,
  { path: Array<{ latitude: number; longitude: number }>; durationMs: number; speedMps: number; seedName: string }
> = {
  "peja-istog": {
    path: PEJA_ISTOG_ROAD_WAYPOINTS,
    durationMs: PEJA_ISTOG_DURATION_MS,
    speedMps: PEJA_ISTOG_SPEED_MPS,
    seedName: "Peja",
  },
  "sf-oakland": {
    path: SF_OAKLAND_WAYPOINTS,
    durationMs: US_DEMO_DURATION_MS,
    speedMps: US_DEMO_SPEED_MPS,
    seedName: "San Francisco",
  },
  "vrelle-istogcenter": {
    path: VRELLE_ISTOGCENTER_WAYPOINTS,
    durationMs: VRELLE_ISTOGCENTER_DURATION_MS,
    speedMps: VRELLE_ISTOGCENTER_SPEED_MPS,
    seedName: "Vrellë",
  },
  "vrelle-cerrce": {
    path: VRELLE_CERRCE_WAYPOINTS,
    durationMs: VRELLE_CERRCE_DURATION_MS,
    speedMps: VRELLE_CERRCE_SPEED_MPS,
    seedName: "Vrellë",
  },
  "prishtina-skopje": {
    path: PRISHTINA_SKOPJE_WAYPOINTS,
    durationMs: PRISHTINA_SKOPJE_DURATION_MS,
    speedMps: PRISHTINA_SKOPJE_SPEED_MPS,
    seedName: "Prishtina",
  },
};

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
  startDemo: (route?: DemoRouteId) => Promise<void>;
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
/** What the host has covered in each village — one short line per clip, not the
 *  whole script — so it continues the thread there instead of re-introducing the
 *  place every time the car stops moving. Dropped as soon as we leave. */
const saidHere = new Map<string, string[]>();
/** Every point aired this drive, anywhere — one short key each. The per-village
 *  thread is dropped when we leave; this is what stops the same monastery being
 *  introduced again two villages later. Forty keys is a few dozen words. */
const coveredKeys: string[] = [];
const TOPIC_WHEEL: Topic[] = ["culture", "food", "history", "surprise"];
let topicIndex = 0;
let hostAlive = false;
let hostEpoch = 0;
let loopRunning = false;
let latestPoint: GeoPoint | null = null;
let pumping = false;

type ReadyClip = { script: NarrationScript; place: Place };

/** How many of the most recent clips in a row were about this same village.
 *
 * Keyed on the settlement name, not the place id: reverse geocoding returns a
 * different OSM node for almost every fix, so an id-based streak never counted
 * past one and the host kept re-introducing the village it was already in.
 */
function trailingStreak(key: string): number {
  let streak = 0;
  for (let i = previousIds.length - 1; i >= 0 && previousIds[i] === key; i -= 1) streak += 1;
  return streak;
}

function pickPlace(get: () => PlayerState): Place {
  const context = get().context;
  const current = context?.current ?? null;
  const nearby = (context?.nearby ?? []).filter((item) => item.id !== current?.id);
  const here = roadPlace(get().point, current);
  // Stuck in traffic, the same place resolves clip after clip. Two clips about
  // one village is plenty; a third is where the host starts re-describing the
  // street it already named. Look around instead — the backend still refuses to
  // re-introduce a place it has covered, but this keeps it from having to.
  const streak = trailingStreak(placeKey(here));
  if (nearby.length > 0 && (streak >= 2 || topicIndex % 4 === 3)) {
    return nearby[streak % nearby.length];
  }
  return here;
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
    alreadyCoveredHere: saidHere.get(placeKey(place)) ?? [],
    coveredKeys,
    continuation: alreadySaid.length > 0,
  });
}

function rememberSaidHere(place: Place, script: NarrationScript): void {
  const key = placeKey(place);
  // One short line ("Teuta's fleet beaten by Rome, 229 BC"), falling back to the
  // opening sentence when the model files nothing.
  const point = (script.covered || script.spokenText.split(/(?<=[.!?])\s+/)[0] || "").slice(0, 120);
  const thread = saidHere.get(key) ?? [];
  if (!point || thread.includes(point)) return;
  thread.push(point);
  if (thread.length > 8) thread.shift();
  saidHere.set(key, thread);
  if (!coveredKeys.includes(point)) {
    coveredKeys.push(point);
    if (coveredKeys.length > 40) coveredKeys.shift();
  }
  forgetLeftBehind(key);
}

/** Once the car is two villages past somewhere, its thread is dead weight: it
 *  costs tokens on every request and we are not driving back. */
function forgetLeftBehind(currentKey: string): void {
  const live = new Set(previousIds.slice(-3));
  live.add(currentKey);
  for (const key of [...saidHere.keys()]) {
    if (!live.has(key)) saidHere.delete(key);
  }
}

function rememberSaid(text: string): void {
  if (!text || alreadySaid.includes(text)) return;
  alreadySaid.push(text);
  if (alreadySaid.length > 12) alreadySaid.shift();
}

// Two scripts may be written at once. Serialised, generation ran ~20s a clip
// against ~19s of speech, so the host consumed clips fractionally faster than it
// could write them and the queue drained no matter how deep it was — that is the
// dead air. Two lanes give the writer headroom; beyond two, clips get written
// against memory too stale to dedupe against.
const SCRIPT_LANES = 2;
let scriptTails: Array<Promise<void>> = [];
const pendingPerLane = [0, 0];

async function enqueueScript<T>(work: () => Promise<T>): Promise<T> {
  while (scriptTails.length < SCRIPT_LANES) scriptTails.push(Promise.resolve());
  let lane = 0;
  for (let i = 1; i < SCRIPT_LANES; i += 1) {
    if (pendingPerLane[i] < pendingPerLane[lane]) lane = i;
  }
  pendingPerLane[lane] += 1;
  let release!: () => void;
  const previous = scriptTails[lane];
  scriptTails[lane] = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await work();
  } finally {
    pendingPerLane[lane] -= 1;
    release();
  }
}

function openerScript(place: Place): NarrationScript {
  const named = place.name && place.name !== "this road";
  const spokenText = named
    ? `VoyageFM. We're on the air. I'm with you through ${place.name}. Stay with me.`
    : "VoyageFM. We're on the air. I'm with you on this road. Stay with me.";
  return {
    id: `opener-${Date.now()}`,
    placeId: place.id,
    topic: "road",
    title: "On air",
    spokenText,
    durationHintS: 8,
    bridgeIn: "On air.",
    tags: ["opener"],
    cached: false,
    source: "gemini",
  };
}

async function resolveVoice(script: NarrationScript): Promise<NarrationScript> {
  // Never throws: audioUrl null means the mixer speaks with the device voice.
  const resolved = await ttsService.resolveAudio(script);
  if (Platform.OS === "web" && resolved.audioUrl) {
    void warmWebSpeech(resolved.audioUrl);
  }
  return resolved;
}

async function prepareClip(get: () => PlayerState, place: Place, topic: Topic): Promise<ReadyClip> {
  previousIds.push(placeKey(place));
  if (previousIds.length > 8) previousIds.shift();
  const script = await enqueueScript(async () => {
    const next = await withDeadline(buildScript(get, place, topic), 60000);
    rememberSaid(next.spokenText);
    rememberSaidHere(place, next);
    return next;
  });
  return { script: await resolveVoice(script), place };
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
  } catch (error) {
    set({ error: error instanceof Error ? error.message : "Playback failed" });
  }
  rememberSaid(script.spokenText);
}

async function runHostForever(set: (partial: Partial<PlayerState>) => void, get: () => PlayerState): Promise<void> {
  const epoch = hostEpoch;
  if (loopRunning) return;
  loopRunning = true;
  const queue: ReadyClip[] = [];
  let inflight = 0;
  let cooldownUntil = 0;
  // Writing a clip and rendering the studio voice runs ~45s against ~20s of
  // speech. Two in hand is not enough to cover that; the queue drained and the
  // Vrelle-Cerrce drive lost 4 of 11 minutes to dead air.
  const ahead = 4;

  const prefetch = () => {
    if (Date.now() < cooldownUntil) return;
    while (inflight + queue.length < ahead && hostAlive && hostEpoch === epoch) {
      inflight += 1;
      const place = pickPlace(get);
      const topic = nextTopic();
      void prepareClip(get, place, topic)
        .then((clip) => {
          if (hostAlive && hostEpoch === epoch) queue.push(clip);
        })
        .catch((error) => {
          // Script generation failed (backend down?) — back off instead of hammering.
          cooldownUntil = Date.now() + 4000;
          if (hostAlive && hostEpoch === epoch) {
            set({ error: error instanceof Error ? error.message : "Host clip failed" });
          }
        })
        .finally(() => {
          inflight -= 1;
        });
    }
  };

  try {
    await audioMixer.holdDuck();
    set({ busy: true, phase: "speaking" });

    // Speak now — wait at most 8s for the cloud voice, then open with the
    // device voice. The host starts talking seconds after play, no matter what.
    try {
      const place = pickPlace(get);
      const draft = openerScript(place);
      let opener: NarrationScript;
      try {
        opener = await withDeadline(resolveVoice(draft), 8000);
      } catch {
        opener = { ...draft, audioUrl: null };
      }
      prefetch();
      if (hostAlive && hostEpoch === epoch) {
        await playClip(set, get, opener, place);
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Host voice failed" });
    }

    prefetch();
    while (hostAlive && hostEpoch === epoch) {
      prefetch();
      while (hostAlive && hostEpoch === epoch && queue.length === 0) {
        await sleep(80);
        prefetch();
      }
      const clip = queue.shift();
      if (!clip) continue;
      prefetch();
      if (clip.script.duplicate && queue.length > 0) {
        // Skipping is right when another clip is ready behind it. Skipping into
        // an empty queue trades a mild repeat for dead air, and dead air is the
        // worse of the two.
        continue;
      }
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

  async startDemo(routeId: DemoRouteId = "peja-istog") {
    await get().stop();
    await audioMixer.prepare(get().audioMode, true);
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
    saidHere.clear();
    coveredKeys.length = 0;
    topicIndex = 0;
    scriptTails = [];
    pendingPerLane[0] = 0;
    pendingPerLane[1] = 0;
    const { path, durationMs, speedMps, seedName } = DEMO_ROUTES[routeId] ?? DEMO_ROUTES["peja-istog"];
    const start = path[0];
    set({
      demo: true,
      live: false,
      error: undefined,
      demoPath: path,
      point: { ...start, timestamp: Date.now(), speedMps },
      context: {
        current: {
          id: `demo-start-${routeId}`,
          name: seedName,
          kind: "town",
          latitude: start.latitude,
          longitude: start.longitude,
        },
        nearby: [],
        region: null,
        source: "knowledge",
      },
    });
    const polyline = path.map((item, index) => ({
      ...item,
      timestamp: Date.now() + index * 1000,
    }));
    void routeCache.prefetch(polyline);
    void fetchWeather(polyline[0]).then((weather) => set({ weather }));
    unpoint = locationEngine.onPoint((point) => queuePoint(set, get, point));
    locationEngine.startDemo(path, durationMs, speedMps);
    if (locationEngine.lastPoint) {
      set({ point: locationEngine.lastPoint });
    }
    void runHostForever(set, get);
  },

  async startLive() {
    await get().stop();
    await audioMixer.prepare(get().audioMode, true);
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
    saidHere.clear();
    coveredKeys.length = 0;
    topicIndex = 0;
    scriptTails = [];
    pendingPerLane[0] = 0;
    pendingPerLane[1] = 0;
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
    await audioMixer.prepare(mode, get().live || get().demo);
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
