import type { NextRequest } from "next/server";
import { Resend } from "resend";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok, errorMessage } from "@/lib/api/responses";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Email a sales order to the customer (Resend when configured; otherwise queued & logged). */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT so.sales_order_number, so.total, so.contact_id, c.display_name AS customer_name, c.email AS customer_email
      FROM sales_orders so LEFT JOIN contacts c ON c.id = so.contact_id
      WHERE so.id = ${params.id}::uuid AND so.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Sales order was not found." });
    const so = rows[0];

    const email = typeof so.customer_email === "string" ? so.customer_email : "";
    if (!email) return fail(422, { code: "CUSTOMER_EMAIL_REQUIRED", message: "Add a customer email before sending the sales order." });

    const number = String(so.sales_order_number ?? "Sales Order");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const pdfUrl = `${appUrl}/api/v1/sales-orders/${params.id}/pdf`;
    const subject = `Sales Order ${number}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Sales Order ${number}</h2>
        <p>Hello ${String(so.customer_name ?? "there")},</p>
        <p>Please find your sales order attached.</p>
        <p><a href="${pdfUrl}">Open sales order PDF</a></p>
        <p>Thank you,<br/>QuikFinance</p>
      </div>`;

    const { resendApiKey } = getServerEnv();
    let status = "queued";
    let providerId: string | null = null;
    let errorText: string | null = null;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const result = await resend.emails.send({ from: "QuikFinance <sales@quikfinance.app>", to: [email], subject, html });
        status = result.error ? "failed" : "sent";
        providerId = result.data?.id ?? null;
        errorText = result.error ? String(result.error.message ?? "Send failed") : null;
      } catch (sendError) {
        status = "failed";
        errorText = errorMessage(sendError);
      }
    }

    await db.from("contact_emails").insert({
      org_id: orgId, contact_id: so.contact_id, direction: "outgoing", to_email: email,
      subject, body: html, status, provider_id: providerId, error: errorText,
      related_type: "sales_order", related_id: params.id, sent_by: userId, sent_at: status === "sent" ? new Date().toISOString() : null
    });
    await prisma.$executeRaw`UPDATE sales_orders SET status = 'sent', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "sales_order", entity_id: params.id, action: "send", new_values: { to: email, status } });

    return ok({ id: params.id, delivery: { status, message: errorText } });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
