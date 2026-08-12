// apps/quikcrmexpress/components/telephony/in-call-modal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, User, ArrowRight, Minus, Maximize2 } from "lucide-react";

interface Props {
  callStartedAt: number;
  providerCallSid: string | null;
  status?: string | null;
  partyA?: string | null;
  partyB?: string | null;
  /** When provided, customer leg shows the lead/contact name instead of the raw number. */
  partyBName?: string | null;
  /** Click ends the call client-side and opens the disposition modal. The
   * provider's webhook will arrive later and backfill duration/recording. */
  onEndCall?: () => void;
}

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Convert a status string from the IndiaVoice provider into a user-friendly
 * label + a Tailwind color set used by the status pill.
 */
function statusUi(raw: string | null | undefined): { label: string; tone: "amber" | "blue" | "emerald" } {
  const s = (raw || "").toLowerCase();
  if (!s) return { label: "Connecting…", tone: "amber" };
  if (s.includes("ring") || s.includes("dial") || s.includes("transfer")) return { label: "Ringing", tone: "amber" };
  if (s.includes("pick") || s.includes("answer")) return { label: "On call", tone: "emerald" };
  if (s.includes("init")) return { label: "Initiating", tone: "amber" };
  if (s.includes("live")) return { label: "Live", tone: "emerald" };
  // Capitalize as fallback.
  return { label: raw!.charAt(0).toUpperCase() + raw!.slice(1), tone: "blue" };
}

const TONE_CLASSES = {
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
} as const;

const PULSE_TONE = {
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
} as const;

function initial(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

export function InCallModal({
  callStartedAt,
  providerCallSid,
  status,
  partyA,
  partyB,
  partyBName,
  onEndCall,
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  // Minimized view lets the agent see the lead details / rest of the screen
  // WHILE the call continues. This is purely a render toggle inside this
  // component — the call, polling, timer source (callStartedAt) and end-call
  // handler all live in the parent CallModal, so collapsing here cannot drop
  // the call. Default expanded so behavior is unchanged until the agent opts in.
  const [minimized, setMinimized] = useState(false);

  // Dragging for the minimized pill. `pos` is null until the agent first drags
  // (null => use the default bottom-right CSS anchor). Once dragged, pos holds
  // fixed top-left coords in px. Position persists across minimize/expand for
  // the life of this component (a new call remounts InCallModal => fresh pos).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // drag bookkeeping: whether a drag is active + the pointer-to-pill offset so
  // the pill doesn't jump to the cursor on grab.
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number; moved: boolean }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
    moved: false,
  });
  // Measured pill size, so we can clamp it inside the viewport while dragging.
  const pillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Global move/up listeners while dragging the minimized pill. Attached to
  // window so the drag keeps working even if the pointer leaves the pill.
  // Clamps to the viewport so the pill can never be flung off-screen.
  useEffect(() => {
    function clamp(x: number, y: number) {
      const el = pillRef.current;
      const w = el?.offsetWidth ?? 320;
      const h = el?.offsetHeight ?? 64;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
    }
    function onMove(clientX: number, clientY: number) {
      if (!dragRef.current.dragging) return;
      dragRef.current.moved = true;
      setPos(clamp(clientX - dragRef.current.offsetX, clientY - dragRef.current.offsetY));
    }
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const up = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", up);
    };
  }, []);

  // Start a drag from the pill body. Records the offset between the pointer and
  // the pill's top-left so movement is smooth. If pos is still null (never
  // dragged), seed it from the pill's current rendered rect first.
  function startDrag(clientX: number, clientY: number) {
    const el = pillRef.current;
    const rect = el?.getBoundingClientRect();
    const startX = pos?.x ?? rect?.left ?? 0;
    const startY = pos?.y ?? rect?.top ?? 0;
    dragRef.current = {
      dragging: true,
      moved: false,
      offsetX: clientX - startX,
      offsetY: clientY - startY,
    };
    if (!pos) setPos({ x: startX, y: startY });
  }

  const ui = statusUi(status);
  const elapsed = formatMmSs(now - callStartedAt);
  const customerLabel = partyBName || partyB || "Customer";

  // ── MINIMIZED: compact floating pill, no full-screen backdrop ──────────────
  // Bottom-right, above app chrome (z-[115]). Because there is NO backdrop, the
  // rest of the page (lead details, notes, navigation) is fully interactive
  // while the call runs. Expand button restores the full card.
  if (minimized) {
    // Positioning: default anchored bottom-right via inline style; once dragged,
    // `pos` takes over with fixed top-left coords. The pill BODY is the drag
    // handle (cursor-move); buttons stopPropagation so clicking Expand/End does
    // not start a drag. `select-none` avoids text-selection while dragging.
    const positionStyle: React.CSSProperties = pos
      ? { top: pos.y, left: pos.x, right: "auto", bottom: "auto" }
      : { bottom: "1rem", right: "1rem" };
    return (
      <div
        ref={pillRef}
        className="fixed z-[115] w-[320px] max-w-[calc(100vw-2rem)] select-none"
        style={positionStyle}
      >
        <div
          className="rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden cursor-move"
          onMouseDown={(e) => {
            // left button only; ignore clicks that originate on a button
            if (e.button !== 0) return;
            startDrag(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3">
            {/* status dot */}
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${PULSE_TONE[ui.tone]}`}
              />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${PULSE_TONE[ui.tone]}`} />
            </span>

            {/* name + status/timer */}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {customerLabel}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {ui.label} · {elapsed}
              </div>
            </div>

            {/* expand — stopPropagation so grabbing the button doesn't drag */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={() => setMinimized(false)}
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
              aria-label="Expand call window"
              title="Expand"
            >
              <Maximize2 size={16} />
            </button>

            {/* end call — stopPropagation so grabbing the button doesn't drag */}
            {onEndCall ? (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={onEndCall}
                className="shrink-0 inline-flex items-center justify-center rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white p-2 shadow-sm transition-colors cursor-pointer"
                aria-label="End call and open disposition"
                title="End call"
              >
                <PhoneOff size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── EXPANDED: full card (default). Backdrop only in this state. ────────────
  return (
    <div
      // z-[115] above the dialer modal (z-50). Solid dark backdrop with a
      // subtle radial gradient so the underlying dialer chrome doesn't bleed
      // through. No Esc handler — agents shouldn't drop a live call by
      // accidentally tapping a key. Agents who need the screen can Minimize.
      className="fixed inset-0 z-[115] flex items-center justify-center"
      aria-modal
      role="dialog"
      style={{
        background:
          "radial-gradient(ellipse at top, rgba(15,23,42,0.92), rgba(15,23,42,0.98))",
      }}
    >
      <div className="w-full max-w-md mx-4">
        <div className="rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          {/* Header — status pill with a pulsing indicator + minimize control */}
          <div className="px-6 pt-6 pb-4 flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[ui.tone]}`}
            >
              <span className="relative inline-flex h-2 w-2">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${PULSE_TONE[ui.tone]}`}
                />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${PULSE_TONE[ui.tone]}`} />
              </span>
              {ui.label}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                Live call
              </span>
              <button
                onClick={() => setMinimized(true)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Minimize call window to see lead details"
                title="Minimize"
              >
                <Minus size={16} />
              </button>
            </div>
          </div>

          {/* Customer block — avatar + name + number */}
          <div className="px-6 pb-2 flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center text-xl font-semibold shadow-md shrink-0">
              {initial(customerLabel)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-slate-900 truncate">
                {customerLabel}
              </div>
              {partyB && partyBName ? (
                <div className="text-sm text-slate-500 font-mono">{partyB}</div>
              ) : null}
            </div>
          </div>

          {/* Hero — the timer */}
          <div className="px-6 py-6 text-center">
            <div className="text-6xl font-mono font-light tracking-wider text-slate-900 tabular-nums">
              {elapsed}
            </div>
          </div>

          {/* Agent / customer routing line */}
          <div className="px-6 pb-5 flex items-center justify-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <User size={12} className="text-slate-400" />
              <span className="font-mono">{partyA || "—"}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Agent</span>
            </span>
            <ArrowRight size={12} className="text-slate-300" />
            <span className="inline-flex items-center gap-1.5">
              <Phone size={12} className="text-slate-400" />
              <span className="font-mono">{partyB || "—"}</span>
            </span>
          </div>

          {/* Actions — primary End call button + a Minimize secondary action */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex flex-col items-center gap-2">
            {onEndCall ? (
              <button
                onClick={onEndCall}
                className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-medium py-3 shadow-sm transition-colors"
                aria-label="End call and open disposition"
              >
                <PhoneOff size={18} />
                End call &amp; record disposition
              </button>
            ) : null}
            <button
              onClick={() => setMinimized(true)}
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-medium py-2.5 ring-1 ring-inset ring-slate-200 transition-colors"
              aria-label="Minimize to see lead details while on the call"
            >
              <Minus size={16} />
              Minimize
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Hang up on your phone — disposition opens automatically when the
              call ends.
            </p>
          </div>

          {/* Debug strip — campid in tiny muted text at the very bottom */}
          {providerCallSid ? (
            <div className="px-6 py-2 text-center text-[10px] text-slate-300 font-mono border-t border-slate-100">
              campid · {providerCallSid}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
