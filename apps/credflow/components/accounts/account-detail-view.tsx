"use client";

/**
 * AccountDetailView — interactive part of /accounts/[id].
 *
 * Header: building icon, name, "industry · segment · Owner X", website link,
 *   chips (Health, NPS, Renews-in), status pill.
 * Actions: Add lead, Assign leads (bulk via single PATCH), Task (quick prompt),
 *   Customer actions dropdown, Activity, Sales activity.
 * Body: leads table (checkbox bulk-select) + activity timeline + subsidiaries.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ClipboardList, PhoneCall, UserPlus, Users } from "lucide-react";
import { AccountStatusPill } from "@/components/accounts/account-status-pill";
import { LeadFormDrawer } from "@/components/leads/lead-form-drawer";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "@/components/ui/table";

interface AccountDto {
  id: string;
  name: string;
  segment: string;
  owner: string;
  ownerId: string | null;
  industry: string;
  status: string;
  website: string;
  city: string;
  state: string | null;
  countryCode: string | null;
  healthScore: number | null;
  npsScore: number | null;
  renewalDate: string | null;
  parentAccountId: string | null;
  deletedAt: string | null;
}

interface LeadRow {
  id: string;
  name: string;
  stage: string;
  status: string;
  owner: string;
  ownerId: string | null;
}

interface UserPickerItem {
  id: string;
  name: string;
}

interface ActivityRow {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
  createdAt: string;
}

interface ChildAccount {
  id: string;
  name: string;
  status: string | null;
}

interface Props {
  account: AccountDto;
  parent: { id: string; name: string } | null;
  subsidiaries: ChildAccount[];
  permissions: {
    leadsCreate: boolean;
    leadsEdit: boolean;
    activitiesCreate: boolean;
  };
}

export function AccountDetailView({ account, parent, subsidiaries, permissions }: Props) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [users, setUsers] = useState<UserPickerItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [touchSales, setTouchSales] = useState(false);
  const [touchSubject, setTouchSubject] = useState("");
  const [touchOutcome, setTouchOutcome] = useState("");
  const [touchSaving, setTouchSaving] = useState(false);
  const [customerActionsOpen, setCustomerActionsOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [leadsRes, actsRes, usersRes] = await Promise.all([
        fetch(`/api/accounts/${account.id}/leads?limit=100&page=1`, {
          credentials: "include",
        }),
        fetch(
          `/api/activities?relatedKind=Account&relatedObjectId=${encodeURIComponent(
            account.id,
          )}&limit=50`,
          { credentials: "include" },
        ),
        fetch("/api/users/picker", { credentials: "include" }),
      ]);
      if (leadsRes.ok) {
        const j = (await leadsRes.json()) as { items: LeadRow[] };
        setLeads(j.items ?? []);
      }
      if (actsRes.ok) {
        const j = await actsRes.json();
        // Accept either { items } or a bare array — match the existing CRM activities surface.
        setActivities(Array.isArray(j) ? j : (j.items ?? []));
      }
      if (usersRes.ok) {
        const j = (await usersRes.json()) as { items: UserPickerItem[] };
        setUsers(j.items ?? []);
      }
    } catch {
      // Silent — header still renders even if related data fails.
    }
  }, [account.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleLead(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected((prev) => (prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))));
  }

  async function applyAssign() {
    if (!assignUserId.trim() || selected.size === 0) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}/leads/bulk-assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [...selected],
          ownerId: assignUserId.trim(),
        }),
      });
      if (!res.ok) throw new Error("Bulk assign failed");
      setAssignOpen(false);
      setSelected(new Set());
      await load();
    } catch {
      // surface via alert for now; the existing CRM uses ToastContext but it
      // isn't auto-injected here.
      alert("Bulk assign failed");
    } finally {
      setAssigning(false);
    }
  }

  function openTouch(sales: boolean) {
    setTouchSales(sales);
    setTouchSubject(sales ? "Sales activity" : "Account activity");
    setTouchOutcome("");
    setTouchOpen(true);
  }

  async function saveTouch(e: React.FormEvent) {
    e.preventDefault();
    if (!touchSubject.trim()) return;
    setTouchSaving(true);
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: touchSales ? "Sales" : "General",
          relatedKind: "Account",
          relatedObjectId: account.id,
          subject: touchSubject.trim(),
          outcome: touchOutcome.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Could not save");
      setTouchOpen(false);
      await load();
    } catch {
      alert("Could not save activity");
    } finally {
      setTouchSaving(false);
    }
  }

  async function quickTask() {
    const subject = window
      .prompt("Task subject", `Follow up with account: ${account.name}`)
      ?.trim();
    if (!subject) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          relatedKind: "Account",
          relatedObjectId: account.id,
        }),
      });
      if (!res.ok) throw new Error("Could not create task");
      alert("Task created");
    } catch {
      alert("Could not create task");
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="border-b border-crm-border px-4 py-3 sm:px-5 sm:py-4 lg:px-6">
        <Link href="/accounts" className="text-sm text-crm-blue hover:underline">
          ← All accounts
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-blue">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold text-crm-text">{account.name}</h1>
                <AccountStatusPill status={account.status} />
                {account.deletedAt && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Deleted
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-crm-muted">
                {account.industry || "—"} · {account.segment || "—"} · Owner{" "}
                {account.owner || "—"}
              </p>
              <p className="mt-0.5 text-xs text-crm-muted">
                {[account.city, account.state, account.countryCode].filter(Boolean).join(", ") ||
                  "—"}
              </p>
              {account.website ? (
                <a
                  href={
                    account.website.startsWith("http")
                      ? account.website
                      : `https://${account.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-sm text-crm-blue hover:underline"
                >
                  {account.website}
                </a>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <HealthChip score={account.healthScore} />
                <NpsChip score={account.npsScore} />
                <RenewalChip renewalDate={account.renewalDate} />
              </div>
              {parent && (
                <p className="mt-2 text-xs text-crm-muted">
                  Subsidiary of{" "}
                  <Link href={`/accounts/${parent.id}`} className="text-crm-blue hover:underline">
                    {parent.name}
                  </Link>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn
              icon={<UserPlus className="h-4 w-4" />}
              disabled={!permissions.leadsCreate}
              onClick={() => setAddLeadOpen(true)}
            >
              Add lead
            </ActionBtn>
            <ActionBtn
              icon={<Users className="h-4 w-4" />}
              disabled={!permissions.leadsEdit || leads.length === 0}
              onClick={() => {
                setAssignOpen(true);
                setAssignUserId("");
              }}
            >
              Assign leads
            </ActionBtn>
            <ActionBtn icon={<ClipboardList className="h-4 w-4" />} onClick={() => void quickTask()}>
              Task
            </ActionBtn>
            <div className="relative">
              <ActionBtn onClick={() => setCustomerActionsOpen((v) => !v)}>
                Customer actions
              </ActionBtn>
              {customerActionsOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded border border-crm-border bg-white p-1 shadow-crm-dropdown">
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-crm-panel"
                    onClick={() => {
                      setCustomerActionsOpen(false);
                      openTouch(false);
                    }}
                  >
                    Log activity
                  </button>
                  <button
                    type="button"
                    className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-crm-panel"
                    onClick={() => {
                      setCustomerActionsOpen(false);
                      openTouch(true);
                    }}
                  >
                    Log sales activity
                  </button>
                </div>
              )}
            </div>
            <ActionBtn
              icon={<ClipboardList className="h-4 w-4" />}
              disabled={!permissions.activitiesCreate}
              onClick={() => openTouch(false)}
            >
              Activity
            </ActionBtn>
            <ActionBtn
              icon={<PhoneCall className="h-4 w-4" />}
              disabled={!permissions.activitiesCreate}
              onClick={() => openTouch(true)}
            >
              Sales activity
            </ActionBtn>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2 lg:gap-6 lg:p-6">
        <section className="min-w-0">
          <h2 className="text-sm font-semibold text-crm-text">Leads on this account</h2>
          <p className="mt-1 text-xs text-crm-muted">
            Use Assign leads to reassign owners in bulk.
          </p>
          <div className="mt-3 overflow-hidden rounded border border-crm-border">
            <TableScroll minWidth={520} bleed={false}>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        className="rounded border-crm-border"
                        checked={leads.length > 0 && selected.size === leads.length}
                        onChange={selectAll}
                        aria-label="Select all"
                      />
                    </TH>
                    <TH className="px-3 py-2 text-left">Lead</TH>
                    <TH hideBelow="sm" className="px-3 py-2 text-left">
                      Stage
                    </TH>
                    <TH hideBelow="md" className="px-3 py-2 text-left">
                      Owner
                    </TH>
                  </TR>
                </THead>
                <TBody>
                  {leads.length === 0 ? (
                    <TR>
                      <TD colSpan={4} className="px-3 py-6 text-center text-crm-muted">
                        No leads linked yet.
                      </TD>
                    </TR>
                  ) : (
                    leads.map((row) => (
                      <TR key={row.id} className="hover:bg-crm-peach/40">
                        <TD className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="rounded border-crm-border"
                            checked={selected.has(row.id)}
                            onChange={() => toggleLead(row.id)}
                            aria-label={`Select ${row.name}`}
                          />
                        </TD>
                        <TD className="px-3 py-2">
                          <Link
                            href={`/leads/${row.id}`}
                            className="block max-w-[180px] truncate font-medium text-crm-blue hover:underline sm:max-w-none"
                          >
                            {row.name}
                          </Link>
                          {/* `<sm` drops Stage and `<md` drops Owner — surface inline. */}
                          <div className="text-xs text-crm-muted sm:hidden">
                            {row.stage}
                            {row.owner ? ` · ${row.owner}` : ""}
                          </div>
                        </TD>
                        <TD hideBelow="sm" className="px-3 py-2 text-crm-muted">
                          {row.stage}
                        </TD>
                        <TD hideBelow="md" className="px-3 py-2">
                          {row.owner || "—"}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableScroll>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-crm-text">Account activity</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {activities.length === 0 ? (
              <li className="rounded border border-dashed border-crm-border px-3 py-6 text-center text-crm-muted">
                No activities yet.
              </li>
            ) : (
              activities.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-crm-border bg-crm-panel/50 px-3 py-2"
                >
                  <p className="font-medium text-crm-text">
                    {a.type} · {a.subject || "—"}
                  </p>
                  <p className="text-xs text-crm-muted">
                    {(a.occurredAt ?? a.createdAt) && new Date(a.occurredAt ?? a.createdAt).toLocaleString()}{" "}
                    · {a.ownerName || "—"}
                  </p>
                  {a.outcome ? <p className="mt-1 text-xs text-crm-text">{a.outcome}</p> : null}
                </li>
              ))
            )}
          </ul>
        </section>

        {subsidiaries.length > 0 && (
          <section className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-crm-text">Subsidiaries</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subsidiaries.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded border border-crm-border bg-white px-3 py-2 text-sm"
                >
                  <Link href={`/accounts/${c.id}`} className="text-crm-blue hover:underline">
                    {c.name}
                  </Link>
                  <AccountStatusPill status={c.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {assignOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-lg border border-crm-border bg-white p-5 shadow-lg">
            <h2 className="text-base font-semibold text-crm-text">Assign leads</h2>
            <p className="mt-1 text-sm text-crm-muted">
              {selected.size} selected. Choose a user as owner.
            </p>
            <label className="mt-4 block text-sm">
              <span className="text-crm-muted">Owner</span>
              <select
                className="mt-1 w-full rounded border border-crm-border px-3 py-2 text-sm"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              >
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-crm-border px-4 py-2 text-sm"
                onClick={() => setAssignOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assigning}
                className="rounded bg-crm-blue px-4 py-2 text-sm font-medium text-white hover:bg-crm-blue-dark disabled:opacity-50"
                onClick={() => void applyAssign()}
              >
                {assigning ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}

      <LeadFormDrawer
        open={addLeadOpen}
        onClose={() => setAddLeadOpen(false)}
        initial={{
          accountId: account.id,
          accountName: account.name,
          ownerId: account.ownerId ?? undefined,
          ownerName: account.owner || undefined,
        }}
        onCreated={() => {
          void load();
        }}
      />

      {touchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={saveTouch}
            className="w-full max-w-md rounded-lg border border-crm-border bg-white p-5 shadow-lg"
          >
            <h2 className="text-base font-semibold text-crm-text">
              {touchSales ? "Sales activity" : "Activity"}
            </h2>
            <label className="mt-4 block text-sm">
              <span className="text-crm-muted">Subject</span>
              <input
                className="mt-1 w-full rounded border border-crm-border px-3 py-2 text-sm"
                value={touchSubject}
                onChange={(e) => setTouchSubject(e.target.value)}
                required
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-crm-muted">Notes / outcome</span>
              <textarea
                className="mt-1 min-h-[88px] w-full rounded border border-crm-border px-3 py-2 text-sm"
                value={touchOutcome}
                onChange={(e) => setTouchOutcome(e.target.value)}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-crm-border px-4 py-2 text-sm"
                onClick={() => setTouchOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={touchSaving}
                className="rounded bg-crm-blue px-4 py-2 text-sm font-medium text-white hover:bg-crm-blue-dark disabled:opacity-50"
              >
                {touchSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded border border-crm-border bg-white px-3 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

function HealthChip({ score }: { score: number | null }) {
  if (score == null) return null;
  // Thresholds from spec P2.6: red <40, amber 40-69, green ≥70
  const tone =
    score >= 70
      ? "bg-emerald-100 text-emerald-800"
      : score >= 40
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  const label = score >= 70 ? "Good" : score >= 40 ? "Watch" : "At risk";
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      Health {score} ({label})
    </span>
  );
}

function NpsChip({ score }: { score: number | null }) {
  if (score == null) return null;
  // Thresholds: red ≤0, amber 1-39, green ≥40
  const tone =
    score >= 40
      ? "bg-emerald-100 text-emerald-800"
      : score >= 1
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      NPS {score >= 0 ? `+${score}` : score}
    </span>
  );
}

function RenewalChip({ renewalDate }: { renewalDate: string | null }) {
  if (!renewalDate) return null;
  const days = Math.round(
    (new Date(renewalDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  // Thresholds: red <30d, amber 30-90d, green >90d
  const tone =
    days > 90
      ? "bg-emerald-100 text-emerald-800"
      : days >= 30
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  const label =
    days < 0 ? `Renewal ${-days}d overdue` : `Renews in ${days}d`;
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}
