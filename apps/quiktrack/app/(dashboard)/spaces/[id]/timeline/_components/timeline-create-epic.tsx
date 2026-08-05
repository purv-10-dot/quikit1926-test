"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Zap, User as UserIcon } from "lucide-react";
import {
  anchorFromRect,
  useAnchoredPanel,
  type PanelAnchor,
} from "@/lib/hooks/useAnchoredPanel";
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
  leftWidth = WORK_COL_WIDTH,
}: {
  projectId: string;
  members: Member[];
  currentUserId: string | null;
  columns: Col[];
  onCreated: () => void;
  /** Width of the frozen left area (Work + optional Status/Assignee columns). */
  leftWidth?: number;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Screen-space anchor for the portaled picker (see the render below).
  const [pickerAnchor, setPickerAnchor] = useState<PanelAnchor | null>(null);
  const [pickerFilter, setPickerFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Wraps the whole inline editor (input + assignee button + picker). Blur is
  // "save" here, so moving focus anywhere *inside* the editor must not save.
  const editorRef = useRef<HTMLDivElement>(null);
  const pickerStyle = useAnchoredPanel(pickerRef, pickerOpen ? pickerAnchor : null, {
    width: 300,
  });

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 0);
  }, [creating]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!pickerOpen || !pickerRef.current) return;
      const target = e.target as Node;
      if (pickerRef.current.contains(target)) return;
      setPickerOpen(false);
      setPickerFilter("");
      // Focus is in the picker's search box at this point, so the title
      // input's blur-to-save has already fired. Clicking elsewhere in the
      // editor puts focus back on the title (Enter still saves); clicking
      // right out of the editor saves, matching what blur would have done.
      if (editorRef.current?.contains(target)) {
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (title.trim() && !submitting) {
        void submitRef.current?.();
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen, title, submitting]);

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

  /** Close the picker and hand focus back to the title input, so Enter still
   *  saves (and a click away still blur-saves) after choosing an assignee. */
  function closePicker() {
    setPickerOpen(false);
    setPickerFilter("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  // Held in a ref so the outside-click listener above can call the latest
  // version without re-subscribing on every keystroke.
  const submitRef = useRef<() => Promise<void>>();

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
  submitRef.current = submit;

  return (
    <div className="flex border-b border-gray-100 relative">
      <div
        style={{ width: leftWidth }}
        className="shrink-0 px-3 py-2 sticky left-0 bg-white z-[15] border-r border-gray-100"
      >
        {creating ? (
          <div ref={editorRef} className="relative">
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
                  // Focus moving to the assignee button, the picker, or
                  // anywhere else inside the editor is not "done editing" —
                  // only a click away from the editor saves. Checking the
                  // picker alone wasn't enough: the picker isn't mounted yet
                  // when the assignee button takes focus, so the blur read as
                  // "clicked away" and created the epic on the spot.
                  const next = e.relatedTarget as Node | null;
                  // The picker is portaled to <body>, so it is NOT inside
                  // `editorRef` — check it separately.
                  if (next && editorRef.current?.contains(next)) return;
                  if (next && pickerRef.current?.contains(next)) return;
                  if (pickerOpen) return;
                  submit();
                }}
                disabled={submitting}
                placeholder="What needs to be done?"
                className="flex-1 ml-2 text-xs text-gray-900 placeholder:text-gray-400 outline-none disabled:opacity-50"
              />
              <button
                type="button"
                // Keep focus on the title input: without this the button takes
                // focus on mousedown, the input's blur-to-save fires before
                // this click, and the epic is created instead of the picker
                // opening. (Safari doesn't focus buttons at all, so the blur
                // guard above can't rely on `relatedTarget` either.)
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (pickerOpen) {
                    closePicker();
                    return;
                  }
                  setPickerAnchor(anchorFromRect(e.currentTarget.getBoundingClientRect()));
                  setPickerOpen(true);
                }}
                className="h-7 w-7 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 shrink-0"
                aria-label="Assign"
                aria-expanded={pickerOpen}
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

            {pickerOpen &&
              createPortal(
                <div
                  ref={pickerRef}
                  // Portaled to <body>: the create row's frozen cell is
                  // `sticky … z-[15]`, which is its own stacking context, so an
                  // absolutely positioned panel inside it can never paint above the
                  // epic rows below (their frozen cells share z-15 and come later in
                  // the DOM) — the list rendered *behind* the timeline data. Same
                  // reason the inline Status/Assignee editors are portaled.
                  style={{ ...pickerStyle, zIndex: 100 }}
                  className="w-[300px] rounded-md border border-gray-200 bg-white shadow-lg"
                >
                  <div className="p-2 border-b border-gray-100">
                    <input
                      autoFocus
                      value={pickerFilter}
                      onChange={(e) => setPickerFilter(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          closePicker();
                        }
                      }}
                      placeholder="Search assignee"
                      className="w-full h-8 px-2 text-xs border border-blue-500 rounded outline-none"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAssigneeId(null);
                        closePicker();
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
                            closePicker();
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
                </div>,
                document.body,
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
