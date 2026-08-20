"use client";

/**
 * Shown right after an invite is created or resent. Surfaces the one-time
 * accept link + temp password (native invites only) so the admin can hand
 * them to the invitee directly if the email doesn't land. Built on the
 * shared `Modal` + `.qc-input`/`IconButton` design system, matching every
 * other dialog in the app.
 */

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Button, IconButton, Modal } from "@/components/ui";

export interface InviteResult {
  url: string;
  method?: "native" | "sso";
  ssoProvider?: "google" | "microsoft" | null;
  expiresAt: string;
  mail: { sent: boolean; error: string | null };
  tempPassword?: string;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to fall back to */
    }
  }
  return (
    <div>
      <label className="qc-label">{label}</label>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: 12.5,
            background: "var(--qc-surface-2)",
            border: "0.5px solid var(--qc-border-strong)",
            borderRadius: "var(--qc-r-md)",
            padding: "7px 10px",
            color: "var(--qc-text)",
          }}
        >
          {value}
        </code>
        <IconButton label="Copy" onClick={copy}>
          {copied ? <Check size={14} style={{ color: "var(--qc-presence)" }} /> : <Copy size={14} />}
        </IconButton>
      </div>
    </div>
  );
}

export function InviteResultDialog({
  email,
  result,
  onClose,
}: {
  email: string;
  result: InviteResult;
  onClose: () => void;
}) {
  const expires = new Date(result.expiresAt);
  return (
    <Modal
      open
      onClose={onClose}
      title="Invitation sent"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12.5,
            borderRadius: "var(--qc-r-md)",
            padding: "8px 10px",
            background: "var(--qc-surface-2)",
            border: "0.5px solid var(--qc-border-strong)",
            color: "var(--qc-text-2)",
          }}
        >
          <Mail size={14} style={{ marginTop: 2, flex: "none" }} />
          {result.mail.sent ? (
            <span>
              An email was sent to <strong>{email}</strong> with these details.
            </span>
          ) : (
            <span>
              Couldn&rsquo;t send the email automatically
              {result.mail.error ? <> ({result.mail.error})</> : null}. Share the link below with{" "}
              <strong>{email}</strong> directly.
            </span>
          )}
        </div>

        <CopyField label="Invitation link" value={result.url} />

        {result.tempPassword ? (
          <CopyField label="Temporary password" value={result.tempPassword} />
        ) : null}

        <p style={{ fontSize: 11.5, color: "var(--qc-text-3)", margin: 0 }}>
          This invitation expires on {expires.toLocaleDateString()} at{" "}
          {expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </p>
      </div>
    </Modal>
  );
}
