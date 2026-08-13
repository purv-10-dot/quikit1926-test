"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { formatDateTime } from "@/lib/utils/date-helpers";

export type CommTab = "emails" | "calls" | "whatsapp" | "sms";

interface ThreadItem {
  id: string;
  channel: CommTab;
  title: string;
  preview: string;
  at: string;
  status?: string;
}

interface Props {
  leadId: string;
  leadPhone: string | null;
  leadEmail: string | null;
  activities: {
    id: string;
    type: string;
    subject: string | null;
    detailNotes: string | null;
    occurredAt: string | null;
    activityCode: string | null;
  }[];
  callLogs: {
    id: string;
    direction: string | null;
    status: string | null;
    durationSec: number | null;
    startTime: string | null;
    createdAt: string;
    recordingUrl?: string | null;
  }[];
  onComposeEmail?: () => void;
  onLogCall?: () => void;
  /** When set (e.g. from command palette), switches the active channel tab. */
  initialTab?: CommTab;
}

const TABS: { key: CommTab; label: string; icon: typeof Mail }[] = [
  { key: "emails", label: "Emails", icon: Mail },
  { key: "calls", label: "Calls", icon: Phone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "sms", label: "SMS", icon: MessageCircle },
];

function classifyChannel(type: string, code: string | null): CommTab | null {
  const t = `${type} ${code ?? ""}`.toLowerCase();
  if (t.includes("email")) return "emails";
  if (t.includes("whatsapp")) return "whatsapp";
  if (t.includes("sms")) return "sms";
  if (t.includes("call")) return "calls";
  return null;
}

export function CommunicationCenter({
  leadPhone,
  leadEmail,
  activities,
  callLogs,
  onComposeEmail,
  onLogCall,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<CommTab>(initialTab ?? "emails");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const threads = useMemo(() => {
    const items: ThreadItem[] = [];
    for (const a of activities) {
      const ch = classifyChannel(a.type, a.activityCode);
      if (!ch) continue;
      items.push({
        id: `a-${a.id}`,
        channel: ch,
        title: a.subject || a.type,
        preview: a.detailNotes?.slice(0, 160) ?? "",
        at: a.occurredAt ?? "",
        status: ch === "emails" ? "Logged" : undefined,
      });
    }
    for (const c of callLogs) {
      items.push({
        id: `c-${c.id}`,
        channel: "calls",
        title: `${c.direction ?? "Call"} · ${c.status ?? "completed"}`,
        preview: c.durationSec != null ? `${c.durationSec}s` : "No duration",
        at: c.startTime ?? c.createdAt,
        status: c.recordingUrl ? "Recording" : "Logged",
      });
    }
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [activities, callLogs]);

  const filtered = threads.filter((t) => {
    if (t.channel !== tab) return false;
    if (!q.trim()) return true;
    const hay = `${t.title} ${t.preview}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="crm-hscroll flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition " +
                  (tab === t.key
                    ? "bg-accent-600 text-white"
                    : "text-crm-muted hover:bg-crm-panel")
                }
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border border-crm-border py-2 pl-8 pr-3 text-sm"
          />
        </div>
      </div>

      {tab === "emails" && !leadEmail ? (
        <p className="mb-3 text-xs text-amber-700">No email on file — add one via quick edit.</p>
      ) : null}
      {tab === "calls" && !leadPhone ? (
        <p className="mb-3 text-xs text-amber-700">No phone on file for click-to-call.</p>
      ) : null}

      {filtered.length === 0 ? (
        <LeadEmptyState
          icon={TABS.find((t) => t.key === tab)!.icon}
          title={`No ${tab} yet`}
          description={
            tab === "emails"
              ? "Log outbound emails or connect a mailbox integration to see threads here."
              : tab === "calls"
                ? "Calls from the dialer and dispositions appear in this hub."
                : "Log SMS/WhatsApp touchpoints via Log activity."
          }
          actionLabel={tab === "emails" ? "Log email" : tab === "calls" ? "Log call" : "Log activity"}
          onAction={tab === "calls" ? onLogCall : onComposeEmail}
        />
      ) : (
        <ul className="divide-y divide-crm-border rounded-xl border border-crm-border bg-white dark:bg-slate-900">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex cursor-default gap-3 px-4 py-3 transition hover:bg-crm-panel/40"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium text-crm-text">{t.title}</p>
                  {t.status ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {t.status}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-crm-muted">{t.preview || "—"}</p>
                <p className="mt-1 text-xs text-crm-muted">
                  {t.at ? formatDateTime(t.at) : "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-crm-muted">
        Templates & delivery tracking (Sent · Opened · Clicked · Replied) connect when your email
        provider integration is enabled.
      </p>
    </div>
  );
}
