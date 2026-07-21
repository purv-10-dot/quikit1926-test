import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { ComposePage } from "@/components/mailbox/compose-page";

export const dynamic = "force-dynamic";

export default async function MailboxComposePage() {
  const user = await requireUser();
  await assertModule(user, "mailbox", "create");
  return (
    <Suspense fallback={null}>
      <ComposePage />
    </Suspense>
  );
}
