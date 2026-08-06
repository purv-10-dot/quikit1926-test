import { requireUser } from "@/lib/auth/require";
import { MailboxList } from "@/components/mailbox/mailbox-list";

export const dynamic = "force-dynamic";

/** Personal-mailbox read — gated on requireUser only. See mailbox/inbox/page.tsx. */
export default async function MailboxSentPage() {
  await requireUser();
  return <MailboxList folder="sent" />;
}
