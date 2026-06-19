"use client";

/**
 * Abstract Jira-style page loader — a fanned deck of polished task cards
 * with sequential check-ins, an orbiting sparkle ring, and a soft pulsing
 * halo. Strict Atlassian blue palette.
 */
export function LoaderMark({ size = 220 }: { size?: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Wide pulsing aurora glow — pushed behind everything so it lights
          the scene but doesn't blur card content. */}
      <span className="absolute -inset-6 rounded-full bg-gradient-to-br from-[#B3D4FF]/40 via-[#4C9AFF]/25 to-[#0052CC]/15 blur-3xl qt-load-aurora pointer-events-none -z-10" />

      {/* Conic-style outer ring — slow clockwise sweep */}
      <svg
        className="absolute inset-0 h-full w-full qt-route-spin-slow"
        viewBox="0 0 180 180"
        fill="none"
      >
        <defs>
          <linearGradient id="qt-load-ring-outer" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#B3D4FF" />
            <stop offset="55%" stopColor="#2684FF" />
            <stop offset="100%" stopColor="#0052CC" />
          </linearGradient>
          <linearGradient id="qt-load-ring-inner" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4C9AFF" />
            <stop offset="100%" stopColor="#0065FF" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r="78" stroke="#EAF2FF" strokeWidth="2" />
        <circle
          cx="90"
          cy="90"
          r="78"
          stroke="url(#qt-load-ring-outer)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="120 380"
        />
      </svg>

      {/* Inner accent arc — faster reverse */}
      <svg
        className="absolute inset-0 h-full w-full qt-route-spin-reverse"
        viewBox="0 0 180 180"
        fill="none"
      >
        <circle
          cx="90"
          cy="90"
          r="62"
          stroke="url(#qt-load-ring-inner)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="55 260"
          opacity="0.85"
        />
      </svg>

      {/* Orbital sparkle ring — four small diamonds in graded blues */}
      <div className="absolute inset-0 qt-route-spin-slow">
        <Spark className="absolute left-1/2 top-3 -translate-x-1/2 h-2 w-2 bg-[#0052CC]" glow="rgba(0,82,204,0.8)" />
        <Spark className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 bg-[#2684FF]" glow="rgba(38,132,255,0.8)" />
        <Spark className="absolute left-1/2 bottom-3 -translate-x-1/2 h-2 w-2 bg-[#4C9AFF]" glow="rgba(76,154,255,0.7)" />
        <Spark className="absolute left-3 top-1/2 -translate-y-1/2 h-2 w-2 bg-[#B3D4FF]" glow="rgba(179,212,255,0.8)" />
      </div>

      {/* Twinkles — float around the stack on staggered beats */}
      <Twinkle className="absolute left-6 top-12 h-3 w-3 text-[#2684FF] qt-load-twinkle-1" />
      <Twinkle className="absolute right-8 top-8 h-2.5 w-2.5 text-[#0065FF] qt-load-twinkle-2" />
      <Twinkle className="absolute right-10 bottom-12 h-2 w-2 text-[#4C9AFF] qt-load-twinkle-3" />
      <Twinkle className="absolute left-10 bottom-10 h-2.5 w-2.5 text-[#B3D4FF] qt-load-twinkle-4" />

      {/* Center task-card stack */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{ width: size * 0.66, height: size * 0.5 }}
        >
          <TaskCard className="qt-load-card qt-load-card-1" tone="back" />
          <TaskCard className="qt-load-card qt-load-card-2" tone="mid" />
          <TaskCard className="qt-load-card qt-load-card-3" tone="front" />
        </div>
      </div>
    </div>
  );
}

function Spark({ className, glow }: { className: string; glow: string }) {
  return (
    <span
      className={`${className} rotate-45 rounded-[1px]`}
      style={{ boxShadow: `0 0 10px ${glow}` }}
    />
  );
}

function Twinkle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0 L9.4 6.6 L16 8 L9.4 9.4 L8 16 L6.6 9.4 L0 8 L6.6 6.6 Z" />
    </svg>
  );
}

function TaskCard({
  className = "",
  tone,
}: {
  className?: string;
  tone: "back" | "mid" | "front";
}) {
  const borderColor =
    tone === "front" ? "border-[#2684FF]" : "border-[#DEEBFF]";
  const shadow =
    tone === "front"
      ? "shadow-[0_18px_40px_-10px_rgba(38,132,255,0.45),0_4px_12px_-2px_rgba(0,82,204,0.25)]"
      : tone === "mid"
        ? "shadow-[0_12px_28px_-12px_rgba(38,132,255,0.3)]"
        : "shadow-[0_8px_18px_-10px_rgba(38,132,255,0.25)]";
  const opacity = tone === "back" ? "opacity-90" : "";

  // Status badge per card so the stack visually tells a story:
  // back = "To Do", middle = "In Progress", front = "Done".
  const status =
    tone === "back"
      ? { label: "To Do", bg: "bg-[#DEEBFF]", text: "text-[#0747A6]" }
      : tone === "mid"
        ? { label: "In Progress", bg: "bg-[#FFF0B3]", text: "text-[#974F0C]" }
        : { label: "Done", bg: "bg-[#E3FCEF]", text: "text-[#006644]" };

  // Note: the front-card halo lives BEHIND the card via an outer wrapper
  // (negative inset + -z-10) so the blur never reaches the card surface.
  return (
    <div
      className={`absolute inset-0 ${className}`}
      style={{
        // Force a GPU layer so animated transforms render crisply, not
        // sub-pixel-blurred. Critical for keeping the small content sharp.
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {tone === "front" && (
        <span className="absolute -inset-3 rounded-2xl bg-[#2684FF]/25 blur-2xl qt-load-front-halo pointer-events-none -z-10" />
      )}
      <div
        className={`relative h-full w-full rounded-xl bg-white border ${borderColor} ${shadow} ${opacity} overflow-hidden`}
      >
        {/* Top accent bar — Jira-style colored stripe */}
        <span
          className={`absolute left-0 top-0 h-1.5 w-full ${
            tone === "front"
              ? "bg-gradient-to-r from-[#0065FF] via-[#2684FF] to-[#4C9AFF]"
              : tone === "mid"
                ? "bg-[#FFC400]"
                : "bg-[#B3D4FF]"
          }`}
        />

        {/* Header row: checkbox + title bar + status pill */}
        <div className="flex items-center gap-2 px-3.5 pt-4">
          <span className="relative inline-flex items-center justify-center h-5 w-5 rounded-md border-2 border-[#2684FF] bg-white shrink-0">
            {tone === "front" && (
              <svg
                className="absolute h-3.5 w-3.5 text-[#0065FF] qt-load-check"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 6 L 5 9 L 10 3" />
              </svg>
            )}
          </span>
          <span className="block h-2.5 rounded-full bg-[#0A1B40]/85 flex-1" />
          <span
            className={`shrink-0 inline-flex items-center px-2 h-5 rounded text-[9px] font-bold uppercase tracking-wider ${status.bg} ${status.text}`}
          >
            {status.label}
          </span>
        </div>

        {/* Content lines */}
        <div className="px-3.5 mt-3 space-y-2">
          <span className="block h-2 w-5/6 rounded-full bg-[#B3D4FF]" />
          <span className="block h-2 w-3/5 rounded-full bg-[#DEEBFF]" />
        </div>

        {/* Footer row: avatar group + status dot + key chip */}
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center gap-2">
          <span className="inline-block h-5 w-5 rounded-full bg-gradient-to-br from-[#4C9AFF] to-[#0052CC] ring-2 ring-white shadow-sm" />
          <span className="inline-block h-5 w-5 -ml-3 rounded-full bg-gradient-to-br from-[#B3D4FF] to-[#2684FF] ring-2 ring-white shadow-sm" />
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                tone === "front"
                  ? "bg-[#36B37E]"
                  : tone === "mid"
                    ? "bg-[#FFAB00]"
                    : "bg-[#42526E]"
              }`}
            />
            <span className="inline-flex items-center h-5 px-2 rounded bg-[#DEEBFF] text-[10px] font-bold text-[#0747A6] leading-none">
              QT-{tone === "front" ? "12" : tone === "mid" ? "11" : "10"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
