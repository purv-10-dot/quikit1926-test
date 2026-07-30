import { requireUser } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { EmailDetail } from "@/components/mailbox/email-detail";

export const dynamic = "force-dynamic";

export default async function MailboxEmailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  await assertModule(user, "mailbox", "view");
  const { id } = await params;
  return <EmailDetail id={id} />;
}
