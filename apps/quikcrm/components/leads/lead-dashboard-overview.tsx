"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, CheckSquare, History } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import type { TabKey } from "@/components/leads/lead-detail-tabs";
import type { UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import { buildUnifiedTimeline } from "@/lib/services/leads/unified-timeline";

export interface OverviewActivity {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
}

export interface OverviewTask {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface OverviewNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface OverviewOpportunity {
  id: string;
  name: string;
  stage: string;
  amountDisplay?: string | null;
}

interface Props {
  leadId: string;
  leadName: string;
  timelineSeed: UnifiedTimelineSeed;
  tasks: OverviewTask[];
  notes: OverviewNote[];
  opportunities: OverviewOpportunity[];
  nextFollowUpAt: string | null;
  onNavigateTab: (tab: TabKey) => void;
}

function SectionHeader({
  title,
  tab,
  onNavigateTab,
}: {
  title: string;
  tab: TabKey;
  onNavigateTab: (tab: TabKey) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-crm-text">{title}</h3>
      <button
        type="button"
        onClick={() => onNavigateTab(tab)}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-crm-blue hover:underline"
      >
        View all <ArrowRight size={12} />
      </button>
    </div>
  );
}

export function LeadDashboardOverview({
  leadId,
  leadName,
  timelineSeed,
  tasks,
  notes,
  opportunities,
  nextFollowUpAt,
  onNavigateTab,
}: Props) {
  const openTasks = tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  const recentActivities = useMemo(
    () =>
      buildUnifiedTimeline({
        activities: timelineSeed.activities,
        callLogs: timelineSeed.callLogs,
        notes: timelineSeed.notes,
        tasks: timelineSeed.tasks,
        opportunities: timelineSeed.opportunities,
        documents: timelineSeed.documents.map((d) => ({
          id: d.id,
          name: d.fileName,
          createdAt: d.createdAt,
        })),
      }).slice(0, 5),
    [timelineSeed],
  );
  const recentNotes = notes.slice(0, 3);
  const recentOpps = opportunities.slice(0, 3);

  return (
    <div className="space-y-6">
      {nextFollowUpAt ? (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Calendar size={18} className="shrink-0" />
          <span>
            <span className="font-medium">Upcoming follow-up</span> — {formatDateTime(nextFollowUpAt)}
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title="Open tasks" tab="tasks" onNavigateTab={onNavigateTab} />
          {openTasks.length === 0 ? (
            <p className="text-sm text-crm-muted">No open tasks for {leadName}.</p>
          ) : (
            <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
              {openTasks.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <CheckSquare size={14} className="shrink-0 text-crm-muted" />
                    <span className="truncate font-medium text-crm-text">{t.subject}</span>
                  </span>
                  <TaskDueChip dueDate={t.dueDate} status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Recent activity" tab="timeline" onNavigateTab={onNavigateTab} />
          {recentActivities.length === 0 ? (
            <p className="text-sm text-crm-muted">No activity logged yet.</p>
          ) : (
            <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
              {recentActivities.map((item) => (
                <li key={item.id} className="px-3 py-2.5 text-sm">
                  <div className="flex gap-2">
                    <History size={14} className="mt-0.5 shrink-0 text-crm-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-crm-text">{item.title}</p>
                      {item.subtitle ? (
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-crm-text">
                          {item.subtitle}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-crm-muted">
                        <time dateTime={item.at} suppressHydrationWarning>
                          {formatDateTime(item.at)}
                        </time>
                        {item.meta ? (
                          <>
                            <span className="mx-1" aria-hidden>
                              ·
                            </span>
                            <span className="text-crm-text">{item.meta}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Notes" tab="notes" onNavigateTab={onNavigateTab} />
          {recentNotes.length === 0 ? (
            <p className="text-sm text-crm-muted">No notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentNotes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-crm-border bg-crm-panel/40 px-3 py-2 text-sm"
                >
                  <p className="line-clamp-3 whitespace-pre-wrap text-crm-text">{n.content}</p>
                  <p className="mt-1 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Opportunities" tab="opportunities" onNavigateTab={onNavigateTab} />
          {recentOpps.length === 0 ? (
            <p className="text-sm text-crm-muted">No linked opportunities.</p>
          ) : (
            <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
              {recentOpps.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <Link href={`/opportunities/${o.id}`} className="crm-link font-medium">
                    {o.name}
                  </Link>
                  <span className="text-xs text-crm-muted">
                    {o.stage}
                    {o.amountDisplay ? ` · ${o.amountDisplay}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="text-center text-xs text-crm-muted">
        Lead ID: <span className="font-mono">{leadId}</span>
      </p>
    </div>
  );
}
