"use client";

/**
 * UserSelect -- unified user picker (single / multi) with searchable dropdown.
 *
 * Mode determines the rendered trigger + selection model:
 *   - "single" -> one avatar + name shown; onChange(id: string)
 *   - "multi"  -> chip list of selected users; onChange(ids: string[])
 *
 * Features shared across modes:
 *   - Click-outside closes the dropdown
 *   - Search box filters by name or email
 *   - Selected items highlighted with accent colors
 *   - Keyboard-accessible (autofocus on search, button elements)
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown, Check, X } from "lucide-react";

export interface PickerUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

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

// -- Mode-specific prop unions --
interface BaseProps {
  users: PickerUser[];
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
}

interface SingleProps extends BaseProps {
  mode: "single";
  value: string;
  onChange: (id: string) => void;
}

interface MultiProps extends BaseProps {
  mode: "multi";
  values: string[];
  onChange: (ids: string[]) => void;
  /** Max items to show as chips in the trigger before collapsing. */
  chipLimit?: number;
}

export type UserSelectProps = SingleProps | MultiProps;

export function UserSelect(props: UserSelectProps) {
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

  const { users, placeholder, error, mode, disabled } = props;

  const filtered = search.trim()
    ? users.filter(u =>
        `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  // -- Trigger rendering --
  let trigger: ReactNode;
  if (mode === "single") {
    const selected = users.find(u => u.id === props.value);
    trigger = selected ? (
      <div className="flex items-center gap-2">
        <div className={`h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ${avatarBg(`${selected.firstName} ${selected.lastName}`)}`}>
          {initials(selected.firstName, selected.lastName)}
        </div>
        <span className="text-gray-700">{selected.firstName} {selected.lastName}</span>
      </div>
    ) : (
      <span className="text-gray-400">{placeholder ?? "Select owner\u2026"}</span>
    );
  } else {
    const chipLimit = props.chipLimit ?? 2;
    const selectedSet = new Set(props.values);
    const selectedUsers = users.filter(u => selectedSet.has(u.id));
    trigger = selectedUsers.length === 0 ? (
      <span className="text-gray-400">{placeholder ?? "Select owners\u2026"}</span>
    ) : (
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        {selectedUsers.slice(0, chipLimit).map(u => (
          <span key={u.id} className="inline-flex items-center gap-1 bg-accent-50 border border-accent-200 text-accent-700 rounded-full pl-0.5 pr-2 py-0.5">
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
    );
  }

  // -- Item click handler --
  function handleItemClick(userId: string) {
    if (mode === "single") {
      props.onChange(userId);
      setOpen(false);
    } else {
      const selectedSet = new Set(props.values);
      if (selectedSet.has(userId)) props.onChange(props.values.filter(v => v !== userId));
      else props.onChange([...props.values, userId]);
    }
  }

  function handleClearAll() {
    if (mode === "single") {
      props.onChange("");
      setOpen(false);
    } else {
      props.onChange([]);
    }
  }

  const hasSelection = mode === "single" ? !!props.value : props.values.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(o => !o); setSearch(""); } }}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-xs focus:outline-none ${disabled ? "bg-gray-50 text-gray-500 cursor-not-allowed border-gray-200" : `bg-white hover:bg-gray-50 focus:ring-1 focus:ring-accent-400 ${error ? "border-red-400" : "border-gray-200"}`}`}
      >
        {trigger}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-[250] bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[240px]">
          {/* Search + optional Clear */}
          <div className="p-2 border-b border-gray-100 flex gap-2">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search\u2026"
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
            {mode === "multi" && hasSelection && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-red-500 px-2 rounded hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {/* Single-mode "clear selection" row */}
            {mode === "single" && props.value && (
              <button
                type="button"
                onClick={handleClearAll}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 italic"
              >
                — Clear selection
              </button>
            )}

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No users match.</p>
            ) : filtered.map(u => {
              const full = `${u.firstName} ${u.lastName}`;
              const isSelected = mode === "single"
                ? u.id === props.value
                : props.values.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleItemClick(u.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors ${isSelected ? "bg-accent-50" : ""}`}
                >
                  {mode === "multi" && (
                    <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-accent-600 border-accent-600" : "border-gray-300 bg-white"}`}>
                      {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                  )}
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${avatarBg(full)}`}>
                    {initials(u.firstName, u.lastName)}
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <span className={`block text-xs font-medium truncate ${isSelected ? "text-accent-700" : "text-gray-800"}`}>{full}</span>
                    <span className="block text-[10px] text-gray-400 truncate">{u.email}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Multi-mode count footer */}
          {mode === "multi" && props.values.length > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5 text-[10px] text-gray-500 bg-gray-50 rounded-b-xl">
              {props.values.length} selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
