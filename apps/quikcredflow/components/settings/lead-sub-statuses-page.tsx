"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

interface StatusRef { id: string; name: string }
interface LeadSubStatus { id: string; name: string; statuses: StatusRef[] }
interface LeadStatus { id: string; name: string }

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

export function LeadSubStatusesPage() {
  const toast = useToast();
  const [subStatuses, setSubStatuses] = useState<LeadSubStatus[]>([]);
  const [allStatuses, setAllStatuses] = useState<LeadStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editTarget, setEditTarget] = useState<LeadSubStatus | null>(null);
  const [linkTarget, setLinkTarget] = useState<LeadSubStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const [ss, s] = await Promise.all([
        apiGet<{ items: LeadSubStatus[] }>("/api/settings/lead-sub-statuses"),
        apiGet<{ items: LeadStatus[] }>("/api/settings/lead-statuses"),
      ]);
      setSubStatuses(ss.items);
      setAllStatuses(s.items);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function addSubStatus() {
    const name = draft.trim();
    if (!name) return;
    setAdding(true);
    try {
      const res = await apiMutation("POST", "/api/settings/lead-sub-statuses", { name });
      setSubStatuses((prev) => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft("");
      toast.success(`Sub-status "${name}" added`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function deleteSubStatus(ss: LeadSubStatus) {
    if (!confirm(`Remove sub-status "${ss.name}"? All status links will also be removed.`)) return;
    try {
      await apiMutation("DELETE", `/api/settings/lead-sub-statuses/${ss.id}`);
      setSubStatuses((prev) => prev.filter((x) => x.id !== ss.id));
      toast.success("Sub-status removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  async function saveEdit(id: string, name: string) {
    try {
      const res = await apiMutation("PATCH", `/api/settings/lead-sub-statuses/${id}`, { name });
      setSubStatuses((prev) =>
        prev.map((x) => (x.id === id ? res.data : x)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditTarget(null);
      toast.success("Sub-status renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  }

  async function saveStatusMappings(subStatusId: string, statusIds: string[]) {
    try {
      const res = await apiMutation("PATCH", `/api/settings/lead-sub-statuses/${subStatusId}`, { statusIds });
      setSubStatuses((prev) => prev.map((x) => (x.id === subStatusId ? res.data : x)));
      setLinkTarget(null);
      toast.success("Status links updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  function linkedLabel(ss: LeadSubStatus): string {
    if (ss.statuses.length === 0) return "All statuses";
    if (ss.statuses.length <= 2) return ss.statuses.map((s) => s.name).join(", ");
    return `${ss.statuses[0]!.name}, ${ss.statuses[1]!.name} +${ss.statuses.length - 2} more`;
  }

  return (
    <div className="space-y-4">
      <SettingsReturnBackButton />
      <div>
        <h1 className="text-lg font-semibold text-crm-text">Lead Sub-Statuses</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Manage sub-statuses and their linked parent statuses.
        </p>
      </div>

      {/* Add bar */}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubStatus(); } }}
          placeholder="Add sub-status (e.g. Interested for Demo)"
          className="flex-1"
        />
        <Button onClick={addSubStatus} disabled={adding || !draft.trim()}>
          <Plus size={14} className="mr-1" /> Add
        </Button>
      </div>

      {/* List */}
      {!loaded ? (
        <p className="text-sm text-crm-muted">Loading…</p>
      ) : subStatuses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-crm-border p-8 text-center text-sm text-crm-muted">
          No sub-statuses yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {subStatuses.map((ss) => (
            <li
              key={ss.id}
              className="flex items-center justify-between rounded-lg border border-crm-border bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-crm-text">{ss.name}</div>
                <div className="mt-0.5 truncate text-xs text-crm-muted">{linkedLabel(ss)}</div>
              </div>

              <div className="ml-3 flex shrink-0 items-center gap-3">
                <button
                  onClick={() => setLinkTarget(ss)}
                  className="text-sm text-crm-blue hover:underline"
                >
                  Statuses
                </button>
                <button
                  onClick={() => setEditTarget(ss)}
                  className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
                >
                  <Pencil size={12} /> Edit
                </button>
                <button
                  onClick={() => deleteSubStatus(ss)}
                  className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Edit name modal */}
      {editTarget && (
        <EditNameModal
          title="Rename sub-status"
          initialName={editTarget.name}
          onClose={() => setEditTarget(null)}
          onSave={(name) => saveEdit(editTarget.id, name)}
        />
      )}

      {/* Link to statuses modal */}
      {linkTarget && (
        <LinkStatusesModal
          subStatus={linkTarget}
          allStatuses={allStatuses}
          onClose={() => setLinkTarget(null)}
          onSave={(ids) => saveStatusMappings(linkTarget.id, ids)}
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

function LinkStatusesModal({
  subStatus,
  allStatuses,
  onClose,
  onSave,
}: {
  subStatus: LeadSubStatus;
  allStatuses: LeadStatus[];
  onClose: () => void;
  onSave: (statusIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(subStatus.statuses.map((s) => s.id)),
  );
  const [search, setSearch] = useState("");

  const visible = search.trim()
    ? allStatuses.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : allStatuses;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Modal open onClose={onClose} title={`Link "${subStatus.name}" to statuses`} width="max-w-md">
      <p className="mb-3 text-sm text-crm-muted">
        Select which statuses show this sub-status. Uncheck all to show it under every status.
      </p>

      {allStatuses.length > 6 && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search statuses…"
          className="mb-3"
        />
      )}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {allStatuses.length === 0 ? (
          <li className="rounded border border-dashed border-crm-border p-3 text-center text-sm text-crm-muted">
            No statuses defined yet — go to Lead Statuses first.
          </li>
        ) : visible.length === 0 ? (
          <li className="py-3 text-center text-sm text-crm-muted">No match for &ldquo;{search}&rdquo;</li>
        ) : (
          visible.map((s) => (
            <li key={s.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded border border-crm-border bg-white px-3 py-2 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span>{s.name}</span>
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
