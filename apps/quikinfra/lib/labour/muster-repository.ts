/**
 * Muster Roll — daily attendance sheet + lines.
 *
 * Rules (feature-logic.md §6/§7):
 *  - One live sheet per (project, date, engagement, contractor, shift).
 *    REVERSED/REJECTED sheets don't block a new one (MUSTER_DUPLICATE).
 *  - attendance ∈ {0,0.25,0.5,0.75,1}; otHours ∈ [0,8].
 *  - Submit only within the 72h window; wage snapshot resolved at submit
 *    (departmental only). Approved sheets lock.
 *  - Approval runs the cross-project double-marking check (> 1.25 day).
 *  - Corrections = reverse (reason mandatory); attendance is derived from
 *    APPROVED sheets — no separate ledger.
 */

import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
import { DomainError } from "@/lib/http";
import { generateDocNumber, withDocNumberRetry } from "@/lib/db/doc-number";
import { resolveLabourRate } from "@/lib/masters/labour-rates-repository";
import {
  ALLOWED_ATTENDANCE, MAX_OT_HOURS, DOUBLE_MARK_TOLERANCE,
  isWithinMusterWindow, type EngagementType, type MusterShift,
} from "@/lib/labour/policy";

// Statuses that occupy the unique (project,date,engagement,contractor,shift) key.
const LIVE_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED"];

export interface MusterLineRecord {
  id: string;
  workmanId: string;
  labourCategoryId: string;
  attendance: string;
  otHours: string | null;
  wageRateApplied: string | null;
  boqItemId: string | null;
  remarks: string | null;
}

export interface MusterRecord {
  id: string;
  orgId: string;
  musterNo: string;
  projectId: string;
  musterDate: string;
  engagementType: string;
  contractorId: string | null;
  workOrderId: string | null;
  shift: string;
  docStatus: string;
  remarks: string | null;
  approvalId: string | null;
  lines: MusterLineRecord[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

type MusterRow = Prisma.CnMusterRollGetPayload<{ include: { lines: true } }>;
type LineRow = Prisma.CnMusterRollLineGetPayload<Record<string, never>>;

function toLine(l: LineRow): MusterLineRecord {
  return {
    id: l.id,
    workmanId: l.workmanId,
    labourCategoryId: l.labourCategoryId,
    attendance: l.attendance?.toString?.() ?? "0",
    otHours: l.otHours?.toString?.() ?? null,
    wageRateApplied: l.wageRateApplied?.toString?.() ?? null,
    boqItemId: l.boqItemId ?? null,
    remarks: l.remarks ?? null,
  };
}

function toRecord(row: MusterRow): MusterRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    musterNo: row.musterNo,
    projectId: row.projectId,
    musterDate: row.musterDate.toISOString().slice(0, 10),
    engagementType: row.engagementType,
    contractorId: row.contractorId ?? null,
    workOrderId: row.workOrderId ?? null,
    shift: row.shift,
    docStatus: row.docStatus,
    remarks: row.remarks ?? null,
    approvalId: row.approvalId ?? null,
    lines: (row.lines ?? []).map(toLine),
    createdAt: row.createdAt?.toISOString?.() ?? "",
    updatedAt: row.updatedAt?.toISOString?.() ?? "",
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

// ─── Validation helpers ────────────────────────────────────────────

function parseDateOnly(v: unknown, field = "musterDate"): Date {
  const s = String(v ?? "").trim();
  const d = s ? new Date(s) : new Date("invalid");
  if (Number.isNaN(d.getTime())) throw new DomainError("VALIDATION", `${field} must be a valid date`, 400);
  // normalize to date-only (midnight UTC)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function validateLineNumbers(attendance: number, otHours: number | null): void {
  if (!(ALLOWED_ATTENDANCE as readonly number[]).includes(attendance)) {
    throw new DomainError("VALIDATION", `attendance must be one of ${ALLOWED_ATTENDANCE.join(", ")}`, 400);
  }
  if (otHours != null && (otHours < 0 || otHours > MAX_OT_HOURS)) {
    throw new DomainError("VALIDATION", `otHours must be between 0 and ${MAX_OT_HOURS}`, 400);
  }
}

function normalizeEngagement(v: unknown): EngagementType {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "CONTRACTOR" || s === "DEPARTMENTAL") return s;
  throw new DomainError("VALIDATION", "engagementType must be CONTRACTOR or DEPARTMENTAL", 400);
}

// ─── List / read ────────────────────────────────────────────────────

export interface ListMustersOptions {
  orgId: string;
  projectId?: string;
  contractorId?: string;
  engagementType?: string;
  docStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  take?: number;
  skip?: number;
  orderBy?: Array<Record<string, "asc" | "desc">>;
}

function buildWhere(opts: ListMustersOptions): Record<string, unknown> {
  const dateFilter: Record<string, Date> = {};
  if (opts.dateFrom) dateFilter.gte = parseDateOnly(opts.dateFrom, "dateFrom");
  if (opts.dateTo) dateFilter.lte = parseDateOnly(opts.dateTo, "dateTo");
  return {
    orgId: opts.orgId,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(opts.contractorId ? { contractorId: opts.contractorId } : {}),
    ...(opts.engagementType ? { engagementType: opts.engagementType } : {}),
    ...(opts.docStatus ? { docStatus: opts.docStatus } : {}),
    ...(Object.keys(dateFilter).length ? { musterDate: dateFilter } : {}),
  };
}

export async function listMusters(opts: ListMustersOptions): Promise<MusterRecord[]> {
  const rows = await db.cnMusterRoll.findMany({
    where: buildWhere(opts),
    include: { lines: true },
    orderBy: opts.orderBy ?? [{ musterDate: "desc" }, { createdAt: "desc" }],
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  });
  return rows.map(toRecord);
}

export async function countMusters(opts: ListMustersOptions): Promise<number> {
  return db.cnMusterRoll.count({ where: buildWhere(opts) });
}

export async function findMusterById(orgId: string, id: string): Promise<MusterRecord | null> {
  const row = await db.cnMusterRoll.findFirst({ where: { id, orgId }, include: { lines: true } });
  return row ? toRecord(row) : null;
}

// ─── Create / update (DRAFT) ────────────────────────────────────────

export interface MusterLineInput {
  workmanId: string;
  attendance: number | string;
  otHours?: number | string | null;
  boqItemId?: string | null;
  remarks?: string | null;
}

export interface CreateMusterInput {
  orgId: string;
  createdBy: string;
  projectId: string;
  musterDate: string;
  engagementType: string;
  contractorId?: string | null;
  workOrderId?: string | null;
  shift?: string;
  remarks?: string | null;
  lines: MusterLineInput[];
}

async function assertNoLiveDuplicate(
  orgId: string, projectId: string, musterDate: Date,
  engagementType: string, contractorId: string | null, shift: string,
  excludeId?: string,
): Promise<void> {
  const existing = await db.cnMusterRoll.findFirst({
    where: {
      orgId, projectId, musterDate, engagementType, contractorId, shift,
      docStatus: { in: LIVE_STATUSES },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { musterNo: true },
  });
  if (existing) {
    throw new DomainError(
      "MUSTER_DUPLICATE",
      `A muster already exists for this project/date/gang/shift (${existing.musterNo})`,
      409,
    );
  }
}

/** Resolve each line's category snapshot from the workman + validate refs. */
async function buildLineData(
  orgId: string, lines: MusterLineInput[],
): Promise<Array<{ workmanId: string; labourCategoryId: string; attendance: Prisma.Decimal; otHours: Prisma.Decimal | null; boqItemId: string | null; remarks: string | null }>> {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new DomainError("VALIDATION", "At least one attendance line is required", 400);
  }
  const workmanIds = Array.from(new Set(lines.map((l) => l.workmanId)));
  const workmen = await db.cnWorkman.findMany({
    where: { orgId, id: { in: workmanIds } },
    select: { id: true, labourCategoryId: true, exitDate: true },
  });
  const byId = new Map(workmen.map((w) => [w.id, w]));

  return lines.map((l) => {
    const w = byId.get(l.workmanId);
    if (!w) throw new DomainError("VALIDATION", `Unknown workman ${l.workmanId}`, 400);
    const attendance = Number(l.attendance);
    const otHours = l.otHours != null && l.otHours !== "" ? Number(l.otHours) : null;
    validateLineNumbers(attendance, otHours);
    return {
      workmanId: l.workmanId,
      labourCategoryId: w.labourCategoryId,
      attendance: new Prisma.Decimal(attendance),
      otHours: otHours != null ? new Prisma.Decimal(otHours) : null,
      boqItemId: l.boqItemId ? String(l.boqItemId) : null,
      remarks: l.remarks ? String(l.remarks) : null,
    };
  });
}

export async function createMuster(input: CreateMusterInput): Promise<MusterRecord> {
  const engagementType = normalizeEngagement(input.engagementType);
  const contractorId = input.contractorId ? String(input.contractorId) : null;
  if (engagementType === "CONTRACTOR" && !contractorId) {
    throw new DomainError("VALIDATION", "Contractor musters require a contractorId", 400);
  }
  if (engagementType === "DEPARTMENTAL" && contractorId) {
    throw new DomainError("VALIDATION", "Departmental musters must not have a contractorId", 400);
  }
  const shift = (input.shift ?? "DAY").toUpperCase() as MusterShift;
  const musterDate = parseDateOnly(input.musterDate);

  await assertNoLiveDuplicate(input.orgId, input.projectId, musterDate, engagementType, contractorId, shift);
  const lineData = await buildLineData(input.orgId, input.lines);

  const created = await withDocNumberRetry(
    () => generateDocNumber("muster", input.orgId),
    (musterNo: string) =>
      db.cnMusterRoll.create({
        data: {
          orgId: input.orgId,
          musterNo,
          projectId: input.projectId,
          musterDate,
          engagementType,
          contractorId,
          workOrderId: input.workOrderId ? String(input.workOrderId) : null,
          shift,
          docStatus: "DRAFT",
          remarks: input.remarks ? String(input.remarks) : null,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          lines: { create: lineData },
        },
        include: { lines: true },
      }),
    "musterNo",
  );
  return toRecord(created);
}

export interface UpdateMusterInput {
  updatedBy: string;
  remarks?: string | null;
  workOrderId?: string | null;
  lines?: MusterLineInput[];
}

/** DRAFT-only edit; replaces all lines when `lines` is provided. */
export async function updateMuster(
  orgId: string, id: string, patch: UpdateMusterInput,
): Promise<MusterRecord | null> {
  const existing = await db.cnMusterRoll.findFirst({ where: { id, orgId }, select: { id: true, docStatus: true } });
  if (!existing) return null;
  if (existing.docStatus !== "DRAFT") {
    throw new DomainError("MUSTER_NOT_EDITABLE", "Only DRAFT musters can be edited", 409);
  }
  const lineData = patch.lines ? await buildLineData(orgId, patch.lines) : null;

  const updated = await db.$transaction(async (tx) => {
    if (lineData) {
      await tx.cnMusterRollLine.deleteMany({ where: { musterRollId: id } });
    }
    return tx.cnMusterRoll.update({
      where: { id },
      data: {
        updatedBy: patch.updatedBy,
        ...(patch.remarks !== undefined ? { remarks: patch.remarks ? String(patch.remarks) : null } : {}),
        ...(patch.workOrderId !== undefined ? { workOrderId: patch.workOrderId ? String(patch.workOrderId) : null } : {}),
        ...(lineData ? { lines: { create: lineData } } : {}),
      },
      include: { lines: true },
    });
  });
  return toRecord(updated);
}

// ─── Submit (72h window + wage snapshot) ────────────────────────────

export async function submitMuster(
  orgId: string, id: string, updatedBy: string, now: Date,
): Promise<MusterRecord | null> {
  const muster = await db.cnMusterRoll.findFirst({ where: { id, orgId }, include: { lines: true } });
  if (!muster) return null;
  if (muster.docStatus !== "DRAFT" && muster.docStatus !== "REJECTED") {
    throw new DomainError("INVALID_TRANSITION", "Only DRAFT/REJECTED musters can be submitted", 409);
  }
  const dateStr = muster.musterDate.toISOString().slice(0, 10);
  if (!isWithinMusterWindow(dateStr, now)) {
    throw new DomainError("MUSTER_WINDOW_EXPIRED", `Muster can only be submitted within 72 hours of ${dateStr}`, 409);
  }

  // Wage snapshot — departmental gangs only (contractor gangs are paid via RAB).
  const updated = await db.$transaction(async (tx) => {
    if (muster.engagementType === "DEPARTMENTAL") {
      const workmen = await tx.cnWorkman.findMany({
        where: { orgId, id: { in: muster.lines.map((l) => l.workmanId) } },
        select: { id: true, dailyWage: true, labourCategoryId: true },
      });
      const byId = new Map(workmen.map((w) => [w.id, w]));
      for (const line of muster.lines) {
        const w = byId.get(line.workmanId);
        let wage: Prisma.Decimal | null = w?.dailyWage ?? null;
        if (!wage) {
          const resolved = await resolveLabourRate({
            orgId,
            labourCategoryId: line.labourCategoryId,
            projectId: muster.projectId,
            onDate: muster.musterDate,
          });
          wage = resolved ? new Prisma.Decimal(resolved.rate) : null;
        }
        await tx.cnMusterRollLine.update({ where: { id: line.id }, data: { wageRateApplied: wage } });
      }
    }
    return tx.cnMusterRoll.update({
      where: { id },
      data: { docStatus: "SUBMITTED", updatedBy },
      include: { lines: true },
    });
  });
  return toRecord(updated);
}

// ─── Approve (double-marking check + lock) ──────────────────────────

export async function approveMuster(
  orgId: string, id: string, updatedBy: string,
): Promise<MusterRecord | null> {
  const muster = await db.cnMusterRoll.findFirst({ where: { id, orgId }, include: { lines: true } });
  if (!muster) return null;
  if (muster.docStatus === "APPROVED") return toRecord(muster);
  if (muster.docStatus !== "SUBMITTED") {
    throw new DomainError("INVALID_TRANSITION", "Only SUBMITTED musters can be approved", 409);
  }

  // Cross-project double-marking: same workman, same date, other APPROVED sheets.
  const workmanIds = muster.lines.map((l) => l.workmanId);
  const others = await db.cnMusterRoll.findMany({
    where: {
      orgId, musterDate: muster.musterDate, docStatus: "APPROVED", id: { not: id },
      lines: { some: { workmanId: { in: workmanIds } } },
    },
    include: { lines: { where: { workmanId: { in: workmanIds } } } },
  });
  const priorByWorkman = new Map<string, number>();
  const conflictNos = new Map<string, Set<string>>();
  for (const o of others) {
    for (const l of o.lines) {
      priorByWorkman.set(l.workmanId, (priorByWorkman.get(l.workmanId) ?? 0) + Number(l.attendance));
      if (!conflictNos.has(l.workmanId)) conflictNos.set(l.workmanId, new Set());
      conflictNos.get(l.workmanId)!.add(o.musterNo);
    }
  }
  for (const line of muster.lines) {
    const combined = (priorByWorkman.get(line.workmanId) ?? 0) + Number(line.attendance);
    if (combined > DOUBLE_MARK_TOLERANCE) {
      const nos = Array.from(conflictNos.get(line.workmanId) ?? []).join(", ");
      throw new DomainError(
        "WORKMAN_DOUBLE_MARKED",
        `Workman is marked on other approved musters for this date (${nos}); combined attendance ${combined} exceeds ${DOUBLE_MARK_TOLERANCE}`,
        409,
      );
    }
  }

  const updated = await db.cnMusterRoll.update({
    where: { id }, data: { docStatus: "APPROVED", updatedBy }, include: { lines: true },
  });
  return toRecord(updated);
}

export async function rejectMuster(
  orgId: string, id: string, updatedBy: string, reason: string,
): Promise<MusterRecord | null> {
  const m = await db.cnMusterRoll.findFirst({ where: { id, orgId }, select: { id: true, docStatus: true, remarks: true } });
  if (!m) return null;
  if (m.docStatus !== "SUBMITTED") {
    throw new DomainError("INVALID_TRANSITION", "Only SUBMITTED musters can be rejected", 409);
  }
  const updated = await db.cnMusterRoll.update({
    where: { id },
    data: { docStatus: "REJECTED", updatedBy, remarks: reason || m.remarks },
    include: { lines: true },
  });
  return toRecord(updated);
}

// ─── Reverse (approved → reversed; reason mandatory) ────────────────

export async function reverseMuster(
  orgId: string, id: string, updatedBy: string, reason: string,
): Promise<MusterRecord | null> {
  if (!reason || !reason.trim()) {
    throw new DomainError("VALIDATION", "A reversal reason is required", 400);
  }
  const m = await db.cnMusterRoll.findFirst({ where: { id, orgId }, select: { id: true, docStatus: true } });
  if (!m) return null;
  if (m.docStatus !== "APPROVED") {
    throw new DomainError("INVALID_TRANSITION", "Only APPROVED musters can be reversed", 409);
  }
  const updated = await db.cnMusterRoll.update({
    where: { id },
    data: { docStatus: "REVERSED", updatedBy, remarks: reason },
    include: { lines: true },
  });
  return toRecord(updated);
}

// ─── Prefill from yesterday's approved muster ───────────────────────

export async function prefillMuster(params: {
  orgId: string; projectId: string; date: string;
  engagementType: string; contractorId?: string | null; shift?: string;
}): Promise<Array<{ workmanId: string; labourCategoryId: string }>> {
  const engagementType = normalizeEngagement(params.engagementType);
  const contractorId = params.contractorId ? String(params.contractorId) : null;
  const shift = (params.shift ?? "DAY").toUpperCase();
  const today = parseDateOnly(params.date);
  const yesterday = new Date(today.getTime() - 86_400_000);

  const prior = await db.cnMusterRoll.findFirst({
    where: {
      orgId: params.orgId, projectId: params.projectId, musterDate: yesterday,
      engagementType, contractorId, shift, docStatus: "APPROVED",
    },
    include: { lines: true },
  });
  if (!prior) return [];
  return prior.lines.map((l) => ({ workmanId: l.workmanId, labourCategoryId: l.labourCategoryId }));
}
