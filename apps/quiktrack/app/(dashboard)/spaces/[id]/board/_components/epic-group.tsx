"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown, Folder } from "lucide-react";
import type { BoardIssue, BoardStatus, EpicLite } from "./board-meta";
import { TaskCard } from "./task-card";

/**
 * Epic group on the board. Mirrors `EpicCard.jsx` from the reference: gradient
 * purple/blue header card with a chevron + folder + title + task count, and a
 * children container that draws the absolutely-positioned 1px lines connecting
 * the epic to each child task. The backbone height is recomputed on the fly
 * via a ResizeObserver so it always lines up with the centre of the last task.
 */
export function EpicGroup({
  epic,
  tasks,
  projectId,
  epicsById,
  statusesById,
  onOpen,
}: {
  epic: BoardIssue;
  tasks: BoardIssue[];
  projectId: string;
  epicsById: Record<string, EpicLite>;
  statusesById: Record<string, BoardStatus>;
  onOpen?: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [backboneHeight, setBackboneHeight] = useState(0);
  const tasksContainerRef = useRef<HTMLDivElement>(null);
  const taskRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!isExpanded || tasks.length <= 1 || !tasksContainerRef.current) {
      setBackboneHeight(0);
      return;
    }
    const calc = () => {
      if (taskRefs.current.length < 2) {
        setBackboneHeight(0);
        return;
      }
      let total = 0;
      for (let i = 0; i < taskRefs.current.length - 1; i++) {
        const el = taskRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const mb = parseFloat(cs.marginBottom) || 0;
        total += rect.height + mb;
      }
      setBackboneHeight(Math.max(0, total + 38));
    };
    const rafId = requestAnimationFrame(() => setTimeout(calc, 0));
    const observers: ResizeObserver[] = [];
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const setupObservers = () => {
      observers.forEach((o) => o.disconnect());
      observers.length = 0;
      taskRefs.current.forEach((el) => {
        if (!el) return;
        const o = new ResizeObserver(() => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(calc, 10);
        });
        o.observe(el);
        observers.push(o);
      });
    };
    const tid = setTimeout(setupObservers, 50);
    window.addEventListener("resize", calc);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(tid);
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("resize", calc);
      observers.forEach((o) => o.disconnect());
    };
  }, [isExpanded, tasks.length, tasks]);

  if (!tasks || tasks.length === 0) return null;

  return (
    <div className="relative">
      <div
        onClick={() => setIsExpanded((v) => !v)}
        className="bg-white border border-gray-200 rounded-md p-2.5 hover:shadow-sm transition-all cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-purple-600 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-purple-600 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-purple-600 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900 flex-1 line-clamp-1">
            {epic.title || "Untitled Epic"}
          </h3>
          <span className="text-xs text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded flex-shrink-0">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>
      </div>

      {isExpanded && (
        <div ref={tasksContainerRef} className="ml-1 mt-2 pb-1 relative">
          {/* Vertical line from epic header down to the first task's centre. */}
          <div
            className="absolute left-[6px] bg-[#CAC8C6] w-[1px]"
            style={{ top: "-8px", height: "20px" }}
          />
          {/* Backbone running through all tasks beyond the first. */}
          {tasks.length > 1 && backboneHeight > 0 && (
            <div
              className="absolute left-[6px] bg-[#CAC8C6] w-[1px]"
              style={{ top: "12px", height: `${backboneHeight}px` }}
            />
          )}

          {tasks.map((task, idx) => {
            const isLast = idx === tasks.length - 1;
            return (
              <div
                key={task.id}
                ref={(el) => {
                  taskRefs.current[idx] = el;
                }}
                className={`relative ${!isLast ? "mb-2" : ""}`}
              >
                {/* Vertical from backbone down to this task's centre (~50px). */}
                <div
                  className="absolute left-[6px] bg-[#CAC8C6] w-[1px]"
                  style={{ top: "0px", height: "50px", zIndex: 1 }}
                />
                {!isLast && (
                  <div
                    className="absolute bg-[#CAC8C6]"
                    style={{
                      left: "7px",
                      top: "50px",
                      width: "18px",
                      height: "1px",
                      zIndex: 1,
                    }}
                  />
                )}
                {isLast && (
                  <div
                    className="absolute"
                    style={{
                      left: "6px",
                      top: "46px",
                      width: "19px",
                      height: "10px",
                      borderLeft: "1px solid #CAC8C6",
                      borderBottom: "1px solid #CAC8C6",
                      zIndex: 1,
                    }}
                  />
                )}

                <div className="ml-6 relative z-0">
                  <TaskCard
                    task={task}
                    projectId={projectId}
                    epicsById={epicsById}
                    statusesById={statusesById}
                    hideEpicChip
                    onOpen={onOpen}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
