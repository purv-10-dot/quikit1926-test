"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date-helpers";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import type { TabKey } from "@/components/contacts/contact-detail-tabs";
import type { ContactDashboardSnapshot } from "@/lib/services/contacts/dashboard-snapshot";

export interface ContactOverviewActivity {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
}

export interface ContactOverviewTask {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface ContactOverviewNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface ContactOverviewOpportunity {
  id: string;
  name: string;
  stage: string;
}

interface Props {
  contactName: string;
  snapshot: ContactDashboardSnapshot;
  activities: ContactOverviewActivity[];
  tasks: ContactOverviewTask[];
  notes: ContactOverviewNote[];
  opportunities: ContactOverviewOpportunity[];
  hasAccount: boolean;
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

export function ContactDashboardOverview({
  snapshot,
  activities,
  tasks,
  notes,
  opportunities,
  hasAccount,
  onNavigateTab,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {snapshot.isStaleTouch ? (
        <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>No activity in the last 30 days — consider logging a touch or scheduling a task.</p>
        </div>
      ) : null}

      <section>
        <SectionHeader title="Recent activity" tab="timeline" onNavigateTab={onNavigateTab} />
        {activities.length === 0 ? (
          <p className="text-sm text-crm-muted">No activities yet.</p>
        ) : (
          <ul className="space-y-2">
            {activities.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded border border-crm-border px-3 py-2 text-sm">
                <p className="font-medium text-crm-text">{a.subject ?? a.type}</p>
                <p className="text-xs text-crm-muted">
                  {a.type}
                  {a.occurredAt ? ` · ${formatDateTime(a.occurredAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Open tasks" tab="tasks" onNavigateTab={onNavigateTab} />
        {tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length === 0 ? (
          <p className="text-sm text-crm-muted">No open tasks.</p>
        ) : (
          <ul className="space-y-2">
            {tasks
              .filter((t) => t.status !== "Completed" && t.status !== "Cancelled")
              .slice(0, 5)
              .map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded border border-crm-border px-3 py-2 text-sm"
                >
                  <span className="font-medium text-crm-text">{t.subject}</span>
                  <TaskDueChip dueDate={t.dueDate} status={t.status} />
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Notes" tab="notes" onNavigateTab={onNavigateTab} />
        {notes.length === 0 ? (
          <p className="text-sm text-crm-muted">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.slice(0, 3).map((n) => (
              <li key={n.id} className="rounded border border-crm-border px-3 py-2 text-sm">
                <p className="line-clamp-2 text-crm-text">{n.content}</p>
                <p className="mt-0.5 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasAccount ? (
        <section>
          <SectionHeader title="Account opportunities" tab="opportunities" onNavigateTab={onNavigateTab} />
          {opportunities.length === 0 ? (
            <p className="text-sm text-crm-muted">No opportunities on the linked account.</p>
          ) : (
            <ul className="space-y-2">
              {opportunities.slice(0, 5).map((o) => (
                <li key={o.id} className="flex items-center justify-between text-sm">
                  <Link href={`/opportunities/${o.id}`} className="font-medium text-crm-blue hover:underline">
                    {o.name}
                  </Link>
                  <span className="text-xs text-crm-muted">{o.stage}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
