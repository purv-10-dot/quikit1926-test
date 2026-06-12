"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { AccountOverviewLead } from "@/components/accounts/account-dashboard-overview";

interface Props {
  accountId: string;
  initialLeads: AccountOverviewLead[];
  canBulkAssign: boolean;
  onChanged?: () => void;
}

interface UserPickerItem {
  id: string;
  name: string;
}

export function AccountLeadsTab({ accountId, initialLeads, canBulkAssign, onChanged }: Props) {
  const toast = useToast();
  const [leads, setLeads] = useState(initialLeads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserPickerItem[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/leads?limit=100&page=1`, {
        credentials: "include",
      });
      if (res.ok) {
        const j = (await res.json()) as { items: AccountOverviewLead[] };
        setLeads(j.items ?? []);
      }
    } catch {
      // keep prior rows
    }
  }, [accountId]);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    void fetch("/api/users/picker", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => setUsers((j.items ?? []) as UserPickerItem[]))
      .catch(() => {});
  }, []);

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
    if (selected.size === 0) {
      toast.error("Select at least one lead.");
      return;
    }
    if (!assignUserId.trim()) {
      toast.error("Choose an owner.");
      return;
    }
    setAssigning(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/leads/bulk-assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: [...selected], ownerId: assignUserId.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(json.error || "Bulk assign failed");
      toast.success(`Assigned ${json.updated ?? 0} lead(s)`);
      setAssignOpen(false);
      setSelected(new Set());
      await refresh();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk assign failed");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-crm-muted">Leads linked to this account.</p>
        {canBulkAssign && leads.length > 0 ? (
          <button
            type="button"
            className="crm-btn-secondary text-xs"
            onClick={() => {
              setSelected((prev) => (prev.size > 0 ? prev : new Set(leads.map((l) => l.id))));
              setAssignUserId("");
              setAssignOpen(true);
            }}
          >
            Assign leads
          </button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded border border-crm-border">
        <TableScroll minWidth={520} bleed={false}>
          <Table>
            <THead>
              <TR>
                {canBulkAssign ? (
                  <TH className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      className="rounded border-crm-border"
                      checked={leads.length > 0 && selected.size === leads.length}
                      onChange={selectAll}
                      aria-label="Select all"
                    />
                  </TH>
                ) : null}
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
                  <TD colSpan={canBulkAssign ? 4 : 3} className="px-3 py-6 text-center text-crm-muted">
                    No leads linked yet.
                  </TD>
                </TR>
              ) : (
                leads.map((row) => (
                  <TR key={row.id} className="hover:bg-crm-peach/40">
                    {canBulkAssign ? (
                      <TD className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="rounded border-crm-border"
                          checked={selected.has(row.id)}
                          onChange={() => toggleLead(row.id)}
                          aria-label={`Select ${row.name}`}
                        />
                      </TD>
                    ) : null}
                    <TD className="px-3 py-2">
                      <Link
                        href={`/leads/${row.id}`}
                        className="block max-w-[180px] truncate font-medium text-crm-blue hover:underline sm:max-w-none"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-crm-muted sm:hidden">
                        {row.stage}
                        {row.ownerName ? ` · ${row.ownerName}` : ""}
                      </div>
                    </TD>
                    <TD hideBelow="sm" className="px-3 py-2 text-crm-muted">
                      {row.stage}
                    </TD>
                    <TD hideBelow="md" className="px-3 py-2">
                      {row.ownerName || "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
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
              {selected.size} of {leads.length} lead(s) selected.
            </p>
            <select
              className="mt-3 w-full rounded border border-crm-border px-3 py-2 text-sm"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
            >
              <option value="">Select owner…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
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
                disabled={assigning || !assignUserId.trim()}
                className="rounded bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                onClick={() => void applyAssign()}
              >
                {assigning ? "Saving…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
