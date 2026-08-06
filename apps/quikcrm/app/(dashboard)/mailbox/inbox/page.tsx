import { requireUser } from "@/lib/auth/require";
import { MailboxList } from "@/components/mailbox/mailbox-list";

export const dynamic = "force-dynamic";

/**
 * A mailbox is PERSONAL data: the user connected their own account and every
 * read is scoped to their own `mailboxConnectionId`. So this is gated on
 * requireUser only — same rule as Settings → Email Accounts, which lets any
 * authenticated user connect a mailbox. Requiring an org-level `mailbox` grant
 * here contradicted that and crashed the render for every non-admin role.
 */
export default async function MailboxInboxPage() {
  await requireUser();
  return <MailboxList folder="inbox" />;
}
