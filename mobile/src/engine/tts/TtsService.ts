import { Platform } from "react-native";

import { renderTts } from "../../core/api";
import type { NarrationScript } from "../../core/types";
import { routeCache } from "../cache/RouteCache";

export class TtsService {
  async resolveAudio(script: NarrationScript): Promise<NarrationScript> {
    const cached = routeCache.audioUrl(script.id);
    if (cached) {
      return { ...script, audioUrl: cached };
    }
    try {
      const url = await withDeadline(renderTts(script), 28000);
      if (url) {
        routeCache.putAudio(script.id, url);
        return { ...script, audioUrl: url };
      }
    } catch {
      // device speech fallback
    }
    return { ...script, audioUrl: null };
  }

  async speakOnDevice(text: string): Promise<void> {
    const budgetMs = Math.min(90000, Math.max(10000, text.split(/\s+/).length * 420));
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.96;
        utterance.lang = "en-US";
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(done, budgetMs);
        utterance.onend = done;
        utterance.onerror = done;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
      return;
    }
    const Speech = await import("expo-speech");
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, budgetMs);
      Speech.speak(text, {
        rate: 0.96,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    });
  }

  stopDevice(): void {
    if (Platform.OS === "web" && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      return;
    }
    import("expo-speech").then((Speech) => Speech.stop()).catch(() => undefined);
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tts timeout")), ms);
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

export const ttsService = new TtsService();
