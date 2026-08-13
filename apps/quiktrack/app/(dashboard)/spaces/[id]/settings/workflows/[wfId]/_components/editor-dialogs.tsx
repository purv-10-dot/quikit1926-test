"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown, Info, Plus } from "lucide-react";
import type { EditorDraft, StatusMeta, TransitionType } from "./editor-types";

/**
 * Statuses always offered in "Add a status" even when the project doesn't have
 * them yet — picking one creates it by name. Covers the classic template set
 * (Open/In Progress/Resolved/Reopened/Closed) plus common extras (Build Broken,
 * Building, Ideation, To Do, In Review, Done) so the dropdown mirrors Jira's.
 */
const CLASSIC_STATUSES: Array<{ name: string; category: string }> = [
  { name: "To Do", category: "BACKLOG" },
  { name: "Ideation", category: "BACKLOG" },
  { name: "Open", category: "BACKLOG" },
  { name: "In Progress", category: "IN_PROGRESS" },
  { name: "Building", category: "IN_PROGRESS" },
  { name: "Build Broken", category: "IN_PROGRESS" },
  { name: "In Review", category: "IN_PROGRESS" },
  { name: "Resolved", category: "IN_PROGRESS" },
  { name: "Reopened", category: "IN_PROGRESS" },
  { name: "Closed", category: "DONE" },
  { name: "Done", category: "DONE" },
];

/** Category → Jira-style status pill colours. */
function pillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

function StatusPill({ name, category }: { name: string; category?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${pillClass(category)}`}>
      {name}
    </span>
  );
}

/** Close a popover when clicking outside its ref. */
function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);
  return ref;
}

function Shell({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Save as new workflow": snapshot the current workflow into a reusable org
 * template (name required + description). POSTs to /api/workflows.
 */
export function SaveAsNewWorkflowDialog({
  sourceWorkflowId,
  defaultName,
  onSaved,
  onClose,
}: {
  sourceWorkflowId: string;
  defaultName: string;
  onSaved: (created: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError("Workflow name is required.");
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceWorkflowId, name: name.trim(), description: description.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to save");
      onSaved(j.data as { id: string; name: string });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Shell title="Save as new workflow" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The current changes will be saved to a new inactive workflow. You can activate the workflow
          by adding it to a workflow scheme.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Workflow name <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Workflow description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * "Edit workflow name and description" — PATCHes the workflow row's metadata
 * (applies immediately; not part of the publishable graph draft).
 */
export function EditWorkflowMetaDialog({
  workflowId,
  initialName,
  initialDescription,
  onSaved,
  onClose,
}: {
  workflowId: string;
  initialName: string;
  initialDescription: string | null;
  onSaved: (updated: { name: string; description: string | null }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== initialName || description.trim() !== (initialDescription ?? "");

  const save = async () => {
    if (!name.trim()) return setError("Workflow name is required.");
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to save");
      onSaved({ name: j.data.name as string, description: (j.data.description ?? null) as string | null });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <Shell title="Edit workflow name and description" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Workflow name <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Workflow description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full resize-none rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim() || !dirty}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

const CATEGORY_OPTIONS = [
  { value: "BACKLOG", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];
const CATEGORY_DOT: Record<string, string> = {
  BACKLOG: "bg-gray-400",
  IN_PROGRESS: "bg-blue-500",
  DONE: "bg-green-500",
};

/**
 * "Edit status" — Jira modal opened from the Name/Category pencil. Warning
 * banner (edits impact other workflows) + Status name + Status Category, an
 * "Update status" that PATCHes the project status, and a "Replace status" link.
 */
export function EditStatusDialog({
  name: initialName,
  category: initialCategory,
  onUpdate,
  onReplace,
  onClose,
}: {
  name: string;
  category: string;
  onUpdate: (name: string, category: string) => void;
  onReplace: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useClickOutside(catOpen, () => setCatOpen(false));
  const catLabel = CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;

  return (
    <Shell title="Edit status" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">⚠</span>
            <div>
              <p>Changes will impact multiple workflows that reference this status, and may also affect filters and reports.</p>
              <button type="button" onClick={onReplace} className="mt-1 font-medium text-accent-700 hover:underline">
                Replace status
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Status name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Status Category</label>
          <div className="relative" ref={catRef}>
            <button
              type="button"
              onClick={() => setCatOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded border border-gray-300 px-3 py-2 text-left text-sm focus:border-accent-500 focus:outline-none"
            >
              <span className={`h-3 w-3 rounded-sm ${CATEGORY_DOT[category]}`} />
              {catLabel}
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {catOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {CATEGORY_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => { setCategory(c.value); setCatOpen(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${c.value === category ? "bg-blue-50/60" : ""}`}
                  >
                    <span className={`h-3 w-3 rounded-sm ${CATEGORY_DOT[c.value]}`} />
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center pt-1">
          <button type="button" onClick={onReplace} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
            Replace status
          </button>
          <div className="ml-auto flex gap-3">
            <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onUpdate(name.trim() || initialName, category); onClose(); }}
              disabled={!name.trim()}
              className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
            >
              Update status
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/**
 * "Replace status" — swap the current status for another (NOT already in this
 * workflow), creating it by name if the project lacks it. Only THIS workflow is
 * affected.
 */
export function ReplaceStatusDialog({
  projectId,
  currentName,
  currentCategory,
  poolStatuses,
  draft,
  onReplace,
  onClose,
}: {
  projectId: string;
  currentName: string;
  currentCategory: string;
  poolStatuses: StatusMeta[];
  draft: EditorDraft;
  /** Replace the current status with the given one (may need creating). */
  onReplace: (newStatusId: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: string | null; name: string; category: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useClickOutside(open, () => setOpen(false));

  // Names already in this workflow (can't replace with an existing node).
  const inWorkflowNames = useMemo(() => {
    const byId = new Map(poolStatuses.map((s) => [s.id, s.name]));
    return new Set(draft.statuses.map((s) => byId.get(s.statusId)).filter(Boolean) as string[]);
  }, [draft.statuses, poolStatuses]);
  const projectNames = useMemo(() => new Set(poolStatuses.map((s) => s.name.toLowerCase())), [poolStatuses]);

  type Opt = { id: string | null; name: string; category: string };
  const options = useMemo<Opt[]>(() => {
    const list: Opt[] = poolStatuses
      .filter((s) => !inWorkflowNames.has(s.name) && s.name !== currentName)
      .map((s) => ({ id: s.id, name: s.name, category: s.category }));
    for (const c of CLASSIC_STATUSES) {
      if (projectNames.has(c.name.toLowerCase())) continue;
      if (inWorkflowNames.has(c.name) || c.name === currentName) continue;
      list.push({ id: null, name: c.name, category: c.category });
    }
    return list;
  }, [poolStatuses, inWorkflowNames, projectNames, currentName]);

  const doReplace = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      let newId = selected.id;
      if (!newId) {
        const r = await fetch(`/api/projects/${projectId}/statuses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selected.name, category: selected.category }),
        });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to create status");
        newId = (j.data as { id: string }).id;
        await qc.invalidateQueries({ queryKey: ["quiktrack", "statuses", projectId] });
      }
      onReplace(newId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to replace status");
      setBusy(false);
    }
  };

  return (
    <Shell title="Replace status" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Replace with another status, or create a new one. Other workflows using “{currentName}” aren&apos;t affected.
        </p>
        <div>
          <div className="mb-1 text-xs font-medium text-gray-700">Current status</div>
          <StatusPill name={currentName} category={currentCategory} />
        </div>
        <hr className="border-gray-100" />
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Change to status</label>
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex min-h-[38px] w-full items-center rounded border border-gray-300 px-2 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none"
            >
              {selected ? <StatusPill name={selected.name} category={selected.category} /> : <span className="text-gray-400">Select a status</span>}
              <ChevronDown className="ml-auto h-4 w-4 text-gray-400" />
            </button>
            {open && (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {options.map((o) => (
                  <button
                    key={o.id ?? `classic:${o.name}`}
                    type="button"
                    onClick={() => { setSelected(o); setOpen(false); }}
                    className="flex w-full items-center px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <StatusPill name={o.name} category={o.category} />
                  </button>
                ))}
                {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No other statuses.</div>}
              </div>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={doReplace}
            disabled={!selected || busy}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy ? "Replacing…" : "Replace"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/**
 * "Add a status" — Jira-style. A searchable combobox of the project's existing
 * statuses (as category-coloured pills), a "Create <name>" option to make a new
 * status inline, and an "Allow transitions from any status" checkbox that also
 * wires a GLOBAL (Any → status) transition into the added status.
 */
export function AddStatusDialog({
  projectId,
  poolStatuses,
  draft,
  onAdd,
  onAddAnyStatus,
  onClose,
}: {
  projectId: string;
  poolStatuses: StatusMeta[];
  draft: EditorDraft;
  /** Add an existing project status to the workflow. */
  onAdd: (statusId: string) => void;
  /** Add a GLOBAL "Any status → statusId" transition (the checkbox). */
  onAddAnyStatus: (statusId: string, statusName: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [allowAny, setAllowAny] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StatusMeta | null>(null);
  const ref = useClickOutside(open, () => setOpen(false));

  // An option is either an EXISTING project status (has an id) or a CLASSIC
  // template status the project doesn't have yet (id = null → created on add).
  type StatusOption = { id: string | null; name: string; category: string };

  const inWorkflowNames = useMemo(() => {
    const byId = new Map(poolStatuses.map((s) => [s.id, s.name]));
    return new Set(draft.statuses.map((s) => byId.get(s.statusId)).filter(Boolean) as string[]);
  }, [draft.statuses, poolStatuses]);
  const projectNames = useMemo(
    () => new Set(poolStatuses.map((s) => s.name.toLowerCase())),
    [poolStatuses],
  );

  // Options = the project's statuses + the classic statuses the project lacks,
  // minus any already in this workflow. Deduped by name (project wins).
  const options = useMemo<StatusOption[]>(() => {
    const list: StatusOption[] = poolStatuses
      .filter((s) => !inWorkflowNames.has(s.name))
      .map((s) => ({ id: s.id, name: s.name, category: s.category }));
    for (const c of CLASSIC_STATUSES) {
      if (projectNames.has(c.name.toLowerCase())) continue; // already a project status
      if (inWorkflowNames.has(c.name)) continue;
      list.push({ id: null, name: c.name, category: c.category });
    }
    return list;
  }, [poolStatuses, inWorkflowNames, projectNames]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options),
    [options, q],
  );
  // Offer "Create <name>" when the typed name matches no listed option.
  const nameExists = useMemo(
    () => options.some((o) => o.name.toLowerCase() === q) || projectNames.has(q),
    [options, projectNames, q],
  );
  const canCreate = q.length > 0 && !nameExists;

  const finish = (statusId: string, statusName: string) => {
    onAdd(statusId);
    if (allowAny) onAddAnyStatus(statusId, statusName);
    onClose();
  };

  // Create a status by name (for classic-only options + the "Create" action),
  // then add it. Category defaults to the classic status's category if known.
  const createStatus = async (name: string, category = "IN_PROGRESS") => {
    setCreating(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to create status");
      const created = j.data as { id: string; name: string };
      await qc.invalidateQueries({ queryKey: ["quiktrack", "statuses", projectId] });
      finish(created.id, created.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create status");
      setCreating(false);
    }
  };

  const pick = (o: StatusOption) => {
    setSelected({ id: o.id ?? "", name: o.name, color: "", category: o.category });
    setOpen(false);
  };

  const add = () => {
    if (selected) {
      if (selected.id) return finish(selected.id, selected.name);
      // Classic-only status not in the project yet → create it by name.
      return void createStatus(selected.name, selected.category);
    }
    if (canCreate) void createStatus(query.trim());
  };

  return (
    <Shell title="Add a status" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Statuses capture the stages of your working process. Add more statuses to represent
          different stages in your team&apos;s process.
        </p>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Search for a status</label>
          <div className="relative" ref={ref}>
            <div className="flex items-center rounded border border-gray-300 px-2 focus-within:border-accent-500">
              {selected ? (
                <span className={`my-1.5 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${pillClass(selected.category)}`}>
                  {selected.name}
                  <X className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100" onClick={() => setSelected(null)} />
                </span>
              ) : (
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm focus:outline-none"
                />
              )}
              <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto text-gray-400">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            {open && !selected && (
              <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {filtered.map((o) => (
                  <button
                    key={o.id ?? `classic:${o.name}`}
                    type="button"
                    onClick={() => pick(o)}
                    className="flex w-full items-center px-3 py-1.5 text-left hover:bg-gray-50"
                  >
                    <StatusPill name={o.name} category={o.category} />
                  </button>
                ))}
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); void createStatus(query.trim()); }}
                    className="flex w-full items-center gap-2 border-l-2 border-accent-500 px-3 py-2 text-left text-sm text-accent-700 hover:bg-accent-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create “{query.trim()}”
                  </button>
                )}
                {filtered.length === 0 && !canCreate && (
                  <div className="px-3 py-2 text-sm text-gray-400">No statuses.</div>
                )}
              </div>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={allowAny} onChange={(e) => setAllowAny(e.target.checked)} />
          Allow transitions from any status
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={add}
            disabled={creating || (!selected && !canCreate)}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

/** Add-transition: From (multi, incl. Any status) → To, with a name + type. */
export function AddTransitionDialog({
  draft,
  statusMeta,
  onAdd,
  onClose,
  prefillFrom,
  prefillTo,
}: {
  draft: EditorDraft;
  statusMeta: Map<string, StatusMeta>;
  onAdd: (t: {
    name: string;
    type: TransitionType;
    toStatusId: string;
    fromStatusIds: string[];
  }) => void;
  onClose: () => void;
  /** Pre-fill From/To when opened by drawing an edge on the diagram. */
  prefillFrom?: string;
  prefillTo?: string;
}) {
  const nodes = draft.statuses;
  const [name, setName] = useState("");
  const [toStatusId, setToStatusId] = useState(prefillTo ?? nodes[0]?.statusId ?? "");
  const [anyStatus, setAnyStatus] = useState(false);
  const [fromIds, setFromIds] = useState<string[]>(prefillFrom ? [prefillFrom] : []);
  const [error, setError] = useState<string | null>(null);

  const toggleFrom = (id: string) =>
    setFromIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const fromRef = useClickOutside(fromOpen, () => setFromOpen(false));
  const toRef = useClickOutside(toOpen, () => setToOpen(false));

  const meta = (id: string) => statusMeta.get(id);
  const toMeta = toStatusId ? meta(toStatusId) : undefined;
  // Valid when a target is chosen and there's at least one source (or Any).
  const canCreate = !!toStatusId && (anyStatus || fromIds.length > 0);

  const submit = () => {
    if (!name.trim()) return setError("Name is required.");
    if (!toStatusId) return setError("Pick a target status.");
    if (!anyStatus && fromIds.length === 0)
      return setError("Pick at least one From status, or choose Any status.");
    onAdd({
      name: name.trim(),
      type: anyStatus ? "GLOBAL" : "NORMAL",
      toStatusId,
      fromStatusIds: anyStatus ? [] : fromIds,
    });
    onClose();
  };

  return (
    <Shell title="Create transition" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Transitions connect statuses. They represent actions people take to move work items through
          your workflow. They also appear as drop zones when people move cards across your project&apos;s
          board.
        </p>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <span>To reuse a transition, edit the transition and select additional from statuses.</span>
        </div>

        {/* From → To, side by side with an arrow between. */}
        <div className="flex items-end gap-3">
          {/* From statuses — chip multi-select with an "Any status" option. */}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">From statuses</label>
            <div className="relative" ref={fromRef}>
              <button
                type="button"
                onClick={() => setFromOpen((v) => !v)}
                className="flex min-h-[38px] w-full items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none"
              >
                <div className="flex flex-1 flex-wrap items-center gap-1">
                  {anyStatus ? (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      Any status
                      <X
                        className="h-3 w-3 cursor-pointer text-gray-500 hover:text-gray-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnyStatus(false);
                        }}
                      />
                    </span>
                  ) : fromIds.length === 0 ? (
                    <span className="text-gray-400">Select statuses</span>
                  ) : (
                    fromIds.map((id) => (
                      <span key={id} className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${pillClass(meta(id)?.category)}`}>
                        {meta(id)?.name ?? id}
                        <X
                          className="h-3 w-3 cursor-pointer opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFrom(id);
                          }}
                        />
                      </span>
                    ))
                  )}
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
              {fromOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={anyStatus}
                      onChange={(e) => {
                        setAnyStatus(e.target.checked);
                        if (e.target.checked) setFromIds([]);
                      }}
                    />
                    <span className="text-gray-700">Any status</span>
                  </label>
                  {nodes.map((s) => (
                    <label
                      key={s.statusId}
                      className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${anyStatus ? "opacity-40" : ""}`}
                    >
                      <input
                        type="checkbox"
                        disabled={anyStatus}
                        checked={fromIds.includes(s.statusId)}
                        onChange={() => toggleFrom(s.statusId)}
                      />
                      <StatusPill name={meta(s.statusId)?.name ?? s.statusId} category={meta(s.statusId)?.category} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pb-2 text-gray-400">→</div>

          {/* To status — single-select pill dropdown with a clear button. */}
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">To status</label>
            <div className="relative" ref={toRef}>
              <button
                type="button"
                onClick={() => setToOpen((v) => !v)}
                className="flex min-h-[38px] w-full items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-left text-sm focus:border-accent-500 focus:outline-none"
              >
                <div className="flex-1">
                  {toMeta ? (
                    <StatusPill name={toMeta.name} category={toMeta.category} />
                  ) : (
                    <span className="text-gray-400">Select a status</span>
                  )}
                </div>
                {toStatusId && (
                  <X
                    className="h-4 w-4 shrink-0 cursor-pointer text-gray-400 hover:text-gray-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setToStatusId("");
                    }}
                  />
                )}
                <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
              {toOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {nodes.map((s) => (
                    <button
                      key={s.statusId}
                      type="button"
                      onClick={() => {
                        setToStatusId(s.statusId);
                        setToOpen(false);
                      }}
                      className={`flex w-full items-center px-3 py-1.5 text-left hover:bg-gray-50 ${s.statusId === toStatusId ? "bg-blue-50/60" : ""}`}
                    >
                      <StatusPill name={meta(s.statusId)?.name ?? s.statusId} category={meta(s.statusId)?.category} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name + tip. */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Give your transition a name"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-accent-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            Tip: Name your transition as an action people take to move an issue, like &quot;start work&quot; or &quot;merge&quot;.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canCreate || !name.trim()}
            className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </Shell>
  );
}
