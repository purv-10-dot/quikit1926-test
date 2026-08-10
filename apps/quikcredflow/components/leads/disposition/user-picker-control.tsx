"use client";

/**
 * user_picker control — RBAC-scoped user list from GET /api/forms/user-picker
 * (scope from the field config).
 *
 * BOTH single and multi modes render as a closed DROPDOWN that only reveals the
 * user list when tapped (never a permanently-expanded checkbox wall). Single mode
 * stores one id (string); multi mode stores string[] and shows checkboxes + chips
 * inside the opened panel. Options show "Name (email)" so agents can disambiguate
 * — matching the advanced-filter people fields.
 *
 * Extracted from disposition-field-groups so the tabbed clean form and the legacy
 * grouped renderer share ONE implementation.
 */
import { useEffect, useRef, useState } from "react";

interface UserPickerFieldLike {
  userPickerMode?: "single" | "multi" | null;
  userPickerScope?: "all_users" | "team" | "role" | null;
}

interface PickerUser {
  id: string;
  name: string;
  email: string;
}

export function UserPickerControl({
  field,
  value,
  onChange,
}: {
  field: UserPickerFieldLike;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const [options, setOptions] = useState<PickerUser[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const scope = field.userPickerScope ?? "all_users";
  const isMulti = field.userPickerMode === "multi";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/forms/user-picker?scope=${encodeURIComponent(scope)}`, {
          credentials: "include",
        });
        const json = await res.json();
        if (!cancelled && res.ok) setOptions(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // "Name (email)" — email in parentheses when a name exists, else just email.
  const label = (u: PickerUser) => (u.name ? (u.email ? `${u.name} (${u.email})` : u.name) : u.email);

  const selectedIds = Array.isArray(value) ? value : value ? [value] : [];
  const q = query.trim().toLowerCase();
  const matches = q
    ? options.filter((u) => label(u).toLowerCase().includes(q))
    : options;

  function pickSingle(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function toggleMulti(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  // Closed-state trigger label.
  const triggerText = (() => {
    if (selectedIds.length === 0) return "Select user";
    if (isMulti) return `${selectedIds.length} selected`;
    const u = options.find((o) => o.id === selectedIds[0]);
    return u ? label(u) : "Select user";
  })();

  return (
    <div ref={rootRef} className="relative mt-1">
      {/* Trigger — looks like the other selects; opens the panel on tap. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="crm-input flex w-full items-center justify-between text-left"
      >
        <span className={selectedIds.length ? "text-crm-text" : "text-crm-muted"}>{triggerText}</span>
        <span className="text-crm-muted">{open ? "▲" : "▼"}</span>
      </button>

      {/* Selected chips (multi only) so picks are visible without opening. */}
      {isMulti && selectedIds.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedIds.map((id) => {
            const u = options.find((o) => o.id === id);
            const text = u ? label(u) : id;
            return (
              <span key={id} className="inline-flex items-center gap-1 rounded bg-crm-panel px-1.5 py-0.5 text-xs">
                {text}
                <button
                  type="button"
                  onClick={() => toggleMulti(id)}
                  className="text-crm-muted hover:text-red-600"
                  aria-label={`Remove ${text}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-crm-border bg-white shadow-lg">
          {/* Search box for long user lists. */}
          <div className="border-b border-crm-border p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="crm-input w-full text-sm"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {matches.length === 0 && (
              <p className="px-3 py-2 text-xs text-crm-muted">No users found.</p>
            )}

            {matches.map((u) =>
              isMulti ? (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-crm-text hover:bg-crm-panel"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(u.id)}
                    onChange={() => toggleMulti(u.id)}
                  />
                  <span>{label(u)}</span>
                </label>
              ) : (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => pickSingle(u.id)}
                  className={
                    "block w-full px-3 py-2 text-left text-sm hover:bg-crm-panel " +
                    (selectedIds[0] === u.id ? "bg-crm-blue-soft font-medium text-crm-blue" : "text-crm-text")
                  }
                >
                  {label(u)}
                </button>
              ),
            )}
          </div>

          {isMulti && (
            <div className="flex items-center justify-between border-t border-crm-border px-3 py-1.5 text-xs">
              <span className="text-crm-muted">{selectedIds.length} selected</span>
              {selectedIds.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-crm-blue hover:underline">
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
