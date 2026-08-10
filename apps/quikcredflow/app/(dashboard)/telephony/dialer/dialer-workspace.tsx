// apps/quikcredflow/app/(dashboard)/telephony/dialer/dialer-workspace.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CallModal } from "@/components/telephony/call-modal";

/**
 * Inline mount of the click-to-call lifecycle for the dedicated dialer page.
 * `inline` mode strips the modal chrome — the keypad is the page content,
 * while the in-call overlay and disposition modal still float on top.
 *
 * `?to=...` and `?leadId=...` URL params are honored so deep-links from the
 * lead detail page (e.g. "Call this lead from the full dialer") work.
 */
export function DialerWorkspace() {
  const params = useSearchParams();
  const to = params.get("to");
  const leadId = params.get("leadId") || undefined;
  // Bumping `key` resets CallModal's internal state so an agent can dial
  // again after the disposition modal closes.
  const [resetKey, setResetKey] = useState(0);

  return (
    <CallModal
      key={resetKey}
      open
      inline
      to={to}
      leadId={leadId}
      onClose={() => setResetKey((k) => k + 1)}
    />
  );
}
