import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/validationError";
import { createCriticalNumberSchema } from "@/lib/schemas/criticalNumberSchema";
import { validateCriticalNumberCreate } from "@/lib/api/criticalNumberValidation";

/**
 * Critical Numbers — list + create.
 *
 * Intentionally lightweight: no trash/restore, no bulk operations, no export,
 * no audit log. That's a scoping decision, not an omission.
 *
 * `auth.view` / `auth.create` come from `withOrgAuthForResource`, which layers
 * the feature-flag module gate ("criticalNumbers") on top of the
 * resource/action permission check ("CriticalNumber"). Every query is filtered
 * by the `orgId` the wrapper resolves — never by anything client-supplied.
 */
const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

/**
 * Enough points for the card's trend chart without a per-card round trip.
 * Bounded recent history, batched into the same query — mirrors KPI's own
 * list endpoint embedding `weeklyValues` rather than a fetch per card.
 *
 * The `updates` include itself is written inline at each call site below,
 * not hoisted to a shared `const` next to this — Prisma's generated
 * `CriticalNumber$updatesArgs` only infers its `orderBy` array cleanly when
 * the literal is checked directly against that expected parameter type at
 * the call site. Hoisted, TypeScript widens/mis-unions that array on its
 * own, and `as const` (the usual fix) makes it `readonly` instead — equally
 * rejected. Same pattern the single-record route ([id]/route.ts) already
 * uses for its own `updates` include.
 */
const RECENT_HISTORY_LIMIT = 8;

const LIST_FIELDS = {
  id: true,
  title: true,
  teamId: true,
  ownerId: true,
  categoryId: true,
  subCategoryId: true,
  measurementUnit: true,
  unit: true,
  currency: true,
  targetScale: true,
  frequency: true,
  targetValue: true,
  currentValue: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true, color: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  category: { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
} as const;

/**
 * GET /api/critical-numbers?teamId=…
 *
 * Returns the org's Critical Numbers, optionally narrowed to one team. No
 * pagination: the per-team cap of 5 bounds the list to a size that never needs
 * paging.
 *
 * Tier resolution is deliberately NOT done here — `resolveTargetTier` is a pure
 * client-side function, so the gauge stays live as the user edits without a
 * round-trip.
 */
export const GET = auth.view(async ({ orgId }, req) => {
  const teamId = req.nextUrl.searchParams.get("teamId") || undefined;
  const categoryId = req.nextUrl.searchParams.get("categoryId") || undefined;

  const items = await db.criticalNumber.findMany({
    where: { orgId, ...(teamId ? { teamId } : {}), ...(categoryId ? { categoryId } : {}) },
    select: {
      ...LIST_FIELDS,
      updates: {
        select: { id: true, date: true, value: true, comment: true, createdAt: true, createdBy: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: RECENT_HISTORY_LIMIT,
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  // `createdBy` on CriticalNumberUpdate is a plain user id — no Prisma
  // relation is defined on that field (unlike CriticalNumber.ownerId), so it
  // can't be resolved via a nested `select`. Same batched-lookup pattern
  // as dashboard/summary/route.ts: collect every distinct id across ALL
  // items' updates, one `findMany`, build a lookup map — not a query per id.
  const userIds = new Set<string>();
  for (const item of items) {
    for (const u of item.updates) userIds.add(u.createdBy);
  }
  const usersById =
    userIds.size > 0
      ? new Map(
          (
            await db.user.findMany({
              where: { id: { in: [...userIds] } },
              select: { id: true, firstName: true, lastName: true },
            })
          ).map((u) => [u.id, u]),
        )
      : new Map<string, { id: string; firstName: string; lastName: string }>();

  // `updates` came back newest-first (that's what `take` needed to keep the
  // recent end) — flip to oldest-first before it leaves the server, so every
  // consumer sees the same order the single-record endpoint already promises.
  const data = items.map((item) => ({
    ...item,
    updates: [...item.updates].reverse().map((u) => {
      const user = usersById.get(u.createdBy);
      return { ...u, createdByName: user ? `${user.firstName} ${user.lastName}`.trim() : null };
    }),
  }));

  return NextResponse.json({ success: true, data });
});

/**
 * POST /api/critical-numbers
 *
 * Create one Critical Number. Server-side gates, in order:
 *   1. Zod      — shape + enums (measurementUnit, frequency) + currency
 *                 required when measurementUnit is "Currency"
 *   2. team     — exists and belongs to this org
 *   3. owner    — is a member (or head) of that team
 *   4. category — exists in this org and isn't trashed
 *   5. subCat   — if given, belongs to the CHOSEN category
 *   6. cap      — the team is under 5
 *
 * `currentValue` is not accepted from the client: it's a denormalised cache of
 * the newest row in the append-only history, so it only ever moves when an
 * update is recorded. A new metric starts at null ("no data"), which is what
 * lets the gauge distinguish "nothing recorded" from a genuine zero.
 */
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const parsed = createCriticalNumberSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed);
  const input = parsed.data;

  const invalid = await validateCriticalNumberCreate({
    orgId,
    teamId: input.teamId,
    ownerId: input.ownerId,
    categoryId: input.categoryId,
    subCategoryId: input.subCategoryId,
  });
  if (invalid) return invalid;

  const created = await db.criticalNumber.create({
    data: {
      orgId,
      title: input.title,
      teamId: input.teamId,
      ownerId: input.ownerId,
      categoryId: input.categoryId,
      subCategoryId: input.subCategoryId ?? null,
      measurementUnit: input.measurementUnit,
      // KPI's rule: the Unit Master label only applies to Number metrics and is
      // force-nulled for every other type, so a stale label can't survive a
      // change of measurement unit.
      unit: input.measurementUnit === "Number" ? input.unit?.trim() || null : null,
      // Same force-null rule as `unit`, mirrored for the Currency-only fields.
      // (Currency itself being REQUIRED for Currency metrics is enforced by
      // the schema's `.refine()` — this is just the force-null, not the gate.)
      currency: input.measurementUnit === "Currency" ? input.currency?.trim() || null : null,
      targetScale: input.measurementUnit === "Currency" ? input.targetScale?.trim() || null : null,
      frequency: input.frequency,
      targetValue: input.targetValue,
      currentValue: null,
      createdBy: userId,
    },
    // Empty `updates` for a just-created record — included anyway so the
    // response still matches `CriticalNumberRow`'s shape.
    select: {
      ...LIST_FIELDS,
      updates: {
        select: { id: true, date: true, value: true, comment: true, createdAt: true, createdBy: true },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: RECENT_HISTORY_LIMIT,
      },
    },
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
