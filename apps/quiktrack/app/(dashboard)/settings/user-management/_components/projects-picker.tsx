"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search, X } from "lucide-react";

interface Project {
  id: string;
  name: string;
  projectKey: string;
  color?: string | null;
}

/**
 * Multi-select dropdown for picking QuikTrack projects. Renders a pill
 * trigger that shows the selected count, opens a searchable checkbox list,
 * and supports keyboard dismiss.
 *
 * Used by the global Add User drawer so admins can attach the new invitee
 * to one or more projects in the same submit.
 */
export function ProjectsPicker({
  selected,
  onChange,
  label = "Projects",
  placeholder = "None — assign later",
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["quiktrack", "projects-picker"],
    queryFn: async () => {
      const r = await fetch("/api/projects?pageSize=200");
      const j = await r.json();
      return ((j.data ?? []) as Project[]) ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const projects = q.data ?? [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedSet.has(p.id)),
    [projects, selectedSet],
  );
  const filtered = useMemo(() => {
    if (!search) return projects;
    const s = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.projectKey.toLowerCase().includes(s),
    );
  }, [projects, search]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function removeChip(id: string) {
    onChange(selected.filter((x) => x !== id));
  }

  return (
    <div className="block text-sm" ref={wrapRef}>
      <span className="text-gray-700 mb-1 block">{label}</span>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full min-h-9 px-2 py-1.5 text-left border border-gray-200 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400 flex items-center gap-1.5 flex-wrap"
        >
          {selectedProjects.length === 0 ? (
            <span className="text-sm text-gray-400 pl-1">{placeholder}</span>
          ) : (
            selectedProjects.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ background: p.color ?? "#2563eb" }}
                />
                <span className="font-medium">{p.projectKey}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(p.id);
                  }}
                  className="hover:bg-blue-100 rounded p-0.5"
                  aria-label={`Remove ${p.name}`}
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 text-gray-400 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-hidden flex flex-col">
            <div className="px-2 py-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full h-8 pl-8 pr-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {q.isLoading ? (
                <p className="px-3 py-3 text-xs text-gray-400">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-3 text-xs text-gray-400">
                  {search ? "No matches." : "No projects in this organisation."}
                </p>
              ) : (
                filtered.map((p) => {
                  const checked = selectedSet.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          checked
                            ? "bg-blue-600 border-blue-600"
                            : "border-gray-300 bg-white"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3 text-white" />}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        style={{ background: p.color ?? "#2563eb" }}
                      />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400">
                        {p.projectKey}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selected.length > 0 && (
              <div className="px-2 py-1.5 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-500">
                  {selected.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[11px] text-gray-500 hover:text-red-600"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
