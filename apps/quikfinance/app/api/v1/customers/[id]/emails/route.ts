import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { sendEmail, emailHtml } from "@/lib/email/mailer";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const bodySchema = z.object({
  to: z.string().trim().email().optional(),
  cc: z.string().trim().max(500).optional().nullable(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000)
});

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, direction, to_email, cc, subject, body, status, error,
             to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at,
             to_char(sent_at,'YYYY-MM-DD HH24:MI') AS sent_at
      FROM contact_emails WHERE contact_id = ${params.id}::uuid AND org_id = ${orgId}::uuid
      ORDER BY created_at DESC`) as unknown[];
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

/** Compose, send (if a provider is configured), and log an email to the customer. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let raw: unknown = {};
  try { raw = await request.json(); } catch { raw = {}; }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Subject and body are required.", details: parsed.error.flatten() });

  try {
    const contactRows = (await prisma.$queryRaw`SELECT email FROM contacts WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ email: string | null }>;
    if (!contactRows.length) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });
    const to = parsed.data.to || contactRows[0].email;
    if (!to) return fail(422, { code: "NO_RECIPIENT", message: "This customer has no email address; enter a recipient." });

    const orgRows = (await prisma.$queryRaw`SELECT name FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ name: string }>;
    const result = await sendEmail({ to, cc: parsed.data.cc ?? null, subject: parsed.data.subject, html: emailHtml(parsed.data.body, orgRows[0]?.name) });

    const status = result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "queued";
    const providerId = result.status === "sent" ? result.providerId : null;
    const error = result.status === "failed" ? result.error : null;

    const rows = (await prisma.$queryRaw`
      INSERT INTO contact_emails (org_id, contact_id, direction, to_email, cc, subject, body, status, provider_id, error, sent_by, sent_at)
      VALUES (${orgId}::uuid, ${params.id}::uuid, 'outgoing', ${to}, ${parsed.data.cc ?? null}, ${parsed.data.subject}, ${parsed.data.body},
        ${status}, ${providerId}, ${error}, ${userId ? userId : null}::uuid, ${status === "sent" ? new Date().toISOString() : null}::timestamptz)
      RETURNING id, to_email, subject, status, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at`) as unknown[];

    return ok({ email: rows[0], delivery: result }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
