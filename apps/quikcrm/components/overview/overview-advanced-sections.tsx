"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/chart-card";
import type { ExecutiveOverviewDto } from "@/lib/dashboard/executive-overview-types";
import type {
  AdoptionStatus,
  ExecutiveAlert,
  SlaSeverity,
} from "@/lib/dashboard/executive-overview-advanced-types";

const ADOPTION_STYLES: Record<AdoptionStatus, string> = {
  excellent: "bg-emerald-100 text-emerald-800",
  good: "bg-sky-100 text-sky-800",
  average: "bg-amber-100 text-amber-800",
  poor: "bg-rose-100 text-rose-800",
};

const SLA_STYLES: Record<SlaSeverity, string> = {
  low: "border-slate-200 bg-slate-50",
  medium: "border-amber-200 bg-amber-50",
  high: "border-orange-200 bg-orange-50",
  critical: "border-rose-300 bg-rose-50",
};

const INACTIVE_BADGE = {
  today: "bg-amber-100 text-amber-800",
  "3d": "bg-orange-100 text-orange-800",
  "7d": "bg-rose-100 text-rose-800",
  none: "",
} as const;

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-crm-text">{title}</h2>
        {subtitle ? <p className="text-xs text-crm-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="crm-card overflow-hidden">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-accent-50 px-3 py-2 text-left text-xs font-medium text-crm-text">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap px-3 py-2 text-xs text-crm-text ${className}`}>{children}</td>;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function AlertRow({ alert }: { alert: ExecutiveAlert }) {
  const icon = alert.tone === "danger" ? "🔴" : alert.tone === "warning" ? "🟡" : "🟢";
  return (
    <div className="flex gap-3 border-t border-crm-border px-4 py-3 text-xs first:border-t-0">
      <span>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-crm-text">{alert.message}</p>
        <p className="mt-0.5 text-crm-muted">
          {alert.priority.toUpperCase()}
          {alert.ownerName ? ` · ${alert.ownerName}` : ""} · {formatDate(alert.createdIso)}
        </p>
      </div>
    </div>
  );
}

export function OverviewAdvancedSections({ data }: { data: ExecutiveOverviewDto }) {
  const a = data.advanced;
  const maxHeat = Math.max(
    ...a.teamHeatmap.flatMap((r) => [r.calls, r.emails, r.meetings, r.tasks, r.deals, r.revenue]),
    1,
  );

  function heatColor(value: number) {
    const intensity = value / maxHeat;
    const alpha = 0.12 + intensity * 0.55;
    return `rgba(37, 99, 235, ${alpha})`;
  }

  return (
    <div className="space-y-8 border-t border-crm-border pt-8">
      <p className="text-xs font-medium uppercase tracking-wider text-crm-muted">
        Management intelligence
      </p>

      <Section title="CRM adoption score" subtitle="Login, updates, tasks, notes, calls, meetings, follow-ups">
        <DataTable>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Rank</Th>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Score</Th>
                <Th>Trend</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {a.adoption.map((row) => (
                <tr key={row.userId} className="border-t border-crm-border">
                  <Td>#{row.rank}</Td>
                  <Td className="font-medium">
                    {row.userName}
                    {row.badge ? (
                      <span className="ml-2 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] text-accent-700">
                        {row.badge}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{row.role}</Td>
                  <Td className="font-semibold">{row.score}%</Td>
                  <Td className="capitalize text-crm-muted">{row.trend}</Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${ADOPTION_STYLES[row.status]}`}
                    >
                      {row.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </Section>

      <Section title="Inactive users monitor" subtitle="Employees not actively using CRM">
        <DataTable>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Last login</Th>
                <Th>Last CRM activity</Th>
                <Th>Session</Th>
                <Th>Days inactive</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {a.inactiveUsers.map((u) => (
                <tr
                  key={u.userId}
                  className={`border-t border-crm-border ${u.warningLevel !== "none" ? "bg-amber-50/30" : ""}`}
                >
                  <Td className="font-medium">{u.userName}</Td>
                  <Td>{formatDate(u.lastLoginIso)}</Td>
                  <Td>{formatDate(u.lastActivityIso)}</Td>
                  <Td>{u.sessionDurationHint}</Td>
                  <Td>{u.daysInactive}</Td>
                  <Td>
                    {u.warningLevel === "7d" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${INACTIVE_BADGE["7d"]}`}>
                        No activity 7+ days
                      </span>
                    ) : u.warningLevel === "3d" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${INACTIVE_BADGE["3d"]}`}>
                        No activity 3+ days
                      </span>
                    ) : u.warningLevel === "today" ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${INACTIVE_BADGE.today}`}>
                        No activity today
                      </span>
                    ) : (
                      <span className="text-crm-muted">Active</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </Section>

      <Section title="Follow-up compliance" subtitle="On-time completion vs assigned follow-ups">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="crm-card p-4">
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[10px] uppercase text-crm-muted">Assigned</p>
                <p className="text-lg font-semibold">{a.followUpCompliance.totalAssigned}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-emerald-700">On time</p>
                <p className="text-lg font-semibold text-emerald-800">
                  {a.followUpCompliance.completedOnTime}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-amber-700">Late</p>
                <p className="text-lg font-semibold">{a.followUpCompliance.completedLate}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-orange-700">Overdue</p>
                <p className="text-lg font-semibold">{a.followUpCompliance.overdue}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-rose-700">Missed</p>
                <p className="text-lg font-semibold">{a.followUpCompliance.missed}</p>
              </div>
            </div>
            <p className="mb-2 text-sm font-medium">Compliance score</p>
            <div className="h-3 overflow-hidden rounded-full bg-crm-panel">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${a.followUpCompliance.compliancePct}%` }}
              />
            </div>
            <p className="mt-2 text-2xl font-semibold text-crm-text">
              {a.followUpCompliance.compliancePct}%
            </p>
          </div>
          <ChartCard title="Compliance gauge" subtitle="Completed on time ÷ total assigned" height={200}>
            <div className="flex h-full flex-col items-center justify-center">
              <div
                className="flex h-28 w-28 items-center justify-center rounded-full border-8 border-emerald-500/30"
                style={{
                  background: `conic-gradient(#059669 ${a.followUpCompliance.compliancePct}%, #e2e8f0 0)`,
                }}
              >
                <span className="rounded-full bg-white px-3 py-2 text-lg font-semibold">
                  {a.followUpCompliance.compliancePct}%
                </span>
              </div>
            </div>
          </ChartCard>
        </div>
      </Section>

      <Section title="Lead aging analytics" subtitle="Open leads by days since last update">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Lead age distribution" height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.leadAging}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="leadCount" radius={[4, 4, 0, 0]}>
                  {a.leadAging.map((entry, i) => (
                    <Cell key={i} fill={entry.stale ? "#f59e0b" : "#2563eb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <DataTable>
            <table className="min-w-full">
              <thead>
                <tr>
                  <Th>Bucket</Th>
                  <Th>Leads</Th>
                  <Th>Value</Th>
                  <Th>%</Th>
                </tr>
              </thead>
              <tbody>
                {a.leadAging.map((b) => (
                  <tr
                    key={b.label}
                    className={`border-t border-crm-border ${b.stale ? "bg-amber-50/40" : ""}`}
                  >
                    <Td className="font-medium">{b.label}</Td>
                    <Td>{b.leadCount}</Td>
                    <Td>{b.valueDisplay}</Td>
                    <Td>{b.pct}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </div>
      </Section>

      <Section title="SLA breach monitor" subtitle="Immediate visibility into process violations">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {a.slaBreaches.map((card) => (
            <div
              key={card.id}
              className={`rounded-lg border p-4 ${SLA_STYLES[card.severity]}`}
            >
              <p className="text-xs font-medium text-crm-text">{card.title}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{card.count}</p>
              <p className="mt-1 text-[10px] uppercase text-crm-muted">
                {card.severity} · {card.trend === "up" ? "↑" : card.trend === "down" ? "↓" : "—"} vs prior
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Approval center" subtitle="Quote and discount approval queue">
        <div className="mb-3 flex gap-3">
          <div className="crm-card flex-1 p-3 text-center">
            <p className="text-xs text-crm-muted">Pending</p>
            <p className="text-xl font-semibold text-amber-700">{a.approvalCenter.pending}</p>
          </div>
          <div className="crm-card flex-1 p-3 text-center">
            <p className="text-xs text-crm-muted">Approved</p>
            <p className="text-xl font-semibold text-emerald-700">{a.approvalCenter.approved}</p>
          </div>
          <div className="crm-card flex-1 p-3 text-center">
            <p className="text-xs text-crm-muted">Rejected</p>
            <p className="text-xl font-semibold text-rose-700">{a.approvalCenter.rejected}</p>
          </div>
        </div>
        <DataTable>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>Request</Th>
                <Th>Requested by</Th>
                <Th>Amount</Th>
                <Th>Created</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {a.approvalCenter.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-crm-muted">
                    No approval requests.
                  </td>
                </tr>
              ) : (
                a.approvalCenter.rows.map((r) => (
                  <tr key={r.id} className="border-t border-crm-border">
                    <Td>
                      <span className="font-medium">{r.title}</span>
                      <span className="block text-[10px] text-crm-muted">{r.requestType}</span>
                    </Td>
                    <Td>{r.requestedBy}</Td>
                    <Td>{r.amountDisplay}</Td>
                    <Td>{formatDate(r.createdIso)}</Td>
                    <Td>
                      <span
                        className={
                          r.status === "Pending"
                            ? "text-amber-700"
                            : r.status === "Approved"
                              ? "text-emerald-700"
                              : "text-rose-700"
                        }
                      >
                        {r.status}
                      </span>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataTable>
      </Section>

      <Section title="Team performance heatmap" subtitle="Activity intensity by rep">
        <div className="crm-card overflow-x-auto p-4">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="bg-accent-50 px-2 py-2 text-left font-medium">User</th>
                {(["Calls", "Emails", "Meetings", "Tasks", "Deals", "Revenue"] as const).map((col) => (
                  <th key={col} className="bg-accent-50 px-2 py-2 text-center font-medium">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {a.teamHeatmap.map((row) => {
                const cols = [
                  row.calls,
                  row.emails,
                  row.meetings,
                  row.tasks,
                  row.deals,
                  row.revenue,
                ] as const;
                return (
                  <tr key={row.userId} className="border-t border-crm-border">
                    <td className="px-2 py-2 font-medium">{row.userName}</td>
                    {cols.map((val, i) => (
                      <td key={i} className="p-1">
                        <div
                          className="rounded px-2 py-1.5 text-center tabular-nums"
                          style={{ backgroundColor: heatColor(val) }}
                        >
                          {val}
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Workload distribution" subtitle="Assigned records per team member">
        <DataTable>
          <table className="min-w-full">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Leads</Th>
                <Th>Opportunities</Th>
                <Th>Tasks</Th>
                <Th>Follow-ups</Th>
              </tr>
            </thead>
            <tbody>
              {a.workload.map((w) => (
                <tr key={w.userId} className="border-t border-crm-border">
                  <Td className="font-medium">{w.userName}</Td>
                  <Td>{w.assignedLeads}</Td>
                  <Td>{w.assignedOpportunities}</Td>
                  <Td>{w.assignedTasks}</Td>
                  <Td>{w.pendingFollowUps}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      </Section>

      <Section title="Customer engagement health" subtitle="Account touchpoints and retention signals">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="crm-card p-3">
            <p className="text-[10px] uppercase text-crm-muted">Contacted this week</p>
            <p className="text-xl font-semibold">{a.customerEngagement.contactedThisWeek}</p>
          </div>
          <div className="crm-card p-3">
            <p className="text-[10px] uppercase text-crm-muted">Inactive 30d+</p>
            <p className="text-xl font-semibold text-amber-700">
              {a.customerEngagement.withoutActivity30d}
            </p>
          </div>
          <div className="crm-card p-3">
            <p className="text-[10px] uppercase text-crm-muted">Upcoming renewals</p>
            <p className="text-xl font-semibold">{a.customerEngagement.upcomingRenewals}</p>
          </div>
          <div className="crm-card p-3">
            <p className="text-[10px] uppercase text-crm-muted">Customer meetings</p>
            <p className="text-xl font-semibold">{a.customerEngagement.customerMeetings}</p>
          </div>
          <div className="crm-card p-3">
            <p className="text-[10px] uppercase text-crm-muted">Open support</p>
            <p className="text-xl font-semibold">{a.customerEngagement.openSupportIssues}</p>
          </div>
          <div className="crm-card border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-[10px] uppercase text-emerald-800">Health score</p>
            <p className="text-xl font-semibold text-emerald-900">
              {a.customerEngagement.healthScore}/100
            </p>
          </div>
        </div>
      </Section>

      <Section title="Executive alert center" subtitle="Priority actions for leadership">
        <div className="crm-card divide-y divide-crm-border">
          {a.executiveAlerts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-crm-muted">No active alerts.</p>
          ) : (
            a.executiveAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
          )}
        </div>
      </Section>
    </div>
  );
}
