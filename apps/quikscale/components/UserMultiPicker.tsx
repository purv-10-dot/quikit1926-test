"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import type { PickerUser } from "./UserPicker";

function avatarBg(name: string): string {
  const colors = [
    "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface Props {
  values: string[];
  onChange: (ids: string[]) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  /** Max items to show as chips in the trigger button before collapsing to "N selected". */
  chipLimit?: number;
}

/**
 * Multi-select user picker. Trigger button shows selected users as avatar chips
 * (up to `chipLimit`, then collapses to "N selected"). Dropdown is a searchable
 * checkbox list. Consistent look with UserPicker.
 */
export function UserMultiPicker({
  values,
  onChange,
  users,
  placeholder = "Select owners…",
  error,
  chipLimit = 2,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selectedSet = new Set(values);
  const selectedUsers = users.filter(u => selectedSet.has(u.id));
  const filtered = search.trim()
    ? users.filter(u =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(values.filter(v => v !== id));
    else onChange([...values, id]);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs ${error ? "border-red-400" : "border-gray-200"}`}
      >
        {selectedUsers.length === 0 ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {selectedUsers.slice(0, chipLimit).map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full pl-0.5 pr-2 py-0.5">
                <span className={`h-4 w-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 ${avatarBg(`${u.firstName} ${u.lastName}`)}`}>
                  {initials(u.firstName, u.lastName)}
                </span>
                <span className="text-[10px] font-medium truncate max-w-[72px]">{u.firstName} {u.lastName[0] ?? ""}</span>
              </span>
            ))}
            {selectedUsers.length > chipLimit && (
              <span className="text-[10px] text-gray-500 font-medium">+{selectedUsers.length - chipLimit} more</span>
            )}
          </div>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[250] bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[260px]">
          {/* Search + Clear */}
          <div className="p-2 border-b border-gray-100 flex gap-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {values.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-500 px-2 rounded hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No users match.</p>
            ) : filtered.map(u => {
              const full = `${u.firstName} ${u.lastName}`;
              const isSelected = selectedSet.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                >
                  {/* Checkbox */}
                  <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"}`}>
                    {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <span className={`block text-xs font-medium truncate ${isSelected ? "text-blue-700" : "text-gray-800"}`}>{full}</span>
                    <span className="block text-[10px] text-gray-400 truncate">{u.email}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer with count */}
          {values.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500 bg-gray-50 rounded-b-xl">
              {values.length} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
