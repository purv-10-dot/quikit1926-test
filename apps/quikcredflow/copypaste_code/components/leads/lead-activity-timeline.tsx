"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, History, FileText, Mail, Calendar, AlertCircle, Sparkles } from "lucide-react";
import { LEAD_SYSTEM_ACTIVITY_CODE } from "@/lib/services/leads/log-lead-system-activities";
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
  logOutcome: string | null;
}

interface CallLogItem {
  id: string;
  callSid: string | null;
  direction: string | null;
  status: string | null;
  durationSec: number | null;
  startTime: string | null;
  recordingUrl: string | null;
  sourceNumber: string | null;
  destinationNumber: string | null;
  agentUserId: string | null;
}

type FeedItem =
  | { kind: "activity"; at: number; data: ActivityItem }
  | { kind: "call"; at: number; data: CallLogItem };

type TimelineFilter = "all" | "stage";
type TimelineMode = "timeline" | "callDisposition";

export function LeadActivityTimeline({
  leadId,
  leadName,
  mode = "timeline",
}: {
  leadId: string;
  leadName: string;
  mode?: TimelineMode;
}) {
  const toast = useToast();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [calls, setCalls] = useState<CallLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<TimelineFilter>("all");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [a, c] = await Promise.all([
          fetch(`/api/activities?leadId=${leadId}`, { credentials: "include" }).then((r) => r.json()),
          fetch(`/api/telephony/call-logs?leadId=${leadId}`, { credentials: "include" }).then((r) => r.json()),
        ]);
        if (cancel) return;
        setActivities(Array.isArray(a?.items) ? a.items : []);
        setCalls(Array.isArray(c?.items) ? c.items.filter((x: CallLogItem & { leadId?: string }) => x.id) : []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load timeline");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [leadId, toast]);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const a of activities) {
      const t = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
      items.push({ kind: "activity", at: t, data: a });
    }
    for (const c of calls) {
      const t = c.startTime ? new Date(c.startTime).getTime() : 0;
      items.push({ kind: "call", at: t, data: c });
    }
    items.sort((a, b) => b.at - a.at);
    if (mode === "callDisposition") {
      return items.filter((i) => {
        if (i.kind === "call") return true;
        const type = (i.data.type || "").toLowerCase();
        const subject = (i.data.subject || "").toLowerCase();
        const outcome = (i.data.outcome || "").toLowerCase();
        const code = (i.data.activityCode || "").toLowerCase();
        return (
          type.includes("call") ||
          type.includes("disposition") ||
          subject.includes("call") ||
          subject.includes("disposition") ||
          outcome.includes("call") ||
          outcome.includes("disposition") ||
          code.includes("call") ||
          code.includes("disposition")
        );
      });
    }
    if (filterMode === "stage") {
      return items.filter(
        (i) => i.kind === "activity" && (i.data.type === "LeadStageChange" || i.data.activityCode === "stage_change"),
      );
    }
    return items;
  }, [activities, calls, filterMode, mode]);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-crm-text">
          {mode === "callDisposition" ? "Call disposition" : "Unified timeline"}
        </h3>
        <p className="text-xs text-crm-muted">
          {mode === "callDisposition"
            ? "Disposition activities and related call logs."
            : "Calls, activities, stage changes, and payment checks in one feed."}
        </p>
      </div>

      {mode !== "callDisposition" ? (
        <div className="mb-4 flex gap-2">
          <FilterPill active={filterMode === "all"} onClick={() => setFilterMode("all")}>
            All
          </FilterPill>
          <FilterPill active={filterMode === "stage"} onClick={() => setFilterMode("stage")}>
            Stage history
          </FilterPill>
        </div>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-crm-muted">Loading timeline…</p>
      ) : feed.length === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">No activity yet for {leadName}.</p>
      ) : (
        <ol className="space-y-3">
          {feed.map((item) =>
            item.kind === "call" ? (
              <CallEntry key={`call:${item.data.id}`} call={item.data} leadName={leadName} />
            ) : (
              <ActivityEntry key={`act:${item.data.id}`} activity={item.data} />
            ),
          )}
        </ol>
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
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3 py-1 text-xs font-medium transition " +
        (active ? "bg-crm-blue text-white" : "border border-crm-border bg-white text-crm-text hover:bg-crm-panel")
      }
    >
      {children}
    </button>
  );
}

function CallEntry({ call, leadName }: { call: CallLogItem; leadName: string }) {
  const dur = call.durationSec ? `${call.durationSec}s` : "—";
  return (
    <li className="border-l-4 border-emerald-300 bg-emerald-50/50 pl-3">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Phone size={14} />
          </span>
          <div>
            <div className="text-sm font-medium text-crm-text">
              Call · {call.status || "completed"}
            </div>
            <div className="text-xs text-crm-muted">
              {call.sourceNumber || "—"} → {call.destinationNumber || "—"} · {dur}
            </div>
            <div className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-200/60 px-1.5 py-0.5 text-[10px] text-emerald-800">
              Call
            </div>
            <div className="mt-1 text-xs text-crm-muted">Lead: {leadName}</div>
            {call.recordingUrl && (
              <div className="mt-2">
                {/* The <audio> source goes through our same-origin proxy
                    because the recording host returns a self-referencing
                    Access-Control-Allow-Origin header that blocks the
                    browser's media fetch. Open / Download links use the
                    raw URL — they're navigations, not media fetches, so
                    CORS doesn't apply. */}
                <audio controls className="h-8 w-full max-w-md">
                  <source
                    src={`/api/telephony/recording?url=${encodeURIComponent(call.recordingUrl)}`}
                  />
                </audio>
                <div className="mt-1 flex gap-3 text-xs">
                  <a className="crm-link" href={call.recordingUrl} target="_blank" rel="noreferrer">
                    Open recording
                  </a>
                  <a className="crm-link" href={call.recordingUrl} download>
                    Download
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs text-crm-muted">{formatDateTime(call.startTime)}</span>
      </div>
    </li>
  );
}

function ActivityEntry({ activity }: { activity: ActivityItem }) {
  const isSystem =
    activity.activityCode === LEAD_SYSTEM_ACTIVITY_CODE ||
    /leadcreated|leadsystem/i.test(activity.type);
  const Icon = iconForActivity(activity.type, activity.activityCode);
  const accent = accentForActivity(activity.type, activity.activityCode);
  const headline = isSystem
    ? activity.subject || "Lead created"
    : `${activity.type}${activity.subject ? ` · ${activity.subject}` : ""}${activity.outcome ? ` · ${activity.outcome}` : ""}`;
  return (
    <li className={`border-l-4 ${accent.border} ${accent.bg} pl-3`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full ${accent.iconBg}`}>
            <Icon size={14} />
          </span>
          <div>
            <div className="text-sm font-medium text-crm-text">{headline}</div>
            {isSystem ? (
              <div className="text-[10px] font-semibold uppercase tracking-wide text-accent-700">
                System
              </div>
            ) : null}
            {activity.ownerName && (
              <div className="text-xs text-crm-muted">Agent: {activity.ownerName}</div>
            )}
            {activity.detailNotes && (
              <div className="mt-2 rounded border border-crm-border bg-white px-3 py-2 text-xs text-crm-text whitespace-pre-wrap">
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

function iconForActivity(type: string, activityCode?: string | null) {
  if (activityCode === LEAD_SYSTEM_ACTIVITY_CODE || /leadcreated|leadsystem/i.test(type)) {
    return Sparkles;
  }
  if (/call/i.test(type)) return Phone;
  if (/email/i.test(type)) return Mail;
  if (/meeting/i.test(type)) return Calendar;
  if (/stage|disposition/i.test(type)) return History;
  if (/note/i.test(type)) return FileText;
  return AlertCircle;
}

function accentForActivity(type: string, activityCode?: string | null) {
  if (activityCode === LEAD_SYSTEM_ACTIVITY_CODE || /leadcreated|leadsystem/i.test(type)) {
    return {
      border: "border-accent-300",
      bg: "bg-accent-50/40",
      iconBg: "bg-accent-100 text-accent-700",
    };
  }
  if (/stage|disposition/i.test(type))
    return { border: "border-blue-300", bg: "bg-blue-50/50", iconBg: "bg-blue-100 text-blue-700" };
  if (/call/i.test(type))
    return { border: "border-emerald-300", bg: "bg-emerald-50/50", iconBg: "bg-emerald-100 text-emerald-700" };
  if (/email/i.test(type))
    return { border: "border-violet-300", bg: "bg-violet-50/50", iconBg: "bg-violet-100 text-violet-700" };
  return { border: "border-crm-border", bg: "bg-crm-panel", iconBg: "bg-crm-panel text-crm-muted" };
}
