import { requireUser } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { MailboxList } from "@/components/mailbox/mailbox-list";

export const dynamic = "force-dynamic";

export default async function MailboxInboxPage() {
  const user = await requireUser();
  await assertModule(user, "mailbox", "view");
  return <MailboxList folder="inbox" />;
}
