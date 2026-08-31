"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  Info,
  Video,
  Maximize2,
  Minimize2,
  Share2,
  Lock,
  Globe,
  X,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { getTemplate } from "./templates-meta";
import { applyDocEditToCache } from "./use-docs";
import { ShareDialog } from "./share-dialog";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { uploadProjectImage, uploadProjectFile } from "@/lib/upload-image";

interface DocFull {
  id: string;
  title: string;
  content: string;
  projectId: string;
  createdBy: string | null;
  status?: string;
  shareToken?: string | null;
  shareMode?: string | null;
  /** Effective role of the current user on this doc (from the GET response). */
  role?: "owner" | "editor" | "viewer";
}

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

const SAVE_DEBOUNCE_MS = 800;

/**
 * Doc editor — popup matching the Jira reference: top bar with Write tab on
 * the left and Publish / Close / ⋯ on the right, big title + author byline,
 * the rich-text editor body, and a floating insert-dock at the bottom that
 * lets the user drop in templates and structural elements.
 */
export function DocEditor({
  projectId,
  docId,
  draftTemplateKey,
  draftFolderId,
  standalone,
}: {
  projectId: string;
  /** Present when editing an existing doc. Omitted in draft mode. */
  docId?: string;
  /** Draft mode: open the editor seeded with this template and create the doc
   *  only on first save — so opening a template never leaves an empty doc. */
  draftTemplateKey?: string;
  draftFolderId?: string | null;
  /** Opened from the standalone /docs/[id] route (e.g. a shared user who isn't
   *  a project member). Closing must not route into the project's docs list —
   *  they may have no access to it. */
  standalone?: boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  // A brand-new draft needs Doc:create (project perm). For an existing doc the
  // server returns the caller's effective role (owner/editor/viewer) — which
  // also covers shared users who aren't project members. Editing needs
  // owner/editor; while the role is still loading we stay optimistic so the
  // editor doesn't flash read-only.
  const perms = useMyProjectPermissions(projectId);
  const [docRole, setDocRole] = useState<"owner" | "editor" | "viewer" | null>(null);
  const canEdit = !docId
    ? perms.loading || perms.has("Doc", "create")
    : docRole === null || docRole === "owner" || docRole === "editor";
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const [doc, setDoc] = useState<DocFull | null>(null);
  const [author, setAuthor] = useState<UserLite | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Draft/publish state. New docs (no docId yet) start as drafts.
  const [status, setStatus] = useState<string>("draft");
  const [publishing, setPublishing] = useState(false);
  const dirtyRef = useRef(false);
  // The doc id, which only exists after a draft is first saved. Mutations read
  // this ref so the create→update switch survives the debounced save closure.
  const docIdRef = useRef<string | undefined>(docId);
  // Guards against a second debounced save starting another create while the
  // first POST is still in flight (which would duplicate the doc).
  const creatingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs that always reflect the latest title/content. Without these, the
  // save() closure scheduled by `setTimeout` reads the values from the
  // render where scheduleSave() was called — which is one render BEHIND
  // the change that triggered it, so we'd persist stale HTML (most
  // visibly: image uploads silently dropped).
  const titleRef = useRef("");
  const contentRef = useRef("");
  titleRef.current = title;
  contentRef.current = content;

  useEffect(() => {
    let alive = true;
    setLoading(true);

    // Draft mode: seed the editor from the chosen template in memory — NO doc
    // row is created until the user actually edits (see save()).
    if (!docId) {
      const tpl = getTemplate(draftTemplateKey) ?? getTemplate("blank");
      setDoc({ id: "", title: tpl?.name ?? "", content: tpl?.body ?? "<p></p>", projectId, createdBy: null });
      setTitle(tpl?.name ?? "");
      setContent(tpl?.body ?? "<p></p>");
      fetch(`/api/session`)
        .then((r) => r.json())
        .then((s) => alive && s?.user && setAuthor(s.user as UserLite))
        .catch(() => undefined)
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }

    Promise.all([
      fetch(`/api/docs/${docId}`).then((r) => r.json()),
      fetch(`/api/session`).then((r) => r.json()).catch(() => null),
    ])
      .then(([d, s]) => {
        if (!alive) return;
        if (d?.success) {
          const x = d.data as DocFull;
          setDoc(x);
          setTitle(x.title);
          setContent(x.content || "<p></p>");
          setStatus(x.status ?? "published");
          setDocRole(x.role ?? null);
        }
        if (s?.user) setAuthor(s.user as UserLite);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [docId, draftTemplateKey, projectId]);

  // People list for @-mentions in the doc editor.
  const [mentions, setMentions] = useState<{ id: string; name: string; email?: string }[]>([]);
  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((j) => {
        const list: Array<{ userId: string; user: { firstName: string | null; lastName: string | null; email: string } | null }> =
          Array.isArray(j?.data?.members) ? j.data.members : Array.isArray(j?.data) ? j.data : [];
        setMentions(
          list
            .filter((m) => m.user)
            .map((m) => ({
              id: m.userId,
              name: [m.user!.firstName, m.user!.lastName].filter(Boolean).join(" ").trim() || m.user!.email,
              email: m.user!.email,
            })),
        );
      })
      .catch(() => undefined);
  }, [projectId]);

  function scheduleSave() {
    if (!canEditRef.current) return; // read-only: never persist
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }

  async function save() {
    if (!dirtyRef.current || !doc || !canEditRef.current) return;
    // A create is already running — keep the dirty flag so edits flush via
    // PATCH once it finishes; don't start a second create.
    if (!docIdRef.current && creatingRef.current) return;
    dirtyRef.current = false;
    setSaving(true);
    try {
      const nextTitle = titleRef.current.trim() || "Untitled doc";
      if (!docIdRef.current) {
        // First save of a draft → create the doc now with the edited content.
        creatingRef.current = true;
        try {
          const res = await fetch(`/api/projects/${projectId}/docs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              templateKey: draftTemplateKey ?? "blank",
              folderId: draftFolderId ?? null,
              title: nextTitle,
              content: contentRef.current,
            }),
          }).then((r) => r.json());
          if (res?.success) {
            docIdRef.current = res.data.id;
            // Reflect the real doc URL without remounting the editor.
            window.history.replaceState(null, "", `/spaces/${projectId}/docs/${res.data.id}`);
            // Mark the relevant lists stale so the new doc shows when the user
            // returns to the Docs tab (one refresh, not per-keystroke).
            qc.invalidateQueries({
              queryKey: ["qt-docs", "list", projectId, draftFolderId ?? "root"],
            });
            qc.invalidateQueries({ queryKey: ["qt-docs", "folders", projectId] });
          } else {
            dirtyRef.current = true; // create failed — allow a retry
          }
        } finally {
          creatingRef.current = false;
        }
        // Flush any edits typed while the create was in flight.
        if (docIdRef.current && dirtyRef.current) scheduleSave();
      } else {
        await fetch(`/api/docs/${docIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle, content: contentRef.current }),
        });
        // Reflect the edit in the Docs list cache immediately so going back
        // shows the new title/date without a 60s staleTime wait or refetch.
        applyDocEditToCache(qc, projectId, docIdRef.current, {
          title: nextTitle,
          updatedAt: new Date().toISOString(),
        });
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    // Standalone viewers (shared non-members) can't open the project docs list,
    // so go back / to the app root instead of into the project.
    if (standalone) {
      if (typeof window !== "undefined" && window.history.length > 1) router.back();
      else router.push("/");
      return;
    }
    router.push(`/spaces/${projectId}/docs`);
  }

  // Publish a draft (visible to all project members) or revert to draft
  // (author-only). The doc must be saved first so it has an id.
  async function togglePublish() {
    const id = docIdRef.current;
    if (!id || publishing) return;
    const next = status === "draft" ? "published" : "draft";
    setPublishing(true);
    try {
      const res = await fetch(`/api/docs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      }).then((r) => r.json());
      if (res?.success) {
        setStatus(next);
        // Refresh the Docs list so the Draft badge appears/disappears on return.
        qc.invalidateQueries({ queryKey: ["qt-docs", "list", projectId] });
      }
    } finally {
      setPublishing(false);
    }
  }

  /**
   * Pushes an image to S3 via /api/docs/upload and returns the stable
   * proxy URL (/api/docs/asset?key=...) that the editor stores in HTML.
   * Each render the proxy mints a fresh presigned GET, so the URLs in the
   * doc body never expire.
   */
  // Delegate to the shared uploaders so size validation + the friendly
  // too-large message (see lib/upload-image.ts) are applied here too.
  async function uploadImageToS3(file: File): Promise<string> {
    return uploadProjectImage(projectId, file);
  }

  /**
   * File attachment upload (non-image) — same endpoint as images, but returns
   * the full metadata the editor's file-attachment card needs. Enables the
   * paperclip "Attach file" button in the doc editor.
   */
  async function uploadFileToS3(
    file: File,
  ): Promise<{ url: string; fileName: string; mimeType: string; size: number }> {
    return uploadProjectFile(projectId, file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div
        className={`bg-white rounded-md shadow-xl flex flex-col overflow-hidden ${
          maximized ? "w-full h-full" : "w-full max-w-[1400px] h-full max-h-[92vh]"
        }`}
      >
        {/* Top bar — Write tab on left, Publish/Close/⋯ on right */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 shrink-0">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900">
            <span className="h-4 w-4 rounded bg-purple-500 text-white text-[10px] flex items-center justify-center">
              ✎
            </span>
            Write
          </span>
          <div className="flex items-center gap-2">
            {/* Save status — quiet dot + label, never competes with the actions */}
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-slate-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  !canEdit
                    ? "bg-gray-400 dark:bg-slate-500"
                    : saving
                      ? "bg-amber-500 animate-pulse"
                      : "bg-emerald-500"
                }`}
              />
              {!canEdit ? "View only" : saving ? "Saving" : "Saved"}
            </span>

            {/* Draft ⇄ Published as ONE segmented toggle: the active state is the
                raised segment; clicking the other side switches it. Muted tints
                so it sits quietly in the toolbar. Drafts are author-only, so
                whoever sees a draft is its author and can publish; only the
                author sees an "unpublish" (go-to-draft) affordance. */}
            {(() => {
              const isAuthor = !doc?.createdBy || doc.createdBy === author?.id;
              const draftActive = status === "draft";
              // Can switch TO each side?
              const canGoPublished = canEdit && draftActive && !!docIdRef.current && !publishing;
              const canGoDraft = canEdit && !draftActive && isAuthor && !publishing;
              const seg =
                "inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-[11px] font-semibold uppercase tracking-wide transition-colors";
              return (
                <div
                  role="group"
                  aria-label="Document visibility"
                  className="inline-flex items-center rounded-full bg-gray-100 p-0.5 ring-1 ring-inset ring-gray-200 dark:bg-slate-800 dark:ring-slate-700"
                >
                  <button
                    type="button"
                    onClick={() => canGoDraft && togglePublish()}
                    disabled={!draftActive && !canGoDraft}
                    aria-pressed={draftActive}
                    title={
                      draftActive
                        ? "Only you can see this draft"
                        : isAuthor
                          ? "Revert to draft — hide from other members"
                          : "Only the author can change this"
                    }
                    className={`${seg} ${
                      draftActive
                        ? "bg-white text-amber-700 shadow-sm dark:bg-slate-700 dark:text-amber-300"
                        : "text-gray-400 hover:text-gray-600 disabled:opacity-40 dark:text-slate-500 dark:hover:text-slate-300"
                    }`}
                  >
                    <Lock className="h-3 w-3" />
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => canGoPublished && togglePublish()}
                    disabled={draftActive && !canGoPublished}
                    aria-pressed={!draftActive}
                    title={
                      !draftActive
                        ? "Visible to all project members"
                        : docIdRef.current
                          ? "Publish — make this visible to all project members"
                          : "Save the doc first to publish it"
                    }
                    className={`${seg} ${
                      !draftActive
                        ? "bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300"
                        : "text-gray-400 hover:text-gray-600 disabled:opacity-40 dark:text-slate-500 dark:hover:text-slate-300"
                    }`}
                  >
                    <Globe className="h-3 w-3" />
                    {publishing ? "…" : "Published"}
                  </button>
                </div>
              );
            })()}

            <span className="h-5 w-px bg-gray-200 dark:bg-slate-700" />

            {/* Share — quiet outline button so Publish stays the hero action */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShareOpen((v) => !v)}
                disabled={!docIdRef.current}
                title={docIdRef.current ? "Share" : "Save the doc first to share it"}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/60"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
              {shareOpen && docIdRef.current && (
                <ShareDialog
                  docId={docIdRef.current}
                  onClose={() => setShareOpen(false)}
                />
              )}
            </div>

            {/* Window controls — quiet ghost icons */}
            <button
              type="button"
              onClick={() => setMaximized((v) => !v)}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              aria-label="Close"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto relative">
          {loading ? (
            <SkeletonBody />
          ) : !doc ? (
            <div className="px-10 py-8 text-sm text-gray-500">Document not found.</div>
          ) : (
            <RichTextEditor
              chromeless
              disabled={!canEdit}
              value={content}
              mentions={mentions}
              onChange={(html) => {
                setContent(html);
                scheduleSave();
              }}
              uploadImage={uploadImageToS3}
              uploadFile={uploadFileToS3}
              placeholder="Did you know you can add all kinds of cool things to this doc, like a table of contents, date, or roadmap. Type / to open a list."
              slotBetween={
                <div className="px-10 pt-6 pb-4">
                  <input
                    value={title}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      scheduleSave();
                    }}
                    onBlur={save}
                    placeholder="Give this doc a title"
                    className="w-full text-3xl font-bold text-gray-900 bg-transparent focus:outline-none placeholder:text-gray-300"
                  />
                  <ByLine user={author} />
                </div>
              }
            />
          )}

          {/* Bottom floating insert dock */}
          {/* Right-edge icon rail */}
          {/* <div className="absolute right-3 bottom-24 flex flex-col gap-2 text-gray-500">
            <button className="p-2 rounded-full bg-white border border-gray-200 hover:bg-gray-50" aria-label="Info">
              <Info className="h-4 w-4" />
            </button>
            <button className="p-2 rounded-full bg-white border border-gray-200 hover:bg-gray-50" aria-label="Loom">
              <Video className="h-4 w-4" />
            </button>
          </div> */}
        </div>
      </div>
    </div>
  );
}

function ByLine({ user }: { user: UserLite | null }) {
  const name = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "User"
    : "User";
  const initial = (name[0] ?? "U").toUpperCase();
  return (
    <div className="flex items-center gap-2 mt-3 text-xs text-gray-600">
      <span className="h-5 w-5 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
        {initial}
      </span>
      <span>
        By <span className="text-blue-700 hover:underline">{name}</span>
      </span>
    </div>
  );
}

function SkeletonBody() {
  return (
    <div className="px-10 py-8">
      <div className="h-9 w-2/3 rounded bg-gray-200 animate-pulse mb-2" />
      <div className="h-3 w-32 rounded bg-gray-100 animate-pulse mb-8" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-3 rounded bg-gray-100 animate-pulse my-2" />
      ))}
    </div>
  );
}
