"use client";

/**
 * SectionUserPicker — admin-only user selector for the OPSP page.
 *
 * Shown when the signed-in admin holds `OPSP.EditUser:update`. Lets them point
 * the four per-user sections (Your Accountability / Quarterly Priorities /
 * Critical # / Balanced Critical #) at any org user — the strategic OPSP stays
 * org-shared. `value === null` means "my own sections".
 *
 * Infinite 25/page server-searched list via `useInfiniteUsers`, mirroring the
 * OwnerSelect dropdown pattern in pickers.tsx.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";

interface Props {
  /** Selected user id, or null for the signed-in user's own sections. */
  value: string | null;
  /**
   * Signed-in user's id — excluded from the list so they only appear as the
   * "(you)" option (prevents the duplicate). Optional: when omitted, no self
   * filtering happens (duplicate ids are still collapsed).
   */
  selfId?: string;
  /** Display name for the signed-in user (the "My own" option). */
  selfName: string;
  /** Reports the chosen user id (null = self) and their resolved display name. */
  onChange: (userId: string | null, name: string) => void;
}

/**
 * The org user list with the signed-in user removed (they're already shown as
 * the dedicated "(you)" option) and any duplicate ids collapsed. Pure so the
 * de-dup logic is unit-testable. Without this the signed-in user appears twice
 * in the dropdown — once as "(you)" and once in the fetched list.
 */
export function visibleSectionUsers<T extends { id: string }>(users: T[], selfId: string): T[] {
  const seen = new Set<string>(selfId ? [selfId] : []);
  return users.filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

export function SectionUserPicker({ value, selfId = "", selfName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { users, hasNextPage, isFetchingNextPage, fetchNextPage, isLoading } =
    useInfiniteUsers(undefined, debouncedSearch);

  // Cache picked users so the trigger label resolves even after the search list
  // changes (the selected user may not be in the current page).
  const [pickedCache, setPickedCache] = useState<Record<string, string>>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Drop the signed-in user (already shown as "(you)") + de-dup repeats.
  const listUsers = useMemo(() => visibleSectionUsers(users, selfId), [users, selfId]);

  const label = useMemo(() => {
    if (!value) return `${selfName} (you)`;
    if (pickedCache[value]) return pickedCache[value];
    const u = users.find((x) => x.id === value);
    return u ? `${u.firstName} ${u.lastName}`.trim() : "Selected user";
  }, [value, selfName, pickedCache, users]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) fetchNextPage();
  }

  function pick(userId: string | null, name: string) {
    if (userId) setPickedCache((c) => ({ ...c, [userId]: name }));
    onChange(userId, name);
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="relative" ref={triggerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-gray-200 rounded-md px-2.5 py-1.5 text-sm bg-white hover:bg-gray-50 min-w-[200px]"
      >
        <Users className="h-3.5 w-3.5 text-accent-600 flex-shrink-0" />
        <span className="flex-1 truncate text-left text-gray-700">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <div className="px-2 pb-1 pt-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto" onScroll={handleScroll}>
            <button
              type="button"
              onClick={() => pick(null, selfName)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50",
                !value && "bg-accent-50",
              )}
            >
              <span className="flex-1 truncate">{selfName} (you)</span>
              {!value && <Check className="h-3.5 w-3.5 text-accent-600" />}
            </button>
            {listUsers.map((u) => {
              const name = `${u.firstName} ${u.lastName}`.trim();
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pick(u.id, name)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50",
                    value === u.id && "bg-accent-50",
                  )}
                >
                  <span className="flex-1 truncate">{name}</span>
                  {value === u.id && <Check className="h-3.5 w-3.5 text-accent-600" />}
                </button>
              );
            })}
            {listUsers.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">
                {isLoading ? "Loading…" : "No other users found."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
