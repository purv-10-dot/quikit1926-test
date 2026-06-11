"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Phone, History, FileText, Mail, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogActivityModal } from "@/components/activities/log-activity-modal";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface ActivityItem {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
  detailNotes: string | null;
  followUpAt: string | null;
  activityCode: string | null;
  relatedKind?: string | null;
}

type FeedSource = "contact" | "lead";

type FeedItem = {
  id: string;
  at: number;
  source: FeedSource;
  data: ActivityItem;
};

type TimelineFilter = "all" | "contact" | "lead";

interface Props {
  contactId: string;
  contactName: string;
  leadId?: string | null;
  leadName?: string | null;
  canLogActivity?: boolean;
  canViewLeads?: boolean;
}

async function fetchActivityItems(url: string): Promise<ActivityItem[]> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j?.items) ? j.items : Array.isArray(j?.data?.items) ? j.data.items : [];
}

export function ContactActivityTimeline({
  contactId,
  contactName,
  leadId,
  leadName,
  canLogActivity = false,
  canViewLeads = false,
}: Props) {
  const toast = useToast();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<TimelineFilter>("all");
  const [showLog, setShowLog] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const contactUrl = `/api/activities?relatedKind=Contact&relatedObjectId=${encodeURIComponent(contactId)}&limit=100`;
      const requests: Promise<{ source: FeedSource; rows: ActivityItem[] }>[] = [
        fetchActivityItems(contactUrl).then((rows) => ({ source: "contact" as const, rows })),
      ];
      if (leadId) {
        requests.push(
          fetchActivityItems(`/api/activities?leadId=${encodeURIComponent(leadId)}&limit=100`).then(
            (rows) => ({ source: "lead" as const, rows }),
          ),
        );
      }
      const batches = await Promise.all(requests);
      const seen = new Set<string>();
      const feed: FeedItem[] = [];
      for (const batch of batches) {
        for (const row of batch.rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          feed.push({
            id: row.id,
            at: row.occurredAt ? new Date(row.occurredAt).getTime() : 0,
            source: batch.source,
            data: row,
          });
        }
      }
      feed.sort((a, b) => b.at - a.at);
      setItems(feed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load timeline");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [contactId, leadId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    if (filterMode === "all") return items;
    return items.filter((i) => i.source === filterMode);
  }, [items, filterMode]);

  const hasLead = Boolean(leadId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-crm-text">Activity timeline</h3>
          <p className="mt-0.5 text-xs text-crm-muted">
            Notes, calls, and updates on this contact
            {hasLead ? " plus activity from the linked lead." : "."}
          </p>
        </div>
        {canLogActivity && !loading && (
          <Button type="button" size="sm" onClick={() => setShowLog(true)}>
            + Log activity
          </Button>
        )}
      </div>

      {hasLead && (
        <div className="flex flex-wrap gap-2">
          <FilterPill active={filterMode === "all"} onClick={() => setFilterMode("all")}>
            All
          </FilterPill>
          <FilterPill active={filterMode === "contact"} onClick={() => setFilterMode("contact")}>
            On contact
          </FilterPill>
          <FilterPill active={filterMode === "lead"} onClick={() => setFilterMode("lead")}>
            From lead
          </FilterPill>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-crm-muted">Loading timeline…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-crm-border px-4 py-10 text-center">
          <p className="text-sm text-crm-muted">No activity yet for {contactName}.</p>
          {canLogActivity && (
            <Button type="button" size="sm" className="mt-3" onClick={() => setShowLog(true)}>
              Log first activity
            </Button>
          )}
        </div>
      ) : (
        <ol className="space-y-3">
          {filtered.map((item) => (
            <ActivityEntry
              key={item.id}
              activity={item.data}
              source={item.source}
              leadName={leadName}
            />
          ))}
        </ol>
      )}

      {canLogActivity && (
        <LogActivityModal
          open={showLog}
          canViewLeads={canViewLeads}
          initialRelated={{ kind: "Contact", id: contactId, label: contactName }}
          initialLead={leadId && leadName ? { id: leadId, label: leadName } : null}
          onClose={() => setShowLog(false)}
          onSuccess={() => void refresh()}
        />
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition " +
        (active
          ? "bg-crm-blue text-white"
          : "border border-crm-border bg-white text-crm-text hover:bg-crm-panel")
      }
    >
      {children}
    </button>
  );
}

function ActivityEntry({
  activity,
  source,
  leadName,
}: {
  activity: ActivityItem;
  source: FeedSource;
  leadName?: string | null;
}) {
  const Icon = iconForActivity(activity.type);
  const accent = accentForActivity(activity.type);
  return (
    <li className={`border-l-4 ${accent.border} ${accent.bg} pl-3`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${accent.iconBg}`}
          >
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-crm-text">
                {activity.type}
                {activity.subject ? ` · ${activity.subject}` : ""}
                {activity.outcome ? ` · ${activity.outcome}` : ""}
              </span>
              <span
                className={
                  "inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium " +
                  (source === "contact"
                    ? "bg-violet-100 text-violet-800"
                    : "bg-blue-100 text-blue-800")
                }
              >
                {source === "contact" ? "Contact" : leadName ? `Lead: ${leadName}` : "Lead"}
              </span>
            </div>
            {activity.ownerName && (
              <div className="text-xs text-crm-muted">By {activity.ownerName}</div>
            )}
            {activity.detailNotes && (
              <div className="mt-2 whitespace-pre-wrap rounded border border-crm-border bg-white px-3 py-2 text-xs text-crm-text">
                {activity.detailNotes}
              </div>
            )}
            {activity.followUpAt && (
              <div className="mt-1 text-xs text-amber-700">
                Follow-up: {formatDateTime(activity.followUpAt)}
              </div>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-crm-muted">{formatDateTime(activity.occurredAt)}</span>
      </div>
    </li>
  );
}

function iconForActivity(type: string) {
  if (/call/i.test(type)) return Phone;
  if (/email/i.test(type)) return Mail;
  if (/meeting/i.test(type)) return Calendar;
  if (/stage|disposition/i.test(type)) return History;
  if (/note/i.test(type)) return FileText;
  return AlertCircle;
}

function accentForActivity(type: string) {
  if (/stage|disposition/i.test(type)) {
    return { border: "border-blue-300", bg: "bg-blue-50/50", iconBg: "bg-blue-100 text-blue-700" };
  }
  if (/call/i.test(type)) {
    return { border: "border-emerald-300", bg: "bg-emerald-50/50", iconBg: "bg-emerald-100 text-emerald-700" };
  }
  if (/email/i.test(type)) {
    return { border: "border-violet-300", bg: "bg-violet-50/50", iconBg: "bg-violet-100 text-violet-700" };
  }
  return { border: "border-crm-border", bg: "bg-crm-panel/80", iconBg: "bg-crm-panel text-crm-muted" };
}
