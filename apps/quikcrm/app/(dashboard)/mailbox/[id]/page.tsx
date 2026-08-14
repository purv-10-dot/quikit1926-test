import { requireUser } from "@/lib/auth/require";
import { EmailDetail } from "@/components/mailbox/email-detail";

export const dynamic = "force-dynamic";

/**
 * Personal-mailbox read — gated on requireUser only. See mailbox/inbox/page.tsx.
 * The email itself is still resolved via getMailboxEmail(), which filters on
 * (orgId, the caller's own mailboxConnectionId), so no user can open another
 * user's email by guessing its id.
 */
export default async function MailboxEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  return <EmailDetail id={id} />;
}
