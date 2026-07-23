"use client";

/**
 * Emails tab body for a Lead/Contact/Account/Opportunity. Lists the record's
 * email threads (sent + received) as a conversation and offers Send / Reply,
 * which open the ComposeEmailModal. Data comes from GET /api/email/threads.
 */

import { useCallback, useEffect, useState } from "react";
import { Mail, Loader2, Paperclip, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ComposeEmailModal, type ComposePrefill } from "./compose-email-modal";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
}
interface Message {
  id: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string | null;
  snippet: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  attachments: Attachment[];
}
interface Thread {
  id: string;
  subject: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  messages: Message[];
}

interface Props {
  relatedKind: "Lead" | "Contact" | "Account" | "Opportunity";
  relatedObjectId: string;
  /** Prefill recipient(s) for a fresh compose (e.g. the record's email). */
  defaultTo?: string[];
}

export function EmailThreadPanel({ relatedKind, relatedObjectId, defaultTo }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [compose, setCompose] = useState<ComposePrefill | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/email/threads?relatedKind=${relatedKind}&relatedObjectId=${relatedObjectId}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (json.success) setThreads(json.data.threads);
    } finally {
      setLoading(false);
    }
  }, [relatedKind, relatedObjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function replyTo(thread: Thread, msg: Message) {
    const subject = (thread.subject ?? msg.subject ?? "").replace(/^(re:\s*)+/i, "");
    setCompose({
      to: [msg.direction === "inbound" ? msg.fromAddress : msg.toAddresses[0]].filter(Boolean),
      subject: `Re: ${subject}`,
      inReplyToMessageId: msg.id,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-crm-text">Email</h3>
        <button
          type="button"
          onClick={() => setCompose({ to: defaultTo, subject: "" })}
          className="crm-btn-primary inline-flex items-center gap-1.5 text-sm"
        >
          <Mail className="h-4 w-4" /> Send Email
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-crm-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
        </div>
      ) : threads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-crm-border py-10 text-center text-sm text-crm-muted">
          No emails yet. Send one to start the conversation — replies will sync here automatically.
        </div>
      ) : (
        <div className="space-y-5">
          {threads.map((thread) => (
            <div key={thread.id} className="crm-card overflow-hidden">
              <div className="border-b border-crm-border bg-accent-50 px-4 py-2 text-sm font-medium text-crm-text">
                {thread.subject || "(no subject)"}
                <span className="ml-2 text-xs font-normal text-crm-muted">
                  {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="divide-y divide-crm-border">
                {thread.messages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} onReply={() => replyTo(thread, msg)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {compose && (
        <ComposeEmailModal
          open
          onClose={() => setCompose(null)}
          relatedKind={relatedKind}
          relatedObjectId={relatedObjectId}
          prefill={compose}
          onSent={load}
        />
      )}
    </div>
  );
}

function MessageRow({ msg, onReply }: { msg: Message; onReply: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const when = msg.sentAt ?? msg.receivedAt ?? msg.createdAt;
  const outbound = msg.direction === "outbound";

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span
            className={
              "mt-0.5 rounded-full p-1 " +
              (outbound ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600")
            }
            title={outbound ? "Sent" : "Received"}
          >
            {outbound ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm text-crm-text">
              <span className="font-medium">{msg.fromAddress}</span>
              <span className="text-crm-muted"> → {msg.toAddresses.join(", ")}</span>
            </div>
            <div className="text-xs text-crm-muted">{new Date(when).toLocaleString()}</div>
          </div>
        </div>
        <button type="button" onClick={onReply} className="crm-btn-ghost shrink-0 text-xs">
          Reply
        </button>
      </div>

      <div className="mt-2 pl-7 text-sm text-crm-text">
        {expanded && msg.bodyHtml ? (
          <div
            className="prose prose-sm max-w-none"
            // Body is provider content; rendered read-only. See TODO on sanitization.
            dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-left text-crm-muted hover:text-crm-text"
          >
            {msg.snippet || "(no preview)"}
          </button>
        )}
        {msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((a) => (
              <a
                key={a.id}
                href={`/api/email/attachments/${a.id}`}
                className="inline-flex items-center gap-1 rounded border border-crm-border px-2 py-0.5 text-xs text-crm-muted hover:text-crm-text hover:underline"
              >
                <Paperclip className="h-3 w-3" /> {a.filename}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
