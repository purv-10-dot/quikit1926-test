import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { buildEWayBillPayload, validateForEInvoice, type EWayDetails } from "@/lib/gst/einvoice";
import { loadInvoiceForGst } from "@/lib/gst/load-invoice";
import { submitEWayBill } from "@/lib/gst/irp-client";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const bodySchema = z.object({
  transport_mode: z.enum(["1", "2", "3", "4"]).optional(),
  vehicle_no: z.string().trim().max(20).optional().nullable(),
  transporter_id: z.string().trim().max(20).optional().nullable(),
  transporter_name: z.string().trim().max(120).optional().nullable(),
  distance_km: z.coerce.number().min(0).optional(),
  transport_doc_no: z.string().trim().max(40).optional().nullable(),
  transport_doc_date: z.string().trim().optional().nullable()
});

/** Build + (if credentials present) generate the e-Way bill with NIC. Persists payload and any e-Way number. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  const details: EWayDetails = parsed.success ? (parsed.data as EWayDetails) : {};

  try {
    const loaded = await loadInvoiceForGst(prisma, orgId, params.id);
    if (!loaded) return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });

    const check = validateForEInvoice(loaded.org, loaded.contact, loaded.invoice);
    if (!check.ok) {
      return fail(422, { code: "EWAY_INVALID", message: check.errors.join(" ") });
    }

    const payload = buildEWayBillPayload(loaded.org, loaded.contact, loaded.invoice, loaded.lines, details);
    const result = await submitEWayBill(payload);

    if (result.status === "eway_generated") {
      await prisma.$executeRaw`
        UPDATE invoices SET
          eway_bill_no = ${result.ewayBillNo}, eway_bill_date = now(), eway_valid_until = now(),
          eway_status = 'generated', eway_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
        WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return ok({ status: "generated", eway_bill_no: result.ewayBillNo, valid_until: result.validUntil });
    }

    if (result.status === "error") {
      await prisma.$executeRaw`
        UPDATE invoices SET eway_status = 'error', eway_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
        WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return fail(502, { code: "NIC_ERROR", message: result.message });
    }

    await prisma.$executeRaw`
      UPDATE invoices SET eway_status = 'pending', eway_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ status: "pending_credentials", message: result.message, payload });
  } catch (error) {
    return fail(400, { code: "EWAY_FAILED", message: errorMessage(error) });
  }
}
