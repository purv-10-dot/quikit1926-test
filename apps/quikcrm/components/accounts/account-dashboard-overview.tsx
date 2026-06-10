"use client";

import Link from "next/link";
import { ArrowRight, AlertTriangle, Calendar } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/utils/date-helpers";
import { categoryLabel, type AccountNoteCategoryId } from "@/lib/accounts/account-note-category";
import { TaskDueChip } from "@/components/tasks/task-due-chip";
import type { TabKey } from "@/components/accounts/account-detail-tabs";
import type { AccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";

export interface AccountOverviewActivity {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
}

export interface AccountOverviewTask {
  id: string;
  subject: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

export interface AccountOverviewContact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  title: string | null;
}

export interface AccountOverviewLead {
  id: string;
  name: string;
  stage: string;
  status: string;
  ownerName: string | null;
  ownerId: string | null;
}

export interface AccountOverviewOpportunity {
  id: string;
  name: string;
  stage: string;
  amountDisplay?: string | null;
}

export interface AccountOverviewNote {
  id: string;
  content: string;
  createdAt: string;
  noteCategory?: AccountNoteCategoryId;
}

interface Props {
  accountName: string;
  snapshot: AccountDashboardSnapshot;
  activities: AccountOverviewActivity[];
  tasks: AccountOverviewTask[];
  notes: AccountOverviewNote[];
  contacts: AccountOverviewContact[];
  leads: AccountOverviewLead[];
  opportunities: AccountOverviewOpportunity[];
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

export function AccountDashboardOverview({
  snapshot,
  activities,
  tasks,
  notes,
  contacts,
  leads,
  opportunities,
  onNavigateTab,
}: Props) {
  const openTasks = tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  const recentNotes = notes.slice(0, 3);
  const recentActivities = activities.slice(0, 5);
  const recentContacts = contacts.slice(0, 3);
  const recentOpps = opportunities.slice(0, 3);
  const recentLeads = leads.slice(0, 5);

  const renewalBanner =
    snapshot.renewalAlert === "urgent" || snapshot.renewalAlert === "overdue" ? (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle size={18} className="shrink-0" />
        <span>
          {snapshot.renewalAlert === "overdue"
            ? "Contract renewal is overdue"
            : `Renewal in ${snapshot.daysToRenewal} days`}
          — review account health and schedule outreach.
        </span>
      </div>
    ) : null;

  const staleTouch = snapshot.isStaleTouch;

  return (
    <div className="space-y-6">
      {renewalBanner}
      {staleTouch ? (
        <div className="flex items-center gap-2 rounded-lg border border-crm-border bg-crm-panel/60 px-4 py-3 text-sm text-crm-text">
          <Calendar size={18} className="shrink-0 text-crm-muted" />
          <span>
            {snapshot.lastTouchAt
              ? `Last touch ${formatDateTime(snapshot.lastTouchAt)} — consider logging activity.`
              : "No recorded touch yet on this account."}
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title="Recent activity" tab="timeline" onNavigateTab={onNavigateTab} />
          {recentActivities.length === 0 ? (
            <p className="text-sm text-crm-muted">No activities yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentActivities.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-crm-border bg-crm-panel/40 px-3 py-2"
                >
                  <p className="font-medium text-crm-text">
                    {a.type} · {a.subject || "—"}
                  </p>
                  <p className="text-xs text-crm-muted">
                    {a.occurredAt ? formatDateTime(a.occurredAt) : "—"} · {a.ownerName || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Open tasks" tab="tasks" onNavigateTab={onNavigateTab} />
          {openTasks.length === 0 ? (
            <p className="text-sm text-crm-muted">No open tasks.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {openTasks.slice(0, 5).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded border border-crm-border px-3 py-2"
                >
                  <span className="font-medium text-crm-text">{t.subject}</span>
                  <TaskDueChip dueDate={t.dueDate} status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <SectionHeader title="Account notes" tab="notes" onNavigateTab={onNavigateTab} />
        {recentNotes.length === 0 ? (
          <p className="text-sm text-crm-muted">No notes yet — add strategy, meeting, or risk notes.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {recentNotes.map((n) => (
              <li
                key={n.id}
                className="rounded border border-crm-border bg-crm-panel/40 px-3 py-2"
              >
                <span className="text-[10px] font-semibold uppercase text-crm-muted">
                  {categoryLabel(n.noteCategory ?? "internal")}
                </span>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-crm-text">{n.content}</p>
                <p className="mt-1 text-xs text-crm-muted">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Open opportunities" tab="opportunities" onNavigateTab={onNavigateTab} />
        {recentOpps.length === 0 ? (
          <p className="text-sm text-crm-muted">No opportunities linked.</p>
        ) : (
          <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
            {recentOpps.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <Link href={`/opportunities/${o.id}`} className="crm-link font-medium">
                    {o.name}
                  </Link>
                  <div className="text-xs text-crm-muted">{o.stage}</div>
                </div>
                <span className="font-medium">{o.amountDisplay ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader title="Key contacts" tab="contacts" onNavigateTab={onNavigateTab} />
          {recentContacts.length === 0 ? (
            <p className="text-sm text-crm-muted">No contacts linked.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentContacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="crm-link font-medium">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ")}
                  </Link>
                  <p className="text-xs text-crm-muted">
                    {c.title || "—"} · {c.email || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Leads" tab="leads" onNavigateTab={onNavigateTab} />
          {recentLeads.length === 0 ? (
            <p className="text-sm text-crm-muted">No leads on this account.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentLeads.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <Link href={`/leads/${l.id}`} className="crm-link font-medium">
                    {l.name}
                  </Link>
                  <span className="text-xs text-crm-muted">{l.stage}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
