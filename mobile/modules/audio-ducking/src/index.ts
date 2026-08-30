import { NativeModulesProxy } from "expo-modules-core";

type Mode = "builtin" | "external";

const Native = NativeModulesProxy.RouteRadioAudioDucking as
  | {
      setMode(mode: Mode): Promise<void>;
      beginSpeechDuck(): Promise<void>;
      endSpeechDuck(): Promise<void>;
      activatePlayback(): Promise<void>;
    }
  | undefined;

export default Native;
