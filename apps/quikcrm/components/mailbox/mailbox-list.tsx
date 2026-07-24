"use client";

/**
 * Reusable mailbox list for a folder (Inbox/Sent/Drafts/All). Reads
 * /api/mailbox/emails (local DB only — never the provider). Search, filters
 * (unread, has-attachment), pagination. Clicking a row opens the detail view.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Search, Mail } from "lucide-react";
import Link from "next/link";

interface EmailRow {
  id: string;
  folder: string;
  direction: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string | null;
  preview: string | null;
  hasAttachments: boolean;
  isRead: boolean;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const TITLES: Record<string, string> = {
  inbox: "Inbox",
  sent: "Sent",
  drafts: "Drafts",
  all: "All Emails",
};

export function MailboxList({ folder }: { folder: "inbox" | "sent" | "drafts" | "all" }) {
  const router = useRouter();
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hasAttachment, setHasAttachment] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ folder, page: String(page), pageSize: "25" });
      if (q.trim()) sp.set("q", q.trim());
      if (unreadOnly) sp.set("isRead", "false");
      if (hasAttachment) sp.set("hasAttachment", "true");
      const res = await fetch(`/api/mailbox/emails?${sp}`, { credentials: "include" });
      const json = await res.json();
      if (json.success) {
        setRows(json.data.items);
        setConnected(json.data.connected);
        setTotalPages(json.data.totalPages);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [folder, page, q, unreadOnly, hasAttachment]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 when filters/search change.
  useEffect(() => {
    setPage(1);
  }, [folder, q, unreadOnly, hasAttachment]);

  function counterparty(r: EmailRow): string {
    if (folder === "sent" || folder === "drafts" || r.direction === "outbound") {
      return r.toAddresses.join(", ") || "(no recipient)";
    }
    return r.fromName || r.fromAddress;
  }

  if (!connected && !loading) {
    return (
      <div className="crm-card p-8 text-center">
        <Mail className="mx-auto h-8 w-8 text-crm-muted" />
        <p className="mt-3 text-sm text-crm-text">No mailbox connected.</p>
        <Link href="/settings/email" className="crm-btn-primary mt-3 inline-block text-sm">
          Connect Mailbox
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-crm-text">{TITLES[folder]}</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-crm-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, sender, body…"
            className="crm-input w-64 pl-8 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-1.5 text-crm-muted">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread
        </label>
        <label className="inline-flex items-center gap-1.5 text-crm-muted">
          <input type="checkbox" checked={hasAttachment} onChange={(e) => setHasAttachment(e.target.checked)} />
          Has attachment
        </label>
        <span className="ml-auto text-xs text-crm-muted">{total} email{total === 1 ? "" : "s"}</span>
      </div>

      <div className="crm-card divide-y divide-crm-border overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-crm-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-crm-muted">No emails.</div>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => router.push(`/mailbox/${r.id}`)}
              className={
                "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-blue-50/40 " +
                (r.isRead ? "" : "bg-blue-50/20")
              }
            >
              {!r.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
              <div className={"min-w-0 flex-1 " + (r.isRead ? "" : "font-semibold")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-crm-text">{counterparty(r)}</span>
                  <span className="shrink-0 text-xs text-crm-muted">
                    {new Date(r.receivedAt ?? r.sentAt ?? r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="truncate text-sm text-crm-text">{r.subject || "(no subject)"}</div>
                <div className="flex items-center gap-1.5 truncate text-xs text-crm-muted">
                  {r.hasAttachments && <Paperclip className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{r.preview}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="crm-btn-ghost disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-crm-muted">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="crm-btn-ghost disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
