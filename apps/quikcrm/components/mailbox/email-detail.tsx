"use client";

/**
 * Mailbox email detail: subject, from/to/cc/bcc, attachments, full (sanitized)
 * HTML body, and the thread (reply history) grouped by providerThreadId. Reads
 * /api/mailbox/emails/[id] (DB only). Body HTML is sanitized server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Paperclip, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface Attachment {
  filename: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}
interface EmailDetail {
  id: string;
  folder: string;
  direction: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string | null;
  bodyHtml: string | null;
  preview: string | null;
  hasAttachments: boolean;
  attachments?: Attachment[];
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export function EmailDetail({ id }: { id: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [thread, setThread] = useState<EmailDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mailbox/emails/${id}`, { credentials: "include" });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json();
      if (json.success) {
        setEmail(json.data.email);
        setThread(json.data.thread);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-crm-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (notFound || !email) {
    return <div className="crm-card p-8 text-center text-sm text-crm-muted">Email not found.</div>;
  }

  // Show the single email, or the whole thread if there are replies.
  const messages = thread.length > 1 ? thread : [email];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => router.back()}
        className="crm-btn-ghost inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="crm-card p-5">
        <h1 className="text-lg font-semibold text-crm-text">{email.subject || "(no subject)"}</h1>
      </div>

      <div className="space-y-4">
        {messages.map((m, i) => (
          <MessageCard key={m.id} m={m} emailId={m.id} defaultOpen={i === messages.length - 1} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({
  m,
  emailId,
  defaultOpen,
}: {
  m: EmailDetail;
  emailId: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const outbound = m.direction === "outbound";
  const when = m.receivedAt ?? m.sentAt ?? m.createdAt;

  return (
    <div className="crm-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-start gap-2">
          <span
            className={"mt-0.5 rounded-full p-1 " + (outbound ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600")}
          >
            {outbound ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-crm-text">
              {m.fromName || m.fromAddress}
            </div>
            <div className="truncate text-xs text-crm-muted">
              To: {m.toAddresses.join(", ")}
              {m.ccAddresses?.length ? ` · Cc: ${m.ccAddresses.join(", ")}` : ""}
              {m.bccAddresses?.length ? ` · Bcc: ${m.bccAddresses.join(", ")}` : ""}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-xs text-crm-muted">{new Date(when).toLocaleString()}</span>
      </button>

      {open && (
        <div className="border-t border-crm-border px-4 py-4">
          {m.bodyHtml ? (
            // Body sanitized server-side before it reaches the client.
            <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
          ) : (
            <p className="text-sm text-crm-muted">{m.preview || "(no content)"}</p>
          )}

          {m.attachments && m.attachments.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {m.attachments.map((a, idx) => (
                <a
                  key={idx}
                  href={`/api/mailbox/emails/${emailId}/attachments/${idx}`}
                  className="inline-flex items-center gap-1 rounded border border-crm-border px-2 py-1 text-xs text-crm-muted hover:text-crm-text hover:underline"
                >
                  <Paperclip className="h-3 w-3" /> {a.filename}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
