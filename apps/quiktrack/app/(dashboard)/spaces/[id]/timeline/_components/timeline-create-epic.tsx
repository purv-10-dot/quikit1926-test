"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Zap, User as UserIcon } from "lucide-react";
import type { Col, Member } from "./timeline-meta";
import { WORK_COL_WIDTH, avatarColor, fullName, initials } from "./timeline-meta";

/**
 * Inline "+ Create Epic" row used at the top of the timeline. Click to open
 * an input + assignee picker; Enter or blur saves; Escape cancels. POSTs to
 * /api/issues with type=EPIC and notifies the parent so the new epic shows.
 */
export function TimelineCreateEpic({
  projectId,
  members,
  currentUserId,
  columns,
  onCreated,
}: {
  projectId: string;
  members: Member[];
  currentUserId: string | null;
  columns: Col[];
  onCreated: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 0);
  }, [creating]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerOpen && pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const filteredMembers = useMemo(() => {
    const q = pickerFilter.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${fullName(m)} ${m.user?.email ?? ""}`.toLowerCase().includes(q),
    );
  }, [members, pickerFilter]);

  const selectedMember = assigneeId
    ? members.find((m) => m.userId === assigneeId) ?? null
    : null;

  async function submit() {
    const t = title.trim();
    if (!t) {
      setCreating(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: t,
          type: "EPIC",
          assigneeId: assigneeId ?? undefined,
        }),
      }).then((r) => r.json());
      if (res?.success) {
        setTitle("");
        setAssigneeId(null);
        setCreating(false);
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex border-b border-gray-100 relative">
      <div
        style={{ width: WORK_COL_WIDTH }}
        className="shrink-0 px-3 py-2 sticky left-0 bg-white z-[15]"
      >
        {creating ? (
          <div className="relative">
            <div className="flex items-center h-9 pl-2 pr-1 border border-blue-500 rounded-md bg-white shadow-sm">
              <Zap className="h-3.5 w-3.5 text-purple-600 shrink-0" />
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") {
                    setTitle("");
                    setAssigneeId(null);
                    setCreating(false);
                  }
                }}
                onBlur={(e) => {
                  if (
                    pickerRef.current &&
                    pickerRef.current.contains(e.relatedTarget as Node)
                  )
                    return;
                  if (!pickerOpen) submit();
                }}
                disabled={submitting}
                placeholder="What needs to be done?"
                className="flex-1 ml-2 text-xs text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="h-7 w-7 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 shrink-0"
                aria-label="Assign"
              >
                {selectedMember ? (
                  <span
                    className="h-6 w-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center"
                    style={{ background: avatarColor(selectedMember.userId) }}
                  >
                    {initials(selectedMember)}
                  </span>
                ) : (
                  <UserIcon className="h-3.5 w-3.5 text-gray-500" />
                )}
              </button>
            </div>

            {pickerOpen && (
              <div
                ref={pickerRef}
                className="absolute left-0 top-full mt-1 w-[300px] bg-white border border-gray-200 rounded-md shadow-lg z-30"
              >
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={pickerFilter}
                    onChange={(e) => setPickerFilter(e.target.value)}
                    placeholder="Search assignee"
                    className="w-full h-8 px-2 text-xs border border-blue-500 rounded outline-none"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAssigneeId(null);
                      setPickerOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <span className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <UserIcon className="h-3 w-3 text-gray-500" />
                    </span>
                    Unassigned
                  </button>
                  {filteredMembers.map((m) => {
                    const isMe = m.userId === currentUserId;
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        onClick={() => {
                          setAssigneeId(m.userId);
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <span
                          className="h-6 w-6 rounded-full text-white text-[10px] font-semibold flex items-center justify-center shrink-0"
                          style={{ background: avatarColor(m.userId) }}
                        >
                          {initials(m)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-gray-900">{fullName(m)}</span>
                          {isMe && <span className="text-gray-500"> (Assign to me)</span>}
                          {m.user?.email && (
                            <div className="text-[11px] text-gray-500 truncate">
                              {m.user.email}
                            </div>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Epic
          </button>
        )}
      </div>
      {columns.map((c) => (
        <div
          key={c.key}
          style={{ width: c.width }}
          className={`shrink-0 border-r border-gray-100 ${creating ? "bg-gray-50" : ""}`}
        />
      ))}
    </div>
  );
}
