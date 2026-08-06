/**
 * Entity History Repository
 *
 * Merges two append-only event sources into one ordered timeline for a
 * given entity:
 *
 *   1. CnApprovalInstance.history  — workflow actions (submit, approve,
 *      reject, return, reverse) with step number + comments.
 *   2. CnAuditLog                  — field-level changes, creates, and
 *      status transitions recorded by `recordAudit`.
 *
 * Both are tenant-scoped. The shape returned is what the DataTable
 * `HistoryDrawer` renders — see [src/components/DataTable.tsx].
 */

import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

export interface HistoryChange {
  field: string;
  from?: string | null;
  to?: string | null;
}

export interface HistoryEvent {
  id: string;
  /** ISO timestamp */
  at: string;
  byId: string;
  byName: string;
  /** Coarse classification — drives icon/colour on the client. */
  kind:
    | "create"
    | "update"
    | "delete"
    | "submit"
    | "approve"
    | "reject"
    | "return"
    | "reverse"
    | "status_change"
    | "pending"
    | "other";
  /** Short, user-facing label (e.g. "Approved at L2", "Status change"). */
  label: string;
  /** Step number when the event came from CnApprovalHistory. */
  stepOrder?: number;
  /** Field-level diff when the event came from CnAuditLog with a `changes` blob. */
  changes?: HistoryChange[];
  comments?: string | null;
}

function approvalLabel(action: string, stepOrder: number): string {
  switch (action) {
    case "approve":
      return `Approved at L${stepOrder}`;
    case "reject":
      return `Rejected at L${stepOrder}`;
    case "return":
      return `Returned at L${stepOrder}`;
    case "reverse":
      return "Reversed";
    case "submit":
      return "Submitted for approval";
    default:
      return action;
  }
}

function auditLabel(action: string): string {
  switch (action) {
    case "create":
      return "Record created";
    case "update":
      return "Updated";
    case "delete":
      return "Deleted";
    case "status_change":
      return "Status changed";
    case "lock":
      return "Locked";
    case "unlock":
      return "Unlocked";
    case "import":
      return "Imported";
    default:
      return action;
  }
}

/**
 * Map of entity types → the Prisma model name that backs them.
 *
 * Used as a fallback for the timeline: every entity carries
 * `createdAt / createdBy / updatedAt / updatedBy` columns, so we can
 * synthesize "Record created by X" + "Last updated by Y" entries even
 * when no `CnApprovalInstance` / `CnAuditLog` rows exist (drafts,
 * masters, anything pre-approval-flow).
 *
 * Multiple entityType strings may map to the same model — that's
 * deliberate: routes write entityType inconsistently (e.g. `mr` on
 * submit, `purchase_requisitions` on approve), and any one of them
 * should resolve back to the row.
 */
const MASTER_MODEL_MAP: Record<string, string> = {
  // Masters
  company: "cnCompany",
  department: "cnDepartment",
  gst_code: "cnGSTCode",
  tds_code: "cnTDSCode",
  uom: "cnUOM",
  work_category: "cnWorkCategory",
  terms_condition: "cnTermsCondition",
  item: "cnItem",
  item_group: "cnItemGroup",
  vendor: "cnVendor",
  contractor: "cnContractor",
  customer: "cnCustomer",
  project: "cnProject",
  "labour-category": "cnLabourCategory",
  "labour-rate": "cnLabourRate",
  workman: "cnWorkman",
  // Transactional entities — purchase
  mr: "cnPurchaseRequisition",
  purchase_requisitions: "cnPurchaseRequisition",
  indent: "cnPurchaseIndent",
  purchase_indents: "cnPurchaseIndent",
  rfq: "cnRfq",
  po: "cnPurchaseOrder",
  // Transactional entities — projects
  material_estimations: "cnMaterialEstimation",
  material_estimation: "cnMaterialEstimation",
  estimation: "cnMaterialEstimation",
  // Transactional entities — store
  grn: "cnGoodsReceiptNote",
  issue: "cnMaterialIssue",
  material_issues: "cnMaterialIssue",
  equipment_logs: "cnEquipmentLog",
  equipment_transfers: "cnEquipmentDeployment",
  job_cards: "cnMaintenanceJobCard",
  transfer: "cnStockTransfer",
  recon: "cnStockReconciliation",
  good_return: "cnGoodReturn",
  gate_pass: "cnGatePass",
};

interface MasterAuditRow {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

const AUDIT_SELECT = {
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
} as const;

/**
 * Model-name → typed finder. Each thunk calls the real Prisma delegate, so
 * the model name and the audit-field select are compiler-checked — no
 * string-indexing of `db`, no casts. Keyed by the same model-name strings
 * MASTER_MODEL_MAP resolves aliases to.
 */
const MODEL_FINDERS: Record<
  string,
  (where: { id: string; orgId: string }) => Promise<MasterAuditRow | null>
> = {
  cnCompany: (where) => db.cnCompany.findFirst({ where, select: AUDIT_SELECT }),
  cnDepartment: (where) => db.cnDepartment.findFirst({ where, select: AUDIT_SELECT }),
  cnGSTCode: (where) => db.cnGSTCode.findFirst({ where, select: AUDIT_SELECT }),
  cnTDSCode: (where) => db.cnTDSCode.findFirst({ where, select: AUDIT_SELECT }),
  cnUOM: (where) => db.cnUOM.findFirst({ where, select: AUDIT_SELECT }),
  cnWorkCategory: (where) => db.cnWorkCategory.findFirst({ where, select: AUDIT_SELECT }),
  cnTermsCondition: (where) => db.cnTermsCondition.findFirst({ where, select: AUDIT_SELECT }),
  cnItem: (where) => db.cnItem.findFirst({ where, select: AUDIT_SELECT }),
  cnItemGroup: (where) => db.cnItemGroup.findFirst({ where, select: AUDIT_SELECT }),
  cnVendor: (where) => db.cnVendor.findFirst({ where, select: AUDIT_SELECT }),
  cnContractor: (where) => db.cnContractor.findFirst({ where, select: AUDIT_SELECT }),
  cnCustomer: (where) => db.cnCustomer.findFirst({ where, select: AUDIT_SELECT }),
  cnProject: (where) => db.cnProject.findFirst({ where, select: AUDIT_SELECT }),
  cnLabourCategory: (where) => db.cnLabourCategory.findFirst({ where, select: AUDIT_SELECT }),
  cnLabourRate: (where) => db.cnLabourRate.findFirst({ where, select: AUDIT_SELECT }),
  cnWorkman: (where) => db.cnWorkman.findFirst({ where, select: AUDIT_SELECT }),
  cnEquipmentDeployment: (where) => db.cnEquipmentDeployment.findFirst({ where, select: AUDIT_SELECT }),
  cnMaintenanceJobCard: (where) => db.cnMaintenanceJobCard.findFirst({ where, select: AUDIT_SELECT }),
  cnPurchaseRequisition: (where) => db.cnPurchaseRequisition.findFirst({ where, select: AUDIT_SELECT }),
  cnPurchaseIndent: (where) => db.cnPurchaseIndent.findFirst({ where, select: AUDIT_SELECT }),
  cnRfq: (where) => db.cnRfq.findFirst({ where, select: AUDIT_SELECT }),
  cnPurchaseOrder: (where) => db.cnPurchaseOrder.findFirst({ where, select: AUDIT_SELECT }),
  cnMaterialEstimation: (where) => db.cnMaterialEstimation.findFirst({ where, select: AUDIT_SELECT }),
  cnGoodsReceiptNote: (where) => db.cnGoodsReceiptNote.findFirst({ where, select: AUDIT_SELECT }),
  cnMaterialIssue: (where) => db.cnMaterialIssue.findFirst({ where, select: AUDIT_SELECT }),
  cnStockTransfer: (where) => db.cnStockTransfer.findFirst({ where, select: AUDIT_SELECT }),
  cnStockReconciliation: (where) => db.cnStockReconciliation.findFirst({ where, select: AUDIT_SELECT }),
  cnGoodReturn: (where) => db.cnGoodReturn.findFirst({ where, select: AUDIT_SELECT }),
  cnGatePass: (where) => db.cnGatePass.findFirst({ where, select: AUDIT_SELECT }),
};

async function loadMasterAuditRow(
  orgId: string,
  types: string[],
  entityId: string,
): Promise<MasterAuditRow | null> {
  for (const t of types) {
    const modelName = MASTER_MODEL_MAP[t];
    if (!modelName) continue;
    const finder = MODEL_FINDERS[modelName];
    if (!finder) continue;
    try {
      const row = await finder({ id: entityId, orgId });
      if (row) return row;
    } catch {
      // Query failed for this model — skip and try the next type.
    }
  }
  return null;
}

function normalizeChanges(raw: unknown): HistoryChange[] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: HistoryChange[] = [];
  const obj = raw as Record<string, unknown>;
  for (const [field, val] of Object.entries(obj)) {
    if (val && typeof val === "object" && ("from" in val || "to" in val)) {
      const v = val as { from?: unknown; to?: unknown };
      out.push({
        field,
        from: v.from == null ? null : String(v.from),
        to: v.to == null ? null : String(v.to),
      });
    } else {
      out.push({ field, to: val == null ? null : String(val) });
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function listHistoryForEntity(
  orgId: string,
  entityType: string | string[],
  entityId: string,
): Promise<HistoryEvent[]> {
  // Some entities have been written under multiple `entityType` strings
  // historically (e.g. issues land as both "material_issues" on submit
  // and "issue" on approve). Accept either a single string or an array;
  // the queries below `IN` over the full set so we surface every event.
  const types = Array.isArray(entityType) ? entityType : [entityType];
  if (types.length === 0) return [];

  // Approval instance(s) — there's normally one but we tolerate
  // re-submissions which create new instances against the same entity.
  // Pull the workflow steps inline so we can synthesize "pending"
  // events for not-yet-acted approvers when the instance is still in
  // flight (multi-level workflows).
  const instances = await db.cnApprovalInstance.findMany({
    where: { orgId, entityType: { in: types }, entityId },
    include: {
      history: true,
      workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
    },
    orderBy: { requestedAt: "asc" },
  });

  const audits = await db.cnAuditLog.findMany({
    where: { orgId, entityType: { in: types }, entityId },
    orderBy: { timestamp: "asc" },
  });

  // Fallback for master records that don't write to CnAuditLog. We
  // read createdAt/createdBy/updatedAt/updatedBy off the master row
  // itself so the timeline can show "Record created" + "Last updated"
  // even with no audit-log entries.
  const masterRow = await loadMasterAuditRow(orgId, types, entityId);

  // Collect every user id we'll need to label in a single round-trip.
  // Includes approverUserId on workflow steps so the "pending" rows
  // can show the named approver where one is configured.
  const userIds: string[] = [];
  for (const inst of instances) {
    userIds.push(inst.requestedById);
    for (const h of inst.history ?? []) userIds.push(h.actionById);
    for (const s of inst.workflow?.steps ?? []) {
      if (s.approverUserId) userIds.push(s.approverUserId);
    }
  }
  for (const a of audits) userIds.push(a.userId);
  if (masterRow) {
    userIds.push(masterRow.createdBy, masterRow.updatedBy);
  }

  const nameById = await resolveUserNames(userIds);

  // Friendly fallback used wherever a user id can't be resolved (deleted
  // session user, demo-mode synthetic id, etc.). The raw cuid is
  // self-diagnosing for developers but reads as garbage in the UI, so we
  // collapse anything we can't name to a sentinel label instead.
  const looksLikeId = (s: string) => /^c[a-z0-9]{20,}$/i.test(s) || s === "" || /^(demo|test)-/.test(s);
  const nameFor = (id: string | null | undefined): string => {
    if (!id) return "Unknown user";
    const resolved = nameById.get(id);
    if (resolved && !looksLikeId(resolved)) return resolved;
    return "Unknown user";
  };

  const events: HistoryEvent[] = [];

  for (const inst of instances) {
    events.push({
      id: `submit:${inst.id}`,
      at: inst.requestedAt.toISOString(),
      byId: inst.requestedById,
      byName: nameFor(inst.requestedById),
      kind: "submit",
      label: "Requested",
    });

    // Track which step orders already have a recorded action so we
    // don't emit a "pending" row for a step that's already been
    // approved/rejected/returned.
    const actedStepOrders = new Set<number>();
    for (const h of inst.history ?? []) {
      const action = String(h.action ?? "other");
      const stepOrder = Number(h.stepOrder ?? 0);
      actedStepOrders.add(stepOrder);
      events.push({
        id: `approval:${h.id}`,
        at: h.actionAt.toISOString(),
        byId: h.actionById,
        byName: nameFor(h.actionById),
        kind: (
          ["approve", "reject", "return", "reverse"].includes(action)
            ? action
            : "other"
        ) as HistoryEvent["kind"],
        label: approvalLabel(action, stepOrder),
        stepOrder: stepOrder || undefined,
        comments: h.comments ?? null,
      });
    }

    // Synthesize pending rows for any future workflow steps that
    // haven't been acted on yet. Only do this while the instance is
    // genuinely awaiting action — once it's approved/rejected/closed,
    // skipped steps are historical and shouldn't be advertised as
    // upcoming. The synthetic timestamp uses the instance's
    // `requestedAt` so pending rows sort AFTER prior history but
    // before any later real audit/approval entries; the dedicated
    // `kind: "pending"` is what the client renders distinctively.
    if (inst.status === "pending_approval") {
      const steps = (inst.workflow?.steps ?? []) as Array<{
        stepOrder: number;
        approverRoleId: string | null;
        approverUserId: string | null;
      }>;
      const baseTs = inst.requestedAt.toISOString();
      for (const s of steps) {
        if (actedStepOrders.has(s.stepOrder)) continue;
        if (s.stepOrder < (inst.currentStepOrder ?? 0)) continue;
        const approverName = s.approverUserId
          ? nameFor(s.approverUserId)
          : roleLabel(s.approverRoleId);
        const isCurrent = s.stepOrder === inst.currentStepOrder;
        events.push({
          id: `pending:${inst.id}:${s.stepOrder}`,
          at: baseTs,
          byId: s.approverUserId ?? "",
          byName: approverName,
          kind: "pending",
          label: isCurrent
            ? `Next — Step ${s.stepOrder}`
            : `Upcoming — Step ${s.stepOrder}`,
          stepOrder: s.stepOrder,
        });
      }
    }
  }

  for (const a of audits) {
    const action = String(a.action ?? "other");
    events.push({
      id: `audit:${a.id}`,
      at: a.timestamp.toISOString(),
      byId: a.userId,
      byName: nameFor(a.userId),
      kind: (
        ["create", "update", "delete", "status_change"].includes(action)
          ? action
          : "other"
      ) as HistoryEvent["kind"],
      label: auditLabel(action),
      changes: normalizeChanges(a.changes),
    });
  }

  // Master-row synthetic events. We only add a "Last updated" entry
  // when updatedAt is meaningfully later than createdAt — a 1-second
  // guard avoids duplicating the create event when both timestamps
  // match (Prisma's `@updatedAt` triggers on create too).
  if (masterRow) {
    const createIso = masterRow.createdAt.toISOString();
    const updateIso = masterRow.updatedAt.toISOString();
    const alreadyHasCreate = events.some(
      (e) => e.kind === "create" && e.at === createIso,
    );
    if (!alreadyHasCreate) {
      events.push({
        id: `master-create:${entityId}`,
        at: createIso,
        byId: masterRow.createdBy,
        byName: nameFor(masterRow.createdBy),
        kind: "create",
        label: "Record created",
      });
    }
    if (
      masterRow.updatedAt.getTime() - masterRow.createdAt.getTime() > 1000 &&
      !events.some((e) => e.kind === "update" && e.at === updateIso)
    ) {
      events.push({
        id: `master-update:${entityId}`,
        at: updateIso,
        byId: masterRow.updatedBy,
        byName: nameFor(masterRow.updatedBy),
        kind: "update",
        label: "Last updated",
      });
    }
  }

  // Sort chronologically; pending events bubble to the end (and
  // among themselves by stepOrder) so the user reads the timeline as
  // "what happened" → "what's next".
  events.sort((a, b) => {
    if (a.kind === "pending" && b.kind !== "pending") return 1;
    if (b.kind === "pending" && a.kind !== "pending") return -1;
    if (a.kind === "pending" && b.kind === "pending") {
      return (a.stepOrder ?? 0) - (b.stepOrder ?? 0);
    }
    return a.at.localeCompare(b.at);
  });
  return events;
}
