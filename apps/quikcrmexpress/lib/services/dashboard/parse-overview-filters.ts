import type { NextRequest } from "next/server";
import { parseFilters, type DashboardFilters } from "./filters";
import type { ExtendedOverviewFilters } from "@/lib/dashboard/executive-overview-advanced-types";
import type { SessionUser } from "@/types/permission";

export type OverviewRequestFilters = DashboardFilters & {
  extended: ExtendedOverviewFilters;
};

function pickParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v || v === "all" || v.trim() === "") return null;
  return v.trim();
}

function pickNumber(url: URL, key: string): number | null {
  const raw = url.searchParams.get(key);
  if (!raw || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseOverviewFilters(req: NextRequest, user: SessionUser): OverviewRequestFilters {
  const base = parseFilters(req, user);
  const url = new URL(req.url);
  return {
    ...base,
    extended: {
      ownerId: base.resolvedOwnerId ?? pickParam(url, "ownerId"),
      source: pickParam(url, "source"),
      role: pickParam(url, "role"),
      teamId: pickParam(url, "teamId"),
      department: pickParam(url, "department"),
      leadStage: pickParam(url, "leadStage"),
      oppStage: pickParam(url, "oppStage"),
      territory: pickParam(url, "territory"),
      industry: pickParam(url, "industry"),
      dealStatus: pickParam(url, "dealStatus"),
      revenueMin: pickNumber(url, "revenueMin"),
      revenueMax: pickNumber(url, "revenueMax"),
    },
  };
}
