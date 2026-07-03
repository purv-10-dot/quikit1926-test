import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok, errorMessage } from "@/lib/api/responses";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Email a credit note to the customer (Resend when configured; otherwise queued & logged). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT cn.credit_note_number, cn.total, cn.contact_id, c.display_name AS customer_name, c.email AS customer_email
      FROM credit_notes cn LEFT JOIN contacts c ON c.id = cn.contact_id
      WHERE cn.id = ${params.id}::uuid AND cn.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Credit note was not found." });
    const cn = rows[0];
    const email = typeof cn.customer_email === "string" ? cn.customer_email : "";
    if (!email) return fail(422, { code: "CUSTOMER_EMAIL_REQUIRED", message: "Add a customer email before sending the credit note." });

    const number = String(cn.credit_note_number ?? "Credit Note");
    const pdfUrl = `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/v1/credit-notes/${params.id}/pdf`;
    const subject = `Credit Note ${number}`;
    const html = `<div style="font-family: Arial, sans-serif; line-height: 1.6;"><h2>Credit Note ${number}</h2><p>Hello ${String(cn.customer_name ?? "there")},</p><p>Please find your credit note attached.</p><p><a href="${pdfUrl}">Open credit note PDF</a></p><p>Thank you,<br/>QuikFinance</p></div>`;

    const { resendApiKey } = getServerEnv();
    let status = "queued";
    let providerId: string | null = null;
    let errorText: string | null = null;
    if (resendApiKey) {
      try {
        const result = await new Resend(resendApiKey).emails.send({ from: "QuikFinance <sales@quikfinance.app>", to: [email], subject, html });
        status = result.error ? "failed" : "sent";
        providerId = result.data?.id ?? null;
        errorText = result.error ? String(result.error.message ?? "Send failed") : null;
      } catch (sendError) { status = "failed"; errorText = errorMessage(sendError); }
    }
    await db.from("contact_emails").insert({ org_id: orgId, contact_id: cn.contact_id, direction: "outgoing", to_email: email, subject, body: html, status, provider_id: providerId, error: errorText, related_type: "credit_note", related_id: params.id, sent_by: userId, sent_at: status === "sent" ? new Date().toISOString() : null });
    return ok({ id: params.id, delivery: { status, message: errorText } });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
