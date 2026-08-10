import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { ComposePage } from "@/components/mailbox/compose-page";

export const dynamic = "force-dynamic";

/**
 * Sending from your OWN connected mailbox is a personal action — gated on
 * requireUser only, matching Settings → Email Accounts. See mailbox/inbox/page.tsx.
 */
export default async function MailboxComposePage() {
  await requireUser();
  return (
    <Suspense fallback={null}>
      <ComposePage />
    </Suspense>
  );
}
