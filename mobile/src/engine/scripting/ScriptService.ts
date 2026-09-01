import { generateScript } from "../../core/api";
import type { DrivePace, NarrationScript, Place, Topic } from "../../core/types";
import { routeCache } from "../cache/RouteCache";

const TOPIC_CYCLE: Topic[] = ["history", "landscape", "food", "culture", "geology", "road"];

export class ScriptService {
  private lastTopic: Topic = "surprise";

  nextTopic(requested: Topic): Topic {
    if (requested !== "surprise") {
      this.lastTopic = requested;
      return requested;
    }
    const index = TOPIC_CYCLE.indexOf(this.lastTopic);
    const next = TOPIC_CYCLE[(index + 1) % TOPIC_CYCLE.length];
    this.lastTopic = next;
    return next;
  }

  async create(input: {
    place: Place;
    topic: Topic;
    pace: DrivePace;
    weather?: string;
    expand?: boolean;
    previousPlaceIds?: string[];
    alreadySaid?: string[];
    alreadyCoveredHere?: string[];
    continuation?: boolean;
  }): Promise<NarrationScript> {
    const topic = this.nextTopic(input.topic);
    const cached = routeCache.scriptFor(input.place.id, topic);
    const skipCache = Boolean(input.expand || input.continuation || (input.alreadySaid && input.alreadySaid.length));
    if (cached && !skipCache && !wrongCountry(cached, input.place)) {
      return cached;
    }
    const script = await generateScript({ ...input, topic });
    routeCache.putScript(script);
    return script;
  }
}

function wrongCountry(script: NarrationScript, place: Place): boolean {
  const text = script.spokenText.toLowerCase();
  const country = (place.country || "").toLowerCase();
  if (country.includes("united states") && /peja|kosovo|rugova|istog|dukagjini/.test(text)) {
    return true;
  }
  return script.placeId !== place.id;
}

export const scriptService = new ScriptService();
