"use client";

import { Instagram, Facebook, ShieldOff } from "lucide-react";

import { useSocialAccounts } from "@/lib/auto-reply/use-social-accounts";
import { Toggle } from "./primitives/Toggle";

type AccountsHook = ReturnType<typeof useSocialAccounts>;

/**
 * Per-account auto-reply master switch. Sits above the KPI strip on
 * the Rules tab. One pill per connected FB/IG account: platform icon
 * + account name + small toggle. When toggled off, the chip dims and
 * shows a "Paused" indicator.
 *
 * Re-enable behaviour: the server advances cursors to now() in the
 * same transaction (per Phase 2 Q5), so flipping back on doesn't
 * trigger a backfill of comments that arrived while disabled.
 */
export function PlatformToggleStrip({
  accountsHook,
}: {
  accountsHook: AccountsHook;
}) {
  const accounts = accountsHook.data ?? [];
  if (accountsHook.loading || accounts.length === 0) {
    // No accounts connected → wizard's no-accounts state covers it.
    // Loading → KPI skeletons cover the rest of the page, so a flash
    // here would be noise.
    return null;
  }

  return (
    <div
      style={{
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 14,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        padding: "10px 14px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "rgba(255, 255, 255, 0.65)",
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Auto-reply for:
      </span>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
        {accounts.map((acc) => {
          const PlatformIcon = acc.platform === "instagram" ? Instagram : Facebook;
          const iconColor = acc.platform === "instagram" ? "#F472B6" : "#60A5FA";
          const enabled = acc.autoReplyEnabled;
          return (
            <div
              key={acc.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px 5px 12px",
                borderRadius: 9999,
                background: enabled
                  ? "rgba(255, 255, 255, 0.10)"
                  : "rgba(255, 255, 255, 0.05)",
                border: enabled
                  ? "1px solid rgba(255, 255, 255, 0.18)"
                  : "1px solid rgba(255, 255, 255, 0.10)",
                opacity: enabled ? 1 : 0.7,
                transition: "background 0.15s, opacity 0.15s",
              }}
            >
              <PlatformIcon size={14} color={iconColor} />
              <span
                style={{
                  fontSize: 12,
                  color: "#FFFFFF",
                  fontWeight: 500,
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {acc.accountName}
              </span>
              {!enabled && (
                <span
                  style={{
                    fontSize: 10,
                    color: "#FCA5A5",
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <ShieldOff size={10} />
                  Paused
                </span>
              )}
              <Toggle
                checked={enabled}
                onChange={() => accountsHook.togglePlatform(acc.id, !enabled)}
                size="sm"
                ariaLabel={`${enabled ? "Pause" : "Resume"} auto-reply for ${acc.accountName}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
