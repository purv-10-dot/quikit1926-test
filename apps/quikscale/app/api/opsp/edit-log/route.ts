import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { writeAuditLog } from "@/lib/api/auditLog";

const withOrgAuth = withOrgAuthForModule("opsp");

/**
 * Per-field "edit after finalize" change log for the OPSP editor.
 *
 * These entries are stored in the shared AuditLog table under a DISTINCT
 * entityId (`opsp-edit:<opspId>`) so they stay separate from the noisy
 * autosave-PUT audit entries (which use the bare opspId) and from the
 * finalize/review status entries (which use a composite id). That keeps the
 * OPSP history drawer to exactly the user-made field edits + their notes.
 *
 *   POST  body { year, quarter, field, label, oldValue, newValue, note? }
 *   GET   ?year=&quarter=  → normalized list for the drawer
 */

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const editEntityId = (opspId: string) => `opsp-edit:${opspId}`;

function parseYear(raw: unknown): number {
  return typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
}

function safeParse(v: string | null): Record<string, unknown> | null {
  if (!v) return null;
  try {
    const p = JSON.parse(v);
    return p && typeof p === "object" ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function findOpsp(orgId: string, userId: string, year: number, quarter: string) {
  return db.oPSPData.findUnique({
    where: { orgId_userId_year_quarter: { orgId, userId, year, quarter } },
    select: { id: true, status: true },
  });
}

// POST — record one field change made while editing a finalized OPSP.
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const year = parseYear(body.year);
  const quarter = String(body.quarter ?? "");
  const field = String(body.field ?? "").trim();
  const label = String(body.label ?? field).trim() || field;
  const note = body.note ? String(body.note).trim() : "";
  const oldValue = body.oldValue ?? null;
  const newValue = body.newValue ?? null;

  if (!year || !QUARTERS.includes(quarter) || !field) {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const opsp = await findOpsp(orgId, userId, year, quarter);
  if (!opsp) {
    return NextResponse.json({ success: false, error: "OPSP not found" }, { status: 404 });
  }
  // A reviewed OPSP is hard-locked — no edits, no edit logs.
  if (opsp.status === "reviewed") {
    return NextResponse.json(
      { success: false, error: "This OPSP's review is finalized — it can no longer be edited." },
      { status: 403 },
    );
  }
  // Edit logging only applies once an OPSP is finalized (draft edits aren't logged).
  if (opsp.status !== "finalized") {
    return NextResponse.json(
      { success: false, error: "Edit logging only applies to finalized OPSPs." },
      { status: 409 },
    );
  }
  // Mirror the editor/PUT lock: editing a finalized OPSP needs Edit-after-Finalize.
  const canEdit = await userCan(userId, orgId, "OPSP.History.EditFinalize", "update");
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Editing a finalized OPSP requires the 'Edit after Finalize' permission." },
      { status: 403 },
    );
  }

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: editEntityId(opsp.id),
    oldValues: { [label]: oldValue },
    newValues: { [label]: newValue },
    changes: [field],
    reason: note || undefined,
  });

  return NextResponse.json({ success: true }, { status: 201 });
});

// PATCH — edit the note (reason) on an existing edit-log entry.
export const PATCH = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const year = parseYear(body.year);
  const quarter = String(body.quarter ?? "");
  const id = String(body.id ?? "").trim();
  const note = body.note != null ? String(body.note).trim() : "";

  if (!year || !QUARTERS.includes(quarter) || !id) {
    return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
  }

  const opsp = await findOpsp(orgId, userId, year, quarter);
  if (!opsp) {
    return NextResponse.json({ success: false, error: "OPSP not found" }, { status: 404 });
  }
  if (opsp.status === "reviewed") {
    return NextResponse.json(
      { success: false, error: "This OPSP's review is finalized — it can no longer be edited." },
      { status: 403 },
    );
  }
  if (opsp.status !== "finalized") {
    return NextResponse.json(
      { success: false, error: "Edit logging only applies to finalized OPSPs." },
      { status: 409 },
    );
  }
  const canEdit = await userCan(userId, orgId, "OPSP.History.EditFinalize", "update");
  if (!canEdit) {
    return NextResponse.json(
      { success: false, error: "Editing a finalized OPSP requires the 'Edit after Finalize' permission." },
      { status: 403 },
    );
  }

  // Scope to THIS OPSP's edit-log channel so an arbitrary AuditLog id can't be retargeted.
  const result = await db.auditLog.updateMany({
    where: { id, orgId, entityType: "OPSPData", entityId: editEntityId(opsp.id) },
    data: { reason: note || null },
  });
  if (result.count === 0) {
    return NextResponse.json({ success: false, error: "Log entry not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
});

// GET — list this OPSP's field-edit history for the drawer.
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const year = parseYear(sp.get("year"));
  const quarter = String(sp.get("quarter") ?? "");
  if (!year || !QUARTERS.includes(quarter)) {
    return NextResponse.json({ success: false, error: "Invalid year/quarter" }, { status: 400 });
  }

  const opsp = await findOpsp(orgId, userId, year, quarter);
  if (!opsp) return NextResponse.json({ success: true, data: [] });

  const logs = await db.auditLog.findMany({
    where: { orgId, entityType: "OPSPData", entityId: editEntityId(opsp.id) },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      oldValues: true,
      newValues: true,
      changes: true,
      actorId: true,
      reason: true,
      createdAt: true,
    },
  });

  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const users = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameMap = Object.fromEntries(
    users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
  );

  const data = logs.map((l) => {
    const oldObj = safeParse(l.oldValues);
    const newObj = safeParse(l.newValues);
    const field = l.changes[0] ?? "";
    const label =
      (oldObj && Object.keys(oldObj)[0]) || (newObj && Object.keys(newObj)[0]) || field;
    return {
      id: l.id,
      field,
      label,
      oldValue: oldObj ? (oldObj[label] ?? null) : null,
      newValue: newObj ? (newObj[label] ?? null) : null,
      note: l.reason ?? null,
      actorId: l.actorId,
      actorName: nameMap[l.actorId] ?? l.actorId,
      createdAt: l.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ success: true, data });
});
