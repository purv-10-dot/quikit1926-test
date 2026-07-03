import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { journalManualSchema, saveJournalEntry } from "@/lib/accounting/journal-service";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT je.*, to_char(je.entry_date,'YYYY-MM-DD') AS entry_date, to_char(je.reverse_date,'YYYY-MM-DD') AS reverse_date,
             w.name AS location_name
      FROM journal_entries je LEFT JOIN warehouses w ON w.id = je.location_id
      WHERE je.id = ${params.id}::uuid AND je.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Journal entry was not found." });
    const lines = (await prisma.$queryRaw`
      SELECT l.*, a.name AS account_name, a.code AS account_code, c.display_name AS contact_name
      FROM journal_entry_lines l
      LEFT JOIN accounts a ON a.id = l.account_id
      LEFT JOIN contacts c ON c.id = l.contact_id
      WHERE l.journal_entry_id = ${params.id}::uuid AND l.org_id = ${orgId}::uuid ORDER BY l.display_order ASC`) as unknown[];
    const attachments = (await prisma.$queryRaw`
      SELECT id, file_name, file_path, content_type, size_bytes FROM document_attachments
      WHERE org_id = ${orgId}::uuid AND entity_type = 'journal_entry' AND entity_id = ${params.id}::uuid ORDER BY created_at ASC`) as unknown[];
    return ok({ ...rows[0], lines, attachments });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = journalManualSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The journal entry is invalid.", details: parsed.error.flatten() });
  }

  const locked = await assertPeriodUnlocked(auth.context, parsed.data.entry_date, "journals");
  if (locked) return locked;

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND source_type = 'manual' LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Journal entry was not found." });
    await prisma.$transaction((tx) => saveJournalEntry(tx, orgId, userId, parsed.data, params.id));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: params.id, action: "update", new_values: { status: parsed.data.status } });
    const rows = (await prisma.$queryRaw`SELECT * FROM journal_entries WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const dateRows = (await prisma.$queryRaw`SELECT to_char(entry_date,'YYYY-MM-DD') AS d FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ d: string }>;
    const locked = await assertPeriodUnlocked(auth.context, dateRows[0]?.d, "journals");
    if (locked) return locked;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM journal_entry_lines WHERE journal_entry_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      await tx.$executeRaw`DELETE FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'journal_entry' AND entity_id = ${params.id}::uuid`;
      await tx.$executeRaw`DELETE FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: params.id, action: "delete", new_values: { id: params.id } });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
