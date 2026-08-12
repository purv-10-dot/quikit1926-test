"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

interface SubStatusRef { id: string; name: string }
interface LeadStatus { id: string; name: string; subStatuses: SubStatusRef[] }
interface LeadSubStatus { id: string; name: string }

// ─── Data fetching helpers ────────────────────────────────────────────────────

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json as T;
}

async function apiMutation(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadStatusesPage() {
  const toast = useToast();
  const [statuses, setStatuses] = useState<LeadStatus[]>([]);
  const [allSubStatuses, setAllSubStatuses] = useState<LeadSubStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<LeadStatus | null>(null);
  const [manageTarget, setManageTarget] = useState<LeadStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, ss] = await Promise.all([
        apiGet<{ items: LeadStatus[] }>("/api/settings/lead-statuses"),
        apiGet<{ items: LeadSubStatus[] }>("/api/settings/lead-sub-statuses"),
      ]);
      setStatuses(s.items);
      setAllSubStatuses(ss.items);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function addStatus() {
    const name = draft.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await apiMutation("POST", "/api/settings/lead-statuses", { name });
      setStatuses((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft("");
      toast.success(`Status "${name}" added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function deleteStatus(s: LeadStatus) {
    if (!confirm(`Remove status "${s.name}"? All sub-status links will also be removed.`)) return;
    try {
      await apiMutation("DELETE", `/api/settings/lead-statuses/${s.id}`);
      setStatuses((prev) => prev.filter((x) => x.id !== s.id));
      toast.success("Status removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function saveEdit(id: string, name: string) {
    try {
      const res = await apiMutation("PATCH", `/api/settings/lead-statuses/${id}`, { name });
      setStatuses((prev) =>
        prev.map((x) => (x.id === id ? res.data : x)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditTarget(null);
      toast.success("Status renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  }

  async function saveSubStatusMappings(statusId: string, subStatusIds: string[]) {
    try {
      const res = await apiMutation("PATCH", `/api/settings/lead-statuses/${statusId}`, { subStatusIds });
      setStatuses((prev) => prev.map((x) => (x.id === statusId ? res.data : x)));
      setManageTarget(null);
      toast.success("Sub-statuses updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <SettingsReturnBackButton />
      <div>
        <h1 className="text-lg font-semibold text-crm-text">Lead Statuses</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Manage statuses and their linked sub-statuses.
        </p>
      </div>

      {/* Add bar */}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStatus(); } }}
          placeholder="Add status (e.g. Open, Contacted, Qualified)"
          className="flex-1"
        />
        <Button onClick={addStatus} disabled={adding || !draft.trim()}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      {!loaded ? (
        <p className="text-sm text-crm-muted">Loading…</p>
      ) : statuses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
          No statuses yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {statuses.map((s) => {
            const isOpen = expanded.has(s.id);
            return (
              <li key={s.id} className="rounded-lg border border-crm-border bg-white">
                {/* Header row */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isOpen
                      ? <ChevronDown size={14} className="shrink-0 text-crm-muted" />
                      : <ChevronRight size={14} className="shrink-0 text-crm-muted" />}
                    <span className="truncate font-medium text-crm-text">{s.name}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {s.subStatuses.length}
                    </span>
                  </button>

                  <div className="ml-3 flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => setManageTarget(s)}
                      className="text-sm text-crm-blue hover:underline"
                    >
                      Sub-statuses
                    </button>
                    <button
                      onClick={() => setEditTarget(s)}
                      className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => deleteStatus(s)}
                      className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                {/* Expanded sub-status list */}
                {isOpen && (
                  <div className="border-t border-crm-border px-4 py-3">
                    {s.subStatuses.length === 0 ? (
                      <p className="text-sm italic text-crm-muted">No sub-status assigned.</p>
                    ) : (
                      <ul className="space-y-1">
                        {s.subStatuses.map((sub) => (
                          <li key={sub.id} className="flex items-center gap-2 text-sm text-crm-text">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-crm-muted" />
                            {sub.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Edit name modal */}
      {editTarget && (
        <EditNameModal
          title={`Rename status`}
          initialName={editTarget.name}
          onClose={() => setEditTarget(null)}
          onSave={(name) => saveEdit(editTarget.id, name)}
        />
      )}

      {/* Manage sub-statuses modal */}
      {manageTarget && (
        <ManageSubStatusesModal
          status={manageTarget}
          allSubStatuses={allSubStatuses}
          onClose={() => setManageTarget(null)}
          onSave={(ids) => saveSubStatusMappings(manageTarget.id, ids)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EditNameModal({
  title,
  initialName,
  onClose,
  onSave,
}: {
  title: string;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [value, setValue] = useState(initialName);
  const dirty = value.trim() && value.trim() !== initialName;

  return (
    <Modal open onClose={onClose} title={title} width="max-w-sm">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(value.trim()); }}
        autoFocus
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(value.trim())} disabled={!dirty}>Save</Button>
      </div>
    </Modal>
  );
}

function ManageSubStatusesModal({
  status,
  allSubStatuses,
  onClose,
  onSave,
}: {
  status: LeadStatus;
  allSubStatuses: LeadSubStatus[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(status.subStatuses.map((s) => s.id)),
  );
  const [search, setSearch] = useState("");

  const visible = search.trim()
    ? allSubStatuses.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : allSubStatuses;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose} title={`Sub-statuses for "${status.name}"`} width="max-w-md">
      <p className="mb-3 text-sm text-crm-muted">
        Select sub-statuses available under this status. Uncheck all to show every sub-status.
      </p>

      {allSubStatuses.length > 6 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sub-statuses…"
          className="mb-3"
        />
      )}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {allSubStatuses.length === 0 ? (
          <li className="rounded border border-dashed border-crm-border p-3 text-center text-sm text-crm-muted">
            No sub-statuses defined yet — go to Lead Sub-Statuses first.
          </li>
        ) : visible.length === 0 ? (
          <li className="py-3 text-center text-sm text-crm-muted">No match for &ldquo;{search}&rdquo;</li>
        ) : (
          visible.map((sub) => (
            <li key={sub.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-crm-border bg-white px-3 py-2 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(sub.id)}
                  onChange={() => toggle(sub.id)}
                />
                <span>{sub.name}</span>
              </label>
            </li>
          ))
        )}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-crm-muted">{selected.size} selected</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave([...selected])}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
