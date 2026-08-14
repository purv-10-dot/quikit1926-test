"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownNarrowWide, X, ChevronDown, ChevronRight, Bot } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor-lazy";
import { RichTextView } from "@/components/rich-text-view";
import { uploadProjectImage, uploadProjectFile } from "@/lib/upload-image";
import { sanitizeRichText } from "@/lib/sanitize";
import type { MentionItem } from "@/components/editor/mention";
import { SkeletonList } from "@/components/skeleton";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { parseClockToHours, formatHoursAsClock } from "@/lib/utils/timesheetPeriod";

type Tab = "all" | "comments" | "history" | "worklog";

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar?: string | null;
}

interface Comment {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  actorType?: string;
  user: User | null;
}

interface HistoryRow {
  id: string;
  userId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  actorType?: string;
  user: User | null;
}

/** Small marker shown next to a human name when the change/comment came from
 * an MCP-authenticated tool rather than someone at the keyboard. */
function AutomatedBadge() {
  return (
    <span
      title="Automated via MCP"
      className="inline-flex items-center justify-center h-4 w-4 rounded bg-gray-100 text-gray-500 shrink-0"
    >
      <Bot className="h-3 w-3" />
    </span>
  );
}

interface WorkLogRow {
  id: string;
  userId: string;
  entryDate: string;
  hours: number;
  description: string | null;
  user: User | null;
}

const REACTION_SHORTCUTS: { emoji: string; label: string }[] = [
  { emoji: "🎉", label: "Looks good!" },
  { emoji: "👋", label: "Need help?" },
  { emoji: "⛔", label: "This is blocked..." },
  { emoji: "🔍", label: "Can you clarify...?" },
  { emoji: "✅", label: "This is done." },
];

function userName(u: User | null): string {
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}
function userInitials(u: User | null): string {
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  return (u.email?.charAt(0) ?? "?").toUpperCase();
}
function userColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0m";
  const minutes = Math.round(hours * 60);
  const d = Math.floor(minutes / (8 * 60));
  const remH = Math.floor((minutes - d * 8 * 60) / 60);
  const remM = minutes - d * 8 * 60 - remH * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (remH) parts.push(`${remH}h`);
  if (remM) parts.push(`${remM}m`);
  return parts.join(" ") || "0m";
}

/**
 * Activity panel for the issue detail modal. Owns the tab state, fetches
 * comments / history / time logs, and renders each tab. Comments support
 * inline create via the shared rich-text editor (revealed on focus).
 */
export function IssueActivity({
  issueId,
  projectId,
  initialWorkLogs,
  mentions,
}: {
  issueId: string;
  projectId: string;
  /** When the parent modal already loaded time logs via /api/issues/[id],
   *  pass them here so the Work log tab is instantly populated. */
  initialWorkLogs?: WorkLogRow[];
  /** People list for `@`-mentions in the comment editor. */
  mentions?: MentionItem[];
}) {
  const queryClient = useQueryClient();
  const perms = useMyProjectPermissions(projectId);
  const canComment = perms.loading || perms.has("IssueComment", "create");
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);

  // Each feed is lazy-loaded on first view via React Query's `enabled` flag
  // (url=null keeps the query idle until its tab is shown). Cached + deduped,
  // so the dev StrictMode double-fetch collapses to one request.
  const wantComments = tab === "all" || tab === "comments";
  const wantHistory = tab === "all" || tab === "history";
  const wantWorklog = tab === "all" || tab === "worklog";

  const commentsKey = ["quiktrack", "issue-comments", issueId];
  const worklogsKey = ["quiktrack", "issue-worklogs", issueId];

  const { data: comments = null } = useApiData<Comment[]>(
    commentsKey,
    wantComments ? `/api/issues/${issueId}/comments` : null,
  );
  const { data: history = null } = useApiData<HistoryRow[]>(
    ["quiktrack", "issue-history", issueId],
    wantHistory ? `/api/issues/${issueId}/history` : null,
  );
  const { data: worklogsData } = useApiData<WorkLogRow[]>(
    worklogsKey,
    wantWorklog ? `/api/timesheets?issueId=${encodeURIComponent(issueId)}` : null,
  );
  // Seed from the parent's already-loaded logs until the query resolves.
  const worklogs = worklogsData ?? initialWorkLogs ?? null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Activity
        </button>
      </div>
      {!open ? null : (
      <>
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-0.5 p-0.5 border border-gray-200 rounded">
          {(
            [
              ["all", "All"],
              ["comments", "Comments"],
              ["history", "History"],
              ["worklog", "Work log"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-2.5 py-1 text-xs rounded ${
                tab === k
                  ? "bg-blue-50 text-blue-700 font-medium border border-blue-200"
                  : "text-gray-700 hover:bg-gray-50 border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSortDesc((v) => !v)}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Toggle sort order"
          title={sortDesc ? "Newest first" : "Oldest first"}
        >
          <ArrowDownNarrowWide className="h-3.5 w-3.5" />
        </button>
      </div>

      {(tab === "comments" || tab === "all") && (
        <CommentsView
          issueId={issueId}
          projectId={projectId}
          comments={comments}
          sortDesc={sortDesc}
          showComposer={canComment && tab === "comments"}
          onPosted={(c) =>
            queryClient.setQueryData<Comment[]>(commentsKey, (old) => [...(old ?? []), c])
          }
          mentions={mentions}
        />
      )}

      {(tab === "history" || tab === "all") && (
        <HistoryView rows={history} sortDesc={sortDesc} hideHeader={tab === "all"} />
      )}

      {tab === "worklog" && (
        <WorkLogView
          rows={worklogs}
          onLogTime={() => setLogOpen(true)}
        />
      )}

      {logOpen && (
        <LogTimeModal
          issueId={issueId}
          projectId={projectId}
          onClose={() => setLogOpen(false)}
          onLogged={() => {
            setLogOpen(false);
            void queryClient.invalidateQueries({ queryKey: worklogsKey });
          }}
        />
      )}
      </>
      )}
    </div>
  );
}

function CommentsView({
  issueId,
  projectId,
  comments,
  sortDesc,
  showComposer = true,
  onPosted,
  mentions,
}: {
  issueId: string;
  projectId: string;
  comments: Comment[] | null;
  sortDesc: boolean;
  showComposer?: boolean;
  onPosted: (c: Comment) => void;
  mentions?: MentionItem[];
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(html: string) {
    if (!html.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: html }),
      }).then((r) => r.json());
      if (res?.success) {
        onPosted(res.data);
        setBody("");
        setEditorOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const ordered = comments ? (sortDesc ? [...comments].reverse() : comments) : null;

  return (
    <div>
      {showComposer && (
      <>
      <div className="border border-gray-200 rounded-md p-2.5">
        {!editorOpen ? (
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="w-full text-left text-xs text-gray-400 px-1 py-1"
          >
            Add a comment...
          </button>
        ) : (
          <div className="space-y-2">
            <RichTextEditor
              value={body}
              onChange={setBody}
              chromeless
              placeholder="Add a comment..."
              mentions={mentions ?? []}
              uploadImage={(file) => uploadProjectImage(projectId, file)}
              uploadFile={(file) => uploadProjectFile(projectId, file)}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBody("");
                  setEditorOpen(false);
                }}
                className="h-7 px-3 text-xs text-gray-700 rounded hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit(body)}
                disabled={submitting || !body.trim()}
                className="h-7 px-3 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
              >
                Save
              </button>
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {REACTION_SHORTCUTS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() =>
                void submit(`<p>${r.emoji} ${escapeHtml(r.label)}</p>`)
              }
              className="shrink-0 inline-flex items-center gap-1 h-6 px-2 text-[11px] text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
            >
              <span>{r.emoji}</span>
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Pro tip: press <span className="px-1 border border-gray-300 rounded text-[10px]">M</span> to
        comment
      </p>
      </>
      )}

      <div className="mt-4 space-y-4">
        {ordered === null && (
          <SkeletonList rows={3} withAvatar />
        )}
        {ordered?.length === 0 && (
          <div className="text-xs text-gray-400">No comments yet.</div>
        )}
        {ordered?.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <span
              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
              style={{ background: userColor(c.userId) }}
            >
              {userInitials(c.user)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-gray-900">
                  {userName(c.user)}
                </span>
                {c.actorType === "agent" && <AutomatedBadge />}
                <span className="text-[11px] text-gray-500">{relativeTime(c.createdAt)}</span>
                {c.editedAt && (
                  <span className="text-[11px] text-gray-400">(edited)</span>
                )}
              </div>
              {/* RichTextView (not dangerouslySetInnerHTML) so file
                  attachments in a comment render as the same inline cards as
                  the description — the read-only `.prose` chip styling would
                  otherwise hide the attachment anchors entirely. */}
              <RichTextView
                html={sanitizeRichText(c.body)}
                className="prose prose-sm max-w-none text-sm text-gray-800 mt-1"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryView({
  rows,
  sortDesc,
  hideHeader,
}: {
  rows: HistoryRow[] | null;
  sortDesc: boolean;
  hideHeader?: boolean;
}) {
  const ordered = rows ? (sortDesc ? [...rows].reverse() : rows) : null;
  return (
    <div className={hideHeader ? "mt-6" : ""}>
      {!hideHeader && rows === null && (
        <SkeletonList rows={3} withAvatar />
      )}
      {ordered?.length === 0 && (
        <div className="text-xs text-gray-400">
          No history yet. Changes will be tracked once history instrumentation is enabled on PATCH
          routes.
        </div>
      )}
      <div className="space-y-3">
        {ordered?.map((r) => (
          <div key={r.id} className="flex items-start gap-2">
            <span
              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
              style={{ background: userColor(r.userId ?? r.id) }}
            >
              {userInitials(r.user)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-900 inline-flex items-center gap-1.5">
                <span className="font-semibold">{userName(r.user)}</span>{" "}
                <span className="text-gray-700">changed the {r.field}</span>
                {r.actorType === "agent" && <AutomatedBadge />}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">{relativeTime(r.createdAt)}</div>
              <div className="mt-1 text-xs text-gray-700 inline-flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px]">
                  {r.oldValue ?? "None"}
                </span>
                <span className="text-gray-400">→</span>
                <span className="px-1.5 py-0.5 border border-gray-300 rounded text-[11px]">
                  {r.newValue ?? "None"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkLogView({
  rows,
  onLogTime,
}: {
  rows: WorkLogRow[] | null;
  onLogTime: () => void;
}) {
  if (rows === null) {
    return <SkeletonList rows={2} withAvatar />;
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-3">
          <span className="text-2xl">⏱️</span>
        </div>
        <p className="text-sm text-gray-700 max-w-xs">
          No time was logged for this Task yet. Logging time lets you track and report on the time
          spent on the work.
        </p>
        <button
          type="button"
          onClick={onLogTime}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          Log time
        </button>
      </div>
    );
  }
  const total = rows.reduce((s, r) => s + (r.hours || 0), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">
          Total logged: <span className="font-medium text-gray-800">{formatHours(total)}</span>
        </span>
        <button
          type="button"
          onClick={onLogTime}
          className="text-xs text-blue-600 hover:underline"
        >
          Log time
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-2 px-2 py-1.5 border border-gray-200 rounded"
          >
            <span
              className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
              style={{ background: userColor(r.userId) }}
            >
              {userInitials(r.user)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-900">
                <span className="font-medium">{userName(r.user)}</span>
                <span className="text-gray-500"> logged </span>
                <span className="font-medium">{formatHours(r.hours)}</span>
                <span className="text-gray-500"> on {new Date(r.entryDate).toLocaleDateString()}</span>
              </div>
              {r.description && (
                <div className="text-xs text-gray-600 mt-0.5">{r.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogTimeModal({
  issueId,
  projectId,
  onClose,
  onLogged,
}: {
  issueId: string;
  projectId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  // Clock-style HH:MM fields. "Time spent" defaults to a real "00:00" value;
  // "Time remaining" is optional so it starts empty.
  const [spent, setSpent] = useState("00:00");
  const [remaining, setRemaining] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const hours = parseClockToHours(spent);
    if (hours === null || hours <= 0) {
      setError("Enter a valid time (e.g. 01:30, or 1.5 for 1h 30m)");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/timesheets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          issueId,
          entryDate: new Date(date).toISOString(),
          hours,
          description: description.trim() || undefined,
        }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error ?? "Failed to log time");
        return;
      }
      onLogged();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-start justify-center pt-24 px-4">
      <div className="bg-white border border-gray-200 rounded-md shadow-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Time tracking</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 block mb-1">Time spent</span>
            <input
              autoFocus
              value={spent}
              onChange={(e) => setSpent(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                // Snap to HH:MM on blur: "1" → "01:00", "1.5" → "01:30".
                // Unparseable input falls back to "00:00".
                const h = parseClockToHours(spent);
                setSpent(h !== null && h > 0 ? formatHoursAsClock(h) : "00:00");
              }}
              inputMode="decimal"
              className={`w-full h-9 px-3 text-sm tabular-nums tracking-wide border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                spent === "00:00" ? "text-gray-400" : "text-gray-900"
              }`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-700 block mb-1">
              Time remaining{" "}
              <span className="text-gray-400" title="Optional — informational only">ⓘ</span>
            </span>
            <input
              value={remaining}
              onChange={(e) => setRemaining(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                // Optional: leave blank when empty, otherwise normalize to HH:MM.
                const h = parseClockToHours(remaining);
                setRemaining(h !== null && h > 0 ? formatHoursAsClock(h) : "");
              }}
              inputMode="decimal"
              placeholder="optional"
              className="w-full h-9 px-3 text-sm tabular-nums tracking-wide text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
        </div>
        <label className="block mt-3">
          <span className="text-xs font-semibold text-gray-700 block mb-1">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>
        <label className="block mt-3">
          <span className="text-xs font-semibold text-gray-700 block mb-1">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on? (optional)"
            rows={3}
            maxLength={2000}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </label>
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-sm text-gray-700 rounded hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={submitting || (parseClockToHours(spent) ?? 0) <= 0}
            className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
