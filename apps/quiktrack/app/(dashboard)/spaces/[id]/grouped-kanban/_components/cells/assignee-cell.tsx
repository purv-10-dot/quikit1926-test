"use client";

import { useMemo, useRef, useState } from "react";
import { User as UserIcon, X } from "lucide-react";
import type { BoardMemberLite } from "../../_types";
import { PopoverPanel } from "./popover-panel";

interface AssigneeCellProps {
  value: string | null;
  members: BoardMemberLite[];
  onCommit: (assigneeId: string | null) => void;
}

function memberColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

function userLabel(u: { firstName: string | null; lastName: string | null; email: string }): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
}

export function AssigneeCell({ value, members, onCommit }: AssigneeCellProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const current = members.find((m) => m.user?.id === value)?.user ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members.filter((m) => m.user);
    return members.filter((m) => m.user && userLabel(m.user).toLowerCase().includes(q));
  }, [members, search]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 hover:bg-gray-100 px-1 py-0.5 focus:outline-none focus-visible:outline-none dark:hover:bg-slate-700/50"
      >
        {current ? (
          <span
            className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
            style={{ background: memberColor(current.id) }}
          >
            {((current.firstName?.[0] ?? current.email[0] ?? "?") + (current.lastName?.[0] ?? "")).toUpperCase()}
          </span>
        ) : (
          <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
            <UserIcon className="h-3 w-3 text-gray-400" />
          </span>
        )}
      </button>
      <PopoverPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        width={240}
      >
        <div className="p-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members"
            className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              if (value !== null) onCommit(null);
            }}
            className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-50 rounded"
          >
            <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center">
              <X className="h-3 w-3 text-gray-400" />
            </span>
            <span className="text-gray-600">Unassigned</span>
          </button>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((m) => {
              const u = m.user!;
              const name = userLabel(u);
              const initials =
                ((u.firstName?.[0] ?? u.email[0] ?? "?") + (u.lastName?.[0] ?? "")).toUpperCase();
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (u.id !== value) onCommit(u.id);
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-50 rounded ${
                    u.id === value ? "bg-gray-50" : ""
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                    style={{ background: memberColor(u.id) }}
                  >
                    {initials}
                  </span>
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-gray-400 text-center">No matches</div>
            )}
          </div>
        </div>
      </PopoverPanel>
    </>
  );
}
