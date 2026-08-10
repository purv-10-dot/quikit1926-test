/**
 * Settings → Support Status.
 *
 * Lists every support request the signed-in user has raised — from QuikHRMS and
 * from any other QuikIT app — with its status and our latest reply. The table
 * is `SupportStatusTab` in @quikit/ui, so every app shows the same thing.
 *
 * Deliberately NOT admin-gated. Support status is inherently per-user: gating
 * it would hide it from exactly the people who raise tickets.
 */

import { SupportStatusTab } from "@quikit/ui/support";

export default function SupportStatusPage() {
  return (
    <div className="p-4 sm:p-6">
      <SupportStatusTab />
    </div>
  );
}
