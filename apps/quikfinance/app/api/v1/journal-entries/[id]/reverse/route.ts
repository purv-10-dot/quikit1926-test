import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { nextSequence } from "@/lib/accounting/posting";
import { assertPostingDateUnlocked } from "@/lib/period-locks";
import { todayISO } from "@/lib/utils/dates";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type JeRow = { entry_number: string; memo: string | null; reference_number: string | null; reporting_method: string; currency: string; location_id: string | null; reverse_date: Date | null };
type LineRow = { account_id: string; contact_id: string | null; description: string | null; debit: string; credit: string; display_order: number };

/** Create a reverse journal: a new published entry with debits/credits swapped (Zoho: Create Reverse Journal). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: { date?: string } = {};
  try { body = (await request.json()) as { date?: string }; } catch { body = {}; }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<JeRow[]>`
        SELECT entry_number, memo, reference_number, reporting_method, currency, location_id, reverse_date
        FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND source_type = 'manual' LIMIT 1`;
      if (!rows.length) throw new Error("Journal entry was not found.");
      const je = rows[0];
      const lines = await tx.$queryRaw<LineRow[]>`
        SELECT account_id, contact_id, description, debit, credit, display_order
        FROM journal_entry_lines WHERE journal_entry_id = ${params.id}::uuid AND org_id = ${orgId}::uuid ORDER BY display_order ASC`;
      if (!lines.length) throw new Error("This journal has no lines to reverse.");

      const date = (body.date && body.date.length >= 10 ? body.date : null) ?? (je.reverse_date ? je.reverse_date.toISOString().slice(0, 10) : null) ?? todayISO();
      // Control: do not post a reversal into a locked period.
      await assertPostingDateUnlocked(tx, orgId, date, "manual");
      const number = await nextSequence(tx, orgId, "journal_entries", "entry_number", "JE");
      const inserted = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO journal_entries (org_id, entry_number, entry_date, status, memo, reference_number, reporting_method, currency, location_id, source_type, reversal_of_id, created_by, posted_by, posted_at)
        VALUES (${orgId}::uuid, ${number}, ${date}::date, 'posted', ${`Reversal of ${je.entry_number}`}, ${je.reference_number ?? null}, ${je.reporting_method}, ${je.currency}, ${je.location_id ?? null}::uuid, 'manual', ${params.id}::uuid, ${userId ? userId : null}::uuid, ${userId ? userId : null}::uuid, now())
        RETURNING id`;
      const newId = inserted[0].id;
      for (const l of lines) {
        // Swap debit and credit.
        await tx.$executeRaw`
          INSERT INTO journal_entry_lines (org_id, journal_entry_id, account_id, contact_id, description, debit, credit, display_order)
          VALUES (${orgId}::uuid, ${newId}::uuid, ${l.account_id}::uuid, ${l.contact_id ?? null}::uuid, ${l.description ?? null}, ${Number(l.credit)}, ${Number(l.debit)}, ${l.display_order})`;
      }
      return { id: newId, number };
    });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: params.id, action: "reverse", new_values: { reversal_id: result.id } });
    return ok({ id: result.id, number: result.number, redirect: `/journal-entries/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "REVERSE_FAILED", message: errorMessage(error) });
  }
}
