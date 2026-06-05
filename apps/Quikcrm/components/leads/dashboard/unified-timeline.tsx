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
import { formatDistanceToNow } from "date-fns";
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
  const mounted = useHasMounted();
  const Icon = ICONS[item.kind];
  const isSystem = item.kind === "system";
  const rel = mounted
    ? formatDistanceToNow(new Date(item.at), { addSuffix: true })
    : formatDateTime(item.at);
  return (
    <li className="relative pb-5 last:pb-0">
      <span
        className={
          "absolute -left-[1.65rem] flex h-8 w-8 items-center justify-center rounded-full border bg-white shadow-sm ring-2 ring-white transition group-hover:border-accent-300 dark:bg-slate-900 dark:ring-slate-900 " +
          (isSystem ? "border-accent-300 bg-accent-50" : "border-crm-border")
        }
      >
        <Icon size={14} className={isSystem ? "text-accent-700" : "text-crm-muted"} />
      </span>
      <div className="group rounded-lg border border-transparent px-2 py-1.5 transition hover:border-crm-border hover:bg-crm-panel/50">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-crm-text">{item.title}</p>
          <time
            className="text-xs text-crm-muted"
            dateTime={item.at}
            title={item.at}
            suppressHydrationWarning
          >
            {rel}
          </time>
        </div>
        {item.subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-crm-muted">{item.subtitle}</p>
        ) : null}
        {item.meta ? <p className="mt-0.5 text-xs text-crm-muted">{item.meta}</p> : null}
      </div>
    </li>
  );
}
