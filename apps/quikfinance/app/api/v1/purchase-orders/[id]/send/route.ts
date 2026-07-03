import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok, errorMessage } from "@/lib/api/responses";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Email a purchase order to the vendor (Resend when configured; otherwise queued & logged). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT po.purchase_order_number, po.total, po.contact_id, po.status, c.display_name AS vendor_name, c.email AS vendor_email
      FROM purchase_orders po LEFT JOIN contacts c ON c.id = po.contact_id
      WHERE po.id = ${params.id}::uuid AND po.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Purchase order was not found." });
    const po = rows[0];

    const email = typeof po.vendor_email === "string" ? po.vendor_email : "";
    if (!email) return fail(422, { code: "VENDOR_EMAIL_REQUIRED", message: "Add a vendor email before sending the purchase order." });

    const number = String(po.purchase_order_number ?? "Purchase Order");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const pdfUrl = `${appUrl}/api/v1/purchase-orders/${params.id}/pdf`;
    const subject = `Purchase Order ${number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Purchase Order ${number}</h2>
        <p>Hello ${String(po.vendor_name ?? "there")},</p>
        <p>Please find our purchase order attached.</p>
        <p><a href="${pdfUrl}">Open purchase order PDF</a></p>
        <p>Thank you,<br/>QuikFinance</p>
      </div>`;

    const { resendApiKey } = getServerEnv();
    let status = "queued";
    let providerId: string | null = null;
    let errorText: string | null = null;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const result = await resend.emails.send({ from: "QuikFinance <purchasing@quikfinance.app>", to: [email], subject, html });
        status = result.error ? "failed" : "sent";
        providerId = result.data?.id ?? null;
        errorText = result.error ? String(result.error.message ?? "Send failed") : null;
      } catch (sendError) {
        status = "failed";
        errorText = errorMessage(sendError);
      }
    }

    await db.from("contact_emails").insert({
      org_id: orgId, contact_id: po.contact_id, direction: "outgoing", to_email: email,
      subject, body: html, status, provider_id: providerId, error: errorText,
      related_type: "purchase_order", related_id: params.id, sent_by: userId, sent_at: status === "sent" ? new Date().toISOString() : null
    });
    // Sending a draft PO issues it (Zoho behaviour).
    if (po.status === "draft") {
      await prisma.$executeRaw`UPDATE purchase_orders SET status = 'issued', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    }
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "purchase_order", entity_id: params.id, action: "send", new_values: { to: email, status } });

    return ok({ id: params.id, delivery: { status, message: errorText } });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
