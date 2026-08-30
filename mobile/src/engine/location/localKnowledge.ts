import { haversineM } from "../../core/geo";
import type { Place, Topic } from "../../core/types";

interface KnowledgePlace extends Place {
  topicFacts: Partial<Record<Topic, string>>;
}

export const KNOWLEDGE: KnowledgePlace[] = [
  {
    id: "peja",
    name: "Peja",
    kind: "city",
    country: "Kosovo",
    region: "Dukagjini",
    municipality: "Peja",
    latitude: 42.6593,
    longitude: 20.2883,
    summary: "Gateway city at the mouth of Rugova Canyon.",
    topicFacts: {
      history: "Peja grew as an Ottoman market town below the Patriarchate of Peć, later a UNESCO site, and remains a hub of Albanian civic life in western Kosovo.",
      landscape: "The city sits where Rugova gorge opens onto the Dukagjini plain, with the Accursed Mountains rising west and the land flattening toward Istog.",
      geology: "Alluvial fans from limestone massifs. Karst springs feed the Lumbardhi i Pejës through Rugova Canyon.",
      food: "Grilled meats, layered flija, Peja beer, and Rugova mountain cheese still reach the Saturday market.",
      culture: "Winter tourism and the Rugova climbing scene give Peja a younger pulse than most western Kosovo towns.",
      road: "The Istog road runs northeast across the plain — two lanes, villages every few minutes, not a highway.",
    },
  },
  {
    id: "zahaq",
    name: "Zahaq",
    kind: "village",
    country: "Kosovo",
    region: "Dukagjini",
    municipality: "Peja",
    latitude: 42.6865,
    longitude: 20.3488,
    summary: "Agricultural village on the Peja–Istog road.",
    topicFacts: {
      history: "A plain village formed around family lands between Peja and the Istog highlands, rebuilt after the 1998–99 war.",
      landscape: "Open fields and low farmhouses. West, the Accursed Mountains; east, the plain continues toward Gurrakoc.",
      food: "Outdoor bread ovens and winter ajvar. You will smell wood smoke more often than restaurants.",
      road: "The corridor threads the village edge. Slow farm traffic, no bypass.",
    },
  },
  {
    id: "gurrakoc",
    name: "Gurrakoc",
    kind: "town",
    country: "Kosovo",
    region: "Dukagjini",
    municipality: "Istog",
    latitude: 42.6894,
    longitude: 20.4117,
    summary: "Market town midway on the Peja–Istog corridor.",
    topicFacts: {
      history: "Grew as a service town for surrounding hamlets. The name points to springs — gurrë — that made settlement possible.",
      landscape: "A compact grid of shops with the mountains still visible on clear days.",
      geology: "Karst springs from the western limestone ranges surface here before joining the Drin system.",
      food: "Roadside bakeries and village dairy. Ask for yogurt and mountain honey.",
      road: "Natural midpoint of a Peja–Istog drive. Brief speed drop, then open road toward Istog.",
    },
  },
  {
    id: "istog",
    name: "Istog",
    kind: "town",
    country: "Kosovo",
    region: "Dukagjini",
    municipality: "Istog",
    latitude: 42.7808,
    longitude: 20.4875,
    summary: "Municipal town known for strong karst springs.",
    topicFacts: {
      history: "Ottoman-era mills used the springs; today Istog is the seat for a scatter of mountain and plain villages.",
      landscape: "Cooler and greener than the southern plain. Springs and tree cover change the feel of the last kilometers.",
      geology: "High-volume karst springs emerge at the contact between limestone uplands and plain sediments.",
      food: "Trout and spring-water freshness. Istog bottled water is sold across Kosovo.",
      road: "A gentle climb from Peja. Still two-lane rural road with village limits.",
    },
  },
  {
    id: "dukagjini-plain",
    name: "Dukagjini Plain",
    kind: "region",
    country: "Kosovo",
    region: "Dukagjini",
    latitude: 42.62,
    longitude: 20.45,
    summary: "Western Kosovo plain between the Accursed Mountains and the central highlands.",
    topicFacts: {
      history: "Both a basin and a cultural name, tied to the medieval Dukagjini principality and the Kanun.",
      landscape: "A cultivated basin framed by mountains. Villages sit on slight rises.",
      food: "Western Kosovo's pantry: peppers, wheat, dairy, vineyards on the drier edges.",
      road: "Long sight lines, little shoulder, sudden village limits. Watch for agricultural vehicles.",
    },
  },
];

export function nearestKnowledge(lat: number, lon: number, maxM = 18_000): KnowledgePlace[] {
  return KNOWLEDGE.map((place) => ({
    ...place,
    distanceM: haversineM({ latitude: lat, longitude: lon, timestamp: 0 }, place),
  }))
    .filter((place) => (place.distanceM ?? Infinity) <= maxM)
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
}

export function knowledgeFact(place: Place, topic: Topic): string {
  const match = KNOWLEDGE.find((item) => item.id === place.id);
  return match?.topicFacts[topic] || match?.topicFacts.landscape || match?.summary || place.summary || `${place.name} is on the current route.`;
}

export const PEJA_ISTOG_WAYPOINTS = [
  { latitude: 42.6593, longitude: 20.2883, name: "Peja" },
  { latitude: 42.672, longitude: 20.318, name: "East Peja" },
  { latitude: 42.6865, longitude: 20.3488, name: "Zahaq" },
  { latitude: 42.688, longitude: 20.38, name: "Toward Gurrakoc" },
  { latitude: 42.6894, longitude: 20.4117, name: "Gurrakoc" },
  { latitude: 42.73, longitude: 20.45, name: "North plain" },
  { latitude: 42.7808, longitude: 20.4875, name: "Istog" },
];
