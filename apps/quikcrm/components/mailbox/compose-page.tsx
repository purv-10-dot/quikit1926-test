"use client";

/**
 * Full-page Compose inside the Mailbox module (not a popup). Thin shell around
 * the SHARED EmailComposeFields + sendComposedEmail — the exact one engine used
 * by Lead → Send Email and Log Activity → Email (POST /api/email/send). No new
 * pipeline, no duplicated send/validation/attachment/threading logic.
 *
 * Opened standalone → relatedKind "None" (stored, shows in Mailbox, not on any
 * record). Opened from a record via ?relatedKind=Lead&relatedObjectId=…&to=… →
 * prefills the recipient and links the email to that record.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  EmailComposeFields,
  emptyCompose,
  sendComposedEmail,
  type ComposeValue,
} from "@/components/email/email-compose-fields";

type RecordKind = "Lead" | "Contact" | "Account" | "Opportunity";
const RECORD_KINDS: RecordKind[] = ["Lead", "Contact", "Account", "Opportunity"];

export function ComposePage() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();

  // Optional record context (when opened from a Lead/Contact/Account/Opportunity).
  const kindParam = params.get("relatedKind");
  const relatedKind: RecordKind | "None" =
    kindParam && (RECORD_KINDS as string[]).includes(kindParam) ? (kindParam as RecordKind) : "None";
  const relatedObjectId = params.get("relatedObjectId") ?? undefined;
  const prefillTo = params.get("to");

  const [value, setValue] = useState<ComposeValue>(() =>
    emptyCompose(prefillTo ? { to: [prefillTo] } : undefined),
  );
  const [sending, setSending] = useState(false);
  const [hasMailbox, setHasMailbox] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/email/mailbox", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setHasMailbox(!!j?.data?.connection && j.data.connection.status === "active"))
      .catch(() => setHasMailbox(false));
  }, []);

  async function send() {
    setSending(true);
    try {
      const r = await sendComposedEmail({ relatedKind, relatedObjectId, value });
      if (r.ok) {
        toast.success("Email sent.");
        // The send route mirrors into CrmMailboxEmail immediately, so Sent/All
        // reflect it on navigation (list fetches on mount).
        router.push("/mailbox/sent");
      } else {
        toast.error(r.error ?? "Failed to send email.");
      }
    } finally {
      setSending(false);
    }
  }

  if (hasMailbox === null) {
    return (
      <div className="flex items-center gap-2 p-6 text-crm-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!hasMailbox) {
    return (
      <div className="crm-card p-8 text-center">
        <p className="text-sm text-crm-text">Connect your mailbox to compose email from the CRM.</p>
        <Link href="/settings/email" className="crm-btn-primary mt-3 inline-block text-sm">
          Connect Mailbox
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-crm-text">New Email</h1>
        {relatedKind !== "None" && (
          <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
            Linked to {relatedKind}
          </span>
        )}
      </div>

      <div className="crm-card p-5">
        <EmailComposeFields value={value} onChange={setValue} />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => router.back()} className="crm-btn-ghost text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="crm-btn-primary inline-flex items-center gap-1.5 text-sm"
        >
          <Send className="h-4 w-4" />
          {sending ? "Sending…" : "Send Email"}
        </button>
      </div>
    </div>
  );
}
