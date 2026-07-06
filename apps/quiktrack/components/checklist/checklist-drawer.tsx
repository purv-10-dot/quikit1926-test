"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, SlidersHorizontal, X, MoreHorizontal, Loader2, ListChecks } from "lucide-react";
import { useChecklist } from "./use-checklist";
import { ChecklistItemRow } from "./checklist-item-row";
import { ManageStatuses } from "./manage-statuses";

/**
 * Personal to-do checklist — a right slide-over opened from the top bar. Not
 * tied to any project and private to the signed-in user.
 *
 * Rendered as a portal-mounted overlay rather than @quikit/ui <RightPanel> so we
 * can match this module's spec exactly (large title, header overflow menu, blue
 * progress bar, and a bottom footer for Manage statuses / Hide completed).
 * TODO(integration): fold these header/footer affordances into @quikit/ui.
 */
export function ChecklistDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const cl = useChecklist(open);
  const [managing, setManaging] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Drag-to-resize the drawer width (persisted). Right-docked, so a wider drawer
  // means dragging the LEFT edge leftwards.
  const MIN_W = 360;
  const MAX_W = 900;
  const [width, setWidth] = useState(420);
  const draggingRef = useRef(false);
  useEffect(() => {
    const saved = Number(localStorage.getItem("qt.checklistWidth"));
    if (saved >= MIN_W && saved <= MAX_W) setWidth(saved);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("qt.checklistWidth", String(width));
    } catch {
      /* ignore */
    }
  }, [width]);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const w = Math.min(Math.max(window.innerWidth - e.clientX, MIN_W), Math.min(MAX_W, window.innerWidth - 80));
      setWidth(w);
    }
    function onUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.userSelect = "none";
  }

  // Body scroll lock + Esc to close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const total = cl.total;
  const doneCount = cl.checked;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const visible = hideCompleted ? cl.items.filter((i) => !i.isCompleted) : cl.items;

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = cl;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length]);

  function addTask() {
    const next = newTask.trim();
    if (!next) return;
    cl.addItem.mutate(next);
    setNewTask("");
  }

  async function createStatus(name: string, color: string): Promise<string | null> {
    const json = (await cl.addStatus.mutateAsync({ name, color })) as { data?: { id?: string } };
    return json?.data?.id ?? null;
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex" role="dialog" aria-modal="true" aria-label="My checklist">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        style={{ width }}
        className="relative ml-auto flex h-full max-w-[95vw] flex-col bg-white shadow-2xl dark:bg-gray-900"
      >
        {/* Drag the left edge to resize */}
        <div
          onMouseDown={startResize}
          className="absolute left-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-blue-500/40"
          title="Drag to resize"
          aria-hidden="true"
        />
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100 px-5 pt-4 pb-3 dark:border-gray-800">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {managing ? "Manage statuses" : "My checklist"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {managing
                  ? "Your personal status labels"
                  : total > 0
                    ? `${doneCount} of ${total} complete`
                    : "Your personal to-dos"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!managing && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="More options"
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                      <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                        <button
                          type="button"
                          onClick={() => {
                            setManaging(true);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <SlidersHorizontal className="h-4 w-4" /> Manage statuses
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!managing && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="scrollbar-visible min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {managing ? (
            <ManageStatuses
              statuses={cl.statuses}
              onAdd={(name, color) => cl.addStatus.mutate({ name, color })}
              onPatch={(id, fields) => cl.patchStatus.mutate({ id, fields })}
              onRemove={(id) => cl.removeStatus.mutate(id)}
              onBack={() => setManaging(false)}
            />
          ) : (
            <>
              {/* Add a task */}
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
                <Plus className="h-5 w-5 shrink-0 text-blue-600" />
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="Add a task"
                  maxLength={255}
                  className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={addTask}
                  disabled={!newTask.trim() || cl.addItem.isPending}
                  className="h-7 shrink-0 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-gray-700"
                >
                  Save
                </button>
              </div>

              {/* List */}
              {cl.loading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-9 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
                  ))}
                </div>
              ) : visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ListChecks className="mb-3 h-8 w-8 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {total === 0 ? "Your checklist is empty" : "Nothing to show"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {total === 0
                      ? "Add your first task above to get started."
                      : "All tasks are completed and hidden."}
                  </p>
                </div>
              ) : (
                <div className="pt-1">
                  {visible.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      statuses={cl.statuses}
                      onPatch={(fields) => cl.patchItem.mutate({ id: item.id, fields })}
                      onRemove={() => cl.removeItem.mutate(item.id)}
                      onCreateStatus={createStatus}
                    />
                  ))}
                  {hasNextPage && <div ref={sentinelRef} className="h-1" />}
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading more…
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!managing && (
          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setManaging(true)}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Manage statuses
            </button>
            <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              Hide completed
            </label>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
