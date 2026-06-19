"use client";

import Link from "next/link";
import {
  Instagram,
  Facebook,
  CheckCircle2,
  Link2,
  Plug,
} from "lucide-react";

import type { SocialAccountRow } from "@/lib/auto-reply/client-types";

type Props = {
  accounts: SocialAccountRow[];
  accountsLoading: boolean;
  selectedAccountId: string;
  ruleName: string;
  isEdit: boolean;
  onSelectAccount: (id: string) => void;
  onChangeName: (name: string) => void;
};

export function WizardStepAccount({
  accounts,
  accountsLoading,
  selectedAccountId,
  ruleName,
  isEdit,
  onSelectAccount,
  onChangeName,
}: Props) {
  if (accountsLoading) {
    return (
      <div style={{ color: "rgba(255, 255, 255, 0.65)", fontSize: 13 }}>
        Loading accounts…
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <Plug size={26} color="rgba(255, 255, 255, 0.65)" />
        </div>
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            marginBottom: 6,
            color: "#FFFFFF",
          }}
        >
          No social accounts connected
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255, 255, 255, 0.65)",
            margin: 0,
            marginBottom: 18,
            lineHeight: 1.55,
          }}
        >
          Connect Instagram or Facebook to start using auto-reply.
        </p>
        <Link
          href="/dashboard/integrations"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 20px",
            borderRadius: 10,
            background: "#FFFFFF",
            color: "#0A0A0A",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <Link2 size={14} />
          Open Integrations
        </Link>
      </div>
    );
  }

  return (
    <div>
      <label
        style={{
          fontSize: 13,
          fontWeight: 500,
          display: "block",
          marginBottom: 12,
          color: "#FFFFFF",
        }}
      >
        {isEdit ? "Connected account" : "Select social account"}
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {accounts.map((acc) => {
          const selected = selectedAccountId === acc.id;
          const PlatformIcon = acc.platform === "instagram" ? Instagram : Facebook;
          const iconColor = acc.platform === "instagram" ? "#F472B6" : "#60A5FA";
          return (
            <button
              key={acc.id}
              type="button"
              onClick={() => onSelectAccount(acc.id)}
              disabled={isEdit && !selected}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 12,
                border: selected
                  ? "1px solid rgba(255, 255, 255, 0.35)"
                  : "1px solid rgba(255, 255, 255, 0.10)",
                background: selected
                  ? "rgba(255, 255, 255, 0.18)"
                  : "rgba(255, 255, 255, 0.06)",
                cursor: isEdit && !selected ? "not-allowed" : "pointer",
                opacity: isEdit && !selected ? 0.4 : 1,
                textAlign: "left",
                width: "100%",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <PlatformIcon size={22} color={iconColor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#FFFFFF",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {acc.accountName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.55)",
                    textTransform: "capitalize",
                  }}
                >
                  {acc.platform}
                </div>
              </div>
              {selected && (
                <CheckCircle2
                  size={20}
                  color="#22C55E"
                  style={{ marginLeft: "auto" }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <label
          style={{
            fontSize: 13,
            fontWeight: 500,
            display: "block",
            marginBottom: 6,
            color: "#FFFFFF",
          }}
        >
          Rule name
        </label>
        <input
          type="text"
          value={ruleName}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="e.g. Welcome reply"
          // Glass input — design-tokens.md §3
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            background: "rgba(255, 255, 255, 0.08)",
            fontSize: 14,
            boxSizing: "border-box",
            outline: "none",
            color: "#FFFFFF",
          }}
        />
      </div>
    </div>
  );
}
