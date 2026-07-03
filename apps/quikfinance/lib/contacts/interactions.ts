import type { Prisma } from "@prisma/client";
import { sendEmail, emailHtml } from "@/lib/email/mailer";

type DB = Prisma.TransactionClient;

/** Comments (shared by customers + vendors). */
export async function listComments(prisma: DB, orgId: string, contactId: string) {
  return (await prisma.$queryRaw`
    SELECT cc.id, cc.body, cc.author, to_char(cc.created_at,'YYYY-MM-DD HH24:MI') AS created_at, p.full_name AS user_name
    FROM contact_comments cc LEFT JOIN profiles p ON p.id = cc.user_id
    WHERE cc.contact_id = ${contactId}::uuid AND cc.org_id = ${orgId}::uuid
    ORDER BY cc.created_at DESC`) as unknown[];
}

export async function addComment(prisma: DB, orgId: string, contactId: string, userId: string | null, body: string) {
  const rows = (await prisma.$queryRaw`
    INSERT INTO contact_comments (org_id, contact_id, user_id, body)
    VALUES (${orgId}::uuid, ${contactId}::uuid, ${userId ? userId : null}::uuid, ${body})
    RETURNING id, body, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at`) as unknown[];
  return rows[0];
}

/** Emails (shared by customers + vendors). */
export async function listEmails(prisma: DB, orgId: string, contactId: string) {
  return (await prisma.$queryRaw`
    SELECT id, direction, to_email, cc, subject, body, status, error,
           to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at, to_char(sent_at,'YYYY-MM-DD HH24:MI') AS sent_at
    FROM contact_emails WHERE contact_id = ${contactId}::uuid AND org_id = ${orgId}::uuid
    ORDER BY created_at DESC`) as unknown[];
}

export type ComposeResult = { ok: true; email: unknown; delivery: { status: string; message?: string } } | { ok: false; code: string; message: string };

export async function composeAndLogEmail(
  prisma: DB,
  orgId: string,
  contactId: string,
  userId: string | null,
  input: { to?: string; cc?: string | null; subject: string; body: string }
): Promise<ComposeResult> {
  const contactRows = (await prisma.$queryRaw`SELECT email FROM contacts WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ email: string | null }>;
  if (!contactRows.length) return { ok: false, code: "NOT_FOUND", message: "Contact was not found." };
  const to = input.to || contactRows[0].email;
  if (!to) return { ok: false, code: "NO_RECIPIENT", message: "This contact has no email address; enter a recipient." };

  const orgRows = (await prisma.$queryRaw`SELECT name FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ name: string }>;
  const result = await sendEmail({ to, cc: input.cc ?? null, subject: input.subject, html: emailHtml(input.body, orgRows[0]?.name) });

  const status = result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "queued";
  const providerId = result.status === "sent" ? result.providerId : null;
  const error = result.status === "failed" ? result.error : null;

  const rows = (await prisma.$queryRaw`
    INSERT INTO contact_emails (org_id, contact_id, direction, to_email, cc, subject, body, status, provider_id, error, sent_by, sent_at)
    VALUES (${orgId}::uuid, ${contactId}::uuid, 'outgoing', ${to}, ${input.cc ?? null}, ${input.subject}, ${input.body},
      ${status}, ${providerId}, ${error}, ${userId ? userId : null}::uuid, ${status === "sent" ? new Date().toISOString() : null}::timestamptz)
    RETURNING id, to_email, subject, status, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at`) as unknown[];
  return { ok: true, email: rows[0], delivery: result };
}
