/**
 * Pure mappers from an AI-extracted report item to a create-route payload.
 *
 * Kept dependency-free (no React, no fetch) so the Save orchestration in
 * MeetingReportPanel stays thin and these mappings are unit-testable in
 * isolation. Each returns exactly the body the matching POST route's Zod schema
 * expects; required fields the transcript can't supply (owner, quarter, year)
 * come from the caller-supplied `ctx`.
 */
import type {
  KpiCandidateItem,
  PriorityCandidateItem,
  WwwCandidateItem,
} from "@/lib/ai/meetingReport";

export interface CreateContext {
  /** User id used as the owner for KPI/Priority when the transcript names no resolvable user. */
  ownerId: string;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  year: number;
  /** yyyy-mm-dd used as the WWW due date when the item has none. */
  defaultWhen: string;
}

/** Normalize a model-supplied date to yyyy-mm-dd, or null if unparseable. */
export function normalizeWhen(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function kpiPayload(item: KpiCandidateItem, ctx: CreateContext) {
  return {
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    kpiLevel: "individual" as const,
    owner: ctx.ownerId,
    quarter: ctx.quarter,
    year: ctx.year,
    measurementUnit: item.measurementUnit ?? "Number",
    ...(item.target != null ? { target: item.target } : {}),
  };
}

export function priorityPayload(item: PriorityCandidateItem, ctx: CreateContext) {
  return {
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    owner: ctx.ownerId,
    quarter: ctx.quarter,
    year: ctx.year,
    overallStatus: "not-started" as const,
  };
}

export function wwwPayload(item: WwwCandidateItem, ctx: CreateContext) {
  return {
    who: item.who?.trim() || "Unassigned",
    what: item.what,
    when: normalizeWhen(item.when) ?? ctx.defaultWhen,
    status: "not-started" as const,
  };
}

/** Calendar-quarter of a month (1-12) as the create routes' quarter enum. */
export function quarterOfMonth(month1to12: number): "Q1" | "Q2" | "Q3" | "Q4" {
  const q = Math.ceil(month1to12 / 3);
  return (["Q1", "Q2", "Q3", "Q4"][Math.min(3, Math.max(0, q - 1))]) as "Q1" | "Q2" | "Q3" | "Q4";
}

export interface OwnerUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
}

/**
 * Resolve a transcript-derived owner NAME (e.g. "Vikram" or "Vikram Panjwani")
 * to a real org user id so KPI/Priority creation attaches to the right person.
 * Tries full name, then first name / email local-part; falls back to
 * `fallbackId` (the current user) when nothing matches — creation must never
 * fail just because a name couldn't be resolved. Pure; unit-tested.
 */
export function resolveOwnerId(
  name: string | null | undefined,
  users: OwnerUser[],
  fallbackId: string,
): string {
  const n = name?.trim().toLowerCase();
  if (!n) return fallbackId;

  const full = (u: OwnerUser) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().toLowerCase();
  const exact = users.find((u) => full(u) && full(u) === n);
  if (exact) return exact.id;

  const byFirstOrEmail = users.find((u) => {
    const first = (u.firstName ?? "").trim().toLowerCase();
    const emailLocal = (u.email ?? "").split("@")[0]?.trim().toLowerCase();
    return (first && first === n) || (emailLocal && emailLocal === n);
  });
  return byFirstOrEmail?.id ?? fallbackId;
}
