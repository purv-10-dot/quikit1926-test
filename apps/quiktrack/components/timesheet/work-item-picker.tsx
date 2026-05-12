"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, CheckSquare, Bug, Bookmark, Zap, ListChecks } from "lucide-react";

interface IssueOption { id: string; key: string; title: string; type: string }
interface Props {
  issues: IssueOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const TYPE_ICON: Record<string, { Icon: React.ElementType; color: string }> = {
  TASK:    { Icon: CheckSquare, color: "text-blue-500" },
  STORY:   { Icon: Bookmark,    color: "text-green-600" },
  BUG:     { Icon: Bug,         color: "text-red-500" },
  EPIC:    { Icon: Zap,         color: "text-purple-600" },
  SUBTASK: { Icon: ListChecks,  color: "text-blue-400" },
};

export function WorkItemPicker({ issues, value, onChange, disabled, placeholder = "Pick a task or subtask" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((i) => i.key.toLowerCase().includes(q) || (i.title ?? "").toLowerCase().includes(q));
  }, [issues, query]);

  const selected = issues.find((i) => i.id === value);
  const meta = (t: string) => TYPE_ICON[t] ?? TYPE_ICON.TASK!;

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
        {selected ? (
          <>
            {(() => { const { Icon, color } = meta(selected.type); return <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />; })()}
            <span className="font-medium text-gray-900">{selected.key}</span>
            <span className="text-gray-700 truncate flex-1">{selected.title}</span>
          </>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg py-1">
          <div className="px-2 py-1.5 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search work items"
                className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No work items match.</div>
            ) : filtered.map((i) => {
              const { Icon, color } = meta(i.type);
              const active = i.id === value;
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => { onChange(i.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${active ? "bg-blue-50" : ""}`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="font-medium text-gray-900 shrink-0">{i.key}</span>
                  <span className="text-gray-700 truncate flex-1">{i.title}</span>
                  {i.type === "SUBTASK" && <span className="text-[10px] text-gray-400 shrink-0">subtask</span>}
                  {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
