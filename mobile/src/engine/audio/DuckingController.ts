import { NativeModules, Platform } from "react-native";

import type { AudioMode } from "../../core/types";

type NativeDucking = {
  setMode(mode: AudioMode): Promise<void>;
  beginSpeechDuck(): Promise<void>;
  endSpeechDuck(): Promise<void>;
  activatePlayback(): Promise<void>;
};

const Native: NativeDucking | undefined = NativeModules.RouteRadioAudioDucking;

export class DuckingController {
  mode: AudioMode = "builtin";

  async setMode(mode: AudioMode): Promise<void> {
    this.mode = mode;
    if (Native) {
      await Native.setMode(mode);
    }
  }

  async activate(): Promise<void> {
    if (Native) {
      await Native.activatePlayback();
      return;
    }
    if (Platform.OS === "web") return;
    try {
      const { Audio } = await import("expo-av");
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        interruptionModeIOS: 2,
        interruptionModeAndroid: 2,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // expo-av unavailable in some web/test contexts
    }
  }

  async beginSpeech(): Promise<void> {
    if (Native) {
      await Native.beginSpeechDuck();
    }
  }

  async endSpeech(): Promise<void> {
    if (Native) {
      await Native.endSpeechDuck();
    }
  }
}

export const duckingController = new DuckingController();
