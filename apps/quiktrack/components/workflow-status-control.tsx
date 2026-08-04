"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Zap, GitBranch, HelpCircle } from "lucide-react";

/**
 * The one status control that honours the workflow (the design guide's §4:
 * "the set of transitions out of a status is exactly the set of buttons the
 * user sees"). Two modes, decided by whether a published workflow governs the
 * item:
 *
 *  - GATED   → current status pill → menu of LEGAL TRANSITIONS
 *              ("Resolve Issue → Resolved") + View / Explain workflow.
 *              The full status list is not offered (it's read-only elsewhere).
 *  - UNGATED → today's free picker (every status), for spaces without a
 *              published workflow (opt-in, per the guide's §1 asymmetry).
 *
 * The control only DECIDES the target status; the parent keeps its own PATCH
 * (via onChange), so every existing consumer wires in without new endpoints.
 */

export interface StatusOption {
  id: string;
  name: string;
  category: string;
}

interface AvailableTransition {
  id: string;
  name: string;
  toStatusId: string;
}

interface TransitionsResponse {
  gated: boolean;
  transitions: AvailableTransition[];
}

function statusPillClass(category?: string): string {
  if (category === "IN_PROGRESS") return "bg-blue-100 text-blue-800";
  if (category === "DONE") return "bg-green-100 text-green-800";
  return "bg-gray-100 text-gray-700";
}

async function fetchTransitions(issueId: string): Promise<TransitionsResponse> {
  const r = await fetch(`/api/issues/${issueId}/transitions`);
  const j = await r.json();
  if (!r.ok || !j.success) return { gated: false, transitions: [] };
  return j.data as TransitionsResponse;
}

export function WorkflowStatusControl({
  issueId,
  projectId,
  currentStatusId,
  currentStatusName,
  currentStatusCategory,
  statuses,
  onChange,
  onViewWorkflow,
  size = "md",
  disabled,
}: {
  issueId: string;
  projectId: string;
  currentStatusId: string;
  currentStatusName: string;
  currentStatusCategory?: string;
  /** Project status catalog — used for the ungated free picker + target labels. */
  statuses: StatusOption[];
  onChange: (statusId: string) => void | Promise<void>;
  /** Optional: "View workflow" link target (e.g. open the editor). */
  onViewWorkflow?: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Fixed-position coords for the portal menu. The menu is rendered into
  // document.body so it can't be clipped by any scroll container (backlog,
  // list, table all wrap this control in an `overflow-y-auto` box).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Legal transitions for THIS issue (only fetched when the menu opens, so we
  // don't fire a request for every row until the user interacts).
  const transitions = useQuery({
    queryKey: ["quiktrack", "issue-transitions", issueId],
    queryFn: () => fetchTransitions(issueId),
    enabled: open,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled outside `ref`, so check both the trigger and menu.
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Position the portal menu just below the trigger. Recompute on open and on
  // scroll/resize so it tracks the button while the menu is up. Right-aligned
  // to the button so it never runs off the right edge of a narrow row.
  useLayoutEffect(() => {
    if (!open) return;
    const MENU_WIDTH = 240;
    const compute = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      setPos({ top: r.bottom + 4, left });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  const statusById = new Map(statuses.map((s) => [s.id, s]));
  const gated = transitions.data?.gated ?? false;
  const legal = transitions.data?.transitions ?? [];
  const pad = size === "sm" ? "h-6 px-2 text-[11px]" : "h-8 px-3 text-xs";

  const pick = async (statusId: string) => {
    setOpen(false);
    if (statusId !== currentStatusId) await onChange(statusId);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded font-semibold uppercase tracking-wider ${pad} ${statusPillClass(
          currentStatusCategory,
        )} disabled:opacity-60`}
      >
        {currentStatusName}
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
          className="z-[100] min-w-[220px] rounded-md border border-gray-200 bg-white py-1.5 shadow-lg">
          {transitions.isLoading ? (
            <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
          ) : gated ? (
            <>
              {legal.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-400">No available transitions.</div>
              ) : (
                legal.map((t) => {
                  const to = statusById.get(t.toStatusId);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pick(t.toStatusId)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <Zap className="h-3.5 w-3.5 shrink-0 text-gray-500" fill="currentColor" />
                      <span className="text-gray-800">{t.name}</span>
                      <span className="text-gray-300">→</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusPillClass(
                          to?.category,
                        )}`}
                      >
                        {to?.name ?? t.toStatusId}
                      </span>
                    </button>
                  );
                })
              )}
              <div className="my-1 border-t border-gray-100" />
              {onViewWorkflow && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onViewWorkflow();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  <GitBranch className="h-3.5 w-3.5 text-gray-500" /> View workflow
                </button>
              )}
              <div
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-400"
                title="Shows why these are the only available moves"
              >
                <HelpCircle className="h-3.5 w-3.5" /> These are the only moves your workflow allows.
              </div>
            </>
          ) : (
            // Ungated: no published workflow → free picker (every status).
            statuses.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s.id)}
                className={`flex w-full items-center px-2.5 py-1 text-left hover:bg-gray-50 ${
                  s.id === currentStatusId ? "bg-blue-50/60" : ""
                }`}
              >
                <span
                  className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusPillClass(
                    s.category,
                  )}`}
                >
                  {s.name}
                </span>
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
