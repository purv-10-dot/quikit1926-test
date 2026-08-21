"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { uploadProjectImage } from "@/lib/upload-image";
import { CreateIssueModal } from "@/components/create-issue-modal";
import { SpacePicker, type SpaceOption } from "./space-picker";

/**
 * Create modal for discovery views. Space is a searchable picker of ALL projects.
 * - Selected space is DISCOVERY → simple idea form (Summary + Description).
 * - Selected space is anything else → hand off to the standard Create Task modal
 *   for that project (kept modular; this component just dispatches).
 */
export function CreateIdeaModal({
  projectId,
  projectName,
  onCreated,
  onClose,
}: {
  projectId: string;
  projectName: string;
  onCreated: () => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<SpaceOption[]>([]);
  const [selectedId, setSelectedId] = useState(projectId);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load ALL projects for the Space picker.
  useEffect(() => {
    let alive = true;
    fetch(`/api/projects?pageSize=200&sort=name&order=asc`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const list = (j?.data ?? []) as SpaceOption[];
        setProjects(list);
        // Default the space to the current project, else the first one.
        // `cur` (the URL segment) may be a project KEY rather than a cuid —
        // the URL is canonicalized to /spaces/<KEY>/… — so match on either the
        // id or the projectKey and normalize to the resolved cuid. Without this,
        // a key wouldn't match any p.id and we'd wrongly fall back to list[0].
        setSelectedId((cur) => {
          const match = cur ? list.find((p) => p.id === cur || p.projectKey === cur) : undefined;
          return match?.id ?? list[0]?.id ?? cur;
        });
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // Resolve the selected project's TYPE deterministically by id (not via the
  // list, which can lag/paginate). Cached per id. This drives idea-form vs Task.
  const [typeById, setTypeById] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!selectedId || typeById[selectedId] !== undefined) return;
    let alive = true;
    fetch(`/api/projects/${selectedId}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setTypeById((m) => ({ ...m, [selectedId]: j?.data?.projectType ?? "other" })); })
      .catch(() => { if (alive) setTypeById((m) => ({ ...m, [selectedId]: "other" })); });
    return () => { alive = false; };
  }, [selectedId, typeById]);

  const selected = projects.find((p) => p.id === selectedId);
  const resolvedType = typeById[selectedId];
  const typeKnown = resolvedType !== undefined;
  const isDiscovery = resolvedType === "discovery";

  const summaryEmpty = summary.trim().length === 0;
  const descPlain = description.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

  async function create() {
    setTouched(true);
    if (summaryEmpty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${selectedId}/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: summary.trim(), ...(descPlain ? { description } : {}) }),
      });
      const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !j?.success) { setError(j?.error ?? "Couldn’t create idea"); return; }
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // Non-discovery space chosen → use the standard Create Task modal (its own
  // Project dropdown lets the user switch further). Decide only once the selected
  // project's type is known (fetched by id) so we never flash the wrong form.
  if (typeKnown && !isDiscovery) {
    return (
      <CreateIssueModal
        open
        onClose={onClose}
        initialProjectId={selectedId}
        onProjectChange={setSelectedId}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/30 p-6" onMouseDown={onClose}>
      <div className="mt-10 w-full max-w-2xl rounded-lg bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Create</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Space picker — switch which project the idea is created in. */}
          <label className="mb-1 block text-sm font-medium text-gray-700">Space</label>
          <div className="mb-4">
            {projects.length === 0 ? (
              <div className="flex items-center gap-2 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">💡 {projectName}</div>
            ) : (
              <SpacePicker options={projects} value={selectedId} onChange={setSelectedId} />
            )}
          </div>

          {/* Summary (required) */}
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Summary <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void create(); }}
            className={`w-full rounded border px-3 py-2 text-sm outline-none focus:border-blue-400 ${touched && summaryEmpty ? "border-red-500" : "border-gray-300"}`}
          />
          {touched && summaryEmpty && <p className="mt-1 text-xs text-red-600">Summary is required</p>}

          {/* Description */}
          <label className="mb-1 mt-4 block text-sm font-medium text-gray-700">Description</label>
          <RichTextEditor value={description} onChange={setDescription} placeholder="Add a description…" uploadImage={(file) => uploadProjectImage(selectedId, file)} />

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
