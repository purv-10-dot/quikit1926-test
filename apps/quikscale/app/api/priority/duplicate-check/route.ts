import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { priorityDuplicateCheckSchema } from "@/lib/schemas/priorityDuplicateCheckSchema";
import { findSemanticDuplicate, type KpiCandidate } from "@/lib/ai/semanticKpiMatch";
import { GeminiUnavailableError } from "@/lib/ai/geminiKeyPool";

const auth = withOrgAuthForResource("priority", "Priority");

const CANDIDATE_CAP = 300;

/**
 * POST /api/priority/duplicate-check
 *
 * Priority counterpart of the KPI similarity warning. Uses Gemini to flag a
 * priority whose name means the SAME thing as one that already exists ACROSS
 * USERS in the same planning period. Advisory only — never blocks creation.
 *
 * Flow:
 *   1. DB pre-filter — same quarter + year, org-wide (all owners).
 *   2. Gemini semantic name comparison across the candidates.
 *   3. Return the matched existing priority (with its owner's name).
 *
 * Responses (all 200, `{ success: true, data }`):
 *   - `{ match: <priority+ownerName> }` — a similar priority exists.
 *   - `{ match: null }`                  — nothing similar.
 *   - `{ aiUnavailable: true }`          — AI check could not run.
 */
export const POST = auth.create(async ({ orgId }, req) => {
  const body = await req.json();
  const parsed = priorityDuplicateCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const candidate = parsed.data;

  // 1. DB pre-filter — org-wide (across users), same planning period.
  const existing = await db.priority.findMany({
    where: {
      orgId,
      quarter: candidate.quarter,
      year: candidate.year,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      owner: true,
      quarter: true,
      year: true,
      startWeek: true,
      endWeek: true,
      description: true,
      owner_user: { select: { firstName: true, lastName: true } },
    },
    take: CANDIDATE_CAP,
  });

  if (existing.length === CANDIDATE_CAP) {
    console.warn(
      `[Gemini] Priority duplicate-check candidate set capped at ${CANDIDATE_CAP} for org ${orgId}.`,
    );
  }
  if (existing.length === 0) {
    return NextResponse.json({ success: true, data: { match: null } });
  }

  // 2. Deterministic exact-name match FIRST — case/space-insensitive. Caught
  //    even when the Gemini quota is exhausted (429) or keys are expired.
  const norm = (s: string) => s.trim().toLowerCase();
  const exact = existing.find((p) => norm(p.name) === norm(candidate.name));
  if (exact) {
    return NextResponse.json({ success: true, data: { match: toMatch(exact) } });
  }

  // 3. Gemini semantic name comparison (fuzzy layer) — degrade gracefully.
  let matchId: string | null = null;
  try {
    const list: KpiCandidate[] = existing.map((p) => ({ id: p.id, name: p.name }));
    const result = await findSemanticDuplicate(candidate.name, list, "Priority");
    matchId = result.matchId;
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      console.warn("[Gemini] Priority duplicate-check unavailable:", err.message);
      return NextResponse.json({ success: true, data: { aiUnavailable: true } });
    }
    throw err; // unexpected error → 500 via withOrgAuth
  }

  if (!matchId) {
    return NextResponse.json({ success: true, data: { match: null } });
  }

  // 4. Return the matched priority (semantic-name match alone).
  const matched = existing.find((p) => p.id === matchId);
  if (!matched) {
    return NextResponse.json({ success: true, data: { match: null } });
  }

  return NextResponse.json({ success: true, data: { match: toMatch(matched) } });
});

/** Strip the joined owner relation into a flat `ownerName` for the client. */
function toMatch<T extends { owner_user?: { firstName: string | null; lastName: string | null } | null }>(
  row: T,
) {
  const { owner_user, ...rest } = row;
  const ownerName = owner_user
    ? `${owner_user.firstName ?? ""} ${owner_user.lastName ?? ""}`.trim() || null
    : null;
  return { ...rest, ownerName };
}
