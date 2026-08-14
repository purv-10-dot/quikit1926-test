/**
 * Settings → Support Status.
 *
 * Lists every support request the signed-in user has raised — from
 * QuikCRMExpress and from any other QuikIT app — with its status and our latest
 * reply. The table is `SupportStatusTab` from @quikit/ui, so every app shows
 * exactly the same thing; this page only supplies the route.
 *
 * Pairs with the floating <SupportLauncher /> in (dashboard)/layout.tsx (which
 * raises requests) and the app/api/support/* routes that back both.
 *
 * Deliberately NOT admin-gated. Support status is inherently per-user — gating
 * it behind adminOnly would hide it from exactly the people who raise tickets.
 * Mirrors apps/quiktrack/app/(dashboard)/settings/support/page.tsx.
 */

import { SupportStatusTab } from "@quikit/ui/support";

export default function SupportStatusPage() {
  return (
    <div className="p-6">
      <SupportStatusTab />
    </div>
  );
}
