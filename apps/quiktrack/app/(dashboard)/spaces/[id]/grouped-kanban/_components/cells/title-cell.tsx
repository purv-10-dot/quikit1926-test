"use client";

import { useEffect, useRef, useState } from "react";

interface TitleCellProps {
  taskId: string;
  taskKey: string;
  value: string;
  onCommit: (next: string) => void;
  onOpenDetail: () => void;
}

export function TitleCell({ taskId, taskKey, value, onCommit, onOpenDetail }: TitleCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Single-vs-double click disambiguation: defer the single-click "open
  // detail" by ~220ms; if a dblclick arrives in that window we cancel the
  // timer and enter edit mode instead. Without this the first click of a
  // dblclick would already have opened the detail sheet.
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  function handleSingleClick() {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      onOpenDetail();
    }, 220);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else setDraft(value);
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-full bg-white border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={handleSingleClick}
      onDoubleClick={handleDoubleClick}
      data-task-id={taskId}
      data-task-key={taskKey}
      className="w-full flex items-center min-w-0 text-left cursor-pointer"
    >
      <span className="truncate text-sm text-gray-900 hover:text-blue-700 transition-colors dark:text-slate-100 dark:hover:text-blue-300">
        {value}
      </span>
    </button>
  );
}
