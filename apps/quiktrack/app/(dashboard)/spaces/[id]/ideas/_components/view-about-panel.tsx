"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Pencil, MessageSquare } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { sanitizeRichText } from "@/lib/sanitize";
import { uploadProjectImage } from "@/lib/upload-image";

interface ViewComment {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  createdBy: string | null;
}

/** Short relative time ("just now", "5m", "3h", "2d") else a date. */
function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 604800) return `${Math.round(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function isBlankHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

/**
 * JPD "All ideas" About/Comments drawer, opened by clicking the view-description
 * line. About = a rich-text view description (editable + persisted to the view
 * config). Comments = real view-level comments (own model/API).
 */
export function ViewAboutPanel({
  projectId,
  viewId,
  viewTitle,
  description,
  canEdit,
  onSaveDescription,
  onClose,
}: {
  projectId: string;
  viewId: string | null;
  viewTitle: string;
  description: string;
  canEdit: boolean;
  onSaveDescription: (html: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const currentUserName = session?.user?.name || session?.user?.email || "You";
  const currentUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const [tab, setTab] = useState<"About" | "Comments">("About");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description);
  const [busy, setBusy] = useState(false);

  // Comments state.
  const [comments, setComments] = useState<ViewComment[]>([]);
  const [composer, setComposer] = useState("");
  const [composing, setComposing] = useState(false); // composer expanded to editor
  const [posting, setPosting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => { setDraft(description); }, [description]);

  useEffect(() => {
    if (tab !== "Comments" || !viewId) return;
    let alive = true;
    fetch(`/api/projects/${projectId}/ideas/views/${viewId}/comments`)
      .then((r) => r.json() as Promise<{ success: boolean; data?: ViewComment[] }>)
      .then((j) => { if (alive && j.success && j.data) setComments(j.data); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [tab, viewId, projectId]);

  async function saveDesc() {
    setBusy(true);
    try { await onSaveDescription(draft); setEditing(false); } finally { setBusy(false); }
  }

  const commentEmpty = isBlankHtml(composer);

  async function postComment() {
    if (commentEmpty || !viewId || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ideas/views/${viewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: composer }),
      });
      const j = (await res.json()) as { success: boolean; data?: ViewComment };
      if (res.ok && j.success && j.data) {
        setComments((c) => [...c, { ...j.data!, authorName: currentUserName, createdBy: currentUserId }]);
        setComposer(""); setComposing(false);
      }
    } finally { setPosting(false); }
  }

  async function saveEdit(id: string) {
    if (isBlankHtml(editDraft) || !viewId) { setEditId(null); return; }
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${viewId}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editDraft }),
    });
    if (res.ok) setComments((cs) => cs.map((c) => (c.id === id ? { ...c, body: editDraft } : c)));
    setEditId(null);
  }

  async function deleteComment(id: string) {
    if (!viewId) return;
    const res = await fetch(`/api/projects/${projectId}/ideas/views/${viewId}/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((cs) => cs.filter((c) => c.id !== id));
  }

  const hasDesc = sanitizeRichText(description).replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <aside className="fixed inset-y-0 right-0 z-[55] flex w-[440px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between px-4 pt-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><span>👋</span> {viewTitle}</h3>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="mx-4 mt-3 grid grid-cols-2 rounded-md border border-gray-200 p-0.5 text-sm">
        {(["About", "Comments"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex items-center justify-center gap-1.5 rounded px-3 py-1 font-medium ${tab === t ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            {t}
            {t === "Comments" && comments.length > 0 && (
              <span className="rounded bg-gray-200 px-1.5 text-[11px] font-semibold text-gray-600">{comments.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "About" ? (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">About</p>
              {canEdit && !editing && (
                <button type="button" onClick={() => { setDraft(description); setEditing(true); }} aria-label="Edit description" className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {editing ? (
              <div>
                <RichTextEditor value={draft} onChange={setDraft} placeholder="Describe this view…" uploadImage={(file) => uploadProjectImage(projectId, file)} />
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => void saveDesc()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => { setDraft(description); setEditing(false); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                </div>
              </div>
            ) : hasDesc ? (
              <div className="prose prose-sm max-w-none text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: sanitizeRichText(description) }} />
            ) : (
              <p className="text-sm text-gray-400">{canEdit ? "Add a description for this view." : "No description yet."}</p>
            )}
          </>
        ) : (
          <>
            {/* Composer: collapsed single-line input; expands to the rich editor
                on focus (JPD). */}
            {viewId && (
              <div className="mb-5 flex items-start gap-2">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-600 text-xs font-medium text-white">
                  {currentUserName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  {composing ? (
                    <>
                      <RichTextEditor value={composer} onChange={setComposer} placeholder="Create a comment" uploadImage={(file) => uploadProjectImage(projectId, file)} />
                      <div className="mt-2 flex items-center gap-2">
                        <button type="button" disabled={commentEmpty || posting} onClick={() => void postComment()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Create</button>
                        <button type="button" onClick={() => { setComposer(""); setComposing(false); }} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setComposing(true)} className="w-full rounded border border-gray-300 px-3 py-2 text-left text-sm text-gray-400 hover:border-gray-400">
                      Create a comment
                    </button>
                  )}
                </div>
              </div>
            )}
            {comments.length === 0 ? (
              <div className="mt-8 flex flex-col items-center text-center">
                <MessageSquare className="h-8 w-8 text-blue-300" />
                <p className="mt-2 max-w-[16rem] text-sm text-gray-500">Create comments to discuss, ask questions and share opinions about this view.</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {comments.map((c) => {
                  const mine = !!currentUserId && c.createdBy === currentUserId;
                  return (
                    <li key={c.id} className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-600 text-xs font-medium text-white">{c.authorName.charAt(0).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-800">{c.authorName}</span>
                          <span className="text-gray-400">{relTime(c.createdAt)}</span>
                        </div>
                        {editId === c.id ? (
                          <div className="mt-1">
                            <RichTextEditor value={editDraft} onChange={setEditDraft} placeholder="Edit comment" uploadImage={(file) => uploadProjectImage(projectId, file)} />
                            <div className="mt-2 flex items-center gap-2">
                              <button type="button" onClick={() => void saveEdit(c.id)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Save</button>
                              <button type="button" onClick={() => setEditId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="prose prose-sm mt-0.5 max-w-none text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: sanitizeRichText(c.body) }} />
                            {mine && (
                              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                <button type="button" onClick={() => { setEditId(c.id); setEditDraft(c.body); }} className="hover:text-gray-700 hover:underline">Edit</button>
                                <span className="text-gray-300">·</span>
                                <button type="button" onClick={() => void deleteComment(c.id)} className="hover:text-red-600 hover:underline">Delete</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
