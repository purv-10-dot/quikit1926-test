import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { duplicateCheckSchema } from "@/lib/schemas/duplicateCheckSchema";
import { findSemanticDuplicate, type KpiCandidate } from "@/lib/ai/semanticKpiMatch";
import { GeminiUnavailableError } from "@/lib/ai/geminiKeyPool";

const auth = withOrgAuthForResource("kpi", "KPI");

// Bound the candidate set sent to the model. Org-wide, single-quarter KPI
// counts are small in practice; the cap protects the prompt from pathological
// orgs. If it ever truncates, the log line makes it visible.
const CANDIDATE_CAP = 300;

/**
 * POST /api/kpi/duplicate-check
 *
 * Similarity warning for the OPSP "Export → Create KPIs" flow. Uses Gemini to
 * flag a KPI whose name means the SAME thing as one that already exists —
 * ACROSS USERS, not just the current owner — so people don't unknowingly
 * recreate a metric a teammate already tracks. This is an advisory warning,
 * never a hard block: the client decides (Cancel / Skip / Replace).
 *
 * Flow:
 *   1. DB pre-filter — same quarter + year, org-wide (all owners).
 *   2. Gemini semantic name comparison across the candidates.
 *   3. Return the matched existing KPI (with its owner's name).
 *
 * The AI step NEVER blocks creation. If every Gemini key fails (expired /
 * quota), the route returns `{ aiUnavailable: true }` and the client shows the
 * "we couldn't check — export anyway?" confirm.
 *
 * Responses (all 200, `{ success: true, data }`):
 *   - `{ match: <kpi+ownerName> }` — a similar KPI exists; warn the user.
 *   - `{ match: null }`            — nothing similar; safe to create.
 *   - `{ aiUnavailable: true }`    — AI check could not run.
 */
export const POST = auth.create(async ({ orgId }, req) => {
  const body = await req.json();
  const parsed = duplicateCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const candidate = parsed.data;

  // 1. DB pre-filter — org-wide (across users), same planning period.
  const existing = await db.kPI.findMany({
    where: {
      orgId,
      kpiLevel: "individual",
      quarter: candidate.quarter,
      year: candidate.year,
      deletedAt: null,
      parentKPIId: null,
    },
    select: {
      id: true,
      name: true,
      owner: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      divisionType: true,
      reverseColor: true,
      frequency: true,
      description: true,
      owner_user: { select: { firstName: true, lastName: true } },
    },
    take: CANDIDATE_CAP,
  });

  if (existing.length === CANDIDATE_CAP) {
    console.warn(
      `[Gemini] KPI duplicate-check candidate set capped at ${CANDIDATE_CAP} for org ${orgId}.`,
    );
  }
  if (existing.length === 0) {
    return NextResponse.json({ success: true, data: { match: null } });
  }

  // 2. Deterministic exact-name match FIRST — case/space-insensitive. This is
  //    independent of the AI, so an identical-name duplicate is always caught
  //    even when the Gemini quota is exhausted (429) or keys are expired.
  const norm = (s: string) => s.trim().toLowerCase();
  const exact = existing.find((k) => norm(k.name) === norm(candidate.name));
  if (exact) {
    return NextResponse.json({ success: true, data: { match: toMatch(exact) } });
  }

  // 3. Gemini semantic name comparison (fuzzy layer) — degrade gracefully.
  let matchId: string | null = null;
  try {
    const list: KpiCandidate[] = existing.map((k) => ({ id: k.id, name: k.name }));
    const result = await findSemanticDuplicate(candidate.name, list);
    matchId = result.matchId;
  } catch (err) {
    if (err instanceof GeminiUnavailableError) {
      console.warn("[Gemini] KPI duplicate-check unavailable:", err.message);
      return NextResponse.json({ success: true, data: { aiUnavailable: true } });
    }
    throw err; // unexpected error → 500 via withOrgAuth
  }

  if (!matchId) {
    return NextResponse.json({ success: true, data: { match: null } });
  }

  // 4. Return the matched KPI (semantic-name match alone — owner/fields may
  //    differ; that's exactly the cross-user case we want to surface).
  const matched = existing.find((k) => k.id === matchId);
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
