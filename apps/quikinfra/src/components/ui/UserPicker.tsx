"use client";

/**
 * UserPicker — single-user selector that fetches the tenant's user list
 * from `/api/settings/users` and presents a searchable dropdown.
 *
 * Wraps the consumer-facing API used by approvals/rules and similar pages
 * (`value` / `onChange(uid)`), hiding the network fetch + the underlying
 * SearchableSelect from call sites.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, Check, User as UserIcon } from "lucide-react";

interface UserRow {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserPicker({ value, onChange, placeholder = "Select user…", disabled }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/users")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        // The settings/users endpoint may envelope responses as either
        // `{ success, data }` or return an array directly — handle both.
        const list: UserRow[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
        setUsers(list);
      })
      .catch(() => setUsers([]))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.name?.toLowerCase().includes(q) ?? false) ||
      (u.email?.toLowerCase().includes(q) ?? false) ||
      u.id.toLowerCase().includes(q),
    );
  }, [users, query]);

  const selected = users.find((u) => u.id === value);
  const triggerLabel = loading
    ? "Loading users…"
    : selected
      ? selected.name || selected.email || selected.id
      : placeholder;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-left text-sm flex items-center gap-2 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500"
      >
        <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-slate-900" : "text-slate-400"}`}>
          {triggerLabel}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && !loading && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 flex flex-col">
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-slate-200 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </div>
            </div>
            <div className="flex-1 overflow-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400 text-center">
                  {users.length === 0 ? "No users found" : "No matches"}
                </div>
              ) : (
                filtered.map((u) => {
                  const isSelected = u.id === value;
                  const display = u.name || u.email || u.id;
                  return (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => { onChange(u.id); setOpen(false); setQuery(""); }}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
                        isSelected ? "bg-orange-50 text-orange-700 font-medium" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex-1 truncate">
                        <span className="block truncate">{display}</span>
                        {u.email && u.email !== display && (
                          <span className="block truncate text-[11px] text-slate-400">{u.email}</span>
                        )}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-orange-600" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
