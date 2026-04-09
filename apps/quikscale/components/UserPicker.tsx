"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

export interface PickerUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

function avatarBg(name: string): string {
  const colors = [
    "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
    "bg-rose-500","bg-cyan-500","bg-fuchsia-500","bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
}

export function UserPicker({ value, onChange, users, placeholder = "Select owner…", error }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selected = users.find(u => u.id === value);
  const filtered = search.trim()
    ? users.filter(u =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 text-xs ${error ? "border-red-400" : "border-gray-200"}`}
      >
        {selected ? (
          <div className="flex items-center gap-2">
            <div className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(`${selected.firstName} ${selected.lastName}`)}`}>
              {initials(selected.firstName, selected.lastName)}
            </div>
            <span className="text-gray-700">{selected.firstName} {selected.lastName}</span>
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[220px]">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {/* Clear */}
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 italic"
              >
                — Clear selection
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No users found.</p>
            ) : filtered.map(u => {
              const full = `${u.firstName} ${u.lastName}`;
              const isSelected = u.id === value;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                >
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="text-left min-w-0">
                    <span className={`block text-xs font-medium truncate ${isSelected ? "text-blue-600" : "text-gray-800"}`}>{full}</span>
                    <span className="block text-[10px] text-gray-400 truncate">{u.email}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
