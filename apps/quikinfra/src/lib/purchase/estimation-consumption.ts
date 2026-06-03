/**
 * Material Estimation consumption.
 *
 * Caps how much of each material can be requisitioned across PRs based
 * on the approved material estimations under a project. Budget is the
 * sum of `materials[].totalQty` across all approved `CnMaterialEstimation`
 * rows for the project (optionally narrowed to a single BOQ leaf).
 * Consumption is the sum of `quantity` across all live PR lines for the
 * same project + itemId.
 *
 * "Live" excludes rejected and cancelled PRs so a rejected draft doesn't
 * permanently eat budget. Open / approved / closed PRs all count.
 */

import { db } from "@/lib/db/prisma";
import { listEstimations } from "@/lib/projects/estimation-repository";

const DEAD_PR_STATUSES = new Set(["rejected", "cancelled", "void"]);

export interface BudgetRow {
  itemId: string;
  itemName: string;
  uomCode: string;
  estimated: number;
  consumed: number;
  remaining: number;
}

export interface BudgetLookupOptions {
  /** When set, only estimations for this BOQ leaf are counted. */
  boqItemId?: string | null;
  /** Skip consumption from this PR id (used when editing an existing PR). */
  ignorePrId?: string | null;
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute the per-material budget map for a project.
 *
 * Returns one entry per itemId that appears in at least one approved
 * estimation for the project (filtered by `boqItemId` when supplied).
 * Items not surfaced by any approved estimation are absent — callers
 * should treat "missing from the map" as "no budget configured".
 */
export async function getProjectMaterialBudget(
  orgId: string,
  projectId: string,
  options: BudgetLookupOptions = {},
): Promise<BudgetRow[]> {
  const { boqItemId = null, ignorePrId = null } = options;

  const estimations = await listEstimations(orgId, { projectId });
  const approved = estimations.filter(
    (e: any) =>
      String(e?.status ?? "").toLowerCase() === "approved" &&
      (!boqItemId || e.boqItemId === boqItemId || e.boqNo === boqItemId),
  );

  const byItem = new Map<string, BudgetRow>();
  for (const est of approved) {
    const mats: any[] = Array.isArray(est.materials) ? est.materials : [];
    for (const m of mats) {
      const itemId = String(m?.itemId ?? "").trim();
      if (!itemId) continue;
      const existing = byItem.get(itemId);
      const qty = toNum(m.totalQty);
      if (existing) {
        existing.estimated += qty;
      } else {
        byItem.set(itemId, {
          itemId,
          itemName: String(m.itemName ?? ""),
          uomCode: String(m.uomCode ?? ""),
          estimated: qty,
          consumed: 0,
          remaining: 0,
        });
      }
    }
  }

  if (byItem.size === 0) return [];

  const itemIds = Array.from(byItem.keys());

  const consumed = await sumLivePrLineQuantities(
    orgId,
    projectId,
    itemIds,
    ignorePrId,
  );
  for (const [itemId, qty] of consumed) {
    const row = byItem.get(itemId);
    if (row) row.consumed = qty;
  }

  await backfillItemNames(orgId, byItem);

  for (const row of byItem.values()) {
    row.remaining = Math.max(0, row.estimated - row.consumed);
  }

  return Array.from(byItem.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName),
  );
}

async function sumLivePrLineQuantities(
  orgId: string,
  projectId: string,
  itemIds: string[],
  ignorePrId: string | null,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (itemIds.length === 0) return out;

  const prs = await (db as any).cnPurchaseRequisition.findMany({
    where: {
      orgId,
      projectId,
      ...(ignorePrId ? { NOT: { id: ignorePrId } } : {}),
    },
    select: {
      status: true,
      lines: {
        where: { itemId: { in: itemIds } },
        select: { itemId: true, quantity: true },
      },
    },
  });

  for (const pr of prs) {
    const status = String(pr.status ?? "").toLowerCase();
    if (DEAD_PR_STATUSES.has(status)) continue;
    for (const line of pr.lines ?? []) {
      const itemId = String(line.itemId ?? "").trim();
      if (!itemId) continue;
      out.set(itemId, (out.get(itemId) ?? 0) + toNum(line.quantity));
    }
  }
  return out;
}

async function backfillItemNames(
  orgId: string,
  byItem: Map<string, BudgetRow>,
): Promise<void> {
  const missing = Array.from(byItem.values()).filter(
    (r) => !r.itemName || !r.uomCode,
  );
  if (missing.length === 0) return;
  try {
    const rows = await (db as any).cnItem.findMany({
      where: { orgId, id: { in: missing.map((m) => m.itemId) } },
      select: { id: true, name: true, uom: { select: { code: true } } },
    });
    const byId = new Map<string, any>(rows.map((r: any) => [r.id, r]));
    for (const row of missing) {
      const item = byId.get(row.itemId);
      if (!item) continue;
      if (!row.itemName) row.itemName = item.name ?? row.itemId;
      if (!row.uomCode) row.uomCode = item.uom?.code ?? "";
    }
  } catch {
    /* Item master lookup is best-effort; falls back to raw itemId. */
  }
}

export interface PrLineForCheck {
  itemId: string;
  quantity: string | number;
}

export interface BudgetBreach {
  itemId: string;
  itemName: string;
  uomCode: string;
  requested: number;
  remaining: number;
  estimated: number;
  consumed: number;
}

/**
 * Validate a set of PR lines against the project's approved estimation
 * budget. Lines that exceed the remaining qty for their itemId surface
 * in `breaches`. Lines whose itemId isn't covered by any approved
 * estimation are allowed through — they aren't constrained by a budget.
 */
export async function validatePrLinesAgainstBudget(
  orgId: string,
  projectId: string,
  lines: PrLineForCheck[],
  options: BudgetLookupOptions = {},
): Promise<{ ok: true } | { ok: false; breaches: BudgetBreach[] }> {
  const budget = await getProjectMaterialBudget(orgId, projectId, options);
  if (budget.length === 0) return { ok: true };

  const byItem = new Map(budget.map((b) => [b.itemId, b]));

  const aggregated = new Map<string, number>();
  for (const line of lines) {
    const itemId = String(line.itemId ?? "").trim();
    if (!itemId) continue;
    const qty = toNum(line.quantity);
    if (qty <= 0) continue;
    aggregated.set(itemId, (aggregated.get(itemId) ?? 0) + qty);
  }

  const breaches: BudgetBreach[] = [];
  for (const [itemId, requested] of aggregated) {
    const row = byItem.get(itemId);
    if (!row) continue;
    if (requested > row.remaining) {
      breaches.push({
        itemId,
        itemName: row.itemName,
        uomCode: row.uomCode,
        requested,
        remaining: row.remaining,
        estimated: row.estimated,
        consumed: row.consumed,
      });
    }
  }

  return breaches.length === 0 ? { ok: true } : { ok: false, breaches };
}

export function formatBreachMessage(breaches: BudgetBreach[]): string {
  return breaches
    .map(
      (b) =>
        `${b.itemName || b.itemId}: requested ${b.requested}${
          b.uomCode ? ` ${b.uomCode}` : ""
        }, only ${b.remaining} left (estimated ${b.estimated}, already consumed ${b.consumed}).`,
    )
    .join(" ");
}
