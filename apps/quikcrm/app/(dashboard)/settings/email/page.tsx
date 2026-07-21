import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { MailboxPanel } from "@/components/settings/email/mailbox-panel";

export const dynamic = "force-dynamic";

/**
 * Settings → Email Accounts. Any authenticated CRM user may connect THEIR OWN
 * mailbox (this is a personal action, not admin config), so we gate on
 * requireUser only.
 */
export default async function EmailSettingsPage() {
  await requireUser();
  return (
    <Suspense fallback={null}>
      <MailboxPanel />
    </Suspense>
  );
}
