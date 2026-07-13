export type DprWeatherCondition = "Clear" | "Cloudy" | "Rain";

export type OpenMeteoSource = "openmeteo_archive" | "openmeteo_forecast";

export type DprWeatherDetail = {
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  windMaxKmh: number | null;
  weatherCode: number | null;
  source: OpenMeteoSource;
};

const IST = "Asia/Kolkata";

const OPEN_METEO_DAILY =
  "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max";

export function calendarIsoDateInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function todayIsoInIST(now = new Date()): string {
  return calendarIsoDateInTimeZone(now, IST);
}

export function parseIsoDateParam(raw: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export function isoDateDaysDifference(fromIso: string, toIso: string): number {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86400000);
}

/** Open-Meteo `daily.weather_code` (WMO). */
export function wmoWeatherCodeToDpr(code: number): DprWeatherCondition {
  if (code === 0 || code === 1) return "Clear";
  if (code === 2 || code === 3) return "Cloudy";
  if (code >= 45 && code <= 48) return "Cloudy";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Cloudy";
  if (code >= 80 && code <= 82) return "Rain";
  if (code >= 85 && code <= 86) return "Cloudy";
  if (code >= 95 && code <= 99) return "Rain";
  return "Cloudy";
}

function firstFiniteNumber(arr: unknown): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const v = arr[0];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseStoredWeatherDetail(raw: unknown): DprWeatherDetail | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const src = o.source;
  if (src !== "openmeteo_archive" && src !== "openmeteo_forecast") return null;
  const num = (k: string): number | null => {
    const v = o[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    tempMaxC: num("tempMaxC"),
    tempMinC: num("tempMinC"),
    precipitationMm: num("precipitationMm"),
    windMaxKmh: num("windMaxKmh"),
    weatherCode: num("weatherCode"),
    source: src,
  };
}

export function buildGeocodeQuery(input: {
  city: string;
  state: string;
  address: string;
}): string | null {
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const addr = input.address?.trim() ?? "";
  if (city && state) return `${city},${state},IN`;
  if (city) return `${city},IN`;
  if (addr.length >= 3) return `${addr},IN`;
  return null;
}

type OwGeoHit = { name?: string; lat: number; lon: number };

export async function openWeatherGeocode(
  query: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<OwGeoHit | null> {
  const url = new URL("https://api.openweathermap.org/geo/1.0/direct");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("appid", apiKey);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store", signal });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as OwGeoHit[];
  const hit = Array.isArray(json) && json.length > 0 ? json[0] : null;
  if (!hit || typeof hit.lat !== "number" || typeof hit.lon !== "number") {
    return null;
  }
  return hit;
}

export async function openMeteoDailySnapshot(
  lat: number,
  lon: number,
  dateIso: string,
  mode: "archive" | "forecast",
  signal?: AbortSignal,
): Promise<DprWeatherDetail | null> {
  const base =
    mode === "archive"
      ? "https://archive-api.open-meteo.com/v1/archive"
      : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(base);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("start_date", dateIso);
  url.searchParams.set("end_date", dateIso);
  url.searchParams.set("daily", OPEN_METEO_DAILY);
  url.searchParams.set("timezone", IST);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store", signal });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = (await res.json()) as {
    daily?: {
      weather_code?: unknown;
      temperature_2m_max?: unknown;
      temperature_2m_min?: unknown;
      precipitation_sum?: unknown;
      windspeed_10m_max?: unknown;
    };
  };
  const d = json.daily;
  if (!d) return null;

  const weatherCode = firstFiniteNumber(d.weather_code);
  const omSource: OpenMeteoSource =
    mode === "archive" ? "openmeteo_archive" : "openmeteo_forecast";

  return {
    tempMaxC: firstFiniteNumber(d.temperature_2m_max),
    tempMinC: firstFiniteNumber(d.temperature_2m_min),
    precipitationMm: firstFiniteNumber(d.precipitation_sum),
    windMaxKmh: firstFiniteNumber(d.windspeed_10m_max),
    weatherCode,
    source: omSource,
  };
}

export async function resolveDprWeather(input: {
  reportDateIso: string;
  geocodeQuery: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<
  | {
      weatherCondition: DprWeatherCondition;
      source: OpenMeteoSource;
      resolvedLocation: string;
      detail: DprWeatherDetail;
    }
  | { error: "geocode_failed" | "upstream_failed" | "date_out_of_range" }
> {
  const today = todayIsoInIST();
  const delta = isoDateDaysDifference(today, input.reportDateIso);
  if (delta > 16) {
    return { error: "date_out_of_range" };
  }

  const geo = await openWeatherGeocode(input.geocodeQuery, input.apiKey, input.signal);
  if (!geo) return { error: "geocode_failed" };

  const resolvedLocation =
    typeof geo.name === "string" && geo.name.trim()
      ? geo.name.trim()
      : input.geocodeQuery;

  const omMode = input.reportDateIso < today ? "archive" : "forecast";
  const snapshot = await openMeteoDailySnapshot(
    geo.lat,
    geo.lon,
    input.reportDateIso,
    omMode,
    input.signal,
  );
  if (
    !snapshot ||
    snapshot.weatherCode === null ||
    !Number.isFinite(snapshot.weatherCode)
  ) {
    return { error: "upstream_failed" };
  }

  return {
    weatherCondition: wmoWeatherCodeToDpr(snapshot.weatherCode),
    source: snapshot.source,
    resolvedLocation,
    detail: snapshot,
  };
}
