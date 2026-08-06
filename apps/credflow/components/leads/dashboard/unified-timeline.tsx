"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  FileText,
  GitBranch,
  History,
  Mail,
  Phone,
  StickyNote,
  CheckSquare,
  Calendar,
  Sparkles,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { useHasMounted } from "@/hooks/use-has-mounted";
import {
  buildUnifiedTimeline,
  filterTimeline,
  groupTimelineByDate,
  type TimelineFilter,
  type UnifiedTimelineItem,
} from "@/lib/services/leads/unified-timeline";
import { LeadEmptyState } from "@/components/leads/dashboard/empty-state";
import { TimelineSkeleton } from "@/components/leads/dashboard/skeleton";
import { CallRecordingPlayer } from "@/components/telephony/call-recording-player";

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "calls", label: "Calls" },
  { key: "emails", label: "Emails" },
  { key: "notes", label: "Notes" },
  { key: "tasks", label: "Tasks" },
  { key: "meetings", label: "Meetings" },
];

const ICONS: Record<UnifiedTimelineItem["kind"], typeof History> = {
  call: Phone,
  email: Mail,
  note: StickyNote,
  meeting: Calendar,
  task: CheckSquare,
  stage: GitBranch,
  system: Sparkles,
  opportunity: Briefcase,
  document: FileText,
  activity: History,
};

export interface UnifiedTimelineSeed {
  activities: Parameters<typeof buildUnifiedTimeline>[0]["activities"];
  callLogs: Parameters<typeof buildUnifiedTimeline>[0]["callLogs"];
  notes: Parameters<typeof buildUnifiedTimeline>[0]["notes"];
  tasks: Parameters<typeof buildUnifiedTimeline>[0]["tasks"];
  opportunities: Parameters<typeof buildUnifiedTimeline>[0]["opportunities"];
  documents: { id: string; fileName: string; createdAt: string }[];
}

interface Props {
  leadId: string;
  seed: UnifiedTimelineSeed;
  onLogActivity?: () => void;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function UnifiedTimeline({
  leadId: _leadId,
  seed,
  onLogActivity,
  pageSize = 25,
  emptyTitle = "No activity yet",
  emptyDescription = "Calls, emails, notes, and stage changes will appear here as your team works this lead.",
}: Props) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const allItems = useMemo(
    () =>
      buildUnifiedTimeline({
        activities: seed.activities,
        callLogs: seed.callLogs,
        notes: seed.notes,
        tasks: seed.tasks,
        opportunities: seed.opportunities,
        documents: seed.documents.map((d) => ({
          id: d.id,
          name: d.fileName,
          createdAt: d.createdAt,
        })),
      }),
    [seed],
  );

  const mounted = useHasMounted();
  const filtered = useMemo(() => filterTimeline(allItems, filter), [allItems, filter]);
  const visible = filtered.slice(0, visibleCount);
  const groups = useMemo(
    () =>
      mounted
        ? groupTimelineByDate(visible)
        : [{ dateLabel: "Activity", items: visible }],
    [mounted, visible],
  );

  const loadMore = useCallback(() => {
    if (visibleCount >= filtered.length) return;
    setLoadingMore(true);
    setVisibleCount((n) => Math.min(n + pageSize, filtered.length));
    setLoadingMore(false);
  }, [filtered.length, pageSize, visibleCount]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [filter, pageSize]);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "120px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  if (allItems.length === 0) {
    return (
      <LeadEmptyState
        icon={History}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel="Log activity"
        onAction={onLogActivity}
      />
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 border-b border-crm-border bg-white/90 px-1 py-2 backdrop-blur-md dark:bg-slate-900/90">
        <div className="crm-hscroll flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition " +
                (filter === f.key
                  ? "bg-accent-600 text-white shadow-sm"
                  : "border border-crm-border bg-white text-crm-text hover:border-accent-300 dark:bg-slate-800")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">No items match this filter.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.dateLabel}>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-crm-muted">
                {g.dateLabel}
              </h4>
              <ol className="relative space-y-0 border-l border-crm-border pl-6">
                {g.items.map((item) => (
                  <TimelineRow key={item.id} item={item} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <div ref={loaderRef} className="py-4 text-center text-xs text-crm-muted">
        {loadingMore ? (
          <TimelineSkeleton />
        ) : visibleCount < filtered.length ? (
          "Loading more…"
        ) : (
          `End of timeline · ${filtered.length} events`
        )}
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: UnifiedTimelineItem }) {
  const Icon = ICONS[item.kind];
  const isSystem = item.kind === "system";
  const isCall = item.kind === "call";
  // Absolute entered time (occurredAt-based; item.at = occurredAt ?? createdAt),
  // app-standard formatDateTime — matches the Call Disposition tab by construction.
  // Replaces the relative "X ago" (A1: one unambiguous absolute time).
  const rel = formatDateTime(item.at);
  return (
    <li className="relative pb-5 last:pb-0">
      <span
        className={
          "absolute -left-[1.65rem] flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-sm ring-2 ring-white transition group-hover:border-accent-300 dark:bg-slate-900 dark:ring-slate-900 " +
          (isCall
            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40"
            : isSystem
              ? "border-accent-300 bg-accent-50"
              : "border-crm-border")
        }
      >
        <Icon
          size={14}
          className={isCall ? "text-emerald-600" : isSystem ? "text-accent-700" : "text-crm-muted"}
        />
      </span>
      <div
        className={
          "group rounded-lg border px-2 py-1.5 transition hover:border-crm-border hover:bg-crm-panel/50 " +
          (isCall
            ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
            : "border-transparent")
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p
            className={
              "text-sm font-medium " +
              (isCall ? "text-emerald-800 dark:text-emerald-300" : "text-crm-text")
            }
          >
            {item.title}
          </p>
          <time
            className="text-xs text-crm-muted"
            dateTime={item.at}
            title={item.at}
            suppressHydrationWarning
          >
            {rel}
          </time>
        </div>
        {item.callDetail ? (
          <p className="mt-1 text-sm text-crm-muted">
            {item.callDetail.agent ? (
              <>
                by <span className="font-medium text-crm-text">{item.callDetail.agent}</span>
              </>
            ) : null}
            {item.callDetail.agent && item.callDetail.through ? (
              <span className="px-1.5 text-crm-border">·</span>
            ) : null}
            {item.callDetail.through ? (
              <>
                through{" "}
                <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                  {item.callDetail.through}
                </span>
              </>
            ) : null}
          </p>
        ) : item.subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-crm-muted">{item.subtitle}</p>
        ) : null}
        {item.callDetail?.durationLabel ? (
          <p className="mt-0.5 text-xs text-crm-muted">
            Duration:{" "}
            <span className="font-medium text-crm-text">{item.callDetail.durationLabel}</span>
          </p>
        ) : item.meta ? (
          <p className="mt-0.5 text-xs text-crm-muted">{item.meta}</p>
        ) : null}
        {item.kind === "call" && item.recordingUrl ? (
          <div className="mt-2">
            <CallRecordingPlayer recordingUrl={item.recordingUrl} />
          </div>
        ) : null}
      </div>
    </li>
  );
}
