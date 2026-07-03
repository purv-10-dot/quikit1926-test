import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { journalManualSchema, saveJournalEntry } from "@/lib/accounting/journal-service";
import { todayISO } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type JeRow = { memo: string | null; reference_number: string | null; reporting_method: string; currency: string; location_id: string | null };
type LineRow = { account_id: string; contact_id: string | null; description: string | null; debit: string; credit: string };

/** Clone a manual journal into a fresh draft (new number, today's date). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT memo, reference_number, reporting_method, currency, location_id
      FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND source_type = 'manual' LIMIT 1`) as JeRow[];
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Journal entry was not found." });
    const je = rows[0];
    const lines = (await prisma.$queryRaw`
      SELECT account_id, contact_id, description, debit, credit
      FROM journal_entry_lines WHERE journal_entry_id = ${params.id}::uuid AND org_id = ${orgId}::uuid ORDER BY display_order ASC`) as LineRow[];

    const parsed = journalManualSchema.safeParse({
      entry_date: todayISO(), status: "draft", notes: je.memo ?? "Cloned journal", reference_number: je.reference_number,
      reporting_method: je.reporting_method, currency: je.currency?.trim() || "INR", location_id: je.location_id,
      lines: lines.map((l) => ({ account_id: l.account_id, contact_id: l.contact_id ?? null, description: l.description, debit: Number(l.debit), credit: Number(l.credit) }))
    });
    if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not clone this journal.", details: parsed.error.flatten() });

    const result = await prisma.$transaction((tx) => saveJournalEntry(tx, orgId, userId, parsed.data));
    const jeRows = (await prisma.$queryRaw`SELECT entry_number FROM journal_entries WHERE id = ${result.id}::uuid`) as Array<{ entry_number: string }>;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: result.id, action: "clone", new_values: { from: params.id } });
    return ok({ id: result.id, number: jeRows[0]?.entry_number ?? null, redirect: `/journal-entries/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CLONE_FAILED", message: errorMessage(error) });
  }
}
