import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type Event = { type: string; label: string; date: string; amount?: number };

/** Aggregated activity timeline for a customer (created, invoices, payments, documents, audit). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const id = params.id;

  try {
    const contact = (await prisma.$queryRaw`SELECT display_name, created_at FROM contacts WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ display_name: string; created_at: Date }>;
    if (!contact.length) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });

    const invoices = (await prisma.$queryRaw`
      SELECT invoice_number, total, to_char(issue_date,'YYYY-MM-DD') AS d FROM invoices
      WHERE org_id = ${orgId}::uuid AND contact_id = ${id}::uuid ORDER BY issue_date DESC LIMIT 50`) as Array<{ invoice_number: string; total: string; d: string }>;
    const payments = (await prisma.$queryRaw`
      SELECT amount, to_char(payment_date,'YYYY-MM-DD') AS d FROM payments
      WHERE org_id = ${orgId}::uuid AND contact_id = ${id}::uuid AND payment_type = 'received' ORDER BY payment_date DESC LIMIT 50`) as Array<{ amount: string; d: string }>;
    const docs = (await prisma.$queryRaw`
      SELECT file_name, to_char(created_at,'YYYY-MM-DD') AS d FROM contact_documents
      WHERE org_id = ${orgId}::uuid AND contact_id = ${id}::uuid ORDER BY created_at DESC LIMIT 50`) as Array<{ file_name: string; d: string }>;
    const audits = (await prisma.$queryRaw`
      SELECT action, to_char(created_at,'YYYY-MM-DD') AS d FROM audit_logs
      WHERE org_id = ${orgId}::uuid AND entity_type = 'customer' AND entity_id = ${id}::uuid ORDER BY created_at DESC LIMIT 20`) as Array<{ action: string; d: string }>;

    const events: Event[] = [
      { type: "created", label: "Customer created", date: new Date(contact[0].created_at).toISOString().slice(0, 10) },
      ...invoices.map((i) => ({ type: "invoice", label: `Invoice ${i.invoice_number}`, date: i.d, amount: Number(i.total) })),
      ...payments.map((p) => ({ type: "payment", label: "Payment received", date: p.d, amount: Number(p.amount) })),
      ...docs.map((d) => ({ type: "document", label: `Document: ${d.file_name}`, date: d.d })),
      ...audits.filter((a) => a.action !== "create").map((a) => ({ type: "audit", label: `Record ${a.action}d`, date: a.d }))
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    return ok(events);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
