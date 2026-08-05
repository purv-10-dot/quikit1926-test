"use client";

import { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { QuikScaleMascot } from "./quikscale-mascot";

interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of the UI element to spotlight; null = center-of-screen step */
  selector?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "qs:tour-completed";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Hi, I'm Scout 👋",
    body:
      "Welcome to QuikScale! I'll walk you through the nav so you know where everything lives. Skip anytime.",
  },
  {
    id: "sidebar",
    title: "Your navigation home",
    body:
      "Every module — Dashboard, Org Setup, and the four pillars below — lives in this sidebar. Each color-coded section groups related work.",
    selector: '[data-tour="sidebar"]',
  },
  {
    id: "dashboard",
    title: "Dashboard",
    body:
      "Your home base — a rollup view of what needs attention across KPIs, priorities, and action items.",
    selector: '[data-tour="nav-dashboard"]',
  },
  {
    id: "org-setup",
    title: "Org Setup",
    body:
      "Admins configure Teams, Users, Quarter Settings and the Unit Master here. Only visible if your role has access.",
    selector: '[data-tour="nav-org-setup"]',
  },
  {
    id: "section-execution",
    title: "Execution",
    body:
      "Day-to-day tracking: KPI (individual & team), Priority, WWW action items, Meeting Rhythm for client meetings, and Analytics/Scorecards.",
    selector: '[data-tour="section-execution"]',
  },
  {
    id: "section-strategy",
    title: "Strategy",
    body:
      "OPSP planning — create, history, review and category management — plus Habits tracking and SWT analysis.",
    selector: '[data-tour="section-strategy"]',
  },
  {
    id: "section-people",
    title: "People",
    body:
      "Goals & Pillars (review cycles, self-assessment, 1:1s, feedback, talent), FACe, PACe, and Survey all live here.",
    selector: '[data-tour="section-people"]',
  },
  {
    id: "section-cash",
    title: "Cash",
    body: "Track cash-flow categories and units for the org.",
    selector: '[data-tour="section-cash"]',
  },
  {
    id: "app-switcher",
    title: "Switch apps",
    body: "Jump to any other QuikIT app you have access to, without signing out.",
    selector: '[data-tour="app-switcher"]',
  },
  {
    id: "user-menu",
    title: "Your account",
    body: "Settings and sign-out live under your avatar.",
    selector: '[data-tour="user-menu"]',
  },
  {
    id: "done",
    title: "You're set!",
    body: "That's the whirlwind tour. Happy scaling!",
  },
];

/* ─── Anchor-relative placement ───────────────────────────────────────────
 * Steps with a selector spotlight a real UI element — some tiny (header
 * icons), some tall (a whole pillar section wrapper). The bubble+mascot
 * group needs to sit beside whichever one is currently lit up, not pinned
 * to a screen corner. Steps with no selector (welcome/done) keep the
 * original corner-pinned rendering untouched — see the `!anchor` branch
 * below. */

import {
  computeGroupLayout,
  GAP,
  EDGE_MARGIN,
  BUBBLE_WIDTH,
  DEFAULT_BUBBLE_HEIGHT,
  MASCOT_SIZE,
  type Placement,
} from "./tourGeometry";

interface TailProps {
  style: { top?: number; left?: number; right?: number; bottom?: number; transform: string };
  edgeClasses: string;
}

/** The little rotated-square tail always points at the anchor's edge that
 *  faces the bubble — left/right/top/bottom depending on placement — offset
 *  along the shared axis to track the anchor's actual center (clamped
 *  within the bubble's own bounds). */
function tailFor(
  placement: Placement,
  anchor: Rect,
  bubbleTop: number,
  bubbleLeft: number,
  bubbleW: number,
  bubbleH: number,
): TailProps {
  const clampOffset = (v: number, max: number) => Math.min(Math.max(v, 16), Math.max(16, max - 16));

  if (placement === "right" || placement === "left") {
    const offset = clampOffset(anchor.top + anchor.height / 2 - bubbleTop, bubbleH);
    return placement === "right"
      ? { style: { left: -8, top: offset, transform: "translateY(-50%) rotate(45deg)" }, edgeClasses: "border-l border-b" }
      : { style: { right: -8, top: offset, transform: "translateY(-50%) rotate(45deg)" }, edgeClasses: "border-r border-t" };
  }

  const offset = clampOffset(anchor.left + anchor.width / 2 - bubbleLeft, bubbleW);
  return placement === "below"
    ? { style: { top: -8, left: offset, transform: "translateX(-50%) rotate(45deg)" }, edgeClasses: "border-t border-l" }
    : { style: { bottom: -8, left: offset, transform: "translateX(-50%) rotate(45deg)" }, edgeClasses: "border-b border-r" };
}

/** Shared bubble innards (header/body/progress dots/controls) — identical
 *  whether the bubble is corner-pinned (no-selector steps) or anchor-placed. */
function TourBubbleContent({
  step,
  stepIdx,
  totalSteps,
  isFirst,
  isLast,
  onSkip,
  onBack,
  onNext,
}: {
  step: TourStep;
  stepIdx: number;
  /** Count of steps ACTUALLY shown (module-gated ones are filtered out). */
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  onSkip: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-700">
            Scout · Step {stepIdx + 1} of {totalSteps}
          </div>
          <h3 className="mt-1 text-lg font-semibold text-gray-900 leading-tight">{step.title}</h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
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
        {Array.from({ length: totalSteps }).map((_s, i) => (
          <span
            key={i}
            className={`block h-1.5 rounded-full transition-all ${
              i === stepIdx ? "w-6 bg-accent-600" : i < stepIdx ? "w-1.5 bg-accent-300" : "w-1.5 bg-accent-100"
            }`}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst}
            className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium text-gray-700 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-1 h-8 px-4 text-xs font-semibold text-white rounded bg-accent-600 hover:bg-accent-700 shadow"
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
    </>
  );
}

export function QuikScaleTour() {
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  /**
   * Steps whose spotlight target actually exists on this screen.
   *
   * Sidebar pillars are module-gated (`moduleKey` + useDisabledModules), so an
   * org with e.g. Cash switched off never renders `[data-tour="section-cash"]`.
   * Keeping that step would show a card describing a feature the user doesn't
   * have — and with no anchor to resolve it fell through to the corner-pinned
   * welcome layout, i.e. a step with no spotlight at all. Resolved when the
   * tour opens (not at module scope) because the sidebar mounts after this.
   * Steps with no selector (welcome/done) are always kept.
   */
  const [steps, setSteps] = useState<TourStep[]>(STEPS);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(DEFAULT_BUBBLE_HEIGHT);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Auto-launch on first visit; later runs can fire via the qs:tour-start
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

  // Re-resolve on every open — module flags can change between runs.
  useEffect(() => {
    if (!open) return;
    setSteps(
      STEPS.filter((s) => !s.selector || !!document.querySelector(s.selector)),
    );
  }, [open]);

  useEffect(() => {
    function onStart() {
      setStepIdx(0);
      setOpen(true);
    }
    window.addEventListener("qs:tour-start", onStart);
    return () => window.removeEventListener("qs:tour-start", onStart);
  }, []);

  // Recompute the spotlight rect when the step (or window size) changes.
  const measure = useCallback(() => {
    const sel = steps[stepIdx]?.selector;
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
    // `steps` belongs here: it's resolved when the tour opens, so a stale
    // closure would measure the pre-filter step at this index.
  }, [stepIdx, steps]);

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

  // Bubble height varies with each step's copy (width is fixed via
  // BUBBLE_WIDTH, so this is the only dimension that needs remeasuring).
  // useLayoutEffect so the corrected placement lands before paint.
  useLayoutEffect(() => {
    if (!open) return;
    const h = bubbleRef.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - bubbleHeight) > 1) setBubbleHeight(h);
    // Deliberately re-runs whenever bubbleHeight changes too — it converges
    // once the measured height stops moving, same as a popper/floating-ui
    // measure loop; stepIdx covers the case where two steps' copy happens
    // to render at the same height (no bubbleHeight change to re-trigger on).
  }, [open, stepIdx, bubbleHeight]);

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

  const step = steps[stepIdx] ?? steps[0]!;
  const isLast = stepIdx === steps.length - 1;
  const isFirst = stepIdx === 0;

  function goBack() {
    setStepIdx((i) => Math.max(0, i - 1));
  }
  function goNext() {
    if (isLast) finish();
    else setStepIdx((i) => i + 1);
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Anchor-relative layout, only computed for steps with a spotlighted target.
  let placement: Placement | null = null;
  let bubblePx: { top: number; left: number } | null = null;
  let mascotSide: "left" | "right" = "left";
  let tail: TailProps | null = null;
  // Scout + bubble are placed as ONE box, so both are clamped to the viewport
  // and both clear the spotlighted target. See tourGeometry.
  let mascotPx: { top: number; left: number } | null = null;
  if (anchor) {
    const layout = computeGroupLayout(anchor, bubbleHeight, vw, vh);
    placement = layout.placement;
    bubblePx = layout.bubble;
    mascotPx = layout.mascot;
    mascotSide = layout.mascotSide;
    tail = tailFor(placement, anchor, bubblePx.top, bubblePx.left, BUBBLE_WIDTH, bubbleHeight);
  }
  const flip = mascotSide === "right"; // mirror so Scout still faces the bubble
  const mascotTop = mascotPx?.top;
  const mascotLeft = mascotPx?.left;

  return (
    <div className="fixed inset-0 z-[300] pointer-events-none">
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
          <span className="absolute inset-0 rounded-[12px] ring-2 ring-accent-500 qs-tour-ring" />
        </div>
      ) : (
        <div className="fixed inset-0 bg-[#0A1B40]/55 pointer-events-auto" />
      )}

      {anchor && bubblePx && tail ? (
        <>
          {/* Scout — positioned relative to the bubble, not the viewport. */}
          <div
            className="fixed pointer-events-auto qs-tour-slide-in"
            style={{ top: mascotTop, left: mascotLeft, width: MASCOT_SIZE, height: MASCOT_SIZE }}
          >
            <QuikScaleMascot size={MASCOT_SIZE} mode="wave" flip={flip} />
          </div>

          {/* Speech bubble — anchored beside whichever element is spotlighted. */}
          <div
            ref={bubbleRef}
            className="fixed pointer-events-auto qs-tour-slide-in bg-white rounded-2xl shadow-2xl border border-gray-200 p-5"
            style={{ top: bubblePx.top, left: bubblePx.left, width: BUBBLE_WIDTH }}
          >
            <span
              className={`absolute w-4 h-4 bg-white border-gray-200 ${tail.edgeClasses}`}
              style={{ ...tail.style }}
            />
            <TourBubbleContent
              step={step}
              stepIdx={stepIdx}
              totalSteps={steps.length}
              isFirst={isFirst}
              isLast={isLast}
              onSkip={finish}
              onBack={goBack}
              onNext={goNext}
            />
          </div>
        </>
      ) : (
        // No-selector steps (welcome/done) — unchanged: corner-pinned, same
        // as before this redesign.
        <div className="fixed right-6 bottom-6 pointer-events-auto qs-tour-slide-in">
          <div className="flex items-center gap-0">
            {/* -mr-5 == MASCOT_OVERLAP (20px). Was -mr-14 (56px), tuned for
                the old 340px mascot; at 112px that tucked her nearly in half. */}
            <QuikScaleMascot size={MASCOT_SIZE} mode="wave" className="-mr-2" />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 w-[340px]">
              <span className="absolute bottom-7 -left-2 w-4 h-4 rotate-45 bg-white border-gray-200 border-l border-b" />
              <TourBubbleContent
                step={step}
                stepIdx={stepIdx}
                totalSteps={steps.length}
                isFirst={isFirst}
                isLast={isLast}
                onSkip={finish}
                onBack={goBack}
                onNext={goNext}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
