"use client";

import { useEffect, useMemo, useState } from "react";
import { X, CheckSquare, Pencil, ArrowRightLeft, Trash2 } from "lucide-react";

export interface BulkRow {
  id: string;
  key: string;
  title: string;
  type: string;
  projectId: string;
  projectName: string;
  statusId: string | null;
}

interface StatusOption {
  id: string;
  name: string;
  color: string;
}
interface MemberOption {
  id: string;
  label: string;
}

type Panel = null | "edit" | "status" | "delete";

/**
 * Floating bulk-action bar for the filter table (Jira-style). Actions operate on
 * the selected rows and, because the list is cross-project, group the selection
 * by project and call the per-project bulk endpoints. No Watch option.
 */
export function BulkActionsBar({
  rows,
  onSelectAll,
  onClear,
  onDone,
}: {
  rows: BulkRow[];
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void; // refetch the list after a mutation
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const count = rows.length;

  // Selection grouped by project — every bulk endpoint is per-project.
  const byProject = useMemo(() => {
    const m = new Map<string, BulkRow[]>();
    for (const r of rows) {
      const arr = m.get(r.projectId) ?? [];
      arr.push(r);
      m.set(r.projectId, arr);
    }
    return m;
  }, [rows]);

  if (count === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-lg bg-gray-900 text-white shadow-2xl px-2 py-1.5 text-sm">
        <span className="px-2 font-medium">{count} selected</span>
        <span className="w-px h-5 bg-white/20" />
        <BarButton icon={CheckSquare} label="Select all" onClick={onSelectAll} />
        <BarButton icon={Pencil} label="Edit fields" onClick={() => setPanel("edit")} />
        <BarButton icon={ArrowRightLeft} label="Change status" onClick={() => setPanel("status")} />
        <BarButton icon={Trash2} label="Delete" danger onClick={() => setPanel("delete")} />
        <span className="w-px h-5 bg-white/20" />
        <button type="button" onClick={onClear} className="p-1.5 rounded hover:bg-white/10" aria-label="Clear selection">
          <X className="h-4 w-4" />
        </button>
      </div>

      {panel === "delete" && (
        <DeletePanel
          count={count}
          byProject={byProject}
          onClose={() => setPanel(null)}
          onDone={() => { setPanel(null); onDone(); onClear(); }}
        />
      )}
      {panel === "edit" && (
        <EditFieldsPanel
          byProject={byProject}
          onClose={() => setPanel(null)}
          onDone={() => { setPanel(null); onDone(); onClear(); }}
        />
      )}
      {panel === "status" && (
        <ChangeStatusPanel
          byProject={byProject}
          onClose={() => setPanel(null)}
          onDone={() => { setPanel(null); onDone(); onClear(); }}
        />
      )}
    </>
  );
}

function BarButton({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-white/10 ${
        danger ? "text-red-300 hover:text-red-200" : ""
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/** Type-to-confirm delete (matches Jira). Detaches children server-side. */
function DeletePanel({
  count,
  byProject,
  onClose,
  onDone,
}: {
  count: number;
  byProject: Map<string, BulkRow[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      for (const [projectId, rows] of byProject) {
        const res = await fetch("/api/issues/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ids: rows.map((r) => r.id) }),
        });
        const j = await res.json();
        if (!j?.success) throw new Error(j?.error ?? "Delete failed");
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={`Delete ${count} work items?`} onClose={onClose} danger>
      <p className="text-sm text-gray-600">
        You&rsquo;re about to permanently delete these {count} work items, their comments and
        attachments, and all of their data. This is irreversible. Any subtasks are kept and detached
        from their parent.
      </p>
      <label className="block mt-4 text-sm text-gray-700">
        Type <span className="font-semibold">delete</span> to continue
      </label>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-1 w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          type="button"
          disabled={text.trim().toLowerCase() !== "delete" || busy}
          onClick={run}
          className="px-4 h-9 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </ModalShell>
  );
}

/** Bulk edit assignee / due date / priority (Keep-as-is defaults). */
function EditFieldsPanel({
  byProject,
  onClose,
  onDone,
}: {
  byProject: Map<string, BulkRow[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [assignee, setAssignee] = useState<string>(""); // "" = keep, "unassign", or userId
  const [due, setDue] = useState<string>("");
  const [clearDue, setClearDue] = useState(false);
  const [priority, setPriority] = useState<string>("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Members from the first selected project (assignee options). Cross-project
  // assignee across differing rosters is uncommon; use the first project's list.
  const firstProject = byProject.keys().next().value as string | undefined;
  useEffect(() => {
    if (!firstProject) return;
    let alive = true;
    fetch(`/api/projects/${firstProject}/members`)
      .then((r) => r.json())
      .then((m) => {
        if (!alive) return;
        const list = (m?.data?.members ?? [])
          .map((x: { user: { id: string; firstName?: string; lastName?: string; email: string } | null }) => x.user)
          .filter(Boolean)
          .map((u: { id: string; firstName?: string; lastName?: string; email: string }) => ({
            id: u.id,
            label: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
          }));
        setMembers(list);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [firstProject]);

  const hasChange = assignee !== "" || clearDue || due !== "" || priority !== "";

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (assignee === "unassign") patch.assigneeId = null;
      else if (assignee) patch.assigneeId = assignee;
      if (clearDue) patch.dueDate = null;
      else if (due) patch.dueDate = new Date(due).toISOString();
      if (priority) patch.priority = priority;

      for (const [projectId, rows] of byProject) {
        const res = await fetch("/api/issues/bulk-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ids: rows.map((r) => r.id), ...patch }),
        });
        const j = await res.json();
        if (!j?.success) throw new Error(j?.error ?? "Update failed");
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Edit fields" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-3">Modify any of the fields below. Untouched fields keep their values.</p>

      <Field label="Assignee">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectCls}>
          <option value="">Keep as is</option>
          <option value="unassign">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </Field>

      <Field label="Due date">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={due}
            disabled={clearDue}
            onChange={(e) => setDue(e.target.value)}
            className={`${selectCls} disabled:bg-gray-50`}
          />
          <label className="inline-flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={clearDue} onChange={(e) => setClearDue(e.target.checked)} className="h-3.5 w-3.5" />
            Clear
          </label>
        </div>
      </Field>

      <Field label="Priority">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectCls}>
          <option value="">Keep as is</option>
          {["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"].map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
      </Field>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          type="button"
          disabled={!hasChange || busy}
          onClick={run}
          className="px-4 h-9 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
    </ModalShell>
  );
}

/** Change status, one target per project's workflow (Jira groups by workflow). */
function ChangeStatusPanel({
  byProject,
  onClose,
  onDone,
}: {
  byProject: Map<string, BulkRow[]>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [statusesByProject, setStatusesByProject] = useState<Record<string, StatusOption[]>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIds = useMemo(() => Array.from(byProject.keys()), [byProject]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      projectIds.map((pid) =>
        fetch(`/api/projects/${pid}/statuses`).then((r) => r.json()).then((j) => [pid, j?.data ?? []] as const),
      ),
    ).then((entries) => {
      if (!alive) return;
      const map: Record<string, StatusOption[]> = {};
      for (const [pid, list] of entries) map[pid] = list;
      setStatusesByProject(map);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [projectIds]);

  const allChosen = projectIds.every((pid) => chosen[pid]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      for (const [projectId, rows] of byProject) {
        const statusId = chosen[projectId];
        if (!statusId) continue;
        const res = await fetch("/api/issues/bulk-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ids: rows.map((r) => r.id), statusId }),
        });
        const j = await res.json();
        if (!j?.success) throw new Error(j?.error ?? "Update failed");
      }
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Change status" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-3">
        Statuses belong to each project&rsquo;s workflow. Pick a status for each group.
      </p>
      <div className="space-y-4 max-h-80 overflow-y-auto">
        {projectIds.map((pid) => {
          const rows = byProject.get(pid) ?? [];
          const statuses = statusesByProject[pid] ?? [];
          return (
            <div key={pid} className="border border-gray-200 rounded p-3">
              <div className="text-sm font-medium text-gray-800 mb-1">
                {rows[0]?.projectName ?? "Project"} — {rows.length} item{rows.length === 1 ? "" : "s"}
              </div>
              <select
                value={chosen[pid] ?? ""}
                onChange={(e) => setChosen((c) => ({ ...c, [pid]: e.target.value }))}
                className={selectCls}
              >
                <option value="">Select status</option>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 h-9 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
        <button
          type="button"
          disabled={!allChosen || busy}
          onClick={run}
          className="px-4 h-9 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
    </ModalShell>
  );
}

const selectCls =
  "w-full h-9 px-2 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 mb-3">
      <span className="text-sm text-gray-600">{label}</span>
      {children}
    </div>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  danger,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className={`text-lg font-semibold ${danger ? "text-red-700" : "text-gray-900"}`}>{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
