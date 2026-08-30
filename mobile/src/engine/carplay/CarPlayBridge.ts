import { NativeEventEmitter, NativeModules, Platform } from "react-native";

import type { NarrationScript, Place, Topic } from "../../core/types";

type NativeCarPlay = {
  setNowPlaying(payload: {
    title: string;
    artist: string;
    isSpeaking: boolean;
    placeName: string;
  }): Promise<void>;
  setNearby(places: { id: string; name: string; kind: string }[]): Promise<void>;
  setTopics(topics: { id: string; label: string }[]): Promise<void>;
};

export type CarPlayCommand =
  | { type: "playPause" }
  | { type: "skip" }
  | { type: "reroll" }
  | { type: "tellMeMore" }
  | { type: "topic"; topic: Topic };

const Native: NativeCarPlay | undefined = NativeModules.RouteRadioCarPlay;

class CarPlayBridge {
  private emitter = Native && Platform.OS === "ios" ? new NativeEventEmitter(NativeModules.RouteRadioCarPlay) : null;

  subscribe(handler: (command: CarPlayCommand) => void): () => void {
    if (!this.emitter) return () => undefined;
    const sub = this.emitter.addListener("RouteRadioCarPlayCommand", handler);
    return () => sub.remove();
  }

  async sync(input: {
    script: NarrationScript | null;
    place: Place | null;
    nearby: Place[];
    speaking: boolean;
  }): Promise<void> {
    if (!Native) return;
    const hook = input.place?.roadName || input.place?.city || input.place?.kind || "On air";
    await Native.setNowPlaying({
      title: input.place?.name ?? "VoyageFM",
      artist: `VoyageFM · ${hook}`,
      isSpeaking: input.speaking,
      placeName: input.place?.name ?? "On air",
    });
    await Native.setNearby(
      input.nearby.slice(0, 8).map((place) => ({
        id: place.id,
        name: place.name,
        kind: place.kind,
      })),
    );
  }
}

export const carPlayBridge = new CarPlayBridge();
