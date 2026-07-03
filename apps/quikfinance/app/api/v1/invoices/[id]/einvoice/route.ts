import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { buildEInvoicePayload, validateForEInvoice } from "@/lib/gst/einvoice";
import { loadInvoiceForGst } from "@/lib/gst/load-invoice";
import { submitEInvoice } from "@/lib/gst/irp-client";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Build + (if credentials present) file the e-Invoice with the IRP. Persists the payload and any IRN/QR. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const loaded = await loadInvoiceForGst(prisma, orgId, params.id);
    if (!loaded) return fail(404, { code: "NOT_FOUND", message: "Invoice was not found." });

    const check = validateForEInvoice(loaded.org, loaded.contact, loaded.invoice);
    if (!check.ok) {
      return fail(422, { code: "EINVOICE_INVALID", message: check.errors.join(" ") });
    }

    const payload = buildEInvoicePayload(loaded.org, loaded.contact, loaded.invoice, loaded.lines);
    const result = await submitEInvoice(payload);

    if (result.status === "registered") {
      await prisma.$executeRaw`
        UPDATE invoices SET
          irn = ${result.irn}, ack_no = ${result.ackNo}, ack_date = now(),
          signed_qr_code = ${result.signedQrCode}, einvoice_status = 'registered',
          einvoice_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
        WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return ok({ status: "registered", irn: result.irn, ack_no: result.ackNo });
    }

    if (result.status === "error") {
      await prisma.$executeRaw`
        UPDATE invoices SET einvoice_status = 'error', einvoice_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
        WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return fail(502, { code: "IRP_ERROR", message: result.message });
    }

    // pending_credentials — payload built and saved, awaiting GSP setup.
    await prisma.$executeRaw`
      UPDATE invoices SET einvoice_status = 'pending', einvoice_payload = ${JSON.stringify(payload)}::jsonb, updated_at = now()
      WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    return ok({ status: "pending_credentials", message: result.message, payload });
  } catch (error) {
    return fail(400, { code: "EINVOICE_FAILED", message: errorMessage(error) });
  }
}
