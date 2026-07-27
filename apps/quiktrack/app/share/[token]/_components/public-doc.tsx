"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Eye, Pencil } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { RichTextView } from "@/components/rich-text-view";
import { sanitizeRichText } from "@/lib/sanitize";

interface SharedDoc {
  id: string;
  title: string;
  content: string;
  shareMode: "view" | "edit";
}

const SAVE_DEBOUNCE_MS = 800;

type Status = "loading" | "ready" | "missing";

/**
 * Public, no-login renderer for a shared doc. View mode renders the stored HTML
 * read-only via `.qt-rich-content`; edit mode mounts the rich-text editor and
 * autosaves through the public PATCH endpoint. Image uploads fall back to
 * inline data URLs (no auth needed). The link is revocable — if the code no
 * longer maps to a doc, we show an unavailable state.
 */
export function PublicDoc({
  token,
  initialDoc,
}: {
  token: string;
  initialDoc?: SharedDoc;
}) {
  const [doc, setDoc] = useState<SharedDoc | null>(initialDoc ?? null);
  const [status, setStatus] = useState<Status>(initialDoc ? "ready" : "loading");
  const [title, setTitle] = useState(initialDoc?.title ?? "");
  const [content, setContent] = useState(initialDoc?.content || (initialDoc ? "<p></p>" : ""));
  const [saving, setSaving] = useState(false);

  const dirtyRef = useRef(false);
  const titleRef = useRef("");
  const contentRef = useRef("");
  titleRef.current = title;
  contentRef.current = content;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Seeded from the server (edit mode) — no need to refetch.
    if (initialDoc) return;
    let alive = true;
    fetch(`/api/docs/share/${token}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.success) {
          const d = j.data as SharedDoc;
          setDoc(d);
          setTitle(d.title);
          setContent(d.content || "<p></p>");
          setStatus("ready");
        } else {
          setStatus("missing");
        }
      })
      .catch(() => alive && setStatus("missing"));
    return () => {
      alive = false;
    };
    // initialDoc is set once at mount; refetch is keyed on token only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function scheduleSave() {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }

  async function save() {
    if (!dirtyRef.current || doc?.shareMode !== "edit") return;
    dirtyRef.current = false;
    setSaving(true);
    try {
      await fetch(`/api/docs/share/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current.trim() || "Untitled doc",
          content: contentRef.current,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  // Flush a pending save on unmount.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (status === "missing" || !doc) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 px-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            This link is no longer available
          </h1>
          <p className="text-sm text-gray-500">
            The shared document may have been unshared or removed.
          </p>
        </div>
      </div>
    );
  }

  const canEdit = doc.shareMode === "edit";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <span className="h-5 w-5 rounded bg-blue-600 text-white text-[11px] grid place-items-center">
            Q
          </span>
          QuikTrack
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          {canEdit ? (
            <>
              <Pencil className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Editing — changes save automatically"}
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" />
              View only
            </>
          )}
        </span>
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-[860px] px-5 py-8">
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {canEdit ? (
            <RichTextEditor
              chromeless
              value={content}
              onChange={(html) => {
                setContent(html);
                scheduleSave();
              }}
              placeholder="Type / for commands…"
              slotBetween={
                <div className="px-10 pt-8 pb-3">
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      scheduleSave();
                    }}
                    onBlur={save}
                    placeholder="Give this doc a title"
                    className="w-full text-3xl font-bold text-gray-900 bg-transparent focus:outline-none placeholder:text-gray-300"
                  />
                </div>
              }
            />
          ) : (
            <div className="px-10 py-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-6">{title || "Untitled doc"}</h1>
              {/* Read-only render via the shared TipTap view so file-attachment
                  cards (and all rich content) render identically to the editor. */}
              <div className="qt-rich-content">
                <RichTextView html={sanitizeRichText(content)} />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
