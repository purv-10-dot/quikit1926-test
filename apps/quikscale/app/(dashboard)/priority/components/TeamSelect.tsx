"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type Team } from "@/lib/hooks/useTeams";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { humanizeApiError } from "@/lib/utils/humanizeError";

// ── Team select with inline Add New ──────────────────────────────────────────
// Shared by the Add/Edit Priority modal and the OPSP "Export → Create
// Priorities" drawer. Renders a "No team" default, the tenant's teams, and an
// inline "Add New Team" creator that POSTs to /api/teams and re-selects the
// new team on success.

export function TeamSelect({
  value,
  onChange,
  teams,
}: {
  value: string;
  onChange: (id: string) => void;
  teams: Team[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setAdding(false);
    setNewName("");
    setErr("");
  }, []);
  useClickOutside(ref, handleClose);

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50);
  }, [adding]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { setErr("Team name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create team");
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      onChange(data.data.id);
      setOpen(false);
      setAdding(false);
      setNewName("");
    } catch (e: unknown) {
      setErr(humanizeApiError(e, { context: "team", fallback: "Couldn't create the team. Please try again." }));
    } finally {
      setSaving(false);
    }
  }

  const selectedTeam = teams.find(t => t.id === value);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white text-left ${open ? "border-accent-400 ring-1 ring-accent-400" : "border-gray-200"}`}>
        <span className={selectedTeam ? "text-gray-800" : "text-gray-400"}>
          {selectedTeam ? selectedTeam.name : "No team"}
        </span>
        <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
          {/* No team option */}
          <button type="button" onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${value === "" ? "font-semibold text-gray-800" : "text-gray-500"}`}>
            No team
          </button>

          {/* Existing teams */}
          {teams.map(t => (
            <button key={t.id} type="button" onClick={() => { onChange(t.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between ${value === t.id ? "font-semibold text-gray-800" : "text-gray-700"}`}>
              {t.name}
              {value === t.id && (
                <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}

          {/* Divider + Add New */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {!adding ? (
              <button type="button" onClick={() => setAdding(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-accent-600 hover:bg-accent-50 transition-colors flex items-center gap-1.5 font-medium">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Team
              </button>
            ) : (
              <div className="px-2 pb-2 pt-1 space-y-1.5">
                <input ref={inputRef} value={newName} onChange={e => { setNewName(e.target.value); setErr(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                  placeholder="Team name…"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
                {err && <p className="text-[10px] text-red-500">{err}</p>}
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setAdding(false); setNewName(""); setErr(""); }}
                    className="flex-1 py-1 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="button" onClick={handleCreate} disabled={saving}
                    className="flex-1 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors font-medium">
                    {saving ? "..." : "Add"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
