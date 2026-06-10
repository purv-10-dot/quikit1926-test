"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Info,
  Video,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";

interface DocFull {
  id: string;
  title: string;
  content: string;
  projectId: string;
  createdBy: string | null;
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
export function DocEditor({ projectId, docId }: { projectId: string; docId: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocFull | null>(null);
  const [author, setAuthor] = useState<UserLite | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const dirtyRef = useRef(false);
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
        }
        if (s?.user) setAuthor(s.user as UserLite);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [docId]);

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
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void save(), SAVE_DEBOUNCE_MS);
  }

  async function save() {
    if (!dirtyRef.current || !doc) return;
    dirtyRef.current = false;
    setSaving(true);
    try {
      await fetch(`/api/docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current.trim() || "Untitled page",
          content: contentRef.current,
        }),
      });
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
    router.push(`/spaces/${projectId}/docs`);
  }

  /**
   * Pushes an image to S3 via /api/docs/upload and returns the stable
   * proxy URL (/api/docs/asset?key=...) that the editor stores in HTML.
   * Each render the proxy mints a fresh presigned GET, so the URLs in the
   * doc body never expire.
   */
  async function uploadImageToS3(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("projectId", projectId);
    const res = await fetch(`/api/docs/upload`, { method: "POST", body: fd });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) {
      throw new Error(j?.error || `Upload failed (${res.status})`);
    }
    return j.data.url as string;
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
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-500 mr-1">
              {saving ? "Saving…" : "All changes saved"}
            </span>
            {/* <button
              type="button"
              onClick={() => void save()}
              className="h-8 px-3 text-xs font-medium text-gray-500 bg-gray-100 rounded cursor-default"
              disabled
            >
              Publish
            </button> */}
            <button
              type="button"
              onClick={close}
              className="h-8 px-3 text-xs text-gray-700 hover:bg-gray-100 rounded"
            >
              Close
            </button>
            {/* <button className="p-1.5 rounded hover:bg-gray-100 text-gray-500" aria-label="More">
              <MoreHorizontal className="h-4 w-4" />
            </button> */}
            <button
              type="button"
              onClick={() => setMaximized((v) => !v)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              aria-label={maximized ? "Restore" : "Maximize"}
            >
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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
              value={content}
              mentions={mentions}
              onChange={(html) => {
                setContent(html);
                scheduleSave();
              }}
              uploadImage={uploadImageToS3}
              placeholder="Did you know you can add all kinds of cool things to this page, like a table of contents, date, or roadmap. Type / to open a list."
              slotBetween={
                <div className="px-10 pt-6 pb-4">
                  <input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      scheduleSave();
                    }}
                    onBlur={save}
                    placeholder="Give this page a title"
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
