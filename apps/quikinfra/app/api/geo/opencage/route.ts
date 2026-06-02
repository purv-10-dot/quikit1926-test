import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { logger } from "@/lib/observability/logger";
import {
  matchStateAndCity,
  type OpencageLocationComponents,
} from "@/lib/geo/opencage-india";

type OpencageResult = {
  formatted?: string;
  components?: OpencageLocationComponents;
};

type OpencageJson = {
  results?: OpencageResult[];
  status?: { code: number; message?: string };
};

export type AddressSuggestionDto = {
  formatted: string;
  state: string | null;
  city: string | null;
  cityMatched: boolean;
};

async function forwardGeocode(
  apiKey: string,
  q: string,
  limit: number,
): Promise<{ ok: true; data: OpencageJson } | { ok: false; status: number }> {
  const url = new URL("https://api.opencagedata.com/geocode/v1/json");
  url.searchParams.set("q", q);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("countrycode", "in");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("no_annotations", "1");

  let ocRes: Response;
  try {
    ocRes = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return { ok: false, status: 502 };
  }

  if (!ocRes.ok) {
    return { ok: false, status: ocRes.status >= 400 ? ocRes.status : 502 };
  }

  try {
    const data = (await ocRes.json()) as OpencageJson;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 502 };
  }
}

function suggestionsFromOpencageData(data: OpencageJson): AddressSuggestionDto[] {
  const ocStatus = data.status?.code;
  if (ocStatus !== undefined && ocStatus !== 200) return [];

  const results = data.results ?? [];
  const out: AddressSuggestionDto[] = [];

  for (const r of results) {
    const formatted =
      typeof r.formatted === "string" && r.formatted.trim()
        ? r.formatted.trim()
        : fallbackFormatted(r.components);
    if (!formatted) continue;
    const { state, city, cityMatched } = matchStateAndCity(r.components ?? {});
    out.push({ formatted, state, city, cityMatched });
  }

  return out;
}

function fallbackFormatted(c?: OpencageLocationComponents): string {
  if (!c) return "";
  const parts = [
    c.suburb,
    c.city || c.town,
    c.village,
    c.state_district,
    c.state,
  ].filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return parts.join(", ");
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const apiKey = process.env.OPENCAGE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geocoding is not configured (set OPENCAGE_API_KEY)" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const rawLimit = parseInt(searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 10)
    : 8;

  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] as AddressSuggestionDto[] });
  }

  const fetched = await forwardGeocode(apiKey, q, limit);
  if (!fetched.ok) {
    logger.warn({
      msg: "opencage_autocomplete_failed",
      orgId: ctx.orgId,
      status: fetched.status,
    });
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }

  const suggestions = suggestionsFromOpencageData(fetched.data);

  logger.info({
    msg: "opencage_autocomplete_ok",
    orgId: ctx.orgId,
    count: suggestions.length,
  });

  return NextResponse.json({ suggestions });
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const apiKey = process.env.OPENCAGE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geocoding is not configured (set OPENCAGE_API_KEY)" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query =
    typeof (body as { query?: unknown })?.query === "string"
      ? String((body as { query: string }).query).trim()
      : "";

  if (query.length < 4) {
    return NextResponse.json(
      { error: "Enter at least 4 characters in the address" },
      { status: 400 },
    );
  }

  const fetched = await forwardGeocode(apiKey, query, 1);
  if (!fetched.ok) {
    logger.warn({
      msg: "opencage_http_error",
      orgId: ctx.orgId,
      status: fetched.status,
    });
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }

  const data = fetched.data;
  const ocStatus = data.status?.code;
  if (ocStatus !== undefined && ocStatus !== 200) {
    logger.info({
      msg: "opencage_no_results",
      orgId: ctx.orgId,
      ocStatus,
    });
    return NextResponse.json({
      state: null,
      city: null,
      cityMatched: false,
      message: data.status?.message ?? "No results",
    });
  }

  const components = data.results?.[0]?.components;
  if (!components) {
    return NextResponse.json({
      state: null,
      city: null,
      cityMatched: false,
      message: "No results",
    });
  }

  const { state, city, cityMatched } = matchStateAndCity(components);

  logger.info({
    msg: "opencage_lookup_ok",
    orgId: ctx.orgId,
    resolvedState: !!state,
    resolvedCity: cityMatched,
  });

  return NextResponse.json({
    state,
    city,
    cityMatched,
    message:
      state && !cityMatched
        ? "State resolved; choose a city from the list if needed."
        : undefined,
  });
}
