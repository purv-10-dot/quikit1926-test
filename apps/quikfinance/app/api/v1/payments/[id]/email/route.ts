import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok, errorMessage } from "@/lib/api/responses";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Email the payment receipt to the customer (Resend when configured; otherwise queued & logged). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT p.payment_number, p.amount, p.contact_id, c.display_name AS customer_name, c.email AS customer_email
      FROM payments p LEFT JOIN contacts c ON c.id = p.contact_id
      WHERE p.id = ${params.id}::uuid AND p.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Payment was not found." });
    const p = rows[0];
    const email = typeof p.customer_email === "string" ? p.customer_email : "";
    if (!email) return fail(422, { code: "CUSTOMER_EMAIL_REQUIRED", message: "Add a customer email before sending the receipt." });

    const number = String(p.payment_number ?? "Receipt");
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/v1/payments/${params.id}/pdf`;
    const subject = `Payment Receipt ${number}`;
    const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6;"><h2>Payment Receipt ${number}</h2><p>Hello ${String(p.customer_name ?? "there")},</p><p>Thank you for your payment. Your receipt is attached.</p><p><a href="${pdfUrl}">Open receipt PDF</a></p><p>Regards,<br/>QuikFinance</p></div>`;

    const { resendApiKey } = getServerEnv();
    let status = "queued";
    let providerId: string | null = null;
    let errorText: string | null = null;
    if (resendApiKey) {
      try {
        const result = await new Resend(resendApiKey).emails.send({ from: "QuikFinance <billing@quikfinance.app>", to: [email], subject, html });
        status = result.error ? "failed" : "sent";
        providerId = result.data?.id ?? null;
        errorText = result.error ? String(result.error.message ?? "Send failed") : null;
      } catch (sendError) { status = "failed"; errorText = errorMessage(sendError); }
    }
    await db.from("contact_emails").insert({ org_id: orgId, contact_id: p.contact_id, direction: "outgoing", to_email: email, subject, body: html, status, provider_id: providerId, error: errorText, related_type: "payment", related_id: params.id, sent_by: userId, sent_at: status === "sent" ? new Date().toISOString() : null });
    return ok({ id: params.id, delivery: { status, message: errorText } });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
