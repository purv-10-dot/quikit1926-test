"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

interface ProjectOption { id: string; name: string }
interface Props {
  projects: ProjectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  disabled,
  placeholder = "Pick a project",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus the search box on open; reset the query on close.
  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  const selected = projects.find((p) => p.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-9 px-3 inline-flex items-center gap-2 text-sm border rounded text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "bg-gray-50 text-gray-400 border-gray-200" :
          open ? "border-blue-500 bg-white" :
          "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <span className={selected ? "text-gray-900 truncate flex-1" : "text-gray-400 flex-1"}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1">
          <div className="px-2 pb-1.5 pt-1">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
                placeholder="Search projects…"
                className="w-full h-8 pl-7 pr-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No projects match.</div>
            ) : (
              filtered.map((p) => {
                const active = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                  >
                    <span className="text-gray-800 truncate flex-1">{p.name}</span>
                    {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
