/**
 * BOQ Repository — Prisma-backed data access for BOQ items, imports, locks.
 *
 * All queries are scoped by tenantId — caller MUST pass a TenantContext.
 * The domain type `BOQItem` (snake_case, flat) is preserved; this repo maps
 * to/from the Prisma `CnBOQItemV2` model (camelCase + Decimal) internally.
 *
 * Why async everywhere: Prisma is async. Service layer has been updated to
 * await these calls.
 */

import type {
  BOQItem,
  BOQImportBatch,
  BOQLockState,
  ParsedBOQNode,
} from "./types";
import { db } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/auth/context";

// ─── Mappers ────────────────────────────────────────────────────────

function dec(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  // Prisma Decimal → number. We accept a modest precision loss for
  // display/rollup; authoritative math happens in SQL / Decimal.
  return typeof v === "number" ? v : Number(v.toString());
}

function toBOQItem(row: any): BOQItem {
  return {
    id: row.id,
    project_id: row.projectId,
    category: row.category,
    boq_no: row.boqNo,
    parent_boq_no: row.parentBoqNo ?? null,
    depth: row.depth,
    sort_order: row.sortOrder,
    is_group: row.isGroup,
    display_name: row.displayName,
    description: row.description ?? "",
    unit: row.unit ?? null,
    tender_qty: dec(row.tenderQty),
    rate: dec(row.rate),
    estimate_amt: dec(row.estimateAmt) ?? 0,
    scope_qty: dec(row.scopeQty) ?? 0,
    sub_done_qty: dec(row.subDoneQty) ?? 0,
    self_done_qty: dec(row.selfDoneQty) ?? 0,
    billed_qty: dec(row.billedQty) ?? 0,
    start_date:
      row.startDate instanceof Date
        ? row.startDate.toISOString().slice(0, 10)
        : (row.startDate ?? null),
    end_date:
      row.endDate instanceof Date
        ? row.endDate.toISOString().slice(0, 10)
        : (row.endDate ?? null),
    is_negative: row.isNegative ?? false,
    source_sheet: row.sourceSheet ?? "",
    import_batch_id: row.importBatchId ?? null,
    created_at:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updated_at:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

function toBOQBatch(row: any): BOQImportBatch {
  return {
    id: row.id,
    project_id: row.projectId,
    uploaded_by: row.uploadedBy,
    uploaded_by_name: row.uploadedByName ?? undefined,
    status: row.status,
    error_detail: row.errorDetail ?? undefined,
    file_name: row.fileName ?? undefined,
    row_count: row.rowCount ?? 0,
    created_at:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function toBOQLockState(row: any, projectId: string): BOQLockState {
  if (!row) {
    return {
      project_id: projectId,
      is_locked: false,
      locked_at: null,
      locked_by: null,
      version: 1,
    };
  }
  return {
    project_id: row.projectId,
    is_locked: row.isLocked,
    locked_at:
      row.lockedAt instanceof Date ? row.lockedAt.toISOString() : row.lockedAt ?? null,
    locked_by: row.lockedBy ?? null,
    version: row.version ?? 1,
  };
}

// ─── Repository ─────────────────────────────────────────────────────

export class BOQRepository {
  // ─── Query ───────────────────────────────────────────────────────

  async listByProject(ctx: TenantContext, projectId: string): Promise<BOQItem[]> {
    const rows = await (db as any).cnBOQItemV2.findMany({
      where: { tenantId: ctx.tenantId, projectId, deletedAt: null },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map(toBOQItem);
  }

  async listLeavesByProject(
    ctx: TenantContext,
    projectId: string
  ): Promise<BOQItem[]> {
    const rows = await (db as any).cnBOQItemV2.findMany({
      where: {
        tenantId: ctx.tenantId,
        projectId,
        isGroup: false,
        deletedAt: null,
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map(toBOQItem);
  }

  async findByBoqNo(
    ctx: TenantContext,
    projectId: string,
    category: string,
    boqNo: string
  ): Promise<BOQItem | null> {
    const row = await (db as any).cnBOQItemV2.findUnique({
      where: {
        tenantId_projectId_category_boqNo: {
          tenantId: ctx.tenantId,
          projectId,
          category,
          boqNo,
        },
      },
    });
    if (!row || row.deletedAt) return null;
    return toBOQItem(row);
  }

  async getCategoriesByProject(
    ctx: TenantContext,
    projectId: string
  ): Promise<string[]> {
    const rows: Array<{ category: string }> = await (db as any).cnBOQItemV2.findMany({
      where: { tenantId: ctx.tenantId, projectId, deletedAt: null },
      select: { category: true },
      distinct: ["category"],
    });
    return rows.map((r) => r.category);
  }

  // ─── Insert ──────────────────────────────────────────────────────

  async bulkInsert(
    ctx: TenantContext,
    projectId: string,
    parsedNodes: ParsedBOQNode[]
  ): Promise<BOQItem[]> {
    if (parsedNodes.length === 0) return [];

    // Run in a transaction so partial failures don't leave orphan rows.
    const inserted = await db.$transaction(async (tx) => {
      const out: any[] = [];
      for (const n of parsedNodes) {
        const estimateAmt = (n.tender_qty ?? 0) * (n.rate ?? 0);
        const created = await (tx as any).cnBOQItemV2.create({
          data: {
            tenantId: ctx.tenantId,
            orgId: ctx.orgId,
            projectId,
            category: n.category,
            boqNo: n.boq_no,
            parentBoqNo: n.parent_boq_no,
            depth: n.depth,
            sortOrder: n.sort_order,
            isGroup: n.is_group,
            displayName: n.display_name,
            description: n.description ?? "",
            unit: n.unit,
            tenderQty: n.tender_qty,
            rate: n.rate,
            estimateAmt,
            scopeQty: n.scope_qty,
            subDoneQty: n.sub_done_qty,
            selfDoneQty: n.self_done_qty,
            billedQty: n.billed_qty,
            startDate: n.start_date ? new Date(n.start_date) : null,
            endDate: n.end_date ? new Date(n.end_date) : null,
            isNegative: n.is_negative,
            sourceSheet: n.source_sheet,
            importBatchId: n.import_batch_id,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        });
        out.push(created);
      }
      return out;
    });

    return inserted.map(toBOQItem);
  }

  // ─── Replace ─────────────────────────────────────────────────────

  /** Wipe all BOQ items for a project (used on lock-free re-import). */
  async replaceForProject(ctx: TenantContext, projectId: string): Promise<void> {
    await (db as any).cnBOQItemV2.deleteMany({
      where: { tenantId: ctx.tenantId, projectId },
    });
  }

  // ─── Manual edit / delete ────────────────────────────────────────

  /** Fetch a single item by id, scoped by tenant + project. */
  async findById(
    ctx: TenantContext,
    projectId: string,
    itemId: string
  ): Promise<BOQItem | null> {
    const row = await (db as any).cnBOQItemV2.findFirst({
      where: { id: itemId, tenantId: ctx.tenantId, projectId, deletedAt: null },
    });
    return row ? toBOQItem(row) : null;
  }

  /**
   * Partially update a BOQ row's editable fields. Recomputes
   * `estimateAmt = tenderQty * rate` whenever either side changes so the
   * rollup stays consistent.
   */
  async updateItem(
    ctx: TenantContext,
    projectId: string,
    itemId: string,
    patch: {
      displayName?: string;
      description?: string;
      unit?: string | null;
      tenderQty?: number | null;
      rate?: number | null;
      scopeQty?: number;
      category?: string;
      startDate?: string | null;
      endDate?: string | null;
    }
  ): Promise<BOQItem | null> {
    const current = await (db as any).cnBOQItemV2.findFirst({
      where: { id: itemId, tenantId: ctx.tenantId, projectId, deletedAt: null },
    });
    if (!current) return null;

    const nextTender =
      patch.tenderQty !== undefined ? patch.tenderQty : Number(current.tenderQty ?? 0);
    const nextRate =
      patch.rate !== undefined ? patch.rate : Number(current.rate ?? 0);

    const data: any = { updatedBy: ctx.userId };
    if (patch.displayName !== undefined) data.displayName = patch.displayName;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.unit !== undefined) data.unit = patch.unit;
    if (patch.tenderQty !== undefined) data.tenderQty = patch.tenderQty;
    if (patch.rate !== undefined) data.rate = patch.rate;
    if (patch.scopeQty !== undefined) data.scopeQty = patch.scopeQty;
    if (patch.category !== undefined) data.category = patch.category;
    if (patch.startDate !== undefined) {
      data.startDate = patch.startDate ? new Date(patch.startDate) : null;
    }
    if (patch.endDate !== undefined) {
      data.endDate = patch.endDate ? new Date(patch.endDate) : null;
    }
    data.estimateAmt = (nextTender ?? 0) * (nextRate ?? 0);
    data.isNegative = (nextTender ?? 0) < 0;

    const updated = await (db as any).cnBOQItemV2.update({
      where: { id: itemId },
      data,
    });
    return toBOQItem(updated);
  }

  /**
   * Soft-delete one BOQ row by stamping `deletedAt`. The row is no longer
   * visible to any read path but the physical record stays so historical
   * DPR/RAB postings that reference the row keep their foreign-key-like
   * joins coherent. Hard delete is intentionally not exposed.
   */
  async deleteItem(
    ctx: TenantContext,
    projectId: string,
    itemId: string
  ): Promise<boolean> {
    const res = await (db as any).cnBOQItemV2.updateMany({
      where: {
        id: itemId,
        tenantId: ctx.tenantId,
        projectId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
    return res.count > 0;
  }

  // ─── Progress updates (DPR/RAB) ──────────────────────────────────

  async addDoneQty(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    workType: "sub_contractor" | "self"
  ): Promise<{ success: boolean; error?: string; item?: BOQItem }> {
    // BOQ refs should be unique within project+category, but since the caller
    // only gives us project+boq_no we locate by (project, boq_no) and reject
    // groups.
    const row = await (db as any).cnBOQItemV2.findFirst({
      where: { tenantId: ctx.tenantId, projectId, boqNo, deletedAt: null },
    });
    if (!row)
      return { success: false, error: `BOQ item ${boqNo} not found in project` };
    if (row.isGroup)
      return {
        success: false,
        error: `Cannot update progress on group row ${boqNo}. Only leaves accept progress.`,
      };

    const field = workType === "sub_contractor" ? "subDoneQty" : "selfDoneQty";
    const updated = await (db as any).cnBOQItemV2.update({
      where: { id: row.id },
      data: {
        [field]: { increment: qty },
        updatedBy: ctx.userId,
      },
    });
    return { success: true, item: toBOQItem(updated) };
  }

  async reverseDoneQty(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    workType: "sub_contractor" | "self"
  ): Promise<{ success: boolean; error?: string }> {
    const row = await (db as any).cnBOQItemV2.findFirst({
      where: { tenantId: ctx.tenantId, projectId, boqNo, deletedAt: null },
    });
    if (!row) return { success: false, error: `BOQ item ${boqNo} not found` };
    if (row.isGroup) return { success: false, error: `Cannot reverse on group row` };

    const field = workType === "sub_contractor" ? "subDoneQty" : "selfDoneQty";
    const current = Number(row[field]?.toString() ?? 0);
    const next = Math.max(0, current - qty);

    await (db as any).cnBOQItemV2.update({
      where: { id: row.id },
      data: { [field]: next, updatedBy: ctx.userId },
    });
    return { success: true };
  }

  async addBilledQty(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number
  ): Promise<{ success: boolean; error?: string }> {
    const row = await (db as any).cnBOQItemV2.findFirst({
      where: { tenantId: ctx.tenantId, projectId, boqNo, deletedAt: null },
    });
    if (!row) return { success: false, error: `BOQ item ${boqNo} not found` };
    if (row.isGroup) return { success: false, error: `Cannot bill group row` };

    await (db as any).cnBOQItemV2.update({
      where: { id: row.id },
      data: { billedQty: { increment: qty }, updatedBy: ctx.userId },
    });
    return { success: true };
  }

  async updateScopeQty(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    scopeQty: number
  ): Promise<{ success: boolean; error?: string }> {
    const row = await (db as any).cnBOQItemV2.findFirst({
      where: { tenantId: ctx.tenantId, projectId, boqNo, deletedAt: null },
    });
    if (!row) return { success: false, error: `BOQ item ${boqNo} not found` };
    if (row.isGroup) return { success: false, error: `Cannot set scope on group row` };

    await (db as any).cnBOQItemV2.update({
      where: { id: row.id },
      data: { scopeQty, updatedBy: ctx.userId },
    });
    return { success: true };
  }

  // ─── Import Batches ──────────────────────────────────────────────

  async createImportBatch(
    ctx: TenantContext,
    projectId: string,
    uploadedBy: string,
    fileName?: string,
    parsedNodes?: ParsedBOQNode[]
  ): Promise<BOQImportBatch> {
    const row = await (db as any).cnBOQImportBatch.create({
      data: {
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        projectId,
        uploadedBy,
        uploadedByName: ctx.userName,
        fileName: fileName ?? null,
        status: "processing",
        parsedNodes: parsedNodes ? (parsedNodes as any) : undefined,
      },
    });
    return toBOQBatch(row);
  }

  async updateImportBatch(
    ctx: TenantContext,
    batchId: string,
    updates: Partial<BOQImportBatch> & { parsed_nodes?: ParsedBOQNode[] }
  ): Promise<BOQImportBatch | null> {
    const data: any = {};
    if (updates.status !== undefined) data.status = updates.status;
    if (updates.row_count !== undefined) data.rowCount = updates.row_count;
    if (updates.error_detail !== undefined) data.errorDetail = updates.error_detail;
    if (updates.file_name !== undefined) data.fileName = updates.file_name;
    if (updates.parsed_nodes !== undefined) data.parsedNodes = updates.parsed_nodes as any;

    const row = await (db as any).cnBOQImportBatch.update({
      where: { id: batchId },
      data,
    });
    return row ? toBOQBatch(row) : null;
  }

  async findImportBatch(
    ctx: TenantContext,
    batchId: string
  ): Promise<(BOQImportBatch & { parsedNodes?: ParsedBOQNode[] }) | null> {
    const row = await (db as any).cnBOQImportBatch.findFirst({
      where: { id: batchId, tenantId: ctx.tenantId },
    });
    if (!row) return null;
    return {
      ...toBOQBatch(row),
      parsedNodes: (row.parsedNodes as ParsedBOQNode[] | undefined) ?? undefined,
    };
  }

  // ─── Lock State ──────────────────────────────────────────────────

  async getLockState(ctx: TenantContext, projectId: string): Promise<BOQLockState> {
    const row = await (db as any).cnBOQLockState.findUnique({
      where: { projectId },
    });
    if (row && row.tenantId !== ctx.tenantId) {
      // Defense-in-depth: never return a lock state from another tenant.
      return toBOQLockState(null, projectId);
    }
    return toBOQLockState(row, projectId);
  }

  async lock(
    ctx: TenantContext,
    projectId: string,
    lockedBy: string
  ): Promise<BOQLockState> {
    const row = await (db as any).cnBOQLockState.upsert({
      where: { projectId },
      create: {
        projectId,
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        isLocked: true,
        lockedAt: new Date(),
        lockedBy,
        version: 1,
      },
      update: {
        isLocked: true,
        lockedAt: new Date(),
        lockedBy,
      },
    });
    return toBOQLockState(row, projectId);
  }

  async unlock(
    ctx: TenantContext,
    projectId: string,
    _unlockedBy: string
  ): Promise<BOQLockState> {
    const row = await (db as any).cnBOQLockState.upsert({
      where: { projectId },
      create: {
        projectId,
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        isLocked: false,
        version: 1,
      },
      update: {
        isLocked: false,
        lockedAt: null,
        lockedBy: null,
        version: { increment: 1 },
      },
    });
    return toBOQLockState(row, projectId);
  }

  async isLocked(ctx: TenantContext, projectId: string): Promise<boolean> {
    const s = await this.getLockState(ctx, projectId);
    return s.is_locked;
  }
}

export const boqRepository = new BOQRepository();
