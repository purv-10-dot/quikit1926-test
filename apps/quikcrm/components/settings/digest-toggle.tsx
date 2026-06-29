"use client";

/**
 * "Daily Digest" recipient toggle for the Settings→Users table (Phase 5 / Stage 4).
 *
 * Eligible users get an interactive on/off switch that writes through
 * PATCH /api/settings/digest-recipients. Ineligible users get a DISABLED switch
 * with a tooltip explaining why (so the column reads clearly: who can receive the
 * digest, who can't, and the reason).
 *
 * Eligibility + the reason come from the listUsers DTO (digestEligible /
 * digestReason / digestEnabled). This component only renders the control and
 * fires the write; the server re-validates eligibility on the PATCH.
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
}: {
  userId: string;
  digestEligible: boolean;
  digestEnabled: boolean;
  digestReason?: string;
}) {
  const [enabled, setEnabled] = useState(digestEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (!digestEligible || saving) return;
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

  const title = digestEligible
    ? enabled
      ? "Receiving the daily digest — click to stop"
      : "Click to start receiving the daily digest"
    : REASON_LABEL[digestReason ?? ""] ?? "Not eligible for the daily digest";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Daily digest"
      title={title}
      disabled={!digestEligible || saving}
      onClick={toggle}
      className={
        "relative inline-flex h-5 w-9 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 " +
        (!digestEligible
          ? "cursor-not-allowed bg-slate-200 opacity-60"
          : enabled
            ? "bg-accent-600"
            : "bg-slate-300")
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
