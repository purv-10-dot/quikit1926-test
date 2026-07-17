"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  X,
  Eye,
  MoreHorizontal,
  Maximize2,
  Minimize2,
  Lightbulb,
  Pin,
  Trash2,
} from "lucide-react";
import { PINNED_FIELD_KEYS, IN_VIEW_FIELD_KEYS } from "@/lib/services/discoveryDefaults";
import { K, type FieldDef, type IdeaRow, type IdeaStatus, type IdeaFieldValue } from "./ideas-types";
import { Accordion, FieldRow } from "./idea-panel-fields";
import { EditableCell } from "./editable-cell";
import { iconForColumn, isFormulaColumn } from "./field-icons";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import { uploadProjectImage } from "@/lib/upload-image";
import { IdeaAttachmentsLinks } from "./idea-attachments-links";
import { IdeaComments } from "./idea-comments";
import { IdeaInsights } from "./idea-insights";
import { IdeaDelivery } from "./idea-delivery";

/**
 * Idea detail side panel — matches the real-JPD layout: header (breadcrumb +
 * actions), title, tab strip (Overview/Comments/Insights/Delivery), an editable
 * rich description, and three field accordions (Pinned / Fields in this view /
 * Available fields) plus Automation. Each accordion scrolls internally AND the
 * whole panel scrolls. Field editors live in idea-panel-fields.tsx.
 */

const TABS = ["Overview", "Comments", "Insights", "Delivery"] as const;
type Tab = (typeof TABS)[number];

export function IdeaDetailPanel({
  projectId,
  projectName,
  idea,
  fields,
  statuses,
  initialTab,
  pinnedKeys,
  onTogglePin,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  idea: IdeaRow;
  fields: FieldDef[];
  statuses: IdeaStatus[];
  initialTab?: Tab;
  /** Field keys currently pinned (from the view config). */
  pinnedKeys?: string[];
  /** Toggle a field's pinned state (persisted upstream, admin-gated). */
  onTogglePin?: (key: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, IdeaFieldValue>>(idea.values);
  const [description, setDescription] = useState(idea.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(idea.title);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab ?? "Overview");
  const [width, setWidth] = useState(560);
  const [expanded, setExpanded] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [insightCount, setInsightCount] = useState<number | null>(null);
  const [deliveryCount, setDeliveryCount] = useState<number | null>(null);
  const status = statuses.find((s) => s.id === idea.statusId);

  // Seed the Comments + Insights tab badges with current counts (each tab keeps
  // its own in sync via onCountChange once opened).
  useEffect(() => {
    let alive = true;
    const grab = (kind: string, set: (n: number) => void) =>
      fetch(`/api/projects/${projectId}/ideas/${idea.id}/${kind}`)
        .then((r) => r.json())
        .then((j: { success: boolean; data?: unknown[] }) => { if (alive && j.success && j.data) set(j.data.length); })
        .catch(() => undefined);
    void grab("comments", setCommentCount);
    void grab("insights", setInsightCount);
    // Delivery returns { items, progress } rather than a bare array.
    fetch(`/api/projects/${projectId}/ideas/${idea.id}/delivery`)
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { items?: unknown[] } }) => { if (alive && j.success && j.data?.items) setDeliveryCount(j.data.items.length); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [projectId, idea.id]);

  // Tell the discovery project header to hide while the panel is open — JPD
  // shows only the drawer's own breadcrumb, not the page "Feedback" header.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("qt:idea-panel", { detail: { open: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("qt:idea-panel", { detail: { open: false } }));
    };
  }, []);

  // Drag the panel's LEFT edge to resize (JPD). Clamped to a sensible range.
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    function onMove(ev: MouseEvent) {
      // Dragging left (smaller clientX) widens the panel.
      setWidth(Math.min(760, Math.max(360, startW + (startX - ev.clientX))));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  async function patch(body: Record<string, unknown>): Promise<Record<string, IdeaFieldValue> | null> {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas/${idea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { values?: Record<string, IdeaFieldValue> } };
      await qc.invalidateQueries({ queryKey: ["quiktrack", "ideas", projectId] });
      return json.data?.values ?? null;
    } finally {
      setSaving(false);
    }
  }

  async function save(fieldId: string, value: IdeaFieldValue) {
    setValues((v) => ({ ...v, [fieldId]: value }));
    const fresh = await patch({ values: { [fieldId]: value } });
    if (fresh) setValues(fresh); // includes recomputed Score
  }

  async function saveDescription() {
    setEditingDesc(false);
    if (description === (idea.description ?? "")) return;
    await patch({ description: description || null });
  }

  async function saveTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || t === idea.title) { setTitleDraft(idea.title); return; }
    await patch({ title: t });
  }

  async function deleteIdea() {
    const res = await fetch(`/api/projects/${projectId}/ideas/${idea.id}`, { method: "DELETE" });
    if (res.ok) {
      await qc.invalidateQueries({ queryKey: ["quiktrack", "ideas", projectId] });
      onClose();
    }
  }

  // Partition fields into the JPD sections. Pinned = the view's pinned list (or
  // the defaults). In-view = the rest of the default in-view set. Available = the
  // remainder. Jira-only fields are dropped entirely.
  const JIRA_ONLY = new Set(["atlassian_project", "atlassian_project_status", "team", "linked_items"]);
  const byKey = new Map(fields.map((f) => [f.key, f] as const));
  const pinKeys = pinnedKeys && pinnedKeys.length ? pinnedKeys : PINNED_FIELD_KEYS;
  const pinnedSet = new Set(pinKeys);
  const pinned = pinKeys.map((k) => byKey.get(k)).filter((f): f is FieldDef => !!f && !JIRA_ONLY.has(f.key));
  const inView = IN_VIEW_FIELD_KEYS
    .filter((k) => !pinnedSet.has(k))
    .map((k) => byKey.get(k))
    .filter((f): f is FieldDef => !!f && !JIRA_ONLY.has(f.key));
  const grouped = new Set([...pinKeys, ...IN_VIEW_FIELD_KEYS]);
  const available = fields
    .filter((f) => !grouped.has(f.key) && !JIRA_ONLY.has(f.key))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Description has real (non-empty) content once HTML tags are stripped.
  const descHasContent = description.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

  // Description + action buttons (top of the Overview left column).
  const overviewContent = (
    <>
      <IdeaAttachmentsLinks projectId={projectId} ideaId={idea.id} />
      {editingDesc ? (
        <div>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Add a description…"
            uploadImage={(file) => uploadProjectImage(projectId, file)}
          />
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void saveDescription()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save</button>
            <button type="button" onClick={() => { setDescription(idea.description ?? ""); setEditingDesc(false); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : descHasContent ? (
        <div
          onClick={() => setEditingDesc(true)}
          className="prose prose-sm max-w-none cursor-text rounded p-1 text-sm leading-relaxed text-gray-700 hover:bg-gray-50"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(description) }}
        />
      ) : (
        <button type="button" onClick={() => setEditingDesc(true)} className="text-sm text-gray-400 hover:text-gray-600">
          Add a description… <span className="text-blue-600">or start from a template</span>
        </button>
      )}
    </>
  );

  // One editable field row (JPD): [field icon] label [pin] .... value. Reuses the
  // grid's EditableCell (borderless in read mode, all editors, auto-saves).
  const fieldRow = (f: FieldDef) => {
    const isPinned = pinnedSet.has(f.key);
    const Icon = iconForColumn(f.key, f);
    return (
      <div key={f.id} className="group grid grid-cols-[150px_1fr] items-center gap-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          {isFormulaColumn(f) ? (
            <span className="w-3.5 text-center font-serif text-[12px] italic text-gray-400">fx</span>
          ) : (
            <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
          <span className="truncate">{f.name}</span>
          {onTogglePin && (
            <button
              type="button"
              aria-label={isPinned ? "Unpin field" : "Pin field"}
              title={isPinned ? "Unpin" : "Pin to top"}
              onClick={() => onTogglePin(f.key)}
              className={`shrink-0 rounded p-0.5 ${isPinned ? "text-amber-500" : "text-gray-300 opacity-0 group-hover:opacity-100 hover:text-gray-500"}`}
            >
              <Pin className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
        <div className="min-w-0 text-sm text-gray-800">
          <EditableCell field={f} value={values[f.id] ?? null} onSave={save} />
        </div>
      </div>
    );
  };

  const fieldAccordions = (
    <>
      <Accordion title="Pinned fields">
        {pinned.map(fieldRow)}
        {pinned.length === 0 && <p className="py-1 text-sm text-gray-400">No pinned fields yet.</p>}
      </Accordion>

      <Accordion title="Fields in this view">
        <FieldRow label="Insights"><span className="font-medium text-gray-700">{insightCount ?? 0}</span></FieldRow>
        {inView.map(fieldRow)}
      </Accordion>

      <Accordion title="Available fields">
        {available.map(fieldRow)}
        <SystemRow label="Created" value={new Date(idea.createdAt).toLocaleString()} />
        <SystemRow label="Updated" value={new Date(idea.updatedAt).toLocaleString()} />
        <FieldRow label="Status">
          {status ? (
            <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {status.name.toUpperCase()}
            </span>
          ) : "—"}
        </FieldRow>
      </Accordion>
    </>
  );

  return (
    <aside
      style={expanded ? undefined : { width }}
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col bg-white"
          : "relative flex h-full flex-shrink-0 flex-col border-l border-gray-200 bg-white"
      }
    >
      {/* Left-edge resize handle (drawer mode only). */}
      {!expanded && (
        <div
          onMouseDown={startResize}
          className="group absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize"
        >
          <div className="h-full w-0.5 bg-transparent group-hover:bg-blue-400" />
        </div>
      )}

      {/* Header: breadcrumb + actions */}
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-gray-600">
          <span className="truncate">{projectName ?? "Discovery"}</span>
          <span className="text-gray-300">/</span>
          <Lightbulb className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-gray-700">{idea.key}</span>
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <MoreMenu onDelete={() => void deleteIdea()} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            title={expanded ? "Collapse" : "Expand"}
            className="rounded p-1.5 hover:bg-gray-100"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Title — click to edit (inline). No funnel-status pill here (JPD). */}
      <div className="px-4 pt-3">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleDraft(idea.title); setEditingTitle(false); } }}
            className="w-full rounded border border-blue-400 px-2 py-1 text-xl font-semibold text-gray-900 outline-none"
          />
        ) : (
          <h2
            onClick={() => { setTitleDraft(idea.title); setEditingTitle(true); }}
            title="Click to edit"
            className="cursor-text rounded px-2 py-1 -mx-2 text-xl font-semibold text-gray-900 hover:bg-gray-50"
          >
            {idea.title}
          </h2>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-3 flex items-center gap-4 border-b border-gray-200 px-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`inline-flex items-center gap-1.5 border-b-2 py-2 text-sm ${
              tab === t ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t}
            {t === "Comments" && commentCount ? (
              <span className={`rounded px-1.5 text-xs font-medium ${tab === t ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{commentCount}</span>
            ) : null}
            {t === "Insights" && insightCount ? (
              <span className={`rounded px-1.5 text-xs font-medium ${tab === t ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{insightCount}</span>
            ) : null}
            {t === "Delivery" && deliveryCount ? (
              <span className={`rounded px-1.5 text-xs font-medium ${tab === t ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{deliveryCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Body — one scroll column in drawer mode; in expanded mode the Overview
          tab becomes two columns (content left, field accordions right). */}
      <div className="flex-1 overflow-y-auto">
        {tab === "Overview" ? (
          expanded ? (
            <div className="mx-auto grid max-w-6xl grid-cols-[1fr_360px] gap-6 px-6 py-4">
              <div className="min-w-0 space-y-3">
                {overviewContent}
                <div className="pt-4">
                  <p className="mb-2 text-sm font-semibold text-gray-900">Comments</p>
                  <IdeaComments projectId={projectId} ideaId={idea.id} onCountChange={setCommentCount} />
                </div>
              </div>
              <div className="space-y-3">{fieldAccordions}</div>
            </div>
          ) : (
            <div className="space-y-3 px-4 py-3">
              {overviewContent}
              {fieldAccordions}
            </div>
          )
        ) : (
          <div className="mx-auto max-w-4xl space-y-3 px-4 py-3">
            {tab === "Comments" ? (
              <IdeaComments projectId={projectId} ideaId={idea.id} onCountChange={setCommentCount} />
            ) : tab === "Insights" ? (
              <IdeaInsights projectId={projectId} ideaId={idea.id} onCountChange={setInsightCount} />
            ) : (
              <IdeaDelivery projectId={projectId} ideaId={idea.id} ideaTitle={idea.title} onCountChange={setDeliveryCount} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function SystemRow({ label, value }: { label: string; value: string }) {
  return (
    <FieldRow label={label}>
      <span className="text-gray-700">{value}</span>
    </FieldRow>
  );
}

function IconBtn({ icon: Icon, label }: { icon: typeof Eye; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className="rounded p-1.5 hover:bg-gray-100">
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** The ⋯ header menu — only Delete for now. */
function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" aria-label="More" onClick={() => setOpen((v) => !v)} className={`rounded p-1.5 hover:bg-gray-100 ${open ? "bg-gray-100 text-gray-700" : ""}`}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
            <button
              type="button"
              onClick={() => { setOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

