"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus, X, Link2, ChevronDown, ChevronRight, Unlink } from "lucide-react";
import { showToast } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import { PortalDropdown } from "../../_shared/portal-dropdown";
import { RELATED_WORK_TEMPLATES, RELATED_WORK_CATEGORIES } from "./related-work-templates";
import { AddWorkItemsModal } from "./add-work-items-modal";
import { CreateReleaseNotesModal } from "./create-release-notes-modal";
import { EditIssueModal } from "@/components/edit-issue-modal";
import type { ReleaseRelatedLink } from "./release-detail-meta";

export function RelatedWorkSection({
  projectId,
  releaseId,
  links,
  canEdit,
  onChanged,
}: {
  projectId: string;
  releaseId: string;
  links: ReleaseRelatedLink[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [sectionOpen, setSectionOpen] = useState(true);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [notesLinkId, setNotesLinkId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerMenuRef = useRef<HTMLDivElement>(null);
  const [pickerRect, setPickerRect] = useState<{ left: number; top: number } | null>(null);
  const [activeTab, setActiveTab] = useState<string>("All");
  // Which placeholder card's own "Link work item" button opened the picker —
  // that card is the one that gets issueId set (no separate row is created).
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);

  const tabs = useMemo(() => {
    const seen = new Set<string>();
    for (const l of links) {
      if (l.type?.trim()) seen.add(l.type.trim());
    }
    return ["All", ...Array.from(seen).sort()];
  }, [links]);

  const visibleLinks = activeTab === "All" ? links : links.filter((l) => l.type?.trim() === activeTab);

  const measurePicker = () => {
    const el = pickerTriggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPickerRect({ left: r.right - 256, top: r.bottom + 4 });
  };
  useLayoutEffect(() => { if (pickerOpen) measurePicker(); }, [pickerOpen]);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pickerTriggerRef.current?.contains(t) || pickerMenuRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    const reposition = () => measurePicker();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [pickerOpen]);

  async function createLink(body: { title: string; url?: string; type?: string }) {
    const res = await fetch(`/api/releases/${releaseId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (!res?.success) {
      showToast(res?.error || "Couldn't add the link.", "error");
      return;
    }
    onChanged();
  }

  function addFreeform() {
    setPickerOpen(false);
    // A blank placeholder card — RelatedWorkRow opens it expanded (no url
    // yet) so Title/Link/Category are editable there, same flow as picking
    // a named template.
    void createLink({ title: "Untitled item" });
  }

  function addFromTemplate(name: string, category: string) {
    setPickerOpen(false);
    void createLink({ title: name, type: category });
  }

  /** Returns whether the update succeeded, so the row can keep the draft
   * input (rather than silently discarding it) on a rejected request. */
  async function patchLink(linkId: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/releases/${releaseId}/links/${linkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (res?.success) {
      onChanged();
      return true;
    }
    showToast(res?.error || "Couldn't update related work.", "error");
    return false;
  }

  async function removeLink(linkId: string) {
    const ok = await confirmDialog({
      title: "Remove related work",
      message: "Remove this item from the release?",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/releases/${releaseId}/links?linkId=${linkId}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res?.success) onChanged();
    else showToast(res?.error || "Couldn't remove the item.", "error");
  }

  /** Converts a placeholder related-work card into a real, tracked work item:
   * creates a QtIssue titled after the card, links it to this release via
   * the normal issues endpoint, then drops the placeholder link row. */
  async function createWorkItemFromLink(link: ReleaseRelatedLink) {
    const created = await fetch("/api/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: link.title }),
    }).then((r) => r.json());
    if (!created?.success) {
      showToast(created?.error || "Couldn't create the work item.", "error");
      return;
    }
    const linked = await fetch(`/api/releases/${releaseId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueIds: [created.data.id] }),
    }).then((r) => r.json());
    if (!linked?.success) {
      showToast(linked?.error || "Work item created, but couldn't link it to the release.", "error");
      return;
    }
    await fetch(`/api/releases/${releaseId}/links?linkId=${link.id}`, { method: "DELETE" }).catch(() => undefined);
    onChanged();
  }

  /** "Link work item" — attaches the picked issue to the SAME card that
   * opened the picker (sets its issueId in place), rather than creating a
   * separate row. */
  async function linkWorkItem(issueIds: string[]): Promise<boolean> {
    const issueId = issueIds[0];
    if (!issueId || !linkTargetId) return false;
    const res = await fetch(`/api/releases/${releaseId}/links/link-work-item`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, linkId: linkTargetId }),
    }).then((r) => r.json());
    if (!res?.success) {
      showToast(res?.error || "Couldn't link the work item.", "error");
      return false;
    }
    return true;
  }

  async function unlinkWorkItem(link: ReleaseRelatedLink) {
    const ok = await confirmDialog({
      title: `Unlink ${link.issue?.key ?? "work item"}?`,
      message: "You can always link it again later.",
      confirmText: "Unlink",
    });
    if (!ok) return;
    const res = await fetch(`/api/releases/${releaseId}/links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: null }),
    }).then((r) => r.json());
    if (res?.success) onChanged();
    else showToast(res?.error || "Couldn't unlink the work item.", "error");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setSectionOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {sectionOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Related work <span className="text-gray-400 font-normal">{links.length}</span>
        </button>
        {canEdit && (
          <>
            <button
              ref={pickerTriggerRef}
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="p-1 hover:bg-gray-100 rounded text-gray-500"
              aria-label="Add related work"
            >
              <Plus className="h-4 w-4" />
            </button>
            {pickerOpen &&
              pickerRect &&
              createPortal(
                <div
                  ref={pickerMenuRef}
                  style={{ position: "fixed", left: pickerRect.left, top: pickerRect.top, zIndex: 60, width: 256 }}
                  className="max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={addFreeform}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                  >
                    <Link2 className="h-4 w-4 text-gray-500" />
                    Add item
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  <div className="px-3 pt-1 pb-1 text-[11px] font-semibold text-gray-500 uppercase">
                    Add items to complete later
                  </div>
                  {RELATED_WORK_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => addFromTemplate(t.name, t.category)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left hover:bg-gray-50"
                    >
                      <t.Icon className={`h-4 w-4 shrink-0 ${t.iconClassName}`} />
                      <span>
                        <span className="block text-gray-800">{t.name}</span>
                        <span className="block text-xs text-gray-500">{t.category}</span>
                      </span>
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </>
        )}
      </div>

      {sectionOpen && (
        <>
          {tabs.length > 1 && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 flex-wrap">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTab(t)}
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-medium ${
                    t === activeTab ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t}
                  <span className="text-[10px] opacity-70">
                    {t === "All" ? links.length : links.filter((l) => l.type?.trim() === t).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {visibleLinks.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <FileText className="mx-auto h-6 w-6 text-gray-300" />
              <div className="mt-2 text-sm font-medium text-gray-700">
                {links.length === 0 ? "Start adding some related work" : "No related work in this category"}
              </div>
              {links.length === 0 && (
                <div className="text-xs text-gray-400">
                  Add the work that&apos;s needed to get ready for your release, like designs, release notes, or dashboards.
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {visibleLinks.map((l) => (
                <RelatedWorkRow
                  key={l.id}
                  link={l}
                  canEdit={canEdit}
                  onPatch={(body) => patchLink(l.id, body)}
                  onRemove={() => void removeLink(l.id)}
                  onLinkWorkItem={() => {
                    setLinkTargetId(l.id);
                    setPickerOpen(false);
                  }}
                  onCreateWorkItem={() => void createWorkItemFromLink(l)}
                  onUnlink={() => void unlinkWorkItem(l)}
                  onOpenIssue={() => l.issueId && setEditingIssueId(l.issueId)}
                  onOpenNotes={() => l.noteBody !== null && setNotesLinkId(l.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AddWorkItemsModal
        open={linkTargetId !== null}
        onClose={() => setLinkTargetId(null)}
        projectId={projectId}
        releaseId={releaseId}
        excludeIds={links.filter((l) => l.issueId).map((l) => l.issueId!)}
        onAdded={onChanged}
        title="Link work item"
        singleSelect
        onSave={linkWorkItem}
      />

      <EditIssueModal
        open={editingIssueId !== null}
        issueId={editingIssueId}
        projectId={projectId}
        onClose={() => setEditingIssueId(null)}
        onSaved={onChanged}
      />

      <CreateReleaseNotesModal
        open={notesLinkId !== null}
        onClose={() => setNotesLinkId(null)}
        releaseId={releaseId}
        existingLinkId={notesLinkId}
        onSaved={onChanged}
      />
    </div>
  );
}

/** Normalizes a user-typed URL: bare "example.com" / "www.foo.com" gets an
 * `https://` prefix (matching common URL-field UX); returns null when the
 * result still isn't a valid absolute URL, so the caller can show an inline
 * error instead of round-tripping to the server for something the client can
 * already tell is wrong. */
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return null;
  }
}

function RelatedWorkRow({
  link,
  canEdit,
  onPatch,
  onRemove,
  onLinkWorkItem,
  onCreateWorkItem,
  onUnlink,
  onOpenIssue,
  onOpenNotes,
}: {
  link: ReleaseRelatedLink;
  canEdit: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onRemove: () => void;
  onLinkWorkItem: () => void;
  onCreateWorkItem: () => void;
  onUnlink: () => void;
  onOpenIssue: () => void;
  onOpenNotes: () => void;
}) {
  const isNotes = link.noteBody !== null;
  const isPlaceholder = !link.url && !link.issue && !isNotes;
  const [expanded, setExpanded] = useState(isPlaceholder);
  const [titleDraft, setTitleDraft] = useState(link.title);
  const [urlDraft, setUrlDraft] = useState(link.url ?? "");
  const [typeDraft, setTypeDraft] = useState(link.type ?? "");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveForm() {
    if (saving) return;
    const t = titleDraft.trim();
    if (!t) {
      setUrlError("Title is required.");
      return;
    }
    const normalized = urlDraft.trim() ? normalizeUrl(urlDraft) : null;
    if (urlDraft.trim() && !normalized) {
      setUrlError("Enter a valid URL, e.g. https://example.com");
      return;
    }
    setUrlError(null);
    setSaving(true);
    try {
      const ok = await onPatch({
        title: t,
        url: normalized,
        type: typeDraft.trim() || null,
      });
      if (ok) setExpanded(false);
      else setUrlError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group px-4 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (isNotes ? onOpenNotes() : setExpanded((v) => !v))}
          className="flex items-center gap-2.5 min-w-0 text-left flex-1"
        >
          <FileText className="h-4 w-4 shrink-0 text-blue-500" />
          <div className="min-w-0">
            {isNotes ? (
              <span className="block text-sm text-gray-900 hover:text-blue-700 hover:underline truncate">
                {link.title}
              </span>
            ) : link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block text-sm text-gray-900 hover:text-blue-700 hover:underline truncate"
              >
                {link.title}
              </a>
            ) : (
              <span className="block text-sm text-gray-900 truncate">{link.title}</span>
            )}
            {link.type && <span className="block text-xs text-gray-500 truncate">{link.type}</span>}
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {link.issue && (
            <>
              <button
                type="button"
                onClick={onOpenIssue}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200"
                title={`${link.issue.key} ${link.issue.title}`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: link.issue.status.color ?? "#9ca3af" }} />
                {link.issue.status.name}
              </button>
              {link.issue.assignee ? (
                <button
                  type="button"
                  onClick={onOpenIssue}
                  title={
                    [link.issue.assignee.firstName, link.issue.assignee.lastName].filter(Boolean).join(" ").trim() ||
                    link.issue.assignee.email
                  }
                  className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center"
                >
                  {(link.issue.assignee.firstName?.[0] ?? link.issue.assignee.email[0] ?? "?").toUpperCase()}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenIssue}
                  title="Unassigned"
                  className="h-6 w-6 rounded-full bg-gray-100 border border-dashed border-gray-300"
                />
              )}
            </>
          )}

          {canEdit && (
            <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              {isNotes ? (
                <button type="button" onClick={onOpenNotes} className="text-xs font-medium text-blue-600 hover:underline">
                  Open
                </button>
              ) : link.issue ? (
                <button type="button" onClick={onUnlink} className="text-xs font-medium text-blue-600 hover:underline">
                  Unlink
                </button>
              ) : (
                <>
                  <button type="button" onClick={onCreateWorkItem} className="text-xs font-medium text-blue-600 hover:underline">
                    Create work item
                  </button>
                  <button type="button" onClick={onLinkWorkItem} className="text-xs font-medium text-blue-600 hover:underline">
                    Link work item
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onRemove}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600"
                aria-label="Remove item"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && canEdit && !link.issue && !isNotes && (
        <div className="mt-2 ml-6 space-y-3 rounded-md border border-gray-200 bg-gray-50/60 p-3">
          <div className="text-[11px] text-gray-500">
            Required fields are marked with an asterisk <span className="text-red-500">*</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link</label>
            <input
              value={urlDraft}
              onChange={(e) => {
                setUrlDraft(e.target.value);
                if (urlError) setUrlError(null);
              }}
              placeholder="https://…"
              className={`w-full h-8 px-2 text-sm border rounded focus:outline-none focus:ring-2 ${
                urlError ? "border-red-400 focus:ring-red-300" : "border-gray-300 focus:ring-blue-500"
              }`}
            />
            {urlError && <div className="mt-1 text-xs text-red-600">{urlError}</div>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <PortalDropdown
              placeholder="Choose a category"
              options={RELATED_WORK_CATEGORIES.map((c) => ({ value: c, label: c }))}
              selected={typeDraft ? [typeDraft] : []}
              onChange={(next) => setTypeDraft(next[0] ?? "")}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!titleDraft.trim() || saving}
              onClick={() => void saveForm()}
              className="h-8 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="h-8 px-3 text-xs text-gray-700 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
