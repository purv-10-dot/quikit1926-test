"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { KanMascot } from "./kan-mascot";

interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the UI element to spotlight; null = center-of-screen step */
  selector?: string;
}

const STORAGE_KEY = "qt:tour-completed";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Hi, I'm Kan 👋",
    body:
      "Welcome to QuikTrack! I'll give you a 60-second tour of the things you'll use every day. You can skip anytime.",
  },
  {
    id: "sidebar",
    title: "Your navigation home",
    body:
      "Everything important lives in this sidebar — Spaces (your projects), Timesheet, Reports and your dashboards.",
    selector: '[data-tour="sidebar"]',
  },
  {
    id: "spaces",
    title: "Spaces = projects",
    body:
      "Each Space holds a project's board, backlog, list, timeline and docs. Click any Space to dive in.",
    selector: '[data-tour="spaces"]',
  },
  {
    id: "timesheet",
    title: "Log your time",
    body:
      "Track effort in a Jira/Tempo-style grid. Group by user → work item, switch periods, and export to CSV / XLS / PDF.",
    selector: '[data-tour="timesheet"]',
  },
  {
    id: "reports",
    title: "Project Reports",
    body:
      "See task counts, estimates and actual time across every project. Click a row for a per-task time breakdown.",
    selector: '[data-tour="reports"]',
  },
  {
    id: "create",
    title: "Create anything, anywhere",
    body:
      "The Create button (top bar) opens the new-issue modal from any screen — no need to navigate first.",
    selector: '[data-tour="create"]',
  },
  {
    id: "done",
    title: "You're set!",
    body:
      "That's the whirlwind tour. Happy tracking!",
  },
];

export function KanTour() {
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // Auto-launch on first visit; later runs can fire via the qt:tour-start
  // window event so a "Restart tour" button anywhere in the app can call it.
  // Source of truth is the server (survives localStorage clears, syncs across
  // devices). localStorage is a fast-path cache + offline fallback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const localDone = window.localStorage.getItem(STORAGE_KEY);

    (async () => {
      try {
        const res = await fetch("/api/me/tour-status", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as { data?: { completed?: boolean } };
          const serverDone = !!json?.data?.completed;
          if (serverDone) {
            window.localStorage.setItem(STORAGE_KEY, "1");
            return;
          }
          if (!localDone) {
            window.setTimeout(() => !cancelled && setOpen(true), 700);
          }
          return;
        }
      } catch {
        /* network error — fall through to localStorage */
      }
      if (!localDone && !cancelled) {
        window.setTimeout(() => !cancelled && setOpen(true), 700);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onStart() {
      setStepIdx(0);
      setOpen(true);
    }
    window.addEventListener("qt:tour-start", onStart);
    return () => window.removeEventListener("qt:tour-start", onStart);
  }, []);

  // Recompute the spotlight rect when the step (or window size) changes.
  const measure = useCallback(() => {
    const sel = STEPS[stepIdx]?.selector;
    if (!sel) {
      setAnchor(null);
      return;
    }
    const el = document.querySelector(sel);
    if (!el) {
      setAnchor(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setAnchor({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [stepIdx]);

  useEffect(() => {
    if (!open) return;
    measure();
    const t = window.setTimeout(measure, 60); // run after possible layout shifts
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  function finish() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore quota / private-mode errors */
    }
    void fetch("/api/me/tour-status", { method: "POST" }).catch(() => {
      /* best-effort — localStorage still gates re-show this session */
    });
    setOpen(false);
    setStepIdx(0);
  }

  if (!open) return null;

  const step = STEPS[stepIdx]!;
  const isLast = stepIdx === STEPS.length - 1;
  const isFirst = stepIdx === 0;

  // Bubble placement: bottom-right by default; if a target is anchored
  // and lives in the right half of the screen, flip to bottom-left so the
  // bubble doesn't cover the spotlight.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const flipLeft = !!anchor && anchor.left + anchor.width / 2 > vw / 2;
  const bubblePos = flipLeft
    ? "left-6 bottom-6"
    : "right-6 bottom-6";

  return (
    <div className="fixed inset-0 z-[300] qt-route-fade-in pointer-events-none">
      {/* Backdrop with spotlight cutout. We use box-shadow on a small div
          to dim everything around the target rect, leaving a clear window
          on top. When no target is set we fall back to a full dim layer. */}
      {anchor ? (
        <div
          className="fixed pointer-events-auto"
          style={{
            top: anchor.top - 8,
            left: anchor.left - 8,
            width: anchor.width + 16,
            height: anchor.height + 16,
            boxShadow: "0 0 0 9999px rgba(10, 27, 64, 0.55)",
            borderRadius: 12,
            transition: "all 0.25s ease",
          }}
        >
          <span className="absolute inset-0 rounded-[12px] ring-2 ring-[#2684FF] qt-tour-ring" />
        </div>
      ) : (
        <div className="fixed inset-0 bg-[#0A1B40]/55 pointer-events-auto" />
      )}

      {/* Kan + speech bubble — fixed in a corner, pointer-events on so the
          tour controls work even while the rest of the page is dimmed. */}
      <div className={`fixed ${bubblePos} pointer-events-auto qt-tour-slide-in`}>
        <div className="flex items-center gap-0">
          {!flipLeft && <KanMascot size={340} mode="wave" className="-mr-14" />}

          <div className="relative bg-white rounded-2xl shadow-2xl border border-[#DEEBFF] p-5 w-[340px]">
            {/* Bubble tail */}
            <span
              className={`absolute bottom-7 ${flipLeft ? "-right-2" : "-left-2"} w-4 h-4 rotate-45 bg-white border-[#DEEBFF] ${flipLeft ? "border-r border-t" : "border-l border-b"}`}
            />

            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#0065FF]">
                  Kan · Step {stepIdx + 1} of {STEPS.length}
                </div>
                <h3 className="mt-1 text-lg font-semibold text-gray-900 leading-tight">
                  {step.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={finish}
                className="p-1 rounded hover:bg-gray-100 text-gray-500 shrink-0"
                aria-label="Skip tour"
                title="Skip tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-sm text-gray-700 leading-relaxed">{step.body}</p>

            {/* Progress dots */}
            <div className="mt-4 flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`block h-1.5 rounded-full transition-all ${
                    i === stepIdx
                      ? "w-6 bg-[#0065FF]"
                      : i < stepIdx
                        ? "w-1.5 bg-[#4C9AFF]"
                        : "w-1.5 bg-[#DEEBFF]"
                  }`}
                />
              ))}
            </div>

            {/* Controls */}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={finish}
                className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={isFirst}
                  className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium text-gray-700 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isLast) finish();
                    else setStepIdx((i) => i + 1);
                  }}
                  className="inline-flex items-center gap-1 h-8 px-4 text-xs font-semibold text-white rounded bg-gradient-to-br from-[#2684FF] to-[#0052CC] hover:from-[#0065FF] hover:to-[#0747A6] shadow"
                >
                  {isLast ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Got it
                    </>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {flipLeft && <KanMascot size={340} mode="wave" className="-ml-14" flip />}
        </div>
      </div>
    </div>
  );
}
