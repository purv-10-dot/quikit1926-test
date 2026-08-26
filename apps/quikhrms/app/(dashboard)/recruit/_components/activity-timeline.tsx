"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  FileText, Pencil, ChevronDown, ChevronRight, CalendarClock, Clock, Users, Check, ShieldX, User, Video, Send, Rocket,
} from "lucide-react";

export interface ActivityEntry {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  names?: string[];
  actor?: { id: string; name: string; jobTitle?: string | null } | null;
  at: string;
}

const KIND_META: Record<string, { cls: string; dot: string; icon: React.ReactNode }> = {
  Created:             { cls: "bg-[#dcfce7] text-[#16a34a]", dot: "bg-[#22c55e]", icon: <FileText size={11} /> },
  Updated:             { cls: "bg-slate-100 text-slate-700", dot: "bg-slate-500", icon: <Pencil size={11} /> },
  StatusChanged:       { cls: "bg-sky-50 text-sky-700", dot: "bg-sky-500", icon: <ChevronDown size={11} /> },
  DateRevised:         { cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500", icon: <CalendarClock size={11} /> },
  SlaOverrideChanged:  { cls: "bg-orange-50 text-orange-700", dot: "bg-orange-500", icon: <Clock size={11} /> },
  RecruiterAssigned:   { cls: "bg-teal-50 text-teal-700", dot: "bg-teal-500", icon: <Users size={11} /> },
  Approved:            { cls: "bg-green-50 text-green-700", dot: "bg-green-500", icon: <Check size={11} /> },
  Rejected:            { cls: "bg-red-50 text-red-700", dot: "bg-red-500", icon: <ShieldX size={11} /> },
  ApplicationReceived: { cls: "bg-purple-50 text-purple-700", dot: "bg-purple-500", icon: <User size={11} /> },
  StageChanged:        { cls: "bg-cyan-50 text-cyan-700", dot: "bg-cyan-500", icon: <ChevronRight size={11} /> },
  InterviewScheduled:  { cls: "bg-violet-50 text-violet-700", dot: "bg-violet-500", icon: <Video size={11} /> },
  OfferSent:           { cls: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500", icon: <Send size={11} /> },
  Hired:               { cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: <Rocket size={11} /> },
};

/** Shared timeline list — used by the per-Requisition Timeline and the
 * per-Recruiter Activity view. Grouped entries (5 candidates moved to
 * "Source") expand on click to show the individual names. */
export function ActivityTimelineList({ entries }: { entries: ActivityEntry[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="relative max-h-[55vh] overflow-y-auto pr-2">
      <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-200" />
      <ul className="space-y-3">
        {entries.map((e) => {
          const meta = KIND_META[e.kind] ?? KIND_META.Updated;
          const isOpen = expanded.has(e.id);
          const hasNames = !!e.names?.length;
          return (
            <li key={e.id} className="relative pl-9">
              <span className={clsx("absolute left-0 top-1 w-7 h-7 rounded-full ring-4 ring-white flex items-center justify-center text-white shadow-sm", meta.dot)}>
                {meta.icon}
              </span>
              <div
                className={clsx("bg-white rounded-lg border border-slate-200 p-3 shadow-sm", hasNames && "cursor-pointer hover:border-slate-300")}
                onClick={hasNames ? () => toggle(e.id) : undefined}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-slate-900 flex items-center gap-1">
                    {hasNames && (isOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />)}
                    {e.title}
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {new Date(e.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                {e.description && <p className="text-xs text-slate-600 mt-1">{e.description}</p>}
                {hasNames && isOpen && (
                  <ul className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {e.names!.map((n, i) => (
                      <li key={i} className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[11px] ring-1 ring-slate-100">{n}</li>
                    ))}
                  </ul>
                )}
                {e.actor && (
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    by <span className="font-medium text-slate-700">{e.actor.name}</span>
                    {e.actor.jobTitle && <> · {e.actor.jobTitle}</>}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
