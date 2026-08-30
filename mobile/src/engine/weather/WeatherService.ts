import type { GeoPoint } from "../../core/types";

export async function fetchWeather(point: GeoPoint): Promise<string | undefined> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}&current=temperature_2m,weather_code,wind_speed_10m`;
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const data = (await response.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
    };
    const temp = data.current?.temperature_2m;
    const wind = data.current?.wind_speed_10m;
    if (temp == null) return undefined;
    return `${Math.round(temp)}°C${wind ? `, wind ${Math.round(wind)} km/h` : ""}`;
  } catch {
    return undefined;
  }
}
