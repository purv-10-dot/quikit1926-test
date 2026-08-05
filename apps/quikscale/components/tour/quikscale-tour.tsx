"use client";

import { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { useSession } from "next-auth/react";
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

/**
 * localStorage keys.
 *
 * Both are suffixed with the signed-in user's id. The unsuffixed key was a
 * single browser-wide flag, which broke two ways on a shared device: user B
 * inherited user A's "completed" state, and switching accounts could never
 * re-show the tour. `LEGACY_STORAGE_KEY` is only read to migrate/clean up.
 */
const LEGACY_STORAGE_KEY = "qs:tour-completed";
const storageKey = (userId: string) => `qs:tour-completed:${userId}`;
/** Set when a completion POST failed — retried on the next mount. */
const pendingSyncKey = (userId: string) => `qs:tour-pending-sync:${userId}`;

/** POST the completion flag, retrying transient failures. */
async function postCompletion(attempts = 2): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch("/api/me/tour-status", { method: "POST" });
      if (res.ok) return true;
    } catch {
      /* network error — fall through to retry */
    }
    if (i < attempts - 1) {
      await new Promise((r) => window.setTimeout(r, 400 * (i + 1)));
    }
  }
  return false;
}

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
  const { data: session } = useSession();
  const userId = session?.user?.id;
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

  // Auto-launch on first visit; later runs fire via the qs:tour-start window
  // event (the "Take the tour again" item in the user menu).
  //
  // The server is the ONLY source of truth, and the gate FAILS CLOSED: the
  // tour opens only when the API explicitly answers `completed: false`. Any
  // 500/offline/non-ok response leaves it shut.
  //
  // Why fail closed: `globalSignOut()` calls `localStorage.clear()`, so the
  // local cache is wiped on every logout and cannot vouch for a returning
  // user. Under the old fail-open branch a single broken GET meant the tour
  // replayed on every single login, forever — which is exactly what happened
  // when /api/me/tour-status started 500-ing. Never seeing the tour is a far
  // cheaper failure than seeing it every login.
  //
  // localStorage remains a fast-path cache only: it can SUPPRESS the tour
  // before the fetch resolves, never trigger it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!userId) return; // wait for the session before keying storage
    let cancelled = false;

    // One-time migration off the old browser-wide key.
    try {
      if (window.localStorage.getItem(LEGACY_STORAGE_KEY)) {
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      /* storage may be unavailable under strict privacy settings */
    }

    const readFlag = (key: string) => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const writeFlag = (key: string, value: string | null) => {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        /* ignore quota / private-mode errors */
      }
    };

    const localDone = readFlag(storageKey(userId));
    const pendingSync = readFlag(pendingSyncKey(userId));

    (async () => {
      // A previous run finished but its POST never landed — replay it so the
      // server catches up instead of re-showing the tour on the next device.
      if (pendingSync) {
        const ok = await postCompletion();
        if (cancelled) return;
        if (ok) writeFlag(pendingSyncKey(userId), null);
        return; // either way this user has already completed it
      }

      if (localDone) return;

      try {
        const res = await fetch("/api/me/tour-status", { cache: "no-store" });
        if (cancelled || !res.ok) return; // fail closed
        const json = (await res.json()) as { data?: { completed?: boolean } };
        if (cancelled) return;
        if (json?.data?.completed) {
          writeFlag(storageKey(userId), "1");
          return;
        }
        window.setTimeout(() => !cancelled && setOpen(true), 700);
      } catch {
        /* network error — fail closed, stay silent */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-resolve on every open — module flags can change between runs.
  useEffect(() => {
    if (!open) return;
    setSteps(
      STEPS.filter((s) => !s.selector || !!document.querySelector(s.selector)),
    );
  }, [open]);

  // Manual restart ("Take the tour again" in the user menu). Clearing the
  // flags on both sides matters: leave the server row in place and the tour
  // would open now but never again after a reload.
  useEffect(() => {
    function onStart() {
      if (userId) {
        try {
          window.localStorage.removeItem(storageKey(userId));
          window.localStorage.removeItem(pendingSyncKey(userId));
        } catch {
          /* ignore */
        }
      }
      void fetch("/api/me/tour-status", { method: "DELETE" }).catch(() => {
        /* best-effort — the tour still runs for this session */
      });
      setStepIdx(0);
      setOpen(true);
    }
    window.addEventListener("qs:tour-start", onStart);
    return () => window.removeEventListener("qs:tour-start", onStart);
  }, [userId]);

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

  /**
   * Records completion (a skip counts as done) and closes the tour.
   *
   * The close is optimistic — the user is finished either way — but the
   * server write is durable: it retries, and on final failure it leaves a
   * `pending-sync` breadcrumb so the next mount replays the POST. Without
   * that, a failed write meant the DB never learned the tour was done, and
   * the next logout (which clears localStorage) resurrected it.
   */
  function finish() {
    setOpen(false);
    setStepIdx(0);
    if (!userId) return;
    try {
      window.localStorage.setItem(storageKey(userId), "1");
      window.localStorage.setItem(pendingSyncKey(userId), "1");
    } catch {
      /* ignore quota / private-mode errors */
    }
    void postCompletion().then((ok) => {
      if (!ok) return; // breadcrumb stays; retried on next mount
      try {
        window.localStorage.removeItem(pendingSyncKey(userId));
      } catch {
        /* ignore */
      }
    });
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
