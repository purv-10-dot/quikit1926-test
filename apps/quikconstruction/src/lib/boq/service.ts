/**
 * BOQ Service — Orchestration layer for BOQ workflows
 *
 * Coordinates parser, validator, repository (Prisma), and rollup services.
 * All business rules + transactional behavior lives here.
 *
 * Tenant discipline: EVERY method takes a TenantContext as its first arg.
 * The service refuses to operate without one. Routes are expected to resolve
 * the context via `requireAuth()` / `requirePermission()` from @/lib/auth.
 */

import type {
  BOQItem,
  BOQItemComputed,
  ImportPreview,
  ParsedBOQNode,
  MultiSheetInput,
} from "./types";
import { parseBOQWorkbook } from "./parser";
import { boqRepository } from "./repository";
import { applyRollup, computeBOQSummary } from "./rollup";
import type { TenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db/prisma";
import {
  postProgressEntry,
  ProgressLedgerError,
} from "./progress-ledger";
import { postBillingEntry, BillingLedgerError } from "./billing-ledger";
import {
  runImportPipeline,
  type ImportMode,
  type NormalizedBoqRow,
  type PipelineResult,
  type RawSheet,
} from "./import";

/**
 * Best-effort project existence probe. Projects live in `projects`;
 * if the id isn't there, we let the BOQ insert hit its native FK error
 * — that's the right signal to the caller that the projectId is stale.
 * Kept as a hook point so future "sync project from external system"
 * logic has a place to live without changing call sites.
 */
async function ensureCnProjectExists(
  projectId: string,
  _tenantId: string,
  _orgId: string,
  _createdBy: string,
): Promise<void> {
  await (db as any).cnProject.findUnique({ where: { id: projectId } }).catch(() => null);
}

export class BOQError extends Error {
  code: string;
  httpStatus: number;
  details?: any;
  constructor(code: string, message: string, httpStatus = 400, details?: any) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.name = "BOQError";
  }
}

export class BOQService {
  private repo = boqRepository;

  // ─── Query ─────────────────────────────────────────────────────────

  /**
   * Get BOQ tree with rollups and computed columns.
   * Used by grid UI and all downstream reports.
   */
  async getBOQTree(
    ctx: TenantContext,
    projectId: string,
    categoryFilter?: string
  ): Promise<{
    items: BOQItemComputed[];
    summary: ReturnType<typeof computeBOQSummary>;
    lockState: Awaited<ReturnType<typeof boqRepository.getLockState>>;
  }> {
    const items = await this.repo.listByProject(ctx, projectId);

    // Apply rollup (always on full set, then filter)
    const rolled = applyRollup(items);

    // Filter by category after rollup
    const filtered =
      categoryFilter && categoryFilter !== "all"
        ? rolled.filter(
            (i) => (i.category ?? "").toLowerCase() === categoryFilter.toLowerCase()
          )
        : rolled;

    const summary = computeBOQSummary(rolled, categoryFilter);
    const lockState = await this.repo.getLockState(ctx, projectId);

    return { items: filtered, summary, lockState };
  }

  /**
   * Get only leaf items for transactional modules (DPR, WO, MR, RAB).
   * Per spec: only leaves are usable, never groups.
   */
  async getLeafItems(
    ctx: TenantContext,
    projectId: string,
    categoryFilter?: string
  ): Promise<BOQItemComputed[]> {
    const items = await this.repo.listLeavesByProject(ctx, projectId);
    const rolled = applyRollup(items);
    if (categoryFilter && categoryFilter !== "all") {
      return rolled.filter(
        (i) =>
          !i.is_group &&
          (i.category ?? "").toLowerCase() === categoryFilter.toLowerCase()
      );
    }
    return rolled.filter((i) => !i.is_group);
  }

  // ─── Import ────────────────────────────────────────────────────────

  /**
   * Stage 1: Parse + validate + return preview.
   * Persists the parsed node set onto the import batch so stage-2 confirm
   * can commit without re-parsing.
   */
  async createImportPreview(
    ctx: TenantContext,
    projectId: string,
    sheets: MultiSheetInput[],
    fileName?: string
  ): Promise<ImportPreview> {
    // V08: Lock check
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError(
        "BOQ_LOCKED",
        "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
        403
      );
    }

    // Create batch with no parsedNodes yet (we'll store them after parse)
    // Masters still live in demo-store; bridge to projects so the
    // batch's FK doesn't blow up. Idempotent — no-op if the row exists.
    await ensureCnProjectExists(projectId, ctx.tenantId, ctx.orgId, ctx.userId);

    const batch = await this.repo.createImportBatch(
      ctx,
      projectId,
      ctx.userId,
      fileName
    );

    const result = parseBOQWorkbook(sheets, projectId, batch.id);

    const errors = result.issues.filter((i) => i.severity === "error");
    const warnings = result.issues.filter((i) => i.severity === "warning");

    const categories: Record<string, number> = {};
    for (const node of result.nodes) {
      categories[node.category] = (categories[node.category] ?? 0) + 1;
    }

    const preview: ImportPreview = {
      batchId: batch.id,
      totalRows: result.nodes.length,
      leafItems: result.nodes.filter((n) => !n.is_group).length,
      groupHeaders: result.nodes.filter((n) => n.is_group).length,
      categories,
      nodes: result.nodes,
      errors,
      warnings,
      requiresConfirmation: true,
    };

    // Persist parsed nodes + status on batch for stage 2
    await this.repo.updateImportBatch(ctx, batch.id, {
      status: errors.length > 0 ? "failed" : "preview_ready",
      row_count: result.nodes.length,
      error_detail: errors.length > 0 ? (errors as any) : null,
      parsed_nodes: result.nodes,
    } as any);

    return preview;
  }

  /**
   * Stage 2: Confirm import — insert nodes into DB from the staged batch.
   */
  async confirmImport(
    ctx: TenantContext,
    projectId: string,
    batchId: string
  ): Promise<{ success: boolean; insertedCount: number; message: string }> {
    const batch = await this.repo.findImportBatch(ctx, batchId);
    if (!batch)
      throw new BOQError("BATCH_NOT_FOUND", `Import batch ${batchId} not found`, 404);
    if (batch.project_id !== projectId)
      throw new BOQError(
        "BATCH_MISMATCH",
        "Batch belongs to a different project",
        400
      );
    if (batch.status === "failed")
      throw new BOQError(
        "BATCH_HAS_ERRORS",
        "Cannot confirm batch with errors. Fix and re-upload.",
        400
      );
    if (batch.status === "imported")
      throw new BOQError(
        "BATCH_ALREADY_IMPORTED",
        "This batch has already been imported",
        400
      );

    const parsedNodes = (batch as any).parsedNodes as ParsedBOQNode[] | undefined;
    if (!parsedNodes || parsedNodes.length === 0) {
      throw new BOQError("BATCH_EMPTY", "No parsed nodes available on this batch", 400);
    }

    // Replace existing BOQ for this project (re-import semantics)
    await this.repo.replaceForProject(ctx, projectId);

    // Bulk insert inside a transaction (repository handles that)
    const inserted = await this.repo.bulkInsert(ctx, projectId, parsedNodes);

    await this.repo.updateImportBatch(ctx, batchId, { status: "imported" });

    return {
      success: true,
      insertedCount: inserted.length,
      message: `${inserted.length} BOQ items imported successfully`,
    };
  }

  /**
   * Combined preview + import in one call (simpler API for UI).
   * Parses, validates, and if no errors, immediately inserts.
   */
  async importWithPreview(
    ctx: TenantContext,
    projectId: string,
    sheets: MultiSheetInput[],
    fileName?: string,
    replaceExisting = false
  ): Promise<{ preview: ImportPreview; inserted?: BOQItem[] }> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError(
        "BOQ_LOCKED",
        "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
        403
      );
    }

    // Masters still live in demo-store; bridge to projects so the
    // batch's FK doesn't blow up. Idempotent — no-op if the row exists.
    await ensureCnProjectExists(projectId, ctx.tenantId, ctx.orgId, ctx.userId);

    const batch = await this.repo.createImportBatch(
      ctx,
      projectId,
      ctx.userId,
      fileName
    );
    const result = parseBOQWorkbook(sheets, projectId, batch.id);

    const errors = result.issues.filter((i) => i.severity === "error");
    const warnings = result.issues.filter((i) => i.severity === "warning");

    const categories: Record<string, number> = {};
    for (const node of result.nodes) {
      categories[node.category] = (categories[node.category] ?? 0) + 1;
    }

    const preview: ImportPreview = {
      batchId: batch.id,
      totalRows: result.nodes.length,
      leafItems: result.nodes.filter((n) => !n.is_group).length,
      groupHeaders: result.nodes.filter((n) => n.is_group).length,
      categories,
      nodes: result.nodes,
      errors,
      warnings,
      requiresConfirmation: false,
    };

    if (errors.length > 0) {
      await this.repo.updateImportBatch(ctx, batch.id, {
        status: "failed",
        error_detail: errors as any,
      });
      return { preview };
    }

    if (replaceExisting) {
      await this.repo.replaceForProject(ctx, projectId);
    }

    const inserted = await this.repo.bulkInsert(ctx, projectId, result.nodes);
    await this.repo.updateImportBatch(ctx, batch.id, {
      status: "imported",
      row_count: inserted.length,
    });

    return { preview, inserted };
  }

  // ─── Dual BOQ Import Engine ────────────────────────────────────────
  //
  // New entry points that go through src/lib/boq/import (strict + generic
  // adapters with shared pipeline). Returns a PipelineResult — one stable
  // shape consumed by both /preview-upload and /import routes.

  /**
   * Dry-run: detect mode, parse, validate, return preview (no DB writes).
   * Lock state is checked up front so a locked project can't even preview.
   */
  async previewDualImport(
    ctx: TenantContext,
    projectId: string,
    sheets: RawSheet[],
    selectedMode: ImportMode | "AUTO" = "AUTO",
    universalMapping?: import("./import/universal-adapter").UniversalMapping,
  ): Promise<PipelineResult> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError(
        "BOQ_LOCKED",
        "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
        403
      );
    }
    return runImportPipeline(sheets, {
      projectId,
      tenantId: ctx.tenantId,
      importBatchId: null,
      selectedMode,
      universalMapping,
    });
  }

  /**
   * Full run: detect mode, parse, validate, then persist on success.
   * On any pipeline error the function short-circuits and returns the
   * preview WITHOUT touching the database. The caller is expected to
   * surface the errors to the user and ask for a corrected file.
   */
  async runDualImport(
    ctx: TenantContext,
    projectId: string,
    sheets: RawSheet[],
    fileName: string | undefined,
    replaceExisting: boolean,
    selectedMode: ImportMode | "AUTO" = "AUTO",
    universalMapping?: import("./import/universal-adapter").UniversalMapping,
  ): Promise<{
    pipeline: PipelineResult;
    inserted: BOQItem[];
    batchId: string | null;
  }> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError(
        "BOQ_LOCKED",
        "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
        403
      );
    }

    // Stage the batch up front so the pipeline can stamp rows with batchId
    // and so we can record failures even when the parser rejects everything.
    // Masters still live in demo-store; bridge to projects so the
    // batch's FK doesn't blow up. Idempotent — no-op if the row exists.
    await ensureCnProjectExists(projectId, ctx.tenantId, ctx.orgId, ctx.userId);

    const batch = await this.repo.createImportBatch(
      ctx,
      projectId,
      ctx.userId,
      fileName
    );

    const pipeline = runImportPipeline(sheets, {
      projectId,
      tenantId: ctx.tenantId,
      importBatchId: batch.id,
      selectedMode,
      universalMapping,
    });

    if (pipeline.errors.length > 0) {
      await this.repo.updateImportBatch(ctx, batch.id, {
        status: "failed",
        row_count: pipeline.rows.length,
        error_detail: pipeline.errors as any,
      });
      return { pipeline, inserted: [], batchId: batch.id };
    }

    if (replaceExisting) {
      await this.repo.replaceForProject(ctx, projectId);
    }

    // Map NormalizedBoqRow → ParsedBOQNode for the legacy bulkInsert.
    // The two shapes overlap by design; this is the only seam that
    // bridges the new pipeline to the old persistence layer.
    const parsedNodes: ParsedBOQNode[] = pipeline.rows.map((r) => ({
      project_id: r.projectId,
      category: r.category,
      boq_no: r.boqNo,
      parent_boq_no: r.parentBoqNo,
      depth: r.depth,
      sort_order: r.sortOrder,
      is_group: r.isGroup,
      display_name: r.displayName,
      description: r.description,
      unit: r.unit,
      tender_qty: r.tenderQty,
      rate: r.rate,
      scope_qty: r.scopeQty,
      sub_done_qty: r.subDoneQty,
      self_done_qty: r.selfDoneQty,
      billed_qty: r.billedQty,
      is_negative: (r.tenderQty ?? 0) < 0,
      source_sheet: r.sourceSheet,
      import_batch_id: batch.id,
      _row_number: r.sourceRowNumber,
    }));

    const inserted = await this.repo.bulkInsert(ctx, projectId, parsedNodes);

    await this.repo.updateImportBatch(ctx, batch.id, {
      status: "imported",
      row_count: inserted.length,
    });

    return { pipeline, inserted, batchId: batch.id };
  }

  /**
   * Persist a set of pre-parsed NormalizedBoqRow rows (from a preview
   * round-trip) into the BOQ store.
   *
   * Defence-in-depth: even though the rows came from a server preview,
   * we re-resolve hierarchy and re-run the validator before persisting —
   * a tampered or stale payload should still be rejected.
   */
  async persistDualImport(
    ctx: TenantContext,
    projectId: string,
    rows: NormalizedBoqRow[],
    fileName: string | undefined,
    replaceExisting: boolean,
    mode: ImportMode
  ): Promise<{
    inserted: BOQItem[];
    batchId: string;
    errors: any[];
    warnings: any[];
  }> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError(
        "BOQ_LOCKED",
        "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
        403
      );
    }

    // Masters still live in demo-store; bridge to projects so the
    // batch's FK doesn't blow up. Idempotent — no-op if the row exists.
    await ensureCnProjectExists(projectId, ctx.tenantId, ctx.orgId, ctx.userId);

    const batch = await this.repo.createImportBatch(
      ctx,
      projectId,
      ctx.userId,
      fileName
    );

    // Re-stamp tenant + batch + projectId — never trust client-supplied values.
    const stamped: NormalizedBoqRow[] = rows.map((r) => ({
      ...r,
      projectId,
      tenantId: ctx.tenantId,
      importBatchId: batch.id,
      importMode: mode,
      // wipe operational fields just in case
      scopeQty: 0,
      subDoneQty: 0,
      selfDoneQty: 0,
      billedQty: 0,
    }));

    // Re-resolve hierarchy + re-validate
    const { resolveHierarchy } = await import("./import/hierarchy");
    const { validateNormalizedRows } = await import("./import/validator");

    const hier = resolveHierarchy(stamped);
    const val = validateNormalizedRows(hier.rows);

    const errors = [
      ...hier.issues.filter((i) => i.severity === "error"),
      ...val.errors,
    ];
    const warnings = [
      ...hier.issues.filter((i) => i.severity === "warning"),
      ...val.warnings,
    ];

    if (errors.length > 0) {
      await this.repo.updateImportBatch(ctx, batch.id, {
        status: "failed",
        row_count: val.rows.length,
        error_detail: errors as any,
      });
      return { inserted: [], batchId: batch.id, errors, warnings };
    }

    if (replaceExisting) {
      await this.repo.replaceForProject(ctx, projectId);
    }

    const parsedNodes: ParsedBOQNode[] = val.rows.map((r) => ({
      project_id: r.projectId,
      category: r.category,
      boq_no: r.boqNo,
      parent_boq_no: r.parentBoqNo,
      depth: r.depth,
      sort_order: r.sortOrder,
      is_group: r.isGroup,
      display_name: r.displayName,
      description: r.description,
      unit: r.unit,
      tender_qty: r.tenderQty,
      rate: r.rate,
      scope_qty: r.scopeQty,
      sub_done_qty: r.subDoneQty,
      self_done_qty: r.selfDoneQty,
      billed_qty: r.billedQty,
      is_negative: (r.tenderQty ?? 0) < 0,
      source_sheet: r.sourceSheet,
      import_batch_id: batch.id,
      _row_number: r.sourceRowNumber,
    }));

    const inserted = await this.repo.bulkInsert(ctx, projectId, parsedNodes);

    await this.repo.updateImportBatch(ctx, batch.id, {
      status: "imported",
      row_count: inserted.length,
    });

    return { inserted, batchId: batch.id, errors, warnings };
  }

  // ─── Lock / Unlock ─────────────────────────────────────────────────

  async lockBOQ(
    ctx: TenantContext,
    projectId: string
  ): Promise<Awaited<ReturnType<typeof boqRepository.getLockState>>> {
    const items = await this.repo.listByProject(ctx, projectId);
    if (items.length === 0) {
      throw new BOQError("EMPTY_BOQ", "Cannot lock an empty BOQ. Import items first.", 400);
    }
    return this.repo.lock(ctx, projectId, ctx.userName || ctx.userId);
  }

  async unlockBOQ(
    ctx: TenantContext,
    projectId: string
  ): Promise<Awaited<ReturnType<typeof boqRepository.getLockState>>> {
    return this.repo.unlock(ctx, projectId, ctx.userName || ctx.userId);
  }

  // ─── Manual Item Management ────────────────────────────────────────

  /** Add a single BOQ item manually (when unlocked). */
  async addManualItem(
    ctx: TenantContext,
    projectId: string,
    item: Partial<ParsedBOQNode>
  ): Promise<BOQItem> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError("BOQ_LOCKED", "Cannot add items to a locked BOQ", 403);
    }

    const existing = await this.repo.listByProject(ctx, projectId);
    const sortOrder = existing.length + 1;

    const node: ParsedBOQNode = {
      project_id: projectId,
      category: item.category ?? "Civil Building",
      boq_no: item.boq_no ?? `NEW-${Date.now()}`,
      parent_boq_no: item.parent_boq_no ?? null,
      depth: item.depth ?? 0,
      sort_order: sortOrder,
      is_group: item.is_group ?? false,
      display_name: item.display_name ?? "",
      description: item.description ?? "",
      unit: item.unit ?? null,
      tender_qty: item.tender_qty ?? null,
      rate: item.rate ?? null,
      scope_qty: 0,
      sub_done_qty: 0,
      self_done_qty: 0,
      billed_qty: 0,
      start_date: item.start_date ?? null,
      end_date: item.end_date ?? null,
      is_negative: (item.tender_qty ?? 0) < 0,
      source_sheet: item.category ?? "Manual",
      import_batch_id: null,
    };

    const [inserted] = await this.repo.bulkInsert(ctx, projectId, [node]);
    return inserted;
  }

  /** Update a BOQ item manually. Blocked when the BOQ is locked. */
  async updateManualItem(
    ctx: TenantContext,
    projectId: string,
    itemId: string,
    patch: {
      display_name?: string;
      description?: string;
      unit?: string | null;
      tender_qty?: number | null;
      rate?: number | null;
      scope_qty?: number;
      category?: string;
      start_date?: string | null;
      end_date?: string | null;
    }
  ): Promise<BOQItem> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError("BOQ_LOCKED", "Cannot edit items on a locked BOQ", 403);
    }
    const existing = await this.repo.findById(ctx, projectId, itemId);
    if (!existing) {
      throw new BOQError("NOT_FOUND", `BOQ item ${itemId} not found`, 404);
    }
    const updated = await this.repo.updateItem(ctx, projectId, itemId, {
      displayName: patch.display_name,
      description: patch.description,
      unit: patch.unit,
      tenderQty: patch.tender_qty,
      rate: patch.rate,
      scopeQty: patch.scope_qty,
      category: patch.category,
      startDate: patch.start_date,
      endDate: patch.end_date,
    });
    if (!updated) {
      throw new BOQError("NOT_FOUND", `BOQ item ${itemId} not found`, 404);
    }
    return updated;
  }

  /** Delete one BOQ item manually. Blocked when the BOQ is locked. */
  async deleteManualItem(
    ctx: TenantContext,
    projectId: string,
    itemId: string
  ): Promise<void> {
    if (await this.repo.isLocked(ctx, projectId)) {
      throw new BOQError("BOQ_LOCKED", "Cannot delete items on a locked BOQ", 403);
    }
    const ok = await this.repo.deleteItem(ctx, projectId, itemId);
    if (!ok) {
      throw new BOQError("NOT_FOUND", `BOQ item ${itemId} not found`, 404);
    }
  }

  // ─── DPR / RAB Integration (ledger-backed, transactional) ─────────

  /**
   * Apply one progress posting from DPR approval.
   *
   * This method is intentionally single-line-scoped. For multi-line DPRs the
   * caller should wrap the whole batch in a single `db.$transaction` and
   * pass its `tx` client in via `applyDPRProgressTxn` — otherwise each line
   * is its own transaction and a partial failure leaves inconsistent state.
   *
   * For backwards-compat this convenience wrapper opens its own txn.
   */
  async applyDPRProgress(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    workType: "sub_contractor" | "self",
    opts?: { dprId?: string; dprLineId?: string; overrideFlag?: boolean; overrideReason?: string }
  ): Promise<void> {
    try {
      await db.$transaction(async (tx) => {
        await postProgressEntry(tx as any, ctx, {
          projectId,
          boqNo,
          qty,
          workType,
          direction: 1,
          dprId: opts?.dprId,
          dprLineId: opts?.dprLineId,
          overrideFlag: opts?.overrideFlag,
          overrideReason: opts?.overrideReason,
        });
      });
    } catch (err: any) {
      if (err instanceof ProgressLedgerError) {
        throw new BOQError(err.code, err.message, err.httpStatus);
      }
      throw new BOQError(
        "DPR_UPDATE_FAILED",
        err.message ?? "Failed to update BOQ from DPR",
        400
      );
    }
  }

  /**
   * Variant that accepts an existing Prisma transaction client, so the
   * caller can batch many line-postings + DPR status update into one atomic
   * unit. Use this from DPR submit/approve route handlers.
   */
  async applyDPRProgressTxn(
    tx: any,
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    workType: "sub_contractor" | "self",
    opts?: { dprId?: string; dprLineId?: string; overrideFlag?: boolean; overrideReason?: string }
  ): Promise<void> {
    try {
      await postProgressEntry(tx, ctx, {
        projectId,
        boqNo,
        qty,
        workType,
        direction: 1,
        dprId: opts?.dprId,
        dprLineId: opts?.dprLineId,
        overrideFlag: opts?.overrideFlag,
        overrideReason: opts?.overrideReason,
      });
    } catch (err: any) {
      if (err instanceof ProgressLedgerError) {
        throw new BOQError(err.code, err.message, err.httpStatus);
      }
      throw err;
    }
  }

  /**
   * Reverse a previously-applied DPR progress posting. Writes a compensating
   * ledger entry (direction=-1). Guarded against underflow.
   */
  async reverseDPRProgressTxn(
    tx: any,
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    workType: "sub_contractor" | "self",
    opts?: { dprId?: string; dprLineId?: string }
  ): Promise<void> {
    try {
      await postProgressEntry(tx, ctx, {
        projectId,
        boqNo,
        qty,
        workType,
        direction: -1,
        dprId: opts?.dprId,
        dprLineId: opts?.dprLineId,
      });
    } catch (err: any) {
      if (err instanceof ProgressLedgerError) {
        throw new BOQError(err.code, err.message, err.httpStatus);
      }
      throw err;
    }
  }

  /**
   * Apply one billing posting from RAB approval. Same transaction semantics
   * as applyDPRProgress — wraps in its own txn for one-shot callers.
   */
  async applyRABBilling(
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    opts?: { rabId?: string; rabLineId?: string; overrideFlag?: boolean; overrideReason?: string }
  ): Promise<void> {
    try {
      await db.$transaction(async (tx) => {
        await postBillingEntry(tx as any, ctx, {
          projectId,
          boqNo,
          qty,
          direction: 1,
          rabId: opts?.rabId,
          rabLineId: opts?.rabLineId,
          overrideFlag: opts?.overrideFlag,
          overrideReason: opts?.overrideReason,
        });
      });
    } catch (err: any) {
      if (err instanceof BillingLedgerError) {
        throw new BOQError(err.code, err.message, err.httpStatus);
      }
      throw new BOQError(
        "RAB_UPDATE_FAILED",
        err.message ?? "Failed to update BOQ from RAB",
        400
      );
    }
  }

  /** Transactional variant for batched RAB approval. */
  async applyRABBillingTxn(
    tx: any,
    ctx: TenantContext,
    projectId: string,
    boqNo: string,
    qty: number,
    opts?: { rabId?: string; rabLineId?: string; overrideFlag?: boolean; overrideReason?: string }
  ): Promise<void> {
    try {
      await postBillingEntry(tx, ctx, {
        projectId,
        boqNo,
        qty,
        direction: 1,
        rabId: opts?.rabId,
        rabLineId: opts?.rabLineId,
        overrideFlag: opts?.overrideFlag,
        overrideReason: opts?.overrideReason,
      });
    } catch (err: any) {
      if (err instanceof BillingLedgerError) {
        throw new BOQError(err.code, err.message, err.httpStatus);
      }
      throw err;
    }
  }
}

export const boqService = new BOQService();
