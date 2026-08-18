"use client";

/**
 * "Daily Digest" recipient toggle for the Settings→Users table (Phase 5 / Stage 4).
 *
 * WHO CAN RECEIVE vs WHO CAN TOGGLE (spec 2026-08-11) — two separate things:
 *   - RECEIVE: every role. Any user whose toggle is ON gets the digest email,
 *     regardless of CRM role (see lib/services/notifications/digest-eligibility.ts).
 *   - TOGGLE:  EXACTLY org_admin / Administrator / admin. Everyone else — the
 *     sales/marketing/finance roles, TeamManager, and also app_admin /
 *     super_admin / owner — sees a DISABLED switch that still shows the real
 *     ON/OFF state: they can read who receives the digest, not change it.
 *
 * `canToggle` is decided by the caller (the Settings→Users page owns the
 * role allow-list, mirroring DIGEST_TOGGLE_ROLES in the PATCH route) so the
 * disabled state matches the server's 403 boundary. It is a prop rather than a
 * context read so this control stays renderable in isolation, and it is a
 * permission flag rather than an `isAdmin` role claim so no broader notion of
 * "admin" can leak in. Defaults to false: a caller that forgets to pass it gets
 * the read-only control, never an unauthorized-but-enabled switch.
 *
 * digestEligible / digestReason still arrive from the listUsers DTO. Eligibility
 * is now always true by role, so they only matter if a future NON-role reason is
 * introduced; the control keeps honouring them.
 */

import { useState } from "react";

const REASON_LABEL: Record<string, string> = {
  "no-team": "No team to manage — Sales Managers need a team to receive a digest",
  "not-eligible-role": "Role not eligible for the daily digest",
};

export function DigestToggle({
  userId,
  digestEligible,
  digestEnabled,
  digestReason,
  canToggle: allowedToToggle = false,
}: {
  userId: string;
  digestEligible: boolean;
  digestEnabled: boolean;
  digestReason?: string;
  canToggle?: boolean;
}) {
  const [enabled, setEnabled] = useState(digestEnabled);
  const [saving, setSaving] = useState(false);
  // Caller-granted permission AND eligibility (always true by role now).
  const canToggle = allowedToToggle && digestEligible;

  async function toggle() {
    if (!canToggle || saving) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch("/api/settings/digest-recipients", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, enabled: next }),
      });
      if (!res.ok) setEnabled(!next); // revert on failure
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  const title = !digestEligible
    ? REASON_LABEL[digestReason ?? ""] ?? "Not eligible for the daily digest"
    : !allowedToToggle
      ? enabled
        ? "Receiving the daily digest — only an administrator can change this"
        : "Not receiving the daily digest — only an administrator can change this"
      : enabled
        ? "Receiving the daily digest — click to stop"
        : "Click to start receiving the daily digest";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Daily digest"
      title={title}
      disabled={!canToggle || saving}
      onClick={toggle}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
        (!digestEligible
          ? "cursor-not-allowed bg-slate-200 opacity-60"
          : // Non-admins keep the real ON/OFF colour (so the column stays
            // readable) but the control is not interactive.
            (enabled ? "bg-accent-600" : "bg-slate-300") +
            (canToggle ? "" : " cursor-not-allowed opacity-60"))
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition " +
          (enabled ? "translate-x-4" : "translate-x-0.5")
        }
      />
    </button>
  );
}
