"""Offline facts for the Peja–Istog corridor. Each settlement owns one hook.

Do not inherit Peja or Istog's greatest hits onto every village in the municipality.
"""

from __future__ import annotations

from math import atan2, cos, radians, sin, sqrt
import unicodedata

SETTLEMENT_KINDS = {"city", "town", "village", "suburb", "neighbourhood"}

PLACES: list[dict] = [
    {
        "id": "peja",
        "name": "Peja",
        "aliases": ("peja", "pejë", "pec", "peć"),
        "kind": "city",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.6593,
        "longitude": 20.2883,
        "hook": "City-center streets, cafes, and the Lumbardhi river through town.",
        "name_means": "Peja / Pejë — the city. Downtown is called Qendra, the center.",
        "street": "Isa Demaj",
        "summary": "Western Kosovo city where the Istog road starts.",
        "facts": {
            "history": "Peja grew as a market town and a hub of Albanian civic life in western Kosovo.",
            "landscape": "The Lumbardhi i Pejës runs through the center; the land opens east toward Istog.",
            "geology": "The river through town is the one you can actually see from the streets — not a geology lecture.",
            "food": "Grilled meats, layered flija, and the beer that took the city's name.",
            "culture": "Cafes and Saturday market energy in the center; a younger pulse than most western Kosovo towns.",
            "road": "From the center the Istog road runs northeast — two lanes, villages every few minutes, not a highway.",
        },
    },
    {
        "id": "qendra",
        "name": "Qendra",
        "aliases": ("qendra", "center", "centre"),
        "kind": "suburb",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.6598,
        "longitude": 20.2895,
        "hook": "Qendra means the center. The street here is Isa Demaj.",
        "name_means": "Qendra is Albanian for the center — downtown Peja, not a village.",
        "street": "Isa Demaj",
        "street_note": "Isa Demaj is the named street through downtown. Say the street name.",
        "summary": "The built-up center of Peja.",
        "facts": {
            "history": "This is the working downtown, not a monument district.",
            "landscape": "Urban blocks and the river nearby — you are still in town.",
            "food": "Cafes and qebaptore on the main streets, the kind locals use after work.",
            "culture": "Traffic, shopfronts, and the everyday center of Peja.",
            "road": "Leaving Qendra toward Istog you thread city streets before the fields start.",
        },
    },
    {
        "id": "old-bazaar",
        "name": "Old Bazaar",
        "aliases": ("old bazaar", "çarshia", "carshia", "carsija", "čaršija"),
        "kind": "suburb",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.6647,
        "longitude": 20.2998,
        "hook": "Çarshia e Vjetër — the old bazaar. The street here is Adem Jashari.",
        "name_means": "Çarshia e Vjetër means the old bazaar / old market quarter.",
        "street": "Adem Jashari",
        "street_note": "The bazaar street is named Adem Jashari. Name the street; do not turn it into a war lecture.",
        "summary": "Peja's historic market quarter, Çarshia e Vjetër.",
        "facts": {
            "history": "The bazaar streets and the Haxhi Zeka Mill are the civic landmarks here.",
            "landscape": "Tight older streets, not open plain yet.",
            "food": "Small bakeries and grill spots tucked into the market lanes.",
            "culture": "A walking quarter: shops, neighbors, the old mill as a local monument.",
            "road": "You are still in Peja's older fabric; the Istog road has not opened up.",
        },
    },
    {
        "id": "fidanishte",
        "name": "Fidanishte",
        "aliases": ("fidanishte",),
        "kind": "suburb",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.6845,
        "longitude": 20.3183,
        "hook": "Eastern Peja neighborhood. The through-street is already Zekë Bërdynaj.",
        "name_means": "Fidanishte is a Peja neighborhood name, not a separate town.",
        "street": "Zekë Bërdynaj",
        "street_note": "Zekë Bërdynaj is the named road leaving Peja toward the north villages.",
        "summary": "Eastern Peja neighborhood on Zekë Bërdynaj.",
        "facts": {
            "history": "A later residential spread of Peja, not the old bazaar.",
            "landscape": "Newer houses, then plots and open ground as you leave town.",
            "food": "Neighborhood shops and home kitchens — not a restaurant strip.",
            "culture": "People live here and drive into the center; it feels like a suburb, not a village yet.",
            "road": "This is the last urban stretch before the two-lane road to Istog.",
        },
    },
    {
        "id": "fierze-peja",
        "name": "Fierzë",
        "aliases": ("fierzë", "fierze", "fierza"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.7098,
        "longitude": 20.3240,
        "hook": "This is Peja's Fierzë — not the Fierza dam in the north. Street: Zekë Bërdynaj.",
        "name_means": "Fierzë is this village in Peja municipality. In Albanian, fier is the fern; several villages share the name. This is not Fierza reservoir.",
        "street": "Zekë Bërdynaj",
        "street_note": "The through-street is Zekë Bërdynaj, a person's name on the sign, not a nameless farm lane.",
        "summary": "Village north of Peja on Zekë Bërdynaj.",
        "facts": {
            "history": "A working village on family land, not a tourist stop.",
            "landscape": "Fields opening after Peja's last houses.",
            "food": "Household bread and peppers put up for winter — you smell wood smoke, not menus.",
            "culture": "Slow village pace: people know the cars that belong here.",
            "road": "The corridor runs the village edge. Farm traffic, no bypass.",
        },
    },
    {
        "id": "novoselle",
        "name": "Novosellë",
        "aliases": ("novosellë", "novoselle", "novo selo"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.7340,
        "longitude": 20.3320,
        "hook": "Novosellë means new village. The street is Avni Elezaj.",
        "name_means": "Novosellë / Novo Selo literally means new village — a later settlement on this land.",
        "street": "Avni Elezaj",
        "street_note": "Avni Elezaj is the named street through Novosellë.",
        "summary": "Village whose name means new settlement, on Avni Elezaj.",
        "facts": {
            "history": "Novosellë means new village: a later settlement on open land north of Peja.",
            "landscape": "Longer sight lines, hay and low houses, Peja already behind you.",
            "food": "Home kitchens and garden plots, not roadside dining.",
            "culture": "A quiet stretch; most traffic is passing through to Istog.",
            "road": "Two-lane rural road with sudden village limits.",
        },
    },
    {
        "id": "zahaq",
        "name": "Zahaq",
        "aliases": ("zahaq",),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Peja",
        "latitude": 42.6865,
        "longitude": 20.3488,
        "hook": "A plain village of family fields between Peja and the Istog villages.",
        "summary": "Small agricultural village on the Dukagjini plain.",
        "facts": {
            "history": "Formed around family lands and seasonal grazing, not a market town.",
            "landscape": "Open fields and low farmhouses.",
            "food": "Outdoor bread ovens and winter ajvar. Wood smoke more often than restaurants.",
            "culture": "Hospitality is private: coffee in a courtyard, not a cafe strip.",
            "road": "The road threads the village edge. Slow farm traffic, unmarked turns.",
        },
    },
    {
        "id": "kaliqan",
        "name": "Kaliqan",
        "aliases": ("kaliqan", "kaličane", "kalicane"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7469,
        "longitude": 20.3483,
        "hook": "Kaliqan is also written Kaličane. You have crossed into Istog municipality. Street: Qazim Hakaj.",
        "name_means": "Kaliqan / Kaličane — the first Istog-municipality village on this drive, not Istog town.",
        "street": "Qazim Hakaj",
        "street_note": "Qazim Hakaj is the named street through Kaliqan; it continues toward Studenicë.",
        "summary": "First Istog-municipality village on Qazim Hakaj.",
        "facts": {
            "history": "A border-of-municipality village, not the town of Istog itself.",
            "landscape": "Greener roadside, houses set back from the lane.",
            "food": "Village tables, not Istog town restaurants.",
            "culture": "You feel the municipality change more than any monument.",
            "road": "Speed drops through the built houses, then the road opens again.",
        },
    },
    {
        "id": "studenice",
        "name": "Studenicë",
        "aliases": ("studenicë", "studenice", "studenica"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7565,
        "longitude": 20.3761,
        "hook": "Studenicë comes from a Slavic root for cold water. Still on Qazim Hakaj.",
        "name_means": "Studenicë / Studenica — a Slavic-rooted name for a cold-water place.",
        "street": "Qazim Hakaj",
        "street_note": "Same named street as Kaliqan: Qazim Hakaj. If you already said the street, say what the village name means.",
        "summary": "Village named for cold water, on Qazim Hakaj.",
        "facts": {
            "history": "A Slavic-rooted name for a cold-water place; the village itself is farms, not a mill town.",
            "landscape": "Fields and a loose string of houses along the corridor.",
            "food": "Dairy and garden plots for the houses you pass.",
            "culture": "Through-traffic and neighbors; nobody here is staging a tour.",
            "road": "Still two lanes. Watch for people and tractors at the house gates.",
        },
    },
    {
        "id": "vrella",
        "name": "Vrellë",
        "aliases": ("vrellë", "vrella", "vrela"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7692,
        "longitude": 20.4034,
        "hook": "Vrellë means spring. The street is Mbretëresha Teutë — Queen Teuta.",
        "name_means": "Vrellë means spring in Albanian. This village owns that name.",
        "street": "Mbretëresha Teutë",
        "street_note": "Mbretëresha Teutë is Queen Teuta, the Illyrian ruler. That is the street name through Vrellë.",
        "summary": "Village named spring, on Queen Teuta street.",
        "facts": {
            "history": "People settled here because water came up at the surface. The name is the clue.",
            "landscape": "Cooler air and greener ground than the open stretch behind you.",
            "geology": "A local spring source, not a lecture about every karst spring in western Kosovo.",
            "food": "Cold water and village tables. Save Istog town trout for the town.",
            "culture": "A named water place; houses sit close to the source ground.",
            "road": "The climb from Peja is almost invisible, but the air tells you.",
        },
    },
    {
        "id": "lubozhde",
        "name": "Lubozhdë",
        "aliases": ("lubozhdë", "lubozhde", "ljubožda", "ljubozda"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7755,
        "longitude": 20.4424,
        "hook": "Lubozhdë is also Ljubožda. The street is Mirsad Idrizaj.",
        "name_means": "Lubozhdë / Ljubožda — both names are used; you are still in Istog municipality, not the town yet.",
        "street": "Mirsad Idrizaj",
        "street_note": "Mirsad Idrizaj is the named street through Lubozhdë.",
        "summary": "Village on Mirsad Idrizaj, approaching Istog.",
        "facts": {
            "history": "A through-village, not the municipal seat.",
            "landscape": "Houses and gardens tight to the road; Istog is minutes ahead.",
            "food": "Family plots and the last village kitchens before town.",
            "culture": "People live on the corridor. The road is their front yard.",
            "road": "Almost in town. Expect slower local traffic and village limits.",
        },
    },
    {
        "id": "cerrce",
        "name": "Cerrcë",
        "aliases": ("cerrcë", "cerrce", "cërrcë", "crnce", "crnče"),
        "kind": "village",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7774,
        "longitude": 20.4585,
        "hook": "Cerrcë is also written Crnce. The street is Selman Kadria.",
        "name_means": "Cerrcë / Crnce — the village on Istog's doorstep. Use the Albanian name Cerrcë.",
        "street": "Selman Kadria",
        "street_note": "Selman Kadria is the named street through Cerrcë.",
        "summary": "Village on Selman Kadria, next to Istog.",
        "facts": {
            "history": "A neighbor village to Istog, not a separate tourist story.",
            "landscape": "Built houses along the lane; you can feel town coming.",
            "food": "Home cooking, not a town menu.",
            "culture": "Ordinary village life: gates, yards, people who commute the last minutes into Istog.",
            "road": "Short, slow, and local. Istog is the next place, not a metaphor.",
        },
    },
    {
        "id": "blakaj",
        "name": "Blakaj",
        "aliases": ("blakaj",),
        "kind": "suburb",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7789,
        "longitude": 20.4767,
        "hook": "Blakaj reads like a family neighborhood. The street is Bekim Fehmiu, the actor.",
        "name_means": "Blakaj is an -aj name, the pattern Kosovo uses for a family or brotherhood quarter.",
        "street": "Bekim Fehmiu",
        "street_note": "Bekim Fehmiu was the Kosovo-born screen actor. Istog put his name on this street at the edge of town.",
        "summary": "Istog edge neighborhood on Bekim Fehmiu.",
        "facts": {
            "history": "A built-up edge of Istog, not a separate village story.",
            "landscape": "Houses tighten; the municipal town is right there.",
            "food": "You are close enough for Istog town bakeries in a minute.",
            "culture": "Residential streets as the town begins.",
            "road": "Last minute of the Peja–Istog drive.",
        },
    },
    {
        "id": "gurrakoc",
        "name": "Gurrakoc",
        "aliases": ("gurrakoc", "gurrakocë"),
        "kind": "town",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.6894,
        "longitude": 20.4117,
        "hook": "Gurrakoc — gurrë means spring in the name. A shop-and-minibus town, not Istog itself.",
        "name_means": "Gurrakoc: gurrë is spring. The name points to water, the daily life is shops and buses.",
        "summary": "Service town in Istog municipality.",
        "facts": {
            "history": "Grew as a municipal service town. The name points to water, but daily life is shops and buses.",
            "landscape": "A compact grid of shopfronts.",
            "food": "Roadside bakeries and village dairy. Ask for yogurt and honey, not a chain menu.",
            "culture": "Tractors and minibuses on market days.",
            "road": "A brief speed drop through the built-up stretch.",
        },
    },
    {
        "id": "istog",
        "name": "Istog",
        "aliases": ("istog", "istok"),
        "kind": "town",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": "Istog",
        "latitude": 42.7808,
        "longitude": 20.4875,
        "hook": "Istog town. A street here is 2 Korriku — July 2nd on the sign.",
        "name_means": "Istog / Istok — the municipal town, not the villages you just drove.",
        "street": "2 Korriku",
        "street_note": "2 Korriku means July 2nd. A date on the street sign, common in Kosovo towns.",
        "summary": "Municipal town. Street 2 Korriku.",
        "facts": {
            "history": "The seat for a scatter of mountain and plain villages, not a recap of every village you just passed.",
            "landscape": "Greener and tighter than the open road from Peja.",
            "geology": "Known for strong local springs and bottled water — mention once, here, if it has not already been said.",
            "food": "Trout on local tables and the bottled water that carries the town's name.",
            "culture": "A quiet administrative town. Surrounding villages keep stronger highland habits.",
            "road": "You arrived on two-lane rural road. This is the end of the Peja drive.",
        },
    },
    {
        "id": "dukagjini-plain",
        "name": "Dukagjini Plain",
        "aliases": ("dukagjini",),
        "kind": "region",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": None,
        "latitude": 42.62,
        "longitude": 20.45,
        "hook": "Western Kosovo's cultivated basin — peppers, wheat, sudden village limits.",
        "summary": "The western Kosovo plain between the mountains and the central highlands.",
        "facts": {
            "history": "Both a basin and a cultural name, tied to the medieval Dukagjini principality and the Kanun.",
            "landscape": "A cultivated basin. Villages sit on slight rises.",
            "food": "Western Kosovo's pantry: peppers, wheat, dairy.",
            "culture": "Albanian is dominant; hospitality talk still has Kanun coloring even when daily life is modern.",
            "road": "Long sight lines, little shoulder, sudden village limits. Watch for agricultural vehicles.",
        },
    },
    {
        "id": "accursed-mountains",
        "name": "Accursed Mountains",
        "aliases": ("accursed mountains", "bjeshkët e nemuna", "prokletije"),
        "kind": "range",
        "country": "Kosovo",
        "region": "Bjeshkët e Nemuna",
        "municipality": None,
        "latitude": 42.60,
        "longitude": 20.10,
        "hook": "The limestone wall west of Peja — a skyline from this road, not the driving surface.",
        "summary": "Bjeshkët e Nemuna / Prokletije west of Peja.",
        "facts": {
            "history": "Shepherds and climbers have used these ridges for centuries.",
            "landscape": "Jagged limestone. Rugova Canyon is a different trip, west of Peja, not this road.",
            "food": "Highland dairy and a short season.",
            "culture": "Rugova's mountain pastoral life is the cultural face of this range in Kosovo.",
            "road": "From the Peja–Istog road the range is a western skyline only.",
        },
    },
    {
        "id": "white-drin",
        "name": "White Drin",
        "aliases": ("white drin", "drini i bardhë", "drini i bardhe"),
        "kind": "river",
        "country": "Kosovo",
        "region": "Dukagjini",
        "municipality": None,
        "latitude": 42.53,
        "longitude": 20.38,
        "hook": "The river that drains western Kosovo — usually south of this road, not in every village.",
        "summary": "Drini i Bardhë, the river of western Kosovo.",
        "facts": {
            "history": "A settlement magnet; it joins the Black Drin in Albania.",
            "landscape": "South of this corridor the river braids the plain.",
            "food": "Freshwater fish in season, and the irrigated fields it makes possible.",
            "culture": "People say they are from the Drin side the way others name a mountain.",
            "road": "The Peja–Istog corridor stays north of the main channel.",
        },
    },
]


def _fold(text: str) -> str:
    raw = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in raw if not unicodedata.combining(ch)).lower().strip()


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = radians(lat1), radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(p1) * cos(p2) * sin(dlon / 2) ** 2
    return 2 * r * atan2(sqrt(a), sqrt(1 - a))


def nearest(
    lat: float,
    lon: float,
    *,
    limit: int = 6,
    max_m: float = 25000,
    kinds: set[str] | None = None,
) -> list[dict]:
    ranked = []
    for place in PLACES:
        if kinds and place["kind"] not in kinds:
            continue
        dist = haversine_m(lat, lon, place["latitude"], place["longitude"])
        if dist <= max_m:
            ranked.append({**place, "distance_m": dist})
    ranked.sort(key=lambda item: item["distance_m"])
    return ranked[:limit]


def by_id(place_id: str) -> dict | None:
    for place in PLACES:
        if place["id"] == place_id:
            return place
    return None


def _name_hit(place: dict, needle: str) -> bool:
    if not needle:
        return False
    folded = _fold(needle)
    names = [_fold(place["name"]), *(_fold(alias) for alias in place.get("aliases") or ())]
    if folded in names:
        return True
    return any(len(alias) >= 5 and (folded.startswith(alias) or alias in folded.split()) for alias in names)


def match_context(name: str | None, municipality: str | None, lat: float | None, lon: float | None) -> dict | None:
    """Match this settlement only. Never hand a village the parent town's fact book."""
    needle = name or ""
    for place in PLACES:
        if place["kind"] in SETTLEMENT_KINDS and _name_hit(place, needle):
            return place
    if lat is not None and lon is not None:
        hits = nearest(lat, lon, limit=1, max_m=2200, kinds=SETTLEMENT_KINDS)
        if hits:
            return hits[0]
    return None


def fact_for(place: dict, topic: str) -> str:
    facts = place.get("facts") or {}
    if topic in {"road", "geology", "landscape"}:
        return place.get("name_means") or place.get("hook") or facts.get("culture") or place.get("summary") or ""
    return (
        place.get("name_means")
        or facts.get(topic)
        or place.get("hook")
        or facts.get("culture")
        or place.get("summary")
        or ""
    )


def all_facts(place: dict) -> dict:
    return place.get("facts") or {}
