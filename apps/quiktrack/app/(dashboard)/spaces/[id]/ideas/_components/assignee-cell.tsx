"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Check, User } from "lucide-react";
import {
  anchorFromRect,
  useAnchoredPanel,
  type PanelAnchor,
} from "@/lib/hooks/useAnchoredPanel";

/** Minimal user shape for the assignee picker (from /api/projects/[id]/members). */
export interface MemberLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}

export function memberName(u: MemberLite): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.email;
}

function initials(u: MemberLite): string {
  const a = u.firstName?.[0] ?? u.email[0] ?? "?";
  const b = u.lastName?.[0] ?? "";
  return (a + b).toUpperCase();
}

/** Read-only avatar + name (e.g. the Creator column). Falls back to a dash. */
export function MemberChip({ user }: { user: MemberLite | null }) {
  if (!user) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar user={user} />
      <span className="truncate text-gray-800">{memberName(user)}</span>
    </span>
  );
}

/** Round avatar — image if present, else colored initials (JPD). */
function Avatar({ user, size = 20 }: { user: MemberLite; size?: number }) {
  if (user.avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-accent-600 font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(user)}
    </span>
  );
}

/**
 * Editable Assignee cell for the ideas table. Shows the current assignee (or
 * "Unassigned") and, on click, opens a fixed-position dropdown of the project's
 * members — pick one to assign, or "Unassigned" to clear. Persists via onAssign
 * (PATCH assigneeId). Fixed positioning escapes the table's overflow clipping.
 */
export function AssigneeCell({
  assigneeId,
  members,
  onAssign,
}: {
  assigneeId: string | null;
  members: MemberLite[];
  onAssign: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const panelStyle = useAnchoredPanel(ref, anchor, { width: 264 });

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll() { setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("scroll", onScroll, true); };
  }, [open]);

  const current = members.find((m) => m.id === assigneeId) ?? null;
  const filtered = q
    ? members.filter((m) => memberName(m).toLowerCase().includes(q.toLowerCase()) || m.email.toLowerCase().includes(q.toLowerCase()))
    : members;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) { setOpen(false); return; }
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAnchor(anchorFromRect(r));
          setQ("");
          setOpen(true);
        }}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {current ? (
          <>
            <Avatar user={current} />
            <span className="truncate text-gray-800">{memberName(current)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-gray-400">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100">
              <User className="h-3 w-3 text-gray-400" />
            </span>
            Unassigned
          </span>
        )}
      </button>

      {open && anchor && (
        <div
          ref={ref}
          style={panelStyle}
          className="z-50 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Select user"
                className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onAssign(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-600 hover:bg-gray-50"
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-gray-100">
                <User className="h-3 w-3 text-gray-400" />
              </span>
              Unassigned
              {!assigneeId && <Check className="ml-auto h-4 w-4 text-blue-600" />}
            </button>
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { onAssign(m.id); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Avatar user={m} />
                <span className="truncate">{memberName(m)}</span>
                {m.id === assigneeId && <Check className="ml-auto h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No members</p>}
          </div>
        </div>
      )}
    </div>
  );
}
