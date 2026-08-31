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
  /** Pre-written HTML body (e.g. an AI draft). Empty for a blank compose. */
  body?: string;
  /** CrmEmailMessage.id being replied to (threads the send). */
  inReplyToMessageId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "Prospect" is accepted because the whole send path already supports it —
   * ACTIVITY_PRIMARY_KINDS, sendEmailSchema and assertActivityTargetExists all
   * list it. Only this prop's union was narrower.
   */
  relatedKind: "Lead" | "Contact" | "Account" | "Opportunity" | "Prospect";
  /** Rendered above the form, e.g. to flag that the body is an AI draft. */
  notice?: React.ReactNode;
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
  notice,
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

  // Close is always available; Send appears only once a mailbox is connected,
  // so the form can be read and edited either way.
  const footer = (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className="crm-btn-ghost text-sm">
        {hasMailbox ? "Cancel" : "Close"}
      </button>
      {hasMailbox && (
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="crm-btn-primary text-sm"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={prefill?.inReplyToMessageId ? "Reply" : "New Email"}
      width="max-w-2xl"
      footer={footer}
    >
      {/* No mailbox blocks SENDING, not composing. The form still renders so a
          pre-filled draft stays visible and copyable — hiding it would throw
          away work the user already paid for (an AI draft is a model call) and
          make a solvable setup problem look like a failed feature. */}
      {hasMailbox === false && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2">
          <p className="text-sm text-crm-text">
            Connect your mailbox to send this from the CRM.
          </p>
          <Link href="/settings/email" className="crm-btn-primary text-xs">
            Connect Mailbox
          </Link>
        </div>
      )}
      {notice}
      <EmailComposeFields value={value} onChange={setValue} />
    </Modal>
  );
}
