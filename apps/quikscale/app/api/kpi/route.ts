import { NextResponse } from "next/server";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("kpi", "KPI");
import { createKPISchema, kpiListParamsSchema } from "@/lib/schemas/kpiSchema";
import { ApiResponse } from "@/lib/services/kpiService";
import {
  validateTeamKPICreate,
  validateIndividualKPICreate,
  validateParentKPI,
} from "@/lib/api/kpiCreateValidation";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { notifyKPIAssignment } from "@/lib/services/kpiNotifications";
import { isOrgAdmin, getMyTeamIds } from "@/lib/api/visibility";
import { fetchAuditUserMap, decorateAudit } from "@/lib/api/auditUsers";
import { audit, requestContext } from "@/lib/audit";
import { searchUserIds, dateSearchConditions, numericSearchValue } from "@/lib/api/listSearch";
import { publishRealtime } from "@quikit/realtime/server";


// GET /api/kpi - List KPIs with filters and pagination
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const params = {
    page: parseInt(searchParams.get("page") || "1"),
    // Accept `limit` as an alias for `pageSize` so the dashboard infinite-scroll
    // hooks (which speak `limit`) and the module pages (`pageSize`) both work.
    pageSize: parseInt(searchParams.get("pageSize") || searchParams.get("limit") || "20"),
    status: searchParams.get("status") || undefined,
    kpiLevel: searchParams.get("kpiLevel") || undefined,
    owner: searchParams.get("owner") || undefined,
    teamId: searchParams.get("teamId") || undefined,
    parentKPIId: searchParams.get("parentKPIId") || undefined,
    quarter: searchParams.get("quarter") || undefined,
    year: searchParams.get("year") ? parseInt(searchParams.get("year")!) : undefined,
    search: searchParams.get("search") || undefined,
    sortBy: searchParams.get("sortBy") || "createdAt",
    sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
  };

  const validated = kpiListParamsSchema.parse(params);

  const includeDeleted = searchParams.get("includeDeleted") === "true";
  // Dashboard "My Dashboard" personal scope — see kpiListParamsSchema.scope.
  const scopeMine = searchParams.get("scope") === "mine";
  // Typed so the `orgId` tenant filter can't be silently dropped by a future edit.
  const where: Prisma.KPIWhereInput = { orgId };
  // Trash toggle: by default return only active (not soft-deleted). When
  // ?includeDeleted=true, return ONLY soft-deleted records for the trash view.
  where.deletedAt = includeDeleted ? { not: null } : null;
  if (validated.status) where.status = validated.status;
  if (validated.kpiLevel) where.kpiLevel = validated.kpiLevel;
  // Owner filter semantics depend on level: individual KPIs carry a single
  // `owner` scalar; team KPIs carry an `ownerIds[]` co-owner list. Filtering a
  // team KPI by its scalar `owner` (the creator) would miss co-owners, so when
  // a team-level owner filter is requested we match the array instead. This
  // mirrors how the Dashboard's Team tab filters team KPIs by co-owner.
  if (validated.owner) {
    if (validated.kpiLevel === "team") where.ownerIds = { has: validated.owner };
    else where.owner = validated.owner;
  }
  // Team filter semantics depend on kpiLevel:
  //   - Team KPIs have KPI.teamId set → filter directly on that column.
  //   - Individual KPIs have teamId=null → team membership is stored in
  //     Membership.teamId. Resolve team → active member user IDs and filter
  //     KPI.owner IN (...). Without this shim, "Individual KPI + Team filter"
  //     always returned zero rows.
  //   - When kpiLevel is not specified (rare on list pages), apply both
  //     conditions as an OR so neither scope is hidden.
  // Team KPI multi-select: `teamIds=a,b,c` filters team KPIs to those teams.
  // Non-admins have their team scope re-applied below (visibility), so this
  // filter only widens/narrows within what they're already allowed to see.
  const teamIdsParam = searchParams.get("teamIds");
  const teamIdList = teamIdsParam ? teamIdsParam.split(",").filter(Boolean) : [];

  if (validated.kpiLevel === "team" && teamIdList.length > 0) {
    where.teamId = teamIdList.length === 1 ? teamIdList[0] : { in: teamIdList };
  } else if (validated.teamId) {
    if (validated.kpiLevel === "individual") {
      const members = await db.orgMember.findMany({
        where: { orgId, teamId: validated.teamId, status: "active" },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      // Empty team → force empty result (filter to a sentinel that can't match)
      where.owner = memberIds.length > 0 ? { in: memberIds } : "__no_team_members__";
    } else if (validated.kpiLevel === "team") {
      where.teamId = validated.teamId;
    } else {
      const members = await db.orgMember.findMany({
        where: { orgId, teamId: validated.teamId, status: "active" },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);
      where.OR = [
        { teamId: validated.teamId },
        ...(memberIds.length > 0 ? [{ owner: { in: memberIds } }] : []),
      ];
    }
  }
  if (validated.parentKPIId) where.parentKPIId = validated.parentKPIId;
  if (validated.quarter) where.quarter = validated.quarter;
  if (validated.year) where.year = validated.year;

  // ── Row-level visibility ────────────────────────────────────────────────
  // Admins see every KPI. Non-admins see only:
  //   - Individual KPIs they own (KPI.owner === userId)
  //   - Team KPIs under a team they belong to (member or head)
  // The kpiLevel filter routes the visibility scope. When kpiLevel is not
  // set, OR both conditions so neither scope is hidden by accident.
  // Dashboard personal scope: KPIs the user owns across BOTH levels —
  // individual (owner === me) ∪ team (ownerIds ∋ me). This is its own
  // row-level filter, so it overrides the admin/non-admin visibility block
  // below (an admin viewing "My Dashboard" still only sees their own rows).
  if (scopeMine) {
    where.OR = [
      { kpiLevel: "individual", owner: userId },
      { kpiLevel: "team", ownerIds: { has: userId } },
    ];
  }

  const adminBypass = await isOrgAdmin(userId, orgId);
  if (!adminBypass && !scopeMine) {
    if (validated.kpiLevel === "individual") {
      where.owner = userId;
    } else if (validated.kpiLevel === "team") {
      const myTeams = await getMyTeamIds(userId, orgId);
      where.teamId = myTeams.length > 0 ? { in: myTeams } : "__no_team_membership__";
    } else {
      const myTeams = await getMyTeamIds(userId, orgId);
      const ownerOr: Prisma.KPIWhereInput[] = [{ owner: userId }];
      if (myTeams.length > 0) ownerOr.push({ teamId: { in: myTeams } });
      // Compose with any existing OR (from the teamId branch above) by ANDing
      // through AND[]. Otherwise just attach OR directly.
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: ownerOr }];
        delete where.OR;
      } else {
        where.OR = ownerOr;
      }
    }
  }

  if (validated.search) {
    // Global search across every visible KPI column. Names/text match directly;
    // user names (owner, co-owners, created-by, updated-by) resolve to ids;
    // team name matches via the relation; numeric goals match on equality; and
    // created/updated dates understand year / full-date / month-name terms.
    const q = validated.search;
    const matchedUserIds = await searchUserIds(db, q);
    const num = numericSearchValue(q);

    const searchOr: Prisma.KPIWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { measurementUnit: { contains: q, mode: "insensitive" } },
      { lastNotes: { contains: q, mode: "insensitive" } },
      { team: { is: { name: { contains: q, mode: "insensitive" } } } },
      // Weekly note text (the "Last Notes" column surfaces a weekly note) —
      // matched via an EXISTS subquery on KPIWeeklyValue (DB-level).
      { weeklyValues: { some: { notes: { contains: q, mode: "insensitive" } } } },
    ];
    if (matchedUserIds.length > 0) {
      searchOr.push({ owner: { in: matchedUserIds } });
      searchOr.push({ ownerIds: { hasSome: matchedUserIds } });
      searchOr.push({ createdBy: { in: matchedUserIds } });
      searchOr.push({ updatedBy: { in: matchedUserIds } });
    }
    if (num != null) {
      searchOr.push({ target: num });
      searchOr.push({ quarterlyGoal: num });
      searchOr.push({ qtdGoal: num });
      searchOr.push({ qtdAchieved: num });
      // Progress: match the stored progressPercent as a 1-point band so a whole
      // number ("25") matches 25.x% (exact for Cumulative; Standalone bars are
      // recomputed client-side and may differ — documented behavior).
      searchOr.push({ progressPercent: { gte: num, lt: num + 1 } });
      // Week 1–13 values: match any week whose entered value equals the number
      // (EXISTS subquery on KPIWeeklyValue — DB-level).
      searchOr.push({ weeklyValues: { some: { value: num } } });
    }
    for (const cond of dateSearchConditions(["createdAt", "updatedAt"], q)) {
      searchOr.push(cond as Prisma.KPIWhereInput);
    }

    // If a visibility filter already wrote where.OR/where.AND, AND-compose so
    // search doesn't blow away the row-level scope.
    if (where.AND) {
      (where.AND as Prisma.KPIWhereInput[]).push({ OR: searchOr });
    } else if (where.OR) {
      where.AND = [{ OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  // Relation-aware orderBy. `owner` is a userId string column, so sorting on
  // it ranks users by id (meaningless). The user-visible "Owner" column shows
  // owner_user.firstName + lastName, so we sort the relation instead.
  // Stable tiebreaker: secondary createdAt desc so equal-key rows have a
  // deterministic order across pages (skipped when createdAt is the primary).
  const dir = validated.sortOrder;
  const primary: Record<string, unknown> =
    validated.sortBy === "owner"
      ? { owner_user: { firstName: dir } }
      : validated.sortBy === "team"
        ? { team: { name: dir } }
        : { [validated.sortBy]: dir };
  const orderBy: Array<Record<string, unknown>> = [primary];
  if (validated.sortBy === "owner") orderBy.push({ owner_user: { lastName: dir } });
  // Team KPI groups rows by team in the UI — secondary sort by KPI name keeps
  // each team's rows ordered and the grouping deterministic across pages.
  if (validated.sortBy === "team") orderBy.push({ name: "asc" });
  if (validated.sortBy !== "createdAt") orderBy.push({ createdAt: "desc" });

  const total = await db.kPI.count({ where });

  const kpis = await db.kPI.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      kpiLevel: true,
      owner: true,
      ownerIds: true,
      ownerContributions: true,
      teamId: true,
      parentKPIId: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      quarterlyGoal: true,
      qtdGoal: true,
      qtdAchieved: true,
      currentWeekValue: true,
      progressPercent: true,
      status: true,
      healthStatus: true,
      lastNotes: true,
      lastNotesAt: true,
      divisionType: true,
      weeklyTargets: true,
      weeklyOwnerTargets: true,
      currency: true,
      targetScale: true,
      reverseColor: true,
      frequency: true,
      importedFromOpsp: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
      team: { select: { id: true, name: true, color: true, headId: true } },
      weeklyValues: { select: { userId: true, weekNumber: true, value: true, notes: true }, orderBy: [{ weekNumber: "asc" }, { userId: "asc" }] },
    },
    orderBy,
    skip: (validated.page - 1) * validated.pageSize,
    take: validated.pageSize,
  });

  // Enrich: batch-fetch users for all team heads + flattened ownerIds so we
  // can attach team.head and owners[] arrays on each KPI without N+1 queries.
  const userIdsToFetch = new Set<string>();
  for (const k of kpis) {
    if (k.team?.headId) userIdsToFetch.add(k.team.headId);
    const ids = (k.ownerIds as string[] | null) ?? [];
    for (const id of ids) userIdsToFetch.add(id);
  }
  const usersMap = userIdsToFetch.size > 0
    ? new Map(
        (await db.user.findMany({
          where: { id: { in: [...userIdsToFetch] } },
          select: { id: true, firstName: true, lastName: true },
        })).map((u) => [u.id, u])
      )
    : new Map();

  // Batch-fetch parent KPIs so the Individual list can show "Linked to <Team KPI>".
  const parentIds = new Set<string>();
  for (const k of kpis) if (k.parentKPIId) parentIds.add(k.parentKPIId);
  const parentMap = parentIds.size > 0
    ? new Map(
        (await db.kPI.findMany({
          where: { id: { in: [...parentIds] }, orgId },
          select: { id: true, name: true, kpiLevel: true },
        })).map((p) => [p.id, p])
      )
    : new Map();

  // Resolve every unique createdBy/updatedBy id → { name, initials } so the
  // KPI table can paint the audit columns without an extra round-trip.
  const auditMap = await fetchAuditUserMap(kpis);

  const enriched = kpis.map((k) => {
    const ownerIds = (k.ownerIds as string[] | null) ?? [];
    const rawWeekly = (k.weeklyValues ?? []) as Array<{
      userId: string | null;
      weekNumber: number;
      value: number | null;
      notes: string | null;
    }>;

    // For team KPIs, aggregate per-owner rows into a single weekly total row per week
    // (the existing KPITable cell display reads a flat [{weekNumber, value, notes}] array).
    // Also expose the raw per-owner breakdown as `weeklyOwnerValues` for the tooltip.
    let weeklyValues = rawWeekly.map(({ weekNumber, value, notes }) => ({ weekNumber, value, notes }));
    let weeklyOwnerValues: Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>> | undefined;

    if (k.kpiLevel === "team") {
      // Group by weekNumber and sum
      const byWeek: Record<number, { value: number; notes: string | null }> = {};
      const byOwner: Record<string, Array<{ weekNumber: number; value: number | null; notes: string | null }>> = {};
      for (const row of rawWeekly) {
        const v = row.value ?? 0;
        if (!byWeek[row.weekNumber]) byWeek[row.weekNumber] = { value: 0, notes: null };
        byWeek[row.weekNumber].value += v;
        // Concatenate notes across owners for the aggregate row
        if (row.notes) {
          byWeek[row.weekNumber].notes = byWeek[row.weekNumber].notes
            ? `${byWeek[row.weekNumber].notes}\n${row.notes}`
            : row.notes;
        }
        if (row.userId) {
          if (!byOwner[row.userId]) byOwner[row.userId] = [];
          byOwner[row.userId].push({ weekNumber: row.weekNumber, value: row.value, notes: row.notes });
        }
      }
      weeklyValues = Object.entries(byWeek).map(([weekStr, agg]) => ({
        weekNumber: parseInt(weekStr, 10),
        value: agg.value,
        notes: agg.notes,
      })).sort((a, b) => a.weekNumber - b.weekNumber);
      weeklyOwnerValues = byOwner;
    }

    return decorateAudit({
      ...k,
      weeklyValues,
      weeklyOwnerValues,
      team: k.team
        ? { ...k.team, head: k.team.headId ? (usersMap.get(k.team.headId) ?? null) : null }
        : null,
      owners: ownerIds.map((id) => usersMap.get(id)).filter(Boolean),
      parentKPI: k.parentKPIId ? (parentMap.get(k.parentKPIId) ?? null) : null,
    }, auditMap);
  });

  // `hasMore` lets the dashboard infinite-scroll hook know whether to keep
  // fetching without re-deriving it from total/page math on the client.
  const hasMore = validated.page * validated.pageSize < total;
  const response: ApiResponse<any> = {
    success: true,
    data: { kpis: enriched, total, page: validated.page, pageSize: validated.pageSize, hasMore },
  };

  return NextResponse.json(response);
});

// POST /api/kpi - Create KPI
export const POST = auth.create(async ({ orgId, userId }, req) => {
  // Rate limit: 30 KPI writes / minute per user (prevents bulk-insert abuse)
  const rl = rateLimit({
    routeKey: "kpi:create",
    clientKey: `${orgId}:${userId}`,
    limit: LIMITS.kpiWrite.limit,
    windowMs: LIMITS.kpiWrite.windowMs,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { success: false, error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const body = await req.json();
  // Use `safeParse` so validation failures return a clean 400 with the
  // first field-level message (e.g. "String must contain at most 200
  // character(s)" when the user enters an overly long KPI name).
  // `.parse()` would throw, get caught by withOrgAuth's outer try/catch,
  // and surface as an opaque 500 — see /api/priority/[id]/weekly/route.ts
  // for the established convention.
  const parsed = createKPISchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const validated = parsed.data;

  // Past-week ADD enforcement removed per product spec — KPI creation is now
  // always allowed regardless of the `add_past_week_data` org flag, so users
  // mid-quarter can create KPIs that auto-distribute targets across past
  // weeks via Cumulative/Standalone division. Editing past-week ACTUAL values
  // is still gated by `canEditPastWeek` on the weekly update routes.

  const isTeamLevel = validated.kpiLevel === "team";

  // Cross-row validation — extracted to @/lib/api/kpiCreateValidation
  if (isTeamLevel) {
    const err = await validateTeamKPICreate({
      orgId,
      actorUserId: userId,
      teamId: validated.teamId,
      ownerIds: validated.ownerIds,
      ownerContributions: validated.ownerContributions as Record<string, number> | null | undefined,
    });
    if (err) return err;
  } else {
    const err = await validateIndividualKPICreate({
      orgId,
      owner: validated.owner,
      teamId: validated.teamId,
    });
    if (err) return err;
  }

  const parentErr = await validateParentKPI(validated.parentKPIId, orgId);
  if (parentErr) return parentErr;

  // Duplicate-name guard — same name allowed when any of owner/team, measurement
  // unit, division type, or color-coding differ. Soft-deleted and auto-created
  // child KPIs (parentKPIId set) are excluded.
  const dup = await db.kPI.findFirst({
    where: {
      orgId,
      name: validated.name,
      quarter: validated.quarter,
      year: validated.year,
      kpiLevel: isTeamLevel ? "team" : "individual",
      measurementUnit: validated.measurementUnit,
      divisionType: validated.divisionType,
      reverseColor: validated.reverseColor ?? false,
      ...(isTeamLevel
        ? { teamId: validated.teamId }
        : { owner: validated.owner }),
      deletedAt: null,
      parentKPIId: null,
    },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      {
        success: false,
        error: `A KPI named "${validated.name}" with the same ${isTeamLevel ? "team" : "owner"}, measurement unit, division type, and color coding already exists for ${validated.quarter} ${validated.year}.`,
      },
      { status: 400 },
    );
  }

  const kpi = await db.kPI.create({
    data: {
      orgId,
      name: validated.name,
      description: validated.description,
      kpiLevel: isTeamLevel ? "team" : "individual",
      owner: isTeamLevel ? null : validated.owner!,
      ownerIds: isTeamLevel ? (validated.ownerIds ?? []) : [],
      ownerContributions: isTeamLevel
        ? ((validated.ownerContributions ?? undefined) as any)
        : undefined,
      teamId: validated.teamId,
      parentKPIId: validated.parentKPIId,
      quarter: validated.quarter,
      year: validated.year,
      measurementUnit: validated.measurementUnit,
      target: validated.target,
      quarterlyGoal: validated.quarterlyGoal,
      qtdGoal: validated.qtdGoal,
      progressPercent: 0,
      status: validated.status || "active",
      healthStatus: "on-track",
      divisionType: validated.divisionType ?? "Cumulative",
      weeklyTargets: (validated.weeklyTargets ?? undefined) as any,
      weeklyOwnerTargets: isTeamLevel
        ? ((validated.weeklyOwnerTargets ?? undefined) as any)
        : undefined,
      currency: validated.currency ?? null,
      targetScale: validated.targetScale ?? null,
      reverseColor: validated.reverseColor ?? false,
      frequency: validated.frequency ?? "weekly",
      importedFromOpsp: validated.importedFromOpsp ?? false,
      createdBy: userId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      kpiLevel: true,
      owner: true,
      teamId: true,
      quarter: true,
      year: true,
      measurementUnit: true,
      target: true,
      quarterlyGoal: true,
      qtdGoal: true,
      qtdAchieved: true,
      progressPercent: true,
      status: true,
      healthStatus: true,
      reverseColor: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
      owner_user: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await db.kPILog.create({
    data: { orgId, kpiId: kpi.id, action: "CREATE", newValue: JSON.stringify(kpi), changedBy: userId },
  });

  // ── Centralized audit (dual-write alongside KPILog) ──
  await audit.log({
    entityType: "KPI",
    entityId: kpi.id,
    action: "CREATE",
    actor: { userId, orgId, teamId: kpi.teamId },
    snapshot: {
      name: kpi.name,
      kpiLevel: kpi.kpiLevel,
      owner: kpi.owner,
      ownerIds: validated.ownerIds ?? [],
      ownerContributions: (validated.ownerContributions as Record<string, number> | null | undefined) ?? null,
      teamId: kpi.teamId,
      target: kpi.target,
      quarterlyGoal: kpi.quarterlyGoal,
      qtdGoal: kpi.qtdGoal,
      measurementUnit: kpi.measurementUnit,
      divisionType: validated.divisionType ?? "Cumulative",
      frequency: validated.frequency ?? "weekly",
      quarter: kpi.quarter,
      year: kpi.year,
      description: kpi.description,
      weeklyTargets: (validated.weeklyTargets as Record<string, number> | null | undefined) ?? null,
    },
    ...requestContext(req),
  });

  // ── Auto-create linked Individual KPIs for every Team KPI owner ───────
  // The Individual KPI list will show a "Linked to Team KPI" column for
  // these. Bidirectional weekly-value + target sync is applied in the
  // weekly + PATCH handlers (see Steps 3–5 in bugsResolve.md).
  const childIdByOwner = new Map<string, string>();
  if (isTeamLevel && (validated.ownerIds?.length ?? 0) > 0) {
    const contribMap = (validated.ownerContributions as Record<string, number> | null | undefined) ?? null;
    const ownerWeeklyTargets = (validated.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined) ?? null;
    const ownerNames = (validated.ownerKpiNames as Record<string, string> | null | undefined) ?? null;

    for (const ownerId of validated.ownerIds!) {
      const pct = contribMap?.[ownerId] ?? (100 / validated.ownerIds!.length);
      const childTarget = ((validated.target ?? 0) * pct) / 100;
      const customName = ownerNames?.[ownerId]?.trim();
      // Per-week target — prefer the saved per-owner map; if missing, fall
      // back to the team's `weeklyTargets` × this owner's contribution %.
      const teamWeekly = (validated.weeklyTargets as Record<string, number> | null | undefined) ?? null;
      const childWeekly: Record<string, number> = (() => {
        if (ownerWeeklyTargets?.[ownerId]) return ownerWeeklyTargets[ownerId];
        if (teamWeekly) {
          const out: Record<string, number> = {};
          for (const [w, v] of Object.entries(teamWeekly)) out[w] = (v * pct) / 100;
          return out;
        }
        return {};
      })();

      const child = await db.kPI.create({
        data: {
          orgId,
          name: customName && customName.length > 0 ? customName : validated.name, // per-owner override or fall back to Team KPI name
          description: validated.description,
          kpiLevel: "individual",
          owner: ownerId,
          ownerIds: [],
          ownerContributions: undefined,
          teamId: validated.teamId,
          parentKPIId: kpi.id, // ← link to the Team KPI just created
          quarter: validated.quarter,
          year: validated.year,
          measurementUnit: validated.measurementUnit,
          target: childTarget,
          quarterlyGoal: validated.quarterlyGoal != null ? (validated.quarterlyGoal * pct) / 100 : null,
          qtdGoal: validated.qtdGoal != null ? (validated.qtdGoal * pct) / 100 : null,
          progressPercent: 0,
          status: validated.status || "active",
          healthStatus: "on-track",
          divisionType: validated.divisionType ?? "Cumulative",
          weeklyTargets: childWeekly as any,
          currency: validated.currency ?? null,
          targetScale: validated.targetScale ?? null,
          reverseColor: validated.reverseColor ?? false,
          frequency: validated.frequency ?? "weekly",
          createdBy: userId,
        },
        select: { id: true },
      });
      childIdByOwner.set(ownerId, child.id);

      await db.kPILog.create({
        data: {
          orgId,
          kpiId: child.id,
          action: "CREATE",
          newValue: JSON.stringify({
            linkedFromTeamKPI: kpi.id,
            owner: ownerId,
            target: childTarget,
            contributionPct: pct,
          }),
          changedBy: userId,
        },
      });

      // System-sourced audit on the linked child KPI.
      await audit.log({
        entityType: "KPI",
        entityId: child.id,
        action: "CREATE",
        actor: { userId, orgId, teamId: validated.teamId },
        source: "system",
        reason: `Linked from team KPI ${kpi.id}`,
        snapshot: {
          name: customName && customName.length > 0 ? customName : validated.name,
          kpiLevel: "individual",
          owner: ownerId,
          teamId: validated.teamId,
          parentKPIId: kpi.id,
          target: childTarget,
          contributionPct: pct,
          measurementUnit: validated.measurementUnit,
          quarter: validated.quarter,
          year: validated.year,
          weeklyTargets: childWeekly,
        },
        ...requestContext(req),
      });
    }
  }

  // ── Notifications ────────────────────────────────────────────────────
  // Individual KPI: one email to its owner.
  // Team KPI: one email per child Individual KPI (so each owner sees their
  //   own derived target instead of the parent total).
  if (isTeamLevel && childIdByOwner.size > 0) {
    for (const [ownerId, childId] of childIdByOwner) {
      notifyKPIAssignment({
        orgId,
        kpiId: childId,
        kpiName: kpi.name,
        quarter: kpi.quarter,
        year: kpi.year,
        creatorUserId: userId,
        ownerUserIds: [ownerId],
      }).catch((err) => {
        console.error("[POST /api/kpi] team-child notify failed:", err);
      });
    }
  } else if (!isTeamLevel && validated.owner) {
    notifyKPIAssignment({
      orgId,
      kpiId: kpi.id,
      kpiName: kpi.name,
      quarter: kpi.quarter,
      year: kpi.year,
      creatorUserId: userId,
      ownerUserIds: [validated.owner],
    }).catch((err) => {
      console.error("[POST /api/kpi] notifyKPIAssignment failed:", err);
    });
  }

  await publishRealtime({
    entity: "kpi",
    action: "created",
    id: kpi.id,
    orgId,
    teamId: kpi.teamId,
    ownerId: kpi.owner,
    year: kpi.year ?? undefined,
    quarter: kpi.quarter ?? undefined,
    actorUserId: userId,
  });

  return NextResponse.json({ success: true, data: kpi, message: "KPI created successfully" }, { status: 201 });
});
