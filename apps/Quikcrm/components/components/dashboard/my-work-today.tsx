"use client";

import Link from "next/link";
import { CalendarClock, CheckSquare, ArrowRight } from "lucide-react";
import type { WorkItemRow } from "@/lib/dashboard/types";
import { formatDateTime } from "@/lib/utils/date-helpers";

interface Props {
  tasksDueToday: number;
  followUpsDueToday: number;
  tasks: WorkItemRow[];
  followUps: WorkItemRow[];
}

export function MyWorkToday({ tasksDueToday, followUpsDueToday, tasks, followUps }: Props) {
  return (
    <section className="crm-card h-full p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-crm-text">My work today</h2>
          <p className="text-xs text-crm-muted">
            {tasksDueToday} tasks · {followUpsDueToday} follow-ups scheduled
          </p>
        </div>
        <Link href="/tasks" className="text-xs font-medium text-crm-blue hover:underline">
          All tasks →
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <WorkList
          icon={CheckSquare}
          title="Tasks due"
          empty="No tasks due today."
          items={tasks}
          ctaHref="/tasks"
          ctaLabel="Create task"
        />
        <WorkList
          icon={CalendarClock}
          title="Follow-ups"
          empty="No follow-ups scheduled for today."
          items={followUps}
          ctaHref="/activities"
          ctaLabel="Log activity"
        />
      </div>
    </section>
  );
}

function WorkList({
  icon: Icon,
  title,
  empty,
  items,
  ctaHref,
  ctaLabel,
}: {
  icon: typeof CheckSquare;
  title: string;
  empty: string;
  items: WorkItemRow[];
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="rounded-xl border border-crm-border/80 bg-crm-panel/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} className="text-crm-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-crm-muted">{title}</h3>
      </div>
      {items.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-crm-muted">{empty}</p>
          <Link
            href={ctaHref}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-crm-blue hover:underline"
          >
            {ctaLabel} <ArrowRight size={12} />
          </Link>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="block rounded-lg px-2 py-2 transition hover:bg-white dark:hover:bg-slate-800"
              >
                <p className="truncate text-sm font-medium text-crm-text">{item.title}</p>
                <p className="text-xs text-crm-muted">
                  {item.subtitle}
                  {item.at ? ` · ${formatDateTime(item.at)}` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
