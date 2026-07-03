import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { journalManualSchema, saveJournalEntry } from "@/lib/accounting/journal-service";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
  const offset = (page - 1) * perPage;
  const search = request.nextUrl.searchParams.get("search");

  try {
    // Manual Journals lists only user-created entries — not the system GL postings
    // (invoices/bills/payments) that share the journal_entries table.
    const countRows = (await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count FROM journal_entries
      WHERE org_id = ${orgId}::uuid AND source_type = 'manual'
        AND (${search}::text IS NULL OR entry_number ILIKE ${`%${search ?? ""}%`} OR reference_number ILIKE ${`%${search ?? ""}%`})
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);
    const data = (await prisma.$queryRaw`
      SELECT je.*, to_char(je.entry_date,'YYYY-MM-DD') AS date,
             COALESCE((SELECT SUM(debit) FROM journal_entry_lines l WHERE l.journal_entry_id = je.id), 0) AS amount,
             (CASE WHEN je.status = 'posted' THEN 'published' ELSE je.status END) AS display_status
      FROM journal_entries je
      WHERE je.org_id = ${orgId}::uuid AND je.source_type = 'manual'
        AND (${search}::text IS NULL OR je.entry_number ILIKE ${`%${search ?? ""}%`} OR je.reference_number ILIKE ${`%${search ?? ""}%`})
      ORDER BY je.entry_date DESC, je.created_at DESC LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];
    return ok(data, { total, page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
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
    const result = await prisma.$transaction((tx) => saveJournalEntry(tx, orgId, userId, parsed.data));
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: result.id, action: "create", new_values: { status: parsed.data.status } });
    const rows = (await prisma.$queryRaw`SELECT * FROM journal_entries WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
