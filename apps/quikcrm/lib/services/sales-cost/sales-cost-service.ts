/**
 * Sales Cost Management service — the DB layer for Settings → Sales Cost.
 *
 * Every function takes `orgId` explicitly and filters on it; there is no
 * ambient tenant. Authorization is NOT done here — the routes gate on
 * `isCrmAdminUser` before calling in (see app/api/settings/sales-cost/*).
 *
 * WRITE MODEL. Cost rows are effective-dated and are never edited in place for
 * a period that has already passed. `setRepSalary` closes the current row and
 * opens a new one from the requested month, so a report for August 2026 keeps
 * resolving to August's salary forever. See ./period.ts for the range
 * semantics ([from, to) half-open, UTC month-aligned).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCrmAppUserIds, filterToCrmAppUsers } from "@/lib/services/settings/crm-app-users";
import {
  type Period,
  type BillingFrequency,
  monthlyCostOf,
  overlapsPeriod,
  rangesOverlap,
  resolveVersionForPeriod,
  startOfMonthUtc,
} from "./period";
import {
  type OtherCostLine,
  type RepCostBreakdown,
  type RepCounts,
  type ToolCostLine,
  allocatedCost,
  buildBreakdown,
  computeEfficiency,
  round2,
  totalMonthlyCost,
} from "./calculate";
import { getRepCounts, getRepCountsBulk } from "./counts";

/** Default currency when an org has no cost rows yet. Matches CrmOpportunity. */
const DEFAULT_CURRENCY = "INR";

/** Max total allocation percentage for one tool in any overlapping window. */
const MAX_ALLOCATION_PCT = 100;

/** Thrown for validation failures the routes surface as 400/409. */
export class SalesCostError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "SalesCostError";
  }
}

/** A Decimal|null from Prisma as a plain number. */
function num(d: Prisma.Decimal | null | undefined): number {
  if (d === null || d === undefined) return 0;
  return d.toNumber();
}

// ---------------------------------------------------------------------------
// Sales reps
// ---------------------------------------------------------------------------

export interface SalesRep {
  userId: string;
  name: string;
  email: string | null;
  role: string;
}

/**
 * The reps selectable in the Sales Cost page.
 *
 * Reuses the single source of truth for "who is a QuikCRM user"
 * (`getCrmAppUserIds` + `filterToCrmAppUsers`) so this list matches
 * /api/users/picker and Settings → Activity Targets. Without the intersection
 * we would offer to configure salaries for members who only use QuikHRMS or
 * QuikScale and can never own a CRM lead.
 */
export async function listSalesReps(orgId: string): Promise<SalesRep[]> {
  const [memberships, crmUserIds] = await Promise.all([
    prisma.orgMember.findMany({
      where: { orgId, status: "active" },
      select: {
        userId: true,
        role: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    getCrmAppUserIds(orgId),
  ]);

  return filterToCrmAppUsers(memberships, crmUserIds).map((m) => {
    const name = [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ").trim();
    return {
      userId: m.userId,
      name: name || m.user?.email || "Unknown user",
      email: m.user?.email ?? null,
      role: m.role,
    };
  });
}

/**
 * Assert a userId is a CRM user in this org. Called before every write so an
 * admin cannot attach costs to a user from another org (or to a user who does
 * not exist) by posting a crafted userId.
 */
async function assertRepInOrg(orgId: string, userId: string): Promise<SalesRep> {
  const reps = await listSalesReps(orgId);
  const rep = reps.find((r) => r.userId === userId);
  if (!rep) {
    throw new SalesCostError("That user is not a QuikCRM user in this organization.", 400);
  }
  return rep;
}

// ---------------------------------------------------------------------------
// Salary
// ---------------------------------------------------------------------------

/** The salary row in force for `period`, or null when none is configured. */
async function resolveSalaryForPeriod(orgId: string, userId: string, period: Period) {
  // `effectiveFrom < period.end` and (`effectiveTo` is null or > period.start)
  // is the half-open overlap test pushed into SQL. Newest-first so a
  // mid-period change resolves to the row that starts within the month.
  const rows = await prisma.crmSalesRepSalary.findMany({
    where: {
      orgId,
      userId,
      effectiveFrom: { lt: period.end },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.start } }],
    },
    orderBy: { effectiveFrom: "desc" },
    take: 1,
  });
  return rows[0] ?? null;
}

export interface SalaryHistoryRow {
  id: string;
  monthlyAmount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

/** Full salary history for a rep, newest first — the audit trail for the UI. */
export async function listSalaryHistory(
  orgId: string,
  userId: string,
): Promise<SalaryHistoryRow[]> {
  const rows = await prisma.crmSalesRepSalary.findMany({
    where: { orgId, userId },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    monthlyAmount: num(r.monthlyAmount),
    currency: r.currency,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    notes: r.notes,
  }));
}

/**
 * Set a rep's salary from `effectiveFrom` onward.
 *
 * This is the operation that preserves history. Rather than updating the
 * existing row's amount, it closes any open/overlapping row at
 * `effectiveFrom` (making its range [oldFrom, effectiveFrom)) and inserts a new
 * row. A report for a month before `effectiveFrom` still finds the old row with
 * the old amount, so past months cannot be retroactively rewritten by a raise.
 *
 * Runs in a transaction: closing the old row and opening the new one must be
 * atomic, or a concurrent read could see either a gap or an overlap.
 */
export async function setRepSalary(
  orgId: string,
  input: {
    userId: string;
    monthlyAmount: number;
    currency?: string;
    effectiveFrom: Date;
    notes?: string | null;
  },
  actorUserId: string,
): Promise<SalaryHistoryRow> {
  const rep = await assertRepInOrg(orgId, input.userId);
  const from = startOfMonthUtc(input.effectiveFrom);

  const created = await prisma.$transaction(async (tx) => {
    // Any row still in force at or after `from` is superseded.
    const overlapping = await tx.crmSalesRepSalary.findMany({
      where: {
        orgId,
        userId: input.userId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
    });

    for (const row of overlapping) {
      if (row.effectiveFrom >= from) {
        // A row starting at or after the new start is fully superseded — the
        // admin is correcting a future-dated entry, so drop it rather than
        // leaving a zero-length range behind.
        await tx.crmSalesRepSalary.delete({ where: { id: row.id } });
      } else {
        // Close the earlier row the instant the new one begins. Half-open
        // ranges mean no gap and no overlap at the boundary.
        await tx.crmSalesRepSalary.update({
          where: { id: row.id },
          data: { effectiveTo: from },
        });
      }
    }

    return tx.crmSalesRepSalary.create({
      data: {
        orgId,
        userId: input.userId,
        userName: rep.name,
        monthlyAmount: new Prisma.Decimal(input.monthlyAmount),
        currency: input.currency ?? DEFAULT_CURRENCY,
        effectiveFrom: from,
        effectiveTo: null,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
      },
    });
  });

  return {
    id: created.id,
    monthlyAmount: num(created.monthlyAmount),
    currency: created.currency,
    effectiveFrom: created.effectiveFrom.toISOString(),
    effectiveTo: created.effectiveTo ? created.effectiveTo.toISOString() : null,
    notes: created.notes,
  };
}

/**
 * Delete one salary row. Org-scoped `deleteMany` rather than `delete` by id so
 * an id from another org affects nothing instead of throwing a 500 (and cannot
 * be used to probe for row existence).
 */
export async function deleteSalary(orgId: string, id: string): Promise<void> {
  const res = await prisma.crmSalesRepSalary.deleteMany({ where: { orgId, id } });
  if (res.count === 0) throw new SalesCostError("Salary entry not found.", 404);
}

// ---------------------------------------------------------------------------
// Tools + allocations
// ---------------------------------------------------------------------------

export interface ToolAllocationDto {
  id: string;
  userId: string;
  userName: string | null;
  percentage: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** One effective-dated price version of a tool. */
export interface ToolPriceDto {
  id: string;
  cost: number;
  billingFrequency: string;
  /** `cost` amortised to a month (annual/12, quarterly/3, one_time → 0). */
  monthlyCost: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
}

export interface ToolDto {
  id: string;
  name: string;
  vendor: string | null;
  category: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  /** Full price history, newest first. */
  prices: ToolPriceDto[];
  /**
   * The price version in force for the requested period, or null when the tool
   * had no price then. Only populated when listTools is given a period —
   * otherwise the caller is looking at the tool's identity, not one month's cost.
   */
  currentPrice: ToolPriceDto | null;
  allocations: ToolAllocationDto[];
  /** Sum of allocation percentages currently open-ended — the shared-tool hint. */
  allocatedPercentage: number;
}

type ToolWithRelations = Prisma.CrmSalesToolGetPayload<{
  include: { allocations: true; prices: true };
}>;

type PriceRow = Prisma.CrmSalesToolPriceGetPayload<Record<string, never>>;

function toPriceDto(p: PriceRow): ToolPriceDto {
  const cost = num(p.cost);
  return {
    id: p.id,
    cost,
    billingFrequency: p.billingFrequency,
    monthlyCost: round2(monthlyCostOf(cost, p.billingFrequency)),
    currency: p.currency,
    effectiveFrom: p.effectiveFrom.toISOString(),
    effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString() : null,
    notes: p.notes,
  };
}

/**
 * The price version in force for `period`, or null.
 *
 * Thin alias over the shared resolveVersionForPeriod so tool prices and salaries
 * resolve by identical rules.
 */
function resolvePriceForPeriod(prices: PriceRow[], period: Period): PriceRow | null {
  return resolveVersionForPeriod(prices, period);
}

function toToolDto(t: ToolWithRelations, period?: Period): ToolDto {
  const prices = [...t.prices].sort(
    (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
  );
  const active = period ? resolvePriceForPeriod(t.prices, period) : null;

  return {
    id: t.id,
    name: t.name,
    vendor: t.vendor,
    category: t.category,
    startDate: t.startDate.toISOString(),
    endDate: t.endDate ? t.endDate.toISOString() : null,
    active: t.active,
    notes: t.notes,
    prices: prices.map(toPriceDto),
    currentPrice: active ? toPriceDto(active) : null,
    allocations: t.allocations.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
      percentage: num(a.percentage),
      effectiveFrom: a.effectiveFrom.toISOString(),
      effectiveTo: a.effectiveTo ? a.effectiveTo.toISOString() : null,
    })),
    allocatedPercentage: round2(
      t.allocations
        .filter((a) => !a.effectiveTo)
        .reduce((acc, a) => acc + num(a.percentage), 0),
    ),
  };
}

/**
 * Every tool in the org with its allocations and price history. Optionally
 * filtered to one rep, and optionally resolved against a period so each tool
 * reports the price that was in force then (`currentPrice`).
 */
export async function listTools(
  orgId: string,
  opts: { userId?: string; period?: Period } = {},
): Promise<ToolDto[]> {
  const tools = await prisma.crmSalesTool.findMany({
    where: {
      orgId,
      ...(opts.userId ? { allocations: { some: { orgId, userId: opts.userId } } } : {}),
    },
    include: {
      allocations: { orderBy: { effectiveFrom: "desc" } },
      prices: { orderBy: { effectiveFrom: "desc" } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return tools.map((t) => toToolDto(t, opts.period));
}

/**
 * Reject an allocation set whose percentages would exceed 100% for any
 * overlapping window.
 *
 * This is the guard that makes shared-tool costs add up: if Rahul has 50% of a
 * ₹16,000 seat and someone tries to give Amit 70% for an overlapping period,
 * the tool would bill ₹18,400 against a ₹16,000 invoice. Overlap is checked
 * pairwise against existing rows rather than as a single SUM, because two
 * allocations in non-overlapping months may each legitimately be 100%.
 */
async function assertAllocationsWithinLimit(
  tx: Prisma.TransactionClient,
  orgId: string,
  toolId: string,
  incoming: Array<{ userId: string; percentage: number; from: Date; to: Date | null }>,
  ignoreAllocationIds: string[] = [],
): Promise<void> {
  const existing = await tx.crmSalesToolAllocation.findMany({
    where: {
      orgId,
      toolId,
      ...(ignoreAllocationIds.length ? { id: { notIn: ignoreAllocationIds } } : {}),
    },
  });

  for (const inc of incoming) {
    // Everything that coexists with this row: other reps' allocations plus the
    // rest of the incoming batch.
    let total = inc.percentage;

    for (const ex of existing) {
      if (ex.userId === inc.userId) continue; // replacing this rep's own share
      if (rangesOverlap(inc.from, inc.to, ex.effectiveFrom, ex.effectiveTo)) {
        total += num(ex.percentage);
      }
    }
    for (const other of incoming) {
      if (other === inc) continue;
      if (other.userId === inc.userId) {
        throw new SalesCostError(
          "The same sales rep appears twice in the allocation list.",
          400,
        );
      }
      if (rangesOverlap(inc.from, inc.to, other.from, other.to)) {
        total += other.percentage;
      }
    }

    if (round2(total) > MAX_ALLOCATION_PCT) {
      throw new SalesCostError(
        `Tool allocation would total ${round2(total)}% for an overlapping period. ` +
          `The combined allocation cannot exceed ${MAX_ALLOCATION_PCT}%.`,
        400,
      );
    }
  }
}

export interface ToolAllocationInput {
  userId: string;
  percentage: number;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}

export interface CreateToolInput {
  name: string;
  vendor?: string | null;
  category?: string | null;
  cost: number;
  billingFrequency: BillingFrequency;
  currency?: string;
  startDate: Date;
  endDate?: Date | null;
  active?: boolean;
  notes?: string | null;
  allocations: ToolAllocationInput[];
}

/**
 * Create a tool and its allocations atomically. A tool with no allocation
 * charges nobody, so at least one is required — that is what "Assigned Sales
 * Rep" means on the Add Tool form.
 */
export async function createTool(
  orgId: string,
  input: CreateToolInput,
  actorUserId: string,
): Promise<ToolDto> {
  if (input.allocations.length === 0) {
    throw new SalesCostError("Assign the tool to at least one sales rep.", 400);
  }

  // Resolve every rep up front so a bad userId fails before we write anything.
  const repNames = new Map<string, string>();
  for (const a of input.allocations) {
    const rep = await assertRepInOrg(orgId, a.userId);
    repNames.set(a.userId, rep.name);
  }

  const toolStart = startOfMonthUtc(input.startDate);
  const toolEnd = input.endDate ? startOfMonthUtc(input.endDate) : null;
  if (toolEnd && toolEnd <= toolStart) {
    throw new SalesCostError("The tool's end date must be after its start date.", 400);
  }

  const created = await prisma.$transaction(async (tx) => {
    const dup = await tx.crmSalesTool.findFirst({ where: { orgId, name: input.name } });
    if (dup) {
      throw new SalesCostError(`A tool named "${input.name}" already exists.`, 409);
    }

    const tool = await tx.crmSalesTool.create({
      data: {
        orgId,
        name: input.name,
        vendor: input.vendor ?? null,
        category: input.category ?? null,
        startDate: toolStart,
        endDate: toolEnd,
        active: input.active ?? true,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
      },
    });

    // The tool's opening price version, running from the tool's start date with
    // no end. A later price change closes this row rather than editing it.
    await tx.crmSalesToolPrice.create({
      data: {
        orgId,
        toolId: tool.id,
        cost: new Prisma.Decimal(input.cost),
        billingFrequency: input.billingFrequency,
        currency: input.currency ?? DEFAULT_CURRENCY,
        effectiveFrom: toolStart,
        effectiveTo: null,
        createdByUserId: actorUserId,
      },
    });

    // Allocations default to the tool's own window when not given explicitly.
    const rows = input.allocations.map((a) => ({
      userId: a.userId,
      percentage: a.percentage,
      from: a.effectiveFrom ? startOfMonthUtc(a.effectiveFrom) : toolStart,
      to: a.effectiveTo ? startOfMonthUtc(a.effectiveTo) : toolEnd,
    }));

    for (const r of rows) {
      if (r.to && r.to <= r.from) {
        throw new SalesCostError(
          "An allocation's end date must be after its start date.",
          400,
        );
      }
    }

    await assertAllocationsWithinLimit(tx, orgId, tool.id, rows);

    await tx.crmSalesToolAllocation.createMany({
      data: rows.map((r) => ({
        orgId,
        toolId: tool.id,
        userId: r.userId,
        userName: repNames.get(r.userId) ?? null,
        percentage: new Prisma.Decimal(r.percentage),
        effectiveFrom: r.from,
        effectiveTo: r.to,
        createdByUserId: actorUserId,
      })),
    });

    return tx.crmSalesTool.findUniqueOrThrow({
      where: { id: tool.id },
      include: {
        allocations: { orderBy: { effectiveFrom: "desc" } },
        prices: { orderBy: { effectiveFrom: "desc" } },
      },
    });
  });

  return toToolDto(created);
}

/**
 * Set a tool's price from `effectiveFrom` onward — the tool equivalent of
 * setRepSalary, and the ONLY way to change what a tool costs.
 *
 * Closes any version still in force at `effectiveFrom` and inserts a new one, so
 * a tool that goes ₹8,000 → ₹10,000 in September keeps reporting ₹8,000 for
 * August no matter when the change was entered. Runs in a transaction: closing
 * the old version and opening the new one must be atomic or a concurrent read
 * would see a gap or an overlap.
 */
export async function setToolPrice(
  orgId: string,
  toolId: string,
  input: {
    cost: number;
    billingFrequency: BillingFrequency;
    currency?: string;
    effectiveFrom: Date;
    notes?: string | null;
  },
  actorUserId: string,
): Promise<ToolPriceDto> {
  const from = startOfMonthUtc(input.effectiveFrom);

  const created = await prisma.$transaction(async (tx) => {
    const tool = await tx.crmSalesTool.findFirst({ where: { orgId, id: toolId } });
    if (!tool) throw new SalesCostError("Tool not found.", 404);

    const overlapping = await tx.crmSalesToolPrice.findMany({
      where: {
        orgId,
        toolId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
    });

    for (const row of overlapping) {
      if (row.effectiveFrom >= from) {
        // A version starting at or after the new start is fully superseded —
        // the admin is correcting a future-dated price, so drop it rather than
        // leaving a zero-length range behind.
        await tx.crmSalesToolPrice.delete({ where: { id: row.id } });
      } else {
        // Close the earlier version the instant the new one begins. Half-open
        // ranges mean no gap and no overlap at the boundary.
        await tx.crmSalesToolPrice.update({
          where: { id: row.id },
          data: { effectiveTo: from },
        });
      }
    }

    return tx.crmSalesToolPrice.create({
      data: {
        orgId,
        toolId,
        cost: new Prisma.Decimal(input.cost),
        billingFrequency: input.billingFrequency,
        currency: input.currency ?? DEFAULT_CURRENCY,
        effectiveFrom: from,
        effectiveTo: null,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
      },
    });
  });

  return toPriceDto(created);
}

/**
 * Delete one price version. Removing a superseded version changes what past
 * months resolve to, so this exists only to undo a mistaken entry — the normal
 * way to reprice is setToolPrice, which preserves the old version.
 */
export async function deleteToolPrice(
  orgId: string,
  toolId: string,
  priceId: string,
): Promise<void> {
  const res = await prisma.crmSalesToolPrice.deleteMany({
    where: { orgId, toolId, id: priceId },
  });
  if (res.count === 0) throw new SalesCostError("Price version not found.", 404);
}

export interface UpdateToolInput {
  name?: string;
  vendor?: string | null;
  category?: string | null;
  startDate?: Date;
  endDate?: Date | null;
  active?: boolean;
  notes?: string | null;
  /** When present, REPLACES the tool's allocation set. */
  allocations?: ToolAllocationInput[];
}

/**
 * Update a tool's identity (name, vendor, window, active) and optionally its
 * allocations.
 *
 * PRICE IS DELIBERATELY NOT UPDATABLE HERE. Cost, billing frequency and
 * currency live on CrmSalesToolPrice and change only through setToolPrice,
 * which closes the current version and opens a new one. That is what keeps a
 * ₹8,000 August unchanged when September becomes ₹10,000 — a mutable `cost`
 * field on the tool is exactly the thing that would rewrite history.
 */
export async function updateTool(
  orgId: string,
  id: string,
  input: UpdateToolInput,
  actorUserId: string,
): Promise<ToolDto> {
  const repNames = new Map<string, string>();
  if (input.allocations) {
    if (input.allocations.length === 0) {
      throw new SalesCostError("Assign the tool to at least one sales rep.", 400);
    }
    for (const a of input.allocations) {
      const rep = await assertRepInOrg(orgId, a.userId);
      repNames.set(a.userId, rep.name);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.crmSalesTool.findFirst({ where: { orgId, id } });
    if (!existing) throw new SalesCostError("Tool not found.", 404);

    if (input.name && input.name !== existing.name) {
      const dup = await tx.crmSalesTool.findFirst({
        where: { orgId, name: input.name, id: { not: id } },
      });
      if (dup) throw new SalesCostError(`A tool named "${input.name}" already exists.`, 409);
    }

    const nextStart = input.startDate ? startOfMonthUtc(input.startDate) : existing.startDate;
    const nextEnd =
      input.endDate === undefined
        ? existing.endDate
        : input.endDate === null
          ? null
          : startOfMonthUtc(input.endDate);
    if (nextEnd && nextEnd <= nextStart) {
      throw new SalesCostError("The tool's end date must be after its start date.", 400);
    }

    await tx.crmSalesTool.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        startDate: nextStart,
        endDate: nextEnd,
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    if (input.allocations) {
      const rows = input.allocations.map((a) => ({
        userId: a.userId,
        percentage: a.percentage,
        from: a.effectiveFrom ? startOfMonthUtc(a.effectiveFrom) : nextStart,
        to: a.effectiveTo ? startOfMonthUtc(a.effectiveTo) : nextEnd,
      }));
      for (const r of rows) {
        if (r.to && r.to <= r.from) {
          throw new SalesCostError(
            "An allocation's end date must be after its start date.",
            400,
          );
        }
      }

      const old = await tx.crmSalesToolAllocation.findMany({
        where: { orgId, toolId: id },
        select: { id: true },
      });
      await assertAllocationsWithinLimit(
        tx,
        orgId,
        id,
        rows,
        old.map((o) => o.id),
      );

      await tx.crmSalesToolAllocation.deleteMany({ where: { orgId, toolId: id } });
      await tx.crmSalesToolAllocation.createMany({
        data: rows.map((r) => ({
          orgId,
          toolId: id,
          userId: r.userId,
          userName: repNames.get(r.userId) ?? null,
          percentage: new Prisma.Decimal(r.percentage),
          effectiveFrom: r.from,
          effectiveTo: r.to,
          createdByUserId: actorUserId,
        })),
      });
    }

    return tx.crmSalesTool.findUniqueOrThrow({
      where: { id },
      include: {
        allocations: { orderBy: { effectiveFrom: "desc" } },
        prices: { orderBy: { effectiveFrom: "desc" } },
      },
    });
  });

  return toToolDto(updated);
}

/** Delete a tool. Allocations and price versions cascade (see the migration FKs). */
export async function deleteTool(orgId: string, id: string): Promise<void> {
  const res = await prisma.crmSalesTool.deleteMany({ where: { orgId, id } });
  if (res.count === 0) throw new SalesCostError("Tool not found.", 404);
}

// ---------------------------------------------------------------------------
// Other costs
// ---------------------------------------------------------------------------

export interface OtherCostDto {
  id: string;
  userId: string;
  userName: string | null;
  label: string;
  monthlyAmount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  notes: string | null;
}

export async function listOtherCosts(
  orgId: string,
  opts: { userId?: string } = {},
): Promise<OtherCostDto[]> {
  const rows = await prisma.crmSalesOtherCost.findMany({
    where: { orgId, ...(opts.userId ? { userId: opts.userId } : {}) },
    orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.userName,
    label: r.label,
    monthlyAmount: num(r.monthlyAmount),
    currency: r.currency,
    effectiveFrom: r.effectiveFrom.toISOString(),
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString() : null,
    active: r.active,
    notes: r.notes,
  }));
}

export async function createOtherCost(
  orgId: string,
  input: {
    userId: string;
    label: string;
    monthlyAmount: number;
    currency?: string;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    active?: boolean;
    notes?: string | null;
  },
  actorUserId: string,
): Promise<OtherCostDto> {
  const rep = await assertRepInOrg(orgId, input.userId);
  const from = startOfMonthUtc(input.effectiveFrom);
  const to = input.effectiveTo ? startOfMonthUtc(input.effectiveTo) : null;
  if (to && to <= from) {
    throw new SalesCostError("The end date must be after the start date.", 400);
  }

  const created = await prisma.crmSalesOtherCost.create({
    data: {
      orgId,
      userId: input.userId,
      userName: rep.name,
      label: input.label,
      monthlyAmount: new Prisma.Decimal(input.monthlyAmount),
      currency: input.currency ?? DEFAULT_CURRENCY,
      effectiveFrom: from,
      effectiveTo: to,
      active: input.active ?? true,
      notes: input.notes ?? null,
      createdByUserId: actorUserId,
    },
  });

  return {
    id: created.id,
    userId: created.userId,
    userName: created.userName,
    label: created.label,
    monthlyAmount: num(created.monthlyAmount),
    currency: created.currency,
    effectiveFrom: created.effectiveFrom.toISOString(),
    effectiveTo: created.effectiveTo ? created.effectiveTo.toISOString() : null,
    active: created.active,
    notes: created.notes,
  };
}

export async function updateOtherCost(
  orgId: string,
  id: string,
  input: {
    label?: string;
    monthlyAmount?: number;
    currency?: string;
    effectiveFrom?: Date;
    effectiveTo?: Date | null;
    active?: boolean;
    notes?: string | null;
  },
): Promise<OtherCostDto> {
  const existing = await prisma.crmSalesOtherCost.findFirst({ where: { orgId, id } });
  if (!existing) throw new SalesCostError("Cost entry not found.", 404);

  const from = input.effectiveFrom
    ? startOfMonthUtc(input.effectiveFrom)
    : existing.effectiveFrom;
  const to =
    input.effectiveTo === undefined
      ? existing.effectiveTo
      : input.effectiveTo === null
        ? null
        : startOfMonthUtc(input.effectiveTo);
  if (to && to <= from) {
    throw new SalesCostError("The end date must be after the start date.", 400);
  }

  const updated = await prisma.crmSalesOtherCost.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.monthlyAmount !== undefined
        ? { monthlyAmount: new Prisma.Decimal(input.monthlyAmount) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      effectiveFrom: from,
      effectiveTo: to,
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  return {
    id: updated.id,
    userId: updated.userId,
    userName: updated.userName,
    label: updated.label,
    monthlyAmount: num(updated.monthlyAmount),
    currency: updated.currency,
    effectiveFrom: updated.effectiveFrom.toISOString(),
    effectiveTo: updated.effectiveTo ? updated.effectiveTo.toISOString() : null,
    active: updated.active,
    notes: updated.notes,
  };
}

export async function deleteOtherCost(orgId: string, id: string): Promise<void> {
  const res = await prisma.crmSalesOtherCost.deleteMany({ where: { orgId, id } });
  if (res.count === 0) throw new SalesCostError("Cost entry not found.", 404);
}

// ---------------------------------------------------------------------------
// The breakdown — what the page actually renders
// ---------------------------------------------------------------------------

/**
 * Resolve one rep's complete cost picture for one period.
 *
 * A tool contributes only when BOTH the tool's own window and the rep's
 * allocation window cover the period, and the tool is `active`. That double
 * condition is why pausing a tool or ending one rep's allocation each
 * independently removes the cost, without either rewriting the other's history.
 */
export async function getRepBreakdown(
  orgId: string,
  userId: string,
  period: Period,
  repName?: string,
): Promise<RepCostBreakdown> {
  const [salaryRow, allocations, otherRows, counts] = await Promise.all([
    resolveSalaryForPeriod(orgId, userId, period),
    prisma.crmSalesToolAllocation.findMany({
      where: {
        orgId,
        userId,
        effectiveFrom: { lt: period.end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.start } }],
      },
      // Every price version is loaded so the one in force for `period` can be
      // picked in memory; a tool has a handful of versions at most, and this
      // keeps it to one query rather than one per allocation.
      include: { tool: { include: { prices: true } } },
    }),
    prisma.crmSalesOtherCost.findMany({
      where: {
        orgId,
        userId,
        active: true,
        effectiveFrom: { lt: period.end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.start } }],
      },
    }),
    getRepCounts(orgId, userId, period),
  ]);

  const tools: ToolCostLine[] = [];
  for (const a of allocations) {
    const t = a.tool;
    // The allocation overlaps the period (SQL above); the tool's own window
    // must too, and it must not be paused.
    if (!t.active) continue;
    if (!overlapsPeriod(t.startDate, t.endDate, period)) continue;

    // The price VERSION in force for this period — not "the tool's price".
    // A tool priced ₹8,000 in August and ₹10,000 from September resolves to
    // ₹8,000 here for August, permanently.
    const price = resolvePriceForPeriod(t.prices, period);
    if (!price) continue; // No price configured for this month → no cost.

    const toolCost = num(price.cost);
    const toolMonthly = round2(monthlyCostOf(toolCost, price.billingFrequency));
    const pct = num(a.percentage);

    tools.push({
      allocationId: a.id,
      toolId: t.id,
      toolName: t.name,
      vendor: t.vendor,
      category: t.category,
      toolCost,
      billingFrequency: price.billingFrequency,
      toolMonthlyCost: toolMonthly,
      percentage: pct,
      allocatedMonthlyCost: allocatedCost(toolMonthly, pct),
      active: t.active,
      currency: price.currency,
    });
  }
  tools.sort((a, b) => b.allocatedMonthlyCost - a.allocatedMonthlyCost);

  const otherCosts: OtherCostLine[] = otherRows.map((r) => ({
    id: r.id,
    label: r.label,
    monthlyAmount: num(r.monthlyAmount),
    currency: r.currency,
    notes: r.notes,
  }));

  return buildBreakdown({
    userId,
    userName: repName ?? salaryRow?.userName ?? "Unknown user",
    period: period.key,
    currency: salaryRow?.currency ?? tools[0]?.currency ?? DEFAULT_CURRENCY,
    salary: num(salaryRow?.monthlyAmount),
    tools,
    otherCosts,
    counts,
  });
}

/** One row of the all-reps summary table. */
export interface RepSummaryRow {
  userId: string;
  userName: string;
  role: string;
  currency: string;
  salary: number;
  toolsCost: number;
  otherCost: number;
  totalMonthlyCost: number;
  counts: RepCounts;
  efficiency: RepCostBreakdown["efficiency"];
}

/**
 * The summary table: every CRM rep's total cost and efficiency for a period.
 *
 * Deliberately NOT `listSalesReps().map(getRepBreakdown)` — that would be
 * 4 count queries plus 3 cost queries per rep. Instead the cost rows are
 * fetched in three org-wide queries and the counts in four grouped aggregates,
 * so the whole table is a constant number of queries.
 */
export async function getOrgSummary(
  orgId: string,
  period: Period,
): Promise<{ period: string; rows: RepSummaryRow[] }> {
  const reps = await listSalesReps(orgId);
  const userIds = reps.map((r) => r.userId);
  if (userIds.length === 0) return { period: period.key, rows: [] };

  const inPeriod = {
    effectiveFrom: { lt: period.end },
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.start } }],
  };

  const [salaries, allocations, others, counts] = await Promise.all([
    prisma.crmSalesRepSalary.findMany({
      where: { orgId, userId: { in: userIds }, ...inPeriod },
      orderBy: { effectiveFrom: "desc" },
    }),
    prisma.crmSalesToolAllocation.findMany({
      where: { orgId, userId: { in: userIds }, ...inPeriod },
      // Price versions come along so each allocation can be costed at the price
      // in force for this period — see resolvePriceForPeriod.
      include: { tool: { include: { prices: true } } },
    }),
    prisma.crmSalesOtherCost.findMany({
      where: { orgId, userId: { in: userIds }, active: true, ...inPeriod },
    }),
    getRepCountsBulk(orgId, userIds, period),
  ]);

  // Newest-first ordering means the first row seen per user is the one in force.
  const salaryByUser = new Map<string, (typeof salaries)[number]>();
  for (const s of salaries) {
    if (!salaryByUser.has(s.userId)) salaryByUser.set(s.userId, s);
  }

  const toolsByUser = new Map<string, number>();
  for (const a of allocations) {
    if (!a.tool.active) continue;
    if (!overlapsPeriod(a.tool.startDate, a.tool.endDate, period)) continue;
    // Same period-resolved price the detail view uses, so the summary row and
    // the per-rep breakdown can never disagree about a tool's cost.
    const price = resolvePriceForPeriod(a.tool.prices, period);
    if (!price) continue;
    const monthly = round2(monthlyCostOf(num(price.cost), price.billingFrequency));
    const share = allocatedCost(monthly, num(a.percentage));
    toolsByUser.set(a.userId, round2((toolsByUser.get(a.userId) ?? 0) + share));
  }

  const otherByUser = new Map<string, number>();
  for (const o of others) {
    otherByUser.set(o.userId, round2((otherByUser.get(o.userId) ?? 0) + num(o.monthlyAmount)));
  }

  const rows: RepSummaryRow[] = reps.map((rep) => {
    const salaryRow = salaryByUser.get(rep.userId);
    const salary = num(salaryRow?.monthlyAmount);
    const toolsCost = toolsByUser.get(rep.userId) ?? 0;
    const otherCost = otherByUser.get(rep.userId) ?? 0;
    const repCounts = counts[rep.userId] ?? {
      leads: 0,
      prospects: 0,
      opportunities: 0,
      wonDeals: 0,
    };
    const total = totalMonthlyCost(salary, toolsCost, otherCost);

    return {
      userId: rep.userId,
      userName: rep.name,
      role: rep.role,
      currency: salaryRow?.currency ?? DEFAULT_CURRENCY,
      salary,
      toolsCost,
      otherCost,
      totalMonthlyCost: total,
      counts: repCounts,
      // Same helper the per-rep breakdown uses, so the summary row and the
      // detail page can never disagree about a cost-per-record figure.
      efficiency: computeEfficiency(total, repCounts),
    };
  });

  return { period: period.key, rows };
}
