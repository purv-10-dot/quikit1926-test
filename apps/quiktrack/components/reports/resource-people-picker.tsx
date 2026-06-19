"use client";

import { useState } from "react";
import { ChevronDown, Users, Search } from "lucide-react";

interface OrgUser {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function ResourcePeoplePicker({
  users,
  selectedUserIds,
  onChange,
}: {
  users: OrgUser[];
  selectedUserIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const query = q.trim().toLowerCase();
  const visible = query
    ? users.filter((u) =>
        `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email}`.toLowerCase().includes(query),
      )
    : users;

  const label =
    selectedUserIds.length === 0
      ? "All people"
      : selectedUserIds.length === 1
        ? users.find((u) => u.userId === selectedUserIds[0])?.firstName ?? "1 person"
        : `${selectedUserIds.length} people selected`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 h-8 text-sm rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 min-w-[180px] justify-between"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Users className="h-3.5 w-3.5 text-gray-500 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg p-1">
          <div className="px-1 pt-0.5 pb-1.5 sticky top-0 bg-white">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
            className="w-full text-left px-3 h-8 text-sm rounded hover:bg-gray-50 text-gray-700 font-medium"
          >
            All people
          </button>
          <div className="h-px bg-gray-100 my-1" />
          {visible.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No people found</div>
          )}
          {visible.map((u) => {
            const checked = selectedUserIds.includes(u.userId);
            const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
            return (
              <label
                key={u.userId}
                className="flex items-center gap-2 px-2 h-8 text-sm rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selectedUserIds.filter((id) => id !== u.userId)
                        : [...selectedUserIds, u.userId],
                    )
                  }
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                />
                <span className="truncate text-gray-700">{name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
