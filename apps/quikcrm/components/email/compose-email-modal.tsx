"use client";

/**
 * Compose / reply email modal for a record. Thin wrapper around the shared
 * EmailComposeFields + sendComposedEmail — the ONE email form + send path used
 * across the app (record Send Email AND Log Activity → Email). Shows a Connect
 * CTA when the user has no connected mailbox.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import {
  EmailComposeFields,
  emptyCompose,
  sendComposedEmail,
  type ComposeValue,
} from "@/components/email/email-compose-fields";

export interface ComposePrefill {
  to?: string[];
  cc?: string[];
  subject?: string;
  /** CrmEmailMessage.id being replied to (threads the send). */
  inReplyToMessageId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  relatedKind: "Lead" | "Contact" | "Account" | "Opportunity";
  relatedObjectId: string;
  prefill?: ComposePrefill;
  onSent?: () => void;
}

export function ComposeEmailModal({
  open,
  onClose,
  relatedKind,
  relatedObjectId,
  prefill,
  onSent,
}: Props) {
  const toast = useToast();
  const [value, setValue] = useState<ComposeValue>(() => emptyCompose());
  const [sending, setSending] = useState(false);
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(emptyCompose(prefill));
    // Check connection so we can show a Connect CTA rather than a failing send.
    fetch("/api/email/mailbox", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setHasMailbox(!!j?.data?.connection && j.data.connection.status === "active"))
      .catch(() => setHasMailbox(false));
  }, [open, prefill]);

  async function send() {
    setSending(true);
    try {
      const r = await sendComposedEmail({
        relatedKind,
        relatedObjectId,
        value,
        inReplyToMessageId: prefill?.inReplyToMessageId,
      });
      if (r.ok) {
        toast.success("Email sent.");
        onSent?.();
        onClose();
      } else {
        toast.error(r.error ?? "Failed to send email.");
      }
    } finally {
      setSending(false);
    }
  }

  const footer = hasMailbox ? (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className="crm-btn-ghost text-sm">
        Cancel
      </button>
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="crm-btn-primary text-sm"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  ) : undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={prefill?.inReplyToMessageId ? "Reply" : "New Email"}
      width="max-w-2xl"
      footer={footer}
    >
      {hasMailbox === false ? (
        <div className="space-y-3 py-4 text-center">
          <p className="text-sm text-crm-text">
            Connect your mailbox to send email from the CRM.
          </p>
          <Link href="/settings/email" className="crm-btn-primary inline-block text-sm">
            Connect Mailbox
          </Link>
        </div>
      ) : (
        <EmailComposeFields value={value} onChange={setValue} />
      )}
    </Modal>
  );
}
