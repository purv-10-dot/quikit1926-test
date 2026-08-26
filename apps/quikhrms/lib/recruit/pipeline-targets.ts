import { prisma } from "@/lib/prisma";
import { stageNames } from "@/lib/services/pipeline-stages";

/**
 * "Minimum candidates/day per pipeline stage" activity benchmark — see
 * app/api/v1/hrms/settings/job-levels/pipeline-targets/route.ts for how the
 * targets themselves are configured. This is the OTHER half: actually
 * counting what happened and comparing it to the target, for a given date
 * range (a single day for a live dashboard card, or an arbitrary range for
 * the Recruiter Report).
 *
 * "Actual" per stage:
 *   - Sourcing   → JobApplication.appliedDate falling inside the range.
 *   - Onboarding → RequisitionPosition.filledAt falling inside the range
 *     (the seat's actual onboarding-completion stamp, not offer/hire time).
 *   - every other (formal pipeline) stage → a stageHistory entry for that
 *     stage dated inside the range.
 * All counted against the OWNING REQUISITION's Job Level.
 *
 * Target is "/day, PER OPEN REQUISITION at that level" × the number of
 * CALENDAR days in the range (weekends included, not business-day-adjusted
 * like the SLA/TAT clocks elsewhere) — matching how the benchmark itself
 * was specified ("for ONE open position, aim for 4/day"): two open L1 reqs
 * means the level-wide target for that stage is 8/day, not 4/day. Only
 * OPEN-ish requisitions (ReqOpen/ReqOnHold/PendingApproval/ReqApproved)
 * count toward this — a closed/cancelled/draft requisition isn't live
 * hiring work, so it shouldn't inflate (or, via its activity, deflate) the
 * benchmark.
 */

const OPEN_STATUSES = new Set(["ReqOpen", "ReqOnHold", "PendingApproval", "ReqApproved"]);

export interface PipelineTargetRow {
  levelId: string;
  levelCode: string;
  levelName: string;
  stage: string;
  targetPerDay: number | null;
  totalTarget: number | null;
  actual: number;
  /** null when there's no target to measure against — never fabricated as 0%. */
  achievementPct: number | null;
}

export interface PipelineTargetReport {
  stages: string[];
  rows: PipelineTargetRow[];
  daysInRange: number;
}

interface LevelRow {
  id: string;
  code: string;
  name: string;
  stageDailyTargets: Record<string, number> | null;
}

function daysInclusive(from: Date, to: Date): number {
  // Calendar-date difference only (ignores time-of-day) — callers pass `to`
  // as end-of-day (23:59:59.999), which would otherwise inflate a
  // single-day range to "2 days" once naively divided by 86_400_000.
  const fromMidnight = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toMidnight = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(1, Math.round((toMidnight - fromMidnight) / 86_400_000) + 1);
}

/** Bumps a stage-count into a `Map<string, Map<string, number>>` keyed by an arbitrary first key then stage. */
function bumpInto(map: Map<string, Map<string, number>>, key: string | null, stage: string) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Map());
  const m = map.get(key)!;
  m.set(stage, (m.get(stage) ?? 0) + 1);
}

/**
 * Every distinct stage name across EVERY pipeline in the org, not just the
 * default one — an org can have more than one HiringPipeline (e.g. a
 * longer one for senior roles with an extra round), and a requisition can
 * be built on any of them. Using only the default pipeline's stages would
 * silently hide a non-default pipeline's stage from the Pipeline Targets
 * grid (no way to set a target for it) and, more importantly, drop any
 * actual activity recorded under a stage name that isn't in that one
 * pipeline's list — the counting itself matches by stage-NAME string
 * against whatever's configured, so it's correct as soon as every
 * pipeline's stages are represented here.
 */
export async function getAllStageNames(orgId: string): Promise<string[]> {
  const pipelines = await prisma.hiringPipeline.findMany({ where: { orgId, deletedAt: null }, select: { stages: true } });
  const seen = new Set<string>();
  const middle: string[] = [];
  for (const p of pipelines) {
    for (const name of stageNames(p.stages)) {
      if (!seen.has(name)) { seen.add(name); middle.push(name); }
    }
  }
  return ["Sourcing", ...middle, "Onboarding"];
}

export async function computePipelineTargetActuals(
  orgId: string,
  opts: { from: Date; to: Date; recruiterId?: string },
): Promise<PipelineTargetReport> {
  const { from, to, recruiterId } = opts;
  const daysInRange = daysInclusive(from, to);

  // NOT filtered by recruiterId here — a requisition split across several
  // recruiters must still resolve to its correct level for everyone; the
  // recruiter scoping happens below, at the POSITION and APPLICATION level
  // (where recruiter attribution actually lives), not by including/excluding
  // whole requisitions.
  const [levels, stages, requisitions] = await Promise.all([
    prisma.$queryRaw<LevelRow[]>`
      SELECT id, code, name, "stageDailyTargets" FROM "app_quikhrms"."JobLevel"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "isActive" = true
      ORDER BY "sortOrder" ASC, "slaDays" ASC
    `,
    getAllStageNames(orgId),
    prisma.jobRequisition.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, jobLevelId: true, status: true },
    }),
  ]);
  const openReqs = requisitions.filter((r) => OPEN_STATUSES.has(r.status));
  const reqLevelById = new Map(openReqs.map((r) => [r.id, r.jobLevelId]));
  const reqIds = openReqs.map((r) => r.id);

  // Target multiplier: how many OPEN seats to count at each level.
  //   - Org-wide (no recruiterId): one requisition = one seat, matching the
  //     original "per open requisition" benchmark spec.
  //   - Scoped to one recruiter: only the OPEN POSITIONS that recruiter
  //     personally holds (RequisitionPosition.recruiterId) — otherwise a
  //     requisition split across several recruiters would credit its WHOLE
  //     seat count to each of them individually.
  const openReqCountByLevel = new Map<string, number>();
  if (recruiterId) {
    const myPositions = reqIds.length
      ? await prisma.$queryRaw<{ requisitionId: string }[]>`
          SELECT "requisitionId" FROM "app_quikhrms"."RequisitionPosition"
          WHERE "orgId" = ${orgId} AND "recruiterId" = ${recruiterId} AND status = 'Open' AND "deletedAt" IS NULL
            AND "requisitionId" = ANY(${reqIds})
        `
      : [];
    for (const p of myPositions) {
      const levelId = reqLevelById.get(p.requisitionId);
      if (!levelId) continue;
      openReqCountByLevel.set(levelId, (openReqCountByLevel.get(levelId) ?? 0) + 1);
    }
  } else {
    for (const r of openReqs) {
      if (!r.jobLevelId) continue;
      openReqCountByLevel.set(r.jobLevelId, (openReqCountByLevel.get(r.jobLevelId) ?? 0) + 1);
    }
  }

  const actual = new Map<string, Map<string, number>>(); // actual[levelId][stage]

  if (reqIds.length > 0) {
    const [apps, filled] = await Promise.all([
      prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, requisitionId: { in: reqIds } },
        select: { id: true, requisitionId: true, appliedDate: true, stageHistory: true },
      }),
      prisma.$queryRaw<{ requisitionId: string; recruiterId: string | null }[]>`
        SELECT "requisitionId", "recruiterId" FROM "app_quikhrms"."RequisitionPosition"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND status = 'Filled'
          AND "filledAt" BETWEEN ${from} AND ${to}
          AND "requisitionId" = ANY(${reqIds})
      `,
    ]);

    // Scoped to one recruiter, only THEIR applications count — each
    // application's own assignedRecruiterId (Round Robin / self-assign /
    // manual pick), the same precise attribution the Assigned Positions
    // view uses. Not filtered by requisition, since a requisition can be
    // split across multiple recruiters.
    let assignedByApp: Map<string, string | null> | null = null;
    if (recruiterId && apps.length) {
      const rows = await prisma.$queryRaw<{ id: string; assignedRecruiterId: string | null }[]>`
        SELECT id, "assignedRecruiterId" FROM "app_quikhrms"."JobApplication"
        WHERE id = ANY(${apps.map((a) => a.id)})
      `;
      assignedByApp = new Map(rows.map((r) => [r.id, r.assignedRecruiterId]));
    }

    for (const a of apps) {
      if (recruiterId && assignedByApp?.get(a.id) !== recruiterId) continue;
      const levelId = reqLevelById.get(a.requisitionId) ?? null;
      if (a.appliedDate >= from && a.appliedDate <= to) bumpInto(actual, levelId, "Sourcing");

      const history = Array.isArray(a.stageHistory) ? (a.stageHistory as { stage?: string; date?: string }[]) : [];
      for (const h of history) {
        if (!h.stage || !h.date) continue;
        const d = new Date(h.date);
        if (d >= from && d <= to) bumpInto(actual, levelId, h.stage);
      }
    }
    for (const f of filled) {
      if (recruiterId && f.recruiterId !== recruiterId) continue;
      bumpInto(actual, reqLevelById.get(f.requisitionId) ?? null, "Onboarding");
    }
  }

  const rows: PipelineTargetRow[] = [];
  for (const level of levels) {
    const openCount = openReqCountByLevel.get(level.id) ?? 0;
    for (const stage of stages) {
      const targetPerDay = level.stageDailyTargets?.[stage] ?? null;
      const totalTarget = targetPerDay != null ? targetPerDay * daysInRange * openCount : null;
      const actualCount = actual.get(level.id)?.get(stage) ?? 0;
      const achievementPct = totalTarget != null && totalTarget > 0 ? Math.round((actualCount / totalTarget) * 100) : null;
      rows.push({ levelId: level.id, levelCode: level.code, levelName: level.name, stage, targetPerDay, totalTarget, actual: actualCount, achievementPct });
    }
  }

  return { stages, rows, daysInRange };
}

export interface RecruiterPipelineTargetSummary {
  recruiterId: string;
  recruiterName: string;
  totalTarget: number;
  totalActual: number;
  /** null when this recruiter has no OPEN requisition on a level with any target set. */
  achievementPct: number | null;
}

/**
 * Same target-vs-actual counting as `computePipelineTargetActuals`, but
 * grouped by RECRUITER (one summary row each) instead of by Job Level — for
 * an "all recruiters, side by side" comparison table. Each requisition is
 * attributed to its PRIMARY recruiter (first split, or the legacy scalar),
 * the same convention the rest of Recruit uses.
 */
export async function computePipelineTargetActualsByRecruiter(
  orgId: string,
  opts: { from: Date; to: Date },
): Promise<{ recruiters: RecruiterPipelineTargetSummary[] }> {
  const { from, to } = opts;
  const daysInRange = daysInclusive(from, to);

  const [levels, requisitions] = await Promise.all([
    prisma.$queryRaw<LevelRow[]>`
      SELECT id, code, name, "stageDailyTargets" FROM "app_quikhrms"."JobLevel"
      WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND "isActive" = true
    `,
    prisma.jobRequisition.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true, jobLevelId: true, recruiterId: true, status: true,
        recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true } },
      },
    }),
  ]);
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const openReqs = requisitions.filter((r) => OPEN_STATUSES.has(r.status));

  const recruiterByReq = new Map<string, string | null>();
  const levelByReq = new Map<string, string | null>();
  // Count of OPEN requisitions per (recruiterId, levelId) — the target
  // multiplier, grouped exactly the way the comparison table is grouped.
  const openCountByRecruiterLevel = new Map<string, Map<string, number>>();
  for (const r of openReqs) {
    const recruiterId = r.recruiterSplits[0]?.employeeId ?? r.recruiterId ?? null;
    recruiterByReq.set(r.id, recruiterId);
    levelByReq.set(r.id, r.jobLevelId);
    if (!recruiterId || !r.jobLevelId) continue;
    if (!openCountByRecruiterLevel.has(recruiterId)) openCountByRecruiterLevel.set(recruiterId, new Map());
    const m = openCountByRecruiterLevel.get(recruiterId)!;
    m.set(r.jobLevelId, (m.get(r.jobLevelId) ?? 0) + 1);
  }
  const reqIds = openReqs.map((r) => r.id);

  // actual[`${recruiterId}::${levelId}`][stage] = count
  const actual = new Map<string, Map<string, number>>();

  if (reqIds.length > 0) {
    const [apps, filled] = await Promise.all([
      prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, requisitionId: { in: reqIds } },
        select: { requisitionId: true, appliedDate: true, stageHistory: true },
      }),
      prisma.$queryRaw<{ requisitionId: string }[]>`
        SELECT "requisitionId" FROM "app_quikhrms"."RequisitionPosition"
        WHERE "orgId" = ${orgId} AND "deletedAt" IS NULL AND status = 'Filled'
          AND "filledAt" BETWEEN ${from} AND ${to}
          AND "requisitionId" = ANY(${reqIds})
      `,
    ]);

    const keyFor = (reqId: string) => {
      const recruiterId = recruiterByReq.get(reqId);
      const levelId = levelByReq.get(reqId);
      return recruiterId && levelId ? `${recruiterId}::${levelId}` : null;
    };

    for (const a of apps) {
      const key = keyFor(a.requisitionId);
      if (a.appliedDate >= from && a.appliedDate <= to) bumpInto(actual, key, "Sourcing");

      const history = Array.isArray(a.stageHistory) ? (a.stageHistory as { stage?: string; date?: string }[]) : [];
      for (const h of history) {
        if (!h.stage || !h.date) continue;
        const d = new Date(h.date);
        if (d >= from && d <= to) bumpInto(actual, key, h.stage);
      }
    }
    for (const f of filled) bumpInto(actual, keyFor(f.requisitionId), "Onboarding");
  }

  // Every recruiter with at least one OPEN requisition on a level that has
  // any target configured — not just recruiters who had activity this
  // range, or a recruiter who did nothing all day would silently vanish
  // from the comparison table instead of showing up at a truthful 0%.
  const recruiterIds = [...openCountByRecruiterLevel.keys()].filter((recruiterId) => {
    const byLevel = openCountByRecruiterLevel.get(recruiterId)!;
    return [...byLevel.keys()].some((levelId) => {
      const t = levelById.get(levelId)?.stageDailyTargets;
      return t && Object.keys(t).length > 0;
    });
  });
  if (recruiterIds.length === 0) return { recruiters: [] };

  const employees = await prisma.employee.findMany({ where: { id: { in: recruiterIds } }, select: { id: true, firstName: true, lastName: true } });
  const nameById = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

  const recruiters: RecruiterPipelineTargetSummary[] = recruiterIds.map((recruiterId) => {
    let totalTarget = 0;
    let totalActual = 0;
    for (const [levelId, openCount] of openCountByRecruiterLevel.get(recruiterId)!) {
      const targets = levelById.get(levelId)?.stageDailyTargets;
      if (!targets) continue;
      const actualForKey = actual.get(`${recruiterId}::${levelId}`);
      for (const [stage, targetPerDay] of Object.entries(targets)) {
        totalTarget += targetPerDay * daysInRange * openCount;
        totalActual += actualForKey?.get(stage) ?? 0;
      }
    }
    return {
      recruiterId, recruiterName: nameById.get(recruiterId) ?? "Unknown",
      totalTarget, totalActual,
      achievementPct: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null,
    };
  }).sort((a, b) => a.recruiterName.localeCompare(b.recruiterName));

  return { recruiters };
}
