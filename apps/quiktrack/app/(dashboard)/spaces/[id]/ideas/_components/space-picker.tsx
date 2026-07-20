"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { SpaceIcon } from "@/components/space-icon";

export interface SpaceOption {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
  projectType?: string | null;
}

/** Searchable space/project picker (icon + name + KEY), used by the Create modal. */
export function SpacePicker({
  options,
  value,
  onChange,
}: {
  options: SpaceOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const cur = options.find((p) => p.id === value);
  const filtered = q ? options.filter((p) => `${p.name} ${p.projectKey}`.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        className="flex w-full items-center justify-between gap-2 rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {cur ? <SpaceIcon icon={cur.icon} name={cur.name} color={cur.color} size={18} radius={4} /> : <span>💡</span>}
          <span className="truncate">{cur ? `${cur.name} (${cur.projectKey})` : "Select a space"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search spaces" className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${p.id === value ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
              >
                <SpaceIcon icon={p.icon} name={p.name} color={p.color} size={18} radius={4} />
                <span className="min-w-0 flex-1 truncate">{p.name} <span className="text-gray-400">({p.projectKey})</span></span>
                {p.id === value && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No spaces</p>}
          </div>
        </div>
      )}
    </div>
  );
}
