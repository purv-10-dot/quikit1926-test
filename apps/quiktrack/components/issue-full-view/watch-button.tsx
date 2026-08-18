"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Plus, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { PopoverPanel } from "@/app/(dashboard)/spaces/[id]/grouped-kanban/_components/cells/popover-panel";

interface Watcher {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}
interface WatchData {
  count: number;
  isWatching: boolean;
  watchers: Watcher[];
}
interface Member {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string; avatar: string | null } | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

/**
 * Watch control for the issue header — Jira's "Watch options". The eye button
 * shows the watcher count; clicking opens a popover with a Stop/Start-watching
 * toggle, the list of everyone watching (each removable), and an "Add watchers"
 * member picker. `projectId` powers the picker; omit it to hide Add-watchers.
 */
export function WatchButton({ issueId, projectId }: { issueId: string; projectId?: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["quiktrack", "issue-watchers", issueId] as const;
  const { data } = useApiData<WatchData>(queryKey, `/api/issues/${issueId}/watch`);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Project members for the Add-watchers picker (lazy: only when the picker opens).
  const { data: members = [] } = useApiData<Member[]>(
    ["quiktrack", "project-members", projectId],
    projectId && adding ? `/api/projects/${projectId}/members` : null,
    {
      select: (d) => {
        const payload = d as { members?: Member[] } | Member[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );

  const isWatching = data?.isWatching ?? false;
  const count = data?.count ?? 0;
  const watchers = useMemo(() => data?.watchers ?? [], [data]);
  const watcherIds = useMemo(() => new Set(watchers.map((w) => w.id)), [watchers]);

  function closePicker() {
    setAdding(false);
    setMemberQuery("");
  }

  async function call(method: "POST" | "DELETE", targetUserId?: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/watch`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: targetUserId ? JSON.stringify({ userId: targetUserId }) : undefined,
      }).then((r) => r.json());
      if (res?.success) queryClient.setQueryData<WatchData>(queryKey, res.data);
    } finally {
      setPending(false);
    }
  }

  const q = memberQuery.trim().toLowerCase();
  const addable = members
    .filter((m) => m.user && !watcherIds.has(m.userId))
    .map((m) => ({
      id: m.userId,
      name: [m.user!.firstName, m.user!.lastName].filter(Boolean).join(" ").trim() || m.user!.email,
      email: m.user!.email,
    }))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  // Dedupe by user id — the members payload can list a user more than once
  // (e.g. multiple project-role rows), which would render duplicate options.
  const addableUnique = Array.from(new Map(addable.map((m) => [m.id, m])).values());

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        // stopPropagation so the click that opens the popover doesn't also reach
        // any ancestor mousedown/click handler (the edit drawer) that could
        // immediately dismiss it.
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="Watch options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1 h-7 px-2 rounded border text-xs font-medium transition-colors ${
          isWatching
            ? "border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100"
            : "border-gray-200 text-gray-600 hover:bg-gray-100"
        }`}
      >
        {isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {count > 0 && <span>{count}</span>}
      </button>

      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => {
          setOpen(false);
          closePicker();
        }}
        align="right"
        width={264}
      >
        {/* Stop / Start watching toggle. */}
        <button
          type="button"
          onClick={() => void call(isWatching ? "DELETE" : "POST")}
          disabled={pending}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {isWatching ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
          {isWatching ? "Stop watching" : "Watch"}
        </button>

        <div className="border-t border-gray-100" />
        <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Watching this work item
        </div>
        <div className="max-h-52 overflow-y-auto pb-1">
          {watchers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No one is watching yet.</div>
          ) : (
            watchers.map((w) => (
              <div key={w.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm">
                <Avatar name={w.name} avatar={w.avatar} />
                <span className="flex-1 truncate text-gray-800">{w.name}</span>
                <button
                  type="button"
                  onClick={() => void call("DELETE", w.id)}
                  disabled={pending}
                  className="rounded p-0.5 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100 disabled:opacity-40"
                  aria-label={`Remove ${w.name}`}
                  title="Remove watcher"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {projectId && (
          <>
            <div className="border-t border-gray-100" />
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Add watchers
              </button>
            ) : (
              <div className="p-2">
                {/* Header row lets the user collapse the picker back to the
                    "Add watchers" button (it had no way to close before). */}
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Add watchers
                  </span>
                  <button
                    type="button"
                    onClick={closePicker}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="relative mb-1">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    autoFocus
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Search members"
                    className="h-8 w-full rounded border border-gray-200 pl-7 pr-2 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-200"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {addableUnique.length === 0 ? (
                    <div className="px-2 py-2 text-xs text-gray-400">No members to add.</div>
                  ) : (
                    addableUnique.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={async () => {
                          await call("POST", m.id);
                          closePicker(); // adding one member returns to the list
                        }}
                        disabled={pending}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Avatar name={m.name} avatar={null} />
                        <span className="flex-1 truncate">{m.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </PopoverPanel>
    </>
  );
}

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}
