// apps/quikcrm/components/telephony/in-call-modal.tsx
"use client";

import { useEffect, useState } from "react";
import { Phone, PhoneOff, User, ArrowRight } from "lucide-react";

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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ui = statusUi(status);
  const elapsed = formatMmSs(now - callStartedAt);
  const customerLabel = partyBName || partyB || "Customer";

  return (
    <div
      // z-[115] above the dialer modal (z-50). Solid dark backdrop with a
      // subtle radial gradient so the underlying dialer chrome doesn't bleed
      // through. No Esc handler — agents shouldn't drop a live call by
      // accidentally tapping a key.
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
          {/* Header — status pill with a pulsing indicator */}
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
            <span className="text-[10px] uppercase tracking-wider text-slate-400">
              Live call
            </span>
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

          {/* Actions — primary End call button */}
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
