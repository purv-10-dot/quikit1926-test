import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/context";
import { ok, err } from "@/lib/http/envelope";
import { logger } from "@/lib/observability/logger";
import { findProjectById } from "@/lib/masters/projects-repository";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  buildGeocodeQuery,
  parseIsoDateParam,
  resolveDprWeather,
  type DprWeatherCondition,
  type DprWeatherDetail,
} from "@/lib/weather/dpr-weather";

export type DprWeatherSuggestDto = {
  weatherCondition: DprWeatherCondition;
  source: "openmeteo_archive" | "openmeteo_forecast";
  resolvedLocation: string;
  detail: DprWeatherDetail;
};

export async function GET(req: NextRequest) {
  const ctxOrResponse = await requireAnyPermission([
    PERMISSIONS.DPR_READ,
    PERMISSIONS.DPR_WRITE,
  ]);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;

  const ctx = ctxOrResponse;
  const apiKey = process.env.WEATHER_API_KEY?.trim();
  if (!apiKey) {
    return err(
      "WEATHER_NOT_CONFIGURED",
      "Weather lookup is not configured (set WEATHER_API_KEY for OpenWeatherMap)",
      503,
    );
  }

  const projectId = req.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  const reportDate = parseIsoDateParam(req.nextUrl.searchParams.get("reportDate"));

  if (!projectId) {
    return err("BAD_REQUEST", "projectId is required", 400);
  }
  if (!reportDate) {
    return err("BAD_REQUEST", "reportDate must be YYYY-MM-DD", 400);
  }

  const project = await findProjectById(ctx.orgId, projectId);
  if (!project || project.status === "inactive") {
    return err("NOT_FOUND", "Project not found", 404);
  }

  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    if (!ctx.projectIds.includes(project.id)) {
      return err("FORBIDDEN", "Project not assigned to this user", 403);
    }
  }

  const geocodeQuery = buildGeocodeQuery({
    city: project.city,
    state: project.state,
    address: project.address,
  });

  if (!geocodeQuery) {
    return err(
      "LOCATION_INCOMPLETE",
      "Add city and state (or site address) on the project to enable weather lookup",
      422,
    );
  }


  let signal: AbortSignal | undefined;
  try {
    signal = AbortSignal.timeout(12_000);
  } catch {
    signal = undefined;
  }

  const resolved = await resolveDprWeather({
    reportDateIso: reportDate,
    geocodeQuery,
    apiKey,
    signal,
  });

  if ("error" in resolved) {
    if (resolved.error === "date_out_of_range") {
      return err(
        "DATE_TOO_FAR",
        "Weather preview is only available within the next 16 days for future dates",
        400,
      );
    }
    if (resolved.error === "geocode_failed") {
      logger.warn({
        msg: "dpr_weather_geocode_failed",
        orgId: ctx.orgId,
        projectId,
      });
      return err(
        "GEOCODE_FAILED",
        "Could not resolve project location for weather. Check city/state on the project master.",
        422,
      );
    }
    logger.warn({
      msg: "dpr_weather_upstream_failed",
      orgId: ctx.orgId,
      projectId,
      reportDate,
    });
    return err(
      "WEATHER_UPSTREAM_FAILED",
      "Weather service temporarily unavailable — pick weather manually",
      502,
    );
  }

  logger.info({
    msg: "dpr_weather_suggest_ok",
    orgId: ctx.orgId,
    projectId,
    reportDate,
    source: resolved.source,
  });

  const payload: DprWeatherSuggestDto = {
    weatherCondition: resolved.weatherCondition,
    source: resolved.source,
    resolvedLocation: resolved.resolvedLocation,
    detail: resolved.detail,
  };
  return ok(payload);
}
