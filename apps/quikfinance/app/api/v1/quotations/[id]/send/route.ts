import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok, errorMessage } from "@/lib/api/responses";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/**
 * Email this quote to the customer. Delivered via Resend when configured;
 * otherwise the message is logged and queued. The quote is marked "sent".
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT q.quotation_number, q.total, to_char(q.expiry_date,'YYYY-MM-DD') AS expiry_date, q.contact_id,
             c.display_name AS customer_name, c.email AS customer_email
      FROM quotations q LEFT JOIN contacts c ON c.id = q.contact_id
      WHERE q.id = ${params.id}::uuid AND q.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Quote was not found." });
    const quote = rows[0];

    const email = typeof quote.customer_email === "string" ? quote.customer_email : "";
    if (!email) return fail(422, { code: "CUSTOMER_EMAIL_REQUIRED", message: "Add a customer email before sending the quote." });

    const number = String(quote.quotation_number ?? "Quote");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const pdfUrl = `${appUrl}/api/v1/quotations/${params.id}/pdf`;
    const subject = `Quote ${number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Quote ${number}</h2>
        <p>Hello ${String(quote.customer_name ?? "there")},</p>
        <p>Please find your quote${quote.expiry_date ? `, valid until ${quote.expiry_date}` : ""}.</p>
        <p><a href="${pdfUrl}">Open quote PDF</a></p>
        <p>Looking forward to your business,<br/>QuikFinance</p>
      </div>`;

    const { resendApiKey } = getServerEnv();
    let status = "queued";
    let providerId: string | null = null;
    let errorText: string | null = null;

    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const result = await resend.emails.send({ from: "QuikFinance <quotes@quikfinance.app>", to: [email], subject, html });
        status = result.error ? "failed" : "sent";
        providerId = result.data?.id ?? null;
        errorText = result.error ? String(result.error.message ?? "Send failed") : null;
      } catch (sendError) {
        status = "failed";
        errorText = errorMessage(sendError);
      }
    }

    // Log the email and mark the quote as sent.
    await db.from("contact_emails").insert({
      org_id: orgId, contact_id: quote.contact_id, direction: "outgoing", to_email: email,
      subject, body: html, status, provider_id: providerId, error: errorText,
      related_type: "quotation", related_id: params.id, sent_by: userId, sent_at: status === "sent" ? new Date().toISOString() : null
    });
    await prisma.$executeRaw`UPDATE quotations SET status = 'sent', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: params.id, action: "send", new_values: { to: email, status } });

    return ok({ id: params.id, delivery: { status, message: errorText } });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
