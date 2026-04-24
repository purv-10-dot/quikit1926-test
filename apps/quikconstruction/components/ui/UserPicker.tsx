"use client";

/**
 * User picker — searchable dropdown over tenant members.
 * Replaces raw "type user id" fields used earlier in approval rules and
 * safety incident "Reported By", inspector fields, etc.
 *
 * Backs to GET /api/masters/users  → [{ id, email, firstName, lastName }]
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, User as UserIcon } from "lucide-react";

interface TenantUser { id: string; email: string; firstName: string; lastName: string | null }

interface Props {
  value: string;
  onChange: (userId: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserPicker({ value, onChange, placeholder = "— select user —", disabled }: Props) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/masters/users").then(r => r.ok ? r.json() : { success: false }).then(j => j.success && setUsers(j.data));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = users.find(u => u.id === value);
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return users;
    return users.filter(u =>
      `${u.firstName} ${u.lastName ?? ""} ${u.email}`.toLowerCase().includes(s),
    );
  }, [users, q]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`w-full text-left text-sm border border-gray-300 rounded px-2 py-1.5 bg-white flex items-center gap-2 ${disabled ? "opacity-50" : "hover:border-accent-400"}`}>
        <UserIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <span className={`flex-1 truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? `${selected.firstName} ${selected.lastName ?? ""} (${selected.email})` : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search users…" className="text-xs border-b border-gray-100 px-3 py-2 outline-none" />
          <div className="overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-500">No matches</div>
            ) : filtered.map(u => (
              <button key={u.id} type="button" onClick={() => { onChange(u.id); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent-50 flex items-center gap-2 ${u.id === value ? "bg-accent-50 text-accent-700" : "text-gray-700"}`}>
                <Check className={`h-3 w-3 flex-shrink-0 ${u.id === value ? "opacity-100 text-accent-600" : "opacity-0"}`} />
                <span className="flex-1 min-w-0 truncate"><span className="font-medium">{u.firstName} {u.lastName ?? ""}</span> <span className="text-gray-500">— {u.email}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
