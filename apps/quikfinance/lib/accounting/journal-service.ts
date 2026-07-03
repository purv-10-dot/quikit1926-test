import { Prisma } from "@prisma/client";
import { z } from "zod";
import { idSchema, moneySchema, currencyCodeSchema } from "@/lib/validations/common.schema";
import { round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

type Tx = Prisma.TransactionClient;

const journalAttachmentSchema = z.object({
  id: idSchema.optional(),
  file_name: z.string().trim().min(1).max(255),
  content_type: z.string().max(200).optional().nullable(),
  size_bytes: z.coerce.number().int().min(0).default(0),
  data: z.string().max(20_000_000).optional().nullable()
});

export const journalManualSchema = z
  .object({
    journal_number: z.string().trim().min(1).max(40).optional(),
    entry_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
    reverse_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)).optional().nullable(),
    reverse_only_on_date: z.coerce.boolean().default(false),
    reference_number: z.string().trim().max(80).optional().nullable(),
    // Zoho's "Notes" is required (max 500). Stored in journal_entries.memo.
    notes: z.string().trim().min(1, "Notes are required.").max(500),
    reporting_method: z.enum(["accrual_and_cash", "accrual_only", "cash_only"]).default("accrual_and_cash"),
    currency: currencyCodeSchema.default("INR"),
    location_id: idSchema.optional().nullable(),
    department_id: idSchema.optional().nullable(),
    status: z.enum(["draft", "posted"]).default("posted"),
    lines: z
      .array(
        z.object({
          account_id: idSchema,
          debit: moneySchema.default(0),
          credit: moneySchema.default(0),
          description: z.string().max(500).optional().nullable(),
          contact_id: idSchema.optional().nullable()
        })
      )
      .min(2),
    attachments: z.array(journalAttachmentSchema).optional()
  })
  .refine(
    (value) => {
      const debit = round2(value.lines.reduce((sum, line) => sum + (line.debit || 0), 0));
      const credit = round2(value.lines.reduce((sum, line) => sum + (line.credit || 0), 0));
      return debit > 0 && debit === credit;
    },
    { message: "Journal entry must be balanced (total debits = total credits) and non-zero.", path: ["lines"] }
  );

export type JournalManualInput = z.infer<typeof journalManualSchema>;

/** Create/update a manual journal entry with its (balanced) lines, contacts, and attachments. */
export async function saveJournalEntry(tx: Tx, orgId: string, userId: string | null, input: JournalManualInput, journalId?: string): Promise<{ id: string }> {
  const isPosted = input.status === "posted";

  let id = journalId ?? "";
  if (journalId) {
    await tx.$executeRaw`
      UPDATE journal_entries SET
        entry_date = ${input.entry_date}::date,
        status = ${input.status},
        memo = ${input.notes},
        reference_number = ${input.reference_number ?? null},
        reporting_method = ${input.reporting_method},
        currency = ${input.currency},
        location_id = ${input.location_id ?? null}::uuid,
        department_id = ${input.department_id ?? null}::uuid,
        reverse_date = ${input.reverse_date ?? null}::date,
        reverse_only_on_date = ${input.reverse_only_on_date},
        posted_by = ${isPosted && userId ? userId : null}::uuid,
        posted_at = ${isPosted ? new Date() : null},
        updated_at = now()
      WHERE id = ${journalId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM journal_entry_lines WHERE journal_entry_id = ${journalId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const entryNumber =
      input.journal_number && input.journal_number.length > 0
        ? input.journal_number
        : await nextDocumentNumber(tx, orgId, "journal", { locationId: input.location_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO journal_entries (
        org_id, entry_number, entry_date, status, memo, reference_number, reporting_method, currency,
        location_id, department_id, reverse_date, reverse_only_on_date, source_type, created_by, posted_by, posted_at
      ) VALUES (
        ${orgId}::uuid, ${entryNumber}, ${input.entry_date}::date, ${input.status}, ${input.notes},
        ${input.reference_number ?? null}, ${input.reporting_method}, ${input.currency},
        ${input.location_id ?? null}::uuid, ${input.department_id ?? null}::uuid, ${input.reverse_date ?? null}::date, ${input.reverse_only_on_date},
        'manual', ${userId ? userId : null}::uuid, ${isPosted && userId ? userId : null}::uuid, ${isPosted ? new Date() : null}
      ) RETURNING id`;
    id = rows[0].id;
  }

  let order = 0;
  for (const line of input.lines) {
    if (round2(line.debit || 0) === 0 && round2(line.credit || 0) === 0) continue;
    await tx.$executeRaw`
      INSERT INTO journal_entry_lines (org_id, journal_entry_id, account_id, contact_id, description, debit, credit, display_order)
      VALUES (${orgId}::uuid, ${id}::uuid, ${line.account_id}::uuid, ${line.contact_id ?? null}::uuid, ${line.description ?? null}, ${round2(line.debit || 0)}, ${round2(line.credit || 0)}, ${order})`;
    order += 1;
  }

  // Attachments: keep referenced ones (by id), drop the rest, insert new uploads.
  const attachments = input.attachments ?? [];
  const existing = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'journal_entry' AND entity_id = ${id}::uuid`;
  const keep = new Set(attachments.filter((a) => a.id).map((a) => String(a.id)));
  for (const row of existing) {
    if (!keep.has(String(row.id))) await tx.$executeRaw`DELETE FROM document_attachments WHERE id = ${row.id}::uuid`;
  }
  for (const a of attachments.filter((x) => !x.id && x.data)) {
    await tx.$executeRaw`
      INSERT INTO document_attachments (org_id, entity_type, entity_id, file_name, file_path, content_type, size_bytes, uploaded_by)
      VALUES (${orgId}::uuid, 'journal_entry', ${id}::uuid, ${a.file_name}, ${a.data}, ${a.content_type ?? null}, ${Math.trunc(a.size_bytes ?? 0)}, ${userId ? userId : null}::uuid)`;
  }

  return { id };
}
