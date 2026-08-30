import { Platform } from "react-native";

import { config } from "../../core/config";
import type { AudioMode, NarrationScript, PlayerPhase } from "../../core/types";
import { ttsService } from "../tts/TtsService";
import { duckingController } from "./DuckingController";
import { playWebSpeech, stopWebSpeech, unlockWebAudio } from "./WebSpeechPlayer";

type PhaseListener = (phase: PlayerPhase) => void;

const AMBIENT =
  "https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dde669b1d.mp3?filename=lofi-study-112191.mp3";

type PlaybackHandle = {
  setVolumeAsync?: (v: number) => Promise<unknown>;
  playAsync: () => Promise<unknown>;
  pauseAsync: () => Promise<unknown>;
  stopAsync?: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  setOnPlaybackStatusUpdate?: (cb: (status: { isLoaded: boolean; didJustFinish?: boolean }) => void) => void;
};

export class AudioMixer {
  private music: PlaybackHandle | null = null;
  private speech: PlaybackHandle | null = null;
  private phase: PlayerPhase = "idle";
  private listeners = new Set<PhaseListener>();
  private musicOn = true;
  private ducked = false;
  speaking = false;

  onPhase(listener: PhaseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get currentPhase(): PlayerPhase {
    return this.phase;
  }

  async prepare(mode: AudioMode): Promise<void> {
    await duckingController.setMode(mode);
    await duckingController.activate();
    if (Platform.OS === "web") {
      await unlockWebAudio();
    }
    if (mode === "builtin") {
      await this.ensureMusic();
    }
  }

  async toggleMusic(on: boolean): Promise<void> {
    this.musicOn = on;
    if (!this.music) return;
    if (on) await this.music.playAsync();
    else await this.music.pauseAsync();
  }

  async speak(script: NarrationScript): Promise<void> {
    await this.stopSpeech();
    if (!this.ducked) {
      this.setPhase("ducking");
      await duckingController.beginSpeech();
      await this.rampMusic(config.duckLevel, config.duckMs);
      this.ducked = true;
    }
    this.speaking = true;
    this.setPhase("speaking");
    try {
      await this.playHost(script);
    } finally {
      this.speaking = false;
    }
  }

  private async playHost(script: NarrationScript): Promise<void> {
    ttsService.stopDevice();
    const url = script.audioUrl ?? (await ttsService.resolveAudio(script)).audioUrl;
    if (!url) {
      throw new Error("host voice missing");
    }
    await this.playRemoteSpeech(url, script.durationHintS);
  }

  async skipSpeech(): Promise<void> {
    await this.stopSpeech();
    ttsService.stopDevice();
    this.speaking = false;
  }

  private async unduck(): Promise<void> {
    if (!this.ducked) return;
    this.ducked = false;
    this.setPhase("restoring");
    await duckingController.endSpeech();
    await this.rampMusic(1, config.restoreMs);
    this.setPhase(this.musicOn ? "music" : "idle");
  }

  async teardown(): Promise<void> {
    await this.skipSpeech();
    await this.unduck();
    await this.music?.unloadAsync();
    this.music = null;
  }

  private async ensureMusic(): Promise<void> {
    if (this.music) {
      if (this.musicOn) await this.music.playAsync();
      return;
    }
    try {
      const { Audio } = await import("expo-av");
      const { sound } = await Audio.Sound.createAsync(
        { uri: AMBIENT },
        { shouldPlay: this.musicOn, isLooping: true, volume: 1 },
      );
      this.music = sound;
      this.setPhase(this.musicOn ? "music" : "idle");
    } catch {
      this.setPhase("idle");
    }
  }

  private async playRemoteSpeech(url: string, durationHintS = 40): Promise<void> {
    if (Platform.OS === "web") {
      await playWebSpeech(url);
      return;
    }
    const { Audio } = await import("expo-av");
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, volume: 1 });
    this.speech = sound;
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          sound.setOnPlaybackStatusUpdate((status: { isLoaded: boolean; didJustFinish?: boolean }) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) resolve();
          });
        }),
        wait((durationHintS + 2) * 1000),
      ]);
    } finally {
      await sound.unloadAsync().catch(() => undefined);
      this.speech = null;
    }
  }

  private async stopSpeech(): Promise<void> {
    ttsService.stopDevice();
    if (Platform.OS === "web") stopWebSpeech();
    if (this.speech) {
      await this.speech.stopAsync?.().catch(() => undefined);
      await this.speech.unloadAsync().catch(() => undefined);
      this.speech = null;
    }
  }

  private async rampMusic(target: number, ms: number): Promise<void> {
    if (!this.music) return;
    const steps = 6;
    const stepMs = Math.max(16, Math.floor(ms / steps));
    for (let i = 1; i <= steps; i += 1) {
      const volume = target === config.duckLevel ? 1 - ((1 - target) * i) / steps : config.duckLevel + ((target - config.duckLevel) * i) / steps;
      await this.music.setVolumeAsync?.(Math.min(1, Math.max(0, volume)));
      await wait(stepMs);
    }
    await this.music.setVolumeAsync?.(target);
  }

  private setPhase(phase: PlayerPhase): void {
    this.phase = phase;
    this.listeners.forEach((listener) => listener(phase));
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const audioMixer = new AudioMixer();
