import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  wmoWeatherCodeToDpr,
  buildGeocodeQuery,
  parseIsoDateParam,
  isoDateDaysDifference,
  parseStoredWeatherDetail,
  todayIsoInIST,
  openWeatherGeocode,
  openMeteoDailySnapshot,
  resolveDprWeather,
} from "@/lib/weather/dpr-weather";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pure helpers", () => {
  it("wmoWeatherCodeToDpr maps WMO codes to Clear/Cloudy/Rain", () => {
    expect(wmoWeatherCodeToDpr(0)).toBe("Clear");
    expect(wmoWeatherCodeToDpr(1)).toBe("Clear");
    expect(wmoWeatherCodeToDpr(3)).toBe("Cloudy");
    expect(wmoWeatherCodeToDpr(48)).toBe("Cloudy");
    expect(wmoWeatherCodeToDpr(61)).toBe("Rain");
    expect(wmoWeatherCodeToDpr(81)).toBe("Rain");
    expect(wmoWeatherCodeToDpr(99)).toBe("Rain");
    expect(wmoWeatherCodeToDpr(200)).toBe("Cloudy"); // default
  });

  it("buildGeocodeQuery prefers city,state then city then address", () => {
    expect(buildGeocodeQuery({ city: "Pune", state: "Maharashtra", address: "" })).toBe(
      "Pune,Maharashtra,IN",
    );
    expect(buildGeocodeQuery({ city: "Pune", state: "", address: "" })).toBe("Pune,IN");
    expect(buildGeocodeQuery({ city: "", state: "", address: "MG Road" })).toBe("MG Road,IN");
    expect(buildGeocodeQuery({ city: "", state: "", address: "ab" })).toBeNull();
  });

  it("parseIsoDateParam accepts YYYY-MM-DD only", () => {
    expect(parseIsoDateParam("2025-06-01")).toBe("2025-06-01");
    expect(parseIsoDateParam("01-06-2025")).toBeNull();
    expect(parseIsoDateParam(null)).toBeNull();
  });

  it("isoDateDaysDifference computes day deltas", () => {
    expect(isoDateDaysDifference("2025-01-01", "2025-01-11")).toBe(10);
    expect(isoDateDaysDifference("2025-01-11", "2025-01-01")).toBe(-10);
  });

  it("parseStoredWeatherDetail validates the source + coerces numbers", () => {
    expect(
      parseStoredWeatherDetail({
        source: "openmeteo_archive",
        tempMaxC: 30,
        tempMinC: 20,
        precipitationMm: 1,
        windMaxKmh: 5,
        weatherCode: 3,
      }),
    ).toEqual({
      source: "openmeteo_archive",
      tempMaxC: 30,
      tempMinC: 20,
      precipitationMm: 1,
      windMaxKmh: 5,
      weatherCode: 3,
    });
    expect(parseStoredWeatherDetail({ source: "bogus" })).toBeNull();
    expect(parseStoredWeatherDetail(null)).toBeNull();
  });
});

describe("openWeatherGeocode", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("returns the first hit and calls the geocode endpoint with q+appid", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([{ name: "Pune", lat: 18.5, lon: 73.8 }]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const hit = await openWeatherGeocode("Pune,IN", "KEY123");
    expect(hit).toEqual({ name: "Pune", lat: 18.5, lon: 73.8 });

    const calledUrl = (fetchMock.mock.calls[0] as any)[0] as string;
    expect(calledUrl).toContain("api.openweathermap.org/geo/1.0/direct");
    expect(calledUrl).toContain("q=Pune");
    expect(calledUrl).toContain("appid=KEY123");
  });

  it("returns null on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([], false, 401)));
    expect(await openWeatherGeocode("x", "k")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await openWeatherGeocode("x", "k")).toBeNull();
  });

  it("returns null when the hit lacks numeric lat/lon", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([{ name: "x" }])));
    expect(await openWeatherGeocode("x", "k")).toBeNull();
  });
});

describe("openMeteoDailySnapshot", () => {
  it("maps the daily arrays into a DprWeatherDetail (archive)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        daily: {
          weather_code: [3],
          temperature_2m_max: [31.2],
          temperature_2m_min: [22.1],
          precipitation_sum: [0],
          windspeed_10m_max: [12.5],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const snap = await openMeteoDailySnapshot(18.5, 73.8, "2025-01-01", "archive");
    expect(snap).toEqual({
      tempMaxC: 31.2,
      tempMinC: 22.1,
      precipitationMm: 0,
      windMaxKmh: 12.5,
      weatherCode: 3,
      source: "openmeteo_archive",
    });
    const url = (fetchMock.mock.calls[0] as any)[0] as string;
    expect(url).toContain("archive-api.open-meteo.com");
  });

  it("uses the forecast endpoint in forecast mode", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ daily: { weather_code: [1] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const snap = await openMeteoDailySnapshot(1, 1, "2025-01-01", "forecast");
    expect(snap?.source).toBe("openmeteo_forecast");
    expect((fetchMock.mock.calls[0] as any)[0] as string).toContain("api.open-meteo.com/v1/forecast");
  });

  it("returns null on non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 500)));
    expect(await openMeteoDailySnapshot(1, 1, "2025-01-01", "archive")).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    expect(await openMeteoDailySnapshot(1, 1, "2025-01-01", "archive")).toBeNull();
  });

  it("returns null when daily is missing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({})));
    expect(await openMeteoDailySnapshot(1, 1, "2025-01-01", "archive")).toBeNull();
  });
});

describe("resolveDprWeather", () => {
  it("resolves geocode + snapshot into a weather condition (forecast for today)", async () => {
    const today = todayIsoInIST();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ name: "Pune", lat: 18.5, lon: 73.8 }]))
      .mockResolvedValueOnce(
        jsonResponse({
          daily: {
            weather_code: [61],
            temperature_2m_max: [28],
            temperature_2m_min: [20],
            precipitation_sum: [10],
            windspeed_10m_max: [9],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const r = await resolveDprWeather({
      reportDateIso: today,
      geocodeQuery: "Pune,IN",
      apiKey: "KEY",
    });
    expect("weatherCondition" in r && r.weatherCondition).toBe("Rain");
    if ("resolvedLocation" in r) {
      expect(r.resolvedLocation).toBe("Pune");
      expect(r.source).toBe("openmeteo_forecast");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns date_out_of_range for dates >16 days out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveDprWeather({
      reportDateIso: "2999-01-01",
      geocodeQuery: "Pune,IN",
      apiKey: "KEY",
    });
    expect(r).toEqual({ error: "date_out_of_range" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns geocode_failed when geocode misses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    const r = await resolveDprWeather({
      reportDateIso: todayIsoInIST(),
      geocodeQuery: "Pune,IN",
      apiKey: "KEY",
    });
    expect(r).toEqual({ error: "geocode_failed" });
  });

  it("returns upstream_failed when the snapshot has no weatherCode", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ name: "Pune", lat: 1, lon: 1 }]))
      .mockResolvedValueOnce(jsonResponse({ daily: { weather_code: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await resolveDprWeather({
      reportDateIso: todayIsoInIST(),
      geocodeQuery: "Pune,IN",
      apiKey: "KEY",
    });
    expect(r).toEqual({ error: "upstream_failed" });
  });
});
