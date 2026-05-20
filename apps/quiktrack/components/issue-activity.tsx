"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDownNarrowWide, X, ChevronDown, ChevronRight } from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { SkeletonList } from "@/components/skeleton";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";

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
  user: User | null;
}

interface HistoryRow {
  id: string;
  userId: string | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: User | null;
}

interface WorkLogRow {
  id: string;
  userId: string;
  entryDate: string;
  hours: number;
  description: string | null;
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

/**
 * Parses Jira-style "2w 4d 6h 45m" duration strings into hours.
 * Returns null when the string contains nothing parseable.
 *
 * Defaults: 1w = 5 working days, 1d = 8 hours.
 */
export function parseDurationToHours(
  input: string,
  opts: { hoursPerDay?: number; daysPerWeek?: number } = {},
): number | null {
  const hoursPerDay = opts.hoursPerDay ?? 8;
  const daysPerWeek = opts.daysPerWeek ?? 5;
  let total = 0;
  let matched = false;
  // Match each unit token (case-insensitive). Unknown units are ignored.
  for (const m of input.matchAll(/(\d+(?:\.\d+)?)\s*([wdhm])/gi)) {
    matched = true;
    const value = Number(m[1]);
    const unit = m[2]!.toLowerCase();
    if (unit === "w") total += value * daysPerWeek * hoursPerDay;
    else if (unit === "d") total += value * hoursPerDay;
    else if (unit === "h") total += value;
    else if (unit === "m") total += value / 60;
  }
  return matched ? total : null;
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
}: {
  issueId: string;
  projectId: string;
  /** When the parent modal already loaded time logs via /api/issues/[id],
   *  pass them here so the Work log tab is instantly populated. */
  initialWorkLogs?: WorkLogRow[];
}) {
  const perms = useMyProjectPermissions(projectId);
  const canComment = perms.loading || perms.has("IssueComment", "create");
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState(true);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [worklogs, setWorklogs] = useState<WorkLogRow[] | null>(initialWorkLogs ?? null);
  const [logOpen, setLogOpen] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/issues/${issueId}/comments`).then((r) => r.json());
    if (res?.success) setComments(res.data ?? []);
    else setComments([]);
  }, [issueId]);

  const refreshHistory = useCallback(async () => {
    const res = await fetch(`/api/issues/${issueId}/history`).then((r) => r.json());
    if (res?.success) setHistory(res.data ?? []);
    else setHistory([]);
  }, [issueId]);

  const refreshWorklogs = useCallback(async () => {
    const res = await fetch(`/api/timesheets?issueId=${encodeURIComponent(issueId)}`).then((r) =>
      r.json(),
    );
    if (res?.success) setWorklogs(res.data ?? []);
    else setWorklogs([]);
  }, [issueId]);

  // Lazy-load each feed on first view.
  useEffect(() => {
    if ((tab === "all" || tab === "comments") && comments === null) void refreshComments();
    if ((tab === "all" || tab === "history") && history === null) void refreshHistory();
    if ((tab === "all" || tab === "worklog") && worklogs === null) void refreshWorklogs();
  }, [tab, comments, history, worklogs, refreshComments, refreshHistory, refreshWorklogs]);

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
          comments={comments}
          sortDesc={sortDesc}
          showComposer={canComment && tab === "comments"}
          onPosted={(c) => setComments((arr) => [...(arr ?? []), c])}
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
            void refreshWorklogs();
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
  comments,
  sortDesc,
  showComposer = true,
  onPosted,
}: {
  issueId: string;
  comments: Comment[] | null;
  sortDesc: boolean;
  showComposer?: boolean;
  onPosted: (c: Comment) => void;
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
                <span className="text-[11px] text-gray-500">{relativeTime(c.createdAt)}</span>
                {c.editedAt && (
                  <span className="text-[11px] text-gray-400">(edited)</span>
                )}
              </div>
              <div
                className="prose prose-sm max-w-none text-sm text-gray-800 mt-1"
                dangerouslySetInnerHTML={{ __html: c.body }}
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
              <div className="text-xs text-gray-900">
                <span className="font-semibold">{userName(r.user)}</span>{" "}
                <span className="text-gray-700">changed the {r.field}</span>
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
              {(r.userId.charAt(0) || "?").toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-gray-900">
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
  const [spent, setSpent] = useState("");
  const [remaining, setRemaining] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const hours = parseDurationToHours(spent);
    if (hours === null || hours <= 0) {
      setError("Enter a valid duration (e.g. 2w 4d 6h 45m)");
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
          entryDate: new Date().toISOString(),
          hours,
          description: undefined,
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
              placeholder="2w 4d 6h 45m"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              placeholder="optional"
              className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
        </div>
        <ul className="mt-3 text-xs text-gray-600 space-y-0.5 pl-1">
          <li>Use the format: 2w 4d 6h 45m</li>
          <li className="ml-3">w = weeks</li>
          <li className="ml-3">d = days</li>
          <li className="ml-3">h = hours</li>
          <li className="ml-3">m = minutes</li>
        </ul>
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
            disabled={submitting || !spent.trim()}
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
