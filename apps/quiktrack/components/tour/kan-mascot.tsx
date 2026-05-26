"use client";

/**
 * Kan — QuikTrack's product-tour assistant.
 *
 * Default `KanMascot` renders the 3D rendered character PNG
 * (`/kan-mascot.png`) with a floating bob, soft halo glow, and animated
 * decorative chart icons — matching the onboarding-card reference design.
 *
 * The original anime SVG mascot is preserved as `KanMascotSvg` (still
 * exported) so any existing usage / loader fallbacks keep working.
 *
 * Modes:
 *   "wave"   → gentle bob + slight tilt + halo pulse + sparkle decorations
 *   "bounce" → vertical bounce (loader / empty-state fallback)
 *   "static" → no animation
 */
export function KanMascot({
  size = 160,
  mode = "wave",
  className = "",
  flip = false,
}: {
  size?: number;
  mode?: "wave" | "bounce" | "static";
  className?: string;
  /** Horizontally mirror the character — use when the mascot sits on the
   *  right side of a speech bubble so it still points toward the card. */
  flip?: boolean;
}) {
  const wrapAnim =
    mode === "bounce"
      ? "qt-mascot-bounce"
      : mode === "wave"
        ? "qt-kan-bob"
        : "";

  return (
    <div
      className={`relative ${className} ${wrapAnim}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src="/kan-mascot.png"
        alt=""
        draggable={false}
        className="relative h-full w-full select-none object-contain"
        style={{
          filter: "drop-shadow(0 8px 18px rgba(15, 38, 71, 0.25))",
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      />
    </div>
  );
}

/**
 * The original anime-inspired Kan SVG. Kept exported so other surfaces
 * (loader fallback, marketing usage, illustrations that need an inline
 * SVG rather than a PNG) can still use it.
 */
export function KanMascotSvg({
  size = 160,
  mode = "wave",
  className = "",
}: {
  size?: number;
  mode?: "wave" | "bounce" | "static";
  className?: string;
}) {
  const wrapAnim =
    mode === "bounce" ? "qt-mascot-bounce" : mode === "wave" ? "qt-kan-idle" : "";
  const innerAnim = mode === "bounce" ? "qt-mascot-squash" : "";

  return (
    <div
      className={`relative ${className} ${wrapAnim}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 160" fill="none" className={`absolute inset-0 ${innerAnim}`}>
        <defs>
          {/* Ambient glow behind character — Jira blue */}
          <radialGradient id="kan-aura" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%" stopColor="#4C9AFF" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#2684FF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0747A6" stopOpacity="0" />
          </radialGradient>

          {/* Anime skin — soft, slightly cool */}
          <linearGradient id="kan-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE4D2" />
            <stop offset="100%" stopColor="#F2C8AE" />
          </linearGradient>
          <linearGradient id="kan-skin-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8B89A" />
            <stop offset="100%" stopColor="#D49A7B" />
          </linearGradient>

          {/* Anime hair — deep Jira navy with bright blue highlight */}
          <linearGradient id="kan-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E3A66" />
            <stop offset="60%" stopColor="#0F2647" />
            <stop offset="100%" stopColor="#091E42" />
          </linearGradient>
          <linearGradient id="kan-hair-hi" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4C9AFF" />
            <stop offset="100%" stopColor="#2684FF" stopOpacity="0" />
          </linearGradient>

          {/* Hoodie — soft cool white/blue */}
          <linearGradient id="kan-hoodie" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FAFBFC" />
            <stop offset="100%" stopColor="#DEEBFF" />
          </linearGradient>

          {/* Blazer — Jira blue gradient */}
          <linearGradient id="kan-blazer" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0052CC" />
            <stop offset="100%" stopColor="#2684FF" />
          </linearGradient>
          <linearGradient id="kan-blazer-shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0747A6" />
            <stop offset="100%" stopColor="#0A2F7A" />
          </linearGradient>

          {/* Glass card */}
          <linearGradient id="kan-glass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#DEEBFF" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="kan-glass-2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#B3D4FF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4C9AFF" stopOpacity="0.55" />
          </linearGradient>

          {/* Neon accent — bright Jira blue */}
          <linearGradient id="kan-neon" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00B8D9" />
            <stop offset="100%" stopColor="#2684FF" />
          </linearGradient>

          <filter id="kan-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Mask that fades the lower body out — half-body float effect */}
          <linearGradient id="kan-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="70%" stopColor="#FFFFFF" stopOpacity="1" />
            <stop offset="88%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <mask id="kan-body-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="160" height="160">
            <rect x="0" y="0" width="160" height="160" fill="url(#kan-fade)" />
          </mask>
        </defs>

        {/* === Ambient aura ========================================== */}
        <circle cx="80" cy="78" r="70" fill="url(#kan-aura)" />

        {/* Particle dots */}
        <g opacity="0.85">
          <circle className="qt-mascot-spark-1" cx="22" cy="40" r="1.6" fill="#4C9AFF" />
          <circle className="qt-mascot-spark-2" cx="142" cy="34" r="1.4" fill="#00B8D9" />
          <circle className="qt-mascot-spark-3" cx="18" cy="100" r="1.2" fill="#B3D4FF" />
          <circle className="qt-mascot-spark-2" cx="146" cy="108" r="1.4" fill="#2684FF" />
          <circle className="qt-mascot-spark-1" cx="130" cy="142" r="1" fill="#4C9AFF" />
        </g>

        {/* === Floating analytics card (top-left) ==================== */}
        <g className="qt-kan-clipboard" transform="translate(0 0)">
          <rect x="8" y="46" width="34" height="26" rx="5" fill="url(#kan-glass)" stroke="#B3D4FF" strokeWidth="0.6" />
          <rect x="11" y="49" width="14" height="2.4" rx="1.2" fill="#0747A6" />
          {/* Mini bar chart */}
          <rect x="12" y="65" width="3" height="4" rx="1" fill="#B3D4FF" />
          <rect x="17" y="61" width="3" height="8" rx="1" fill="#4C9AFF" />
          <rect x="22" y="57" width="3" height="12" rx="1" fill="#2684FF" />
          <rect x="27" y="63" width="3" height="6" rx="1" fill="#4C9AFF" />
          <rect x="32" y="55" width="3" height="14" rx="1" fill="#0052CC" />
        </g>

        {/* === Floating notification bubble (top-right) ============== */}
        <g className="qt-kan-clipboard" transform="translate(0 0)">
          <rect x="118" y="50" width="34" height="14" rx="7" fill="url(#kan-glass-2)" stroke="#4C9AFF" strokeWidth="0.6" />
          <circle cx="125" cy="57" r="2.4" fill="#00B8D9" filter="url(#kan-glow)" />
          <rect x="130" y="55" width="16" height="1.8" rx="0.9" fill="#0747A6" />
          <rect x="130" y="58.5" width="11" height="1.6" rx="0.8" fill="#4C9AFF" />
        </g>

        {/* === FLOATING CHARACTER (half-body) ======================== */}
        <g mask="url(#kan-body-mask)">
          {/* Blazer / torso silhouette — extends past frame; mask fades it out */}
          <path
            d="M30 170
               C 28 130, 44 110, 62 106
               L 98 106
               C 116 110, 132 130, 130 170 Z"
            fill="url(#kan-blazer)"
          />
          {/* Blazer lapels */}
          <path d="M62 106 L 80 124 L 72 170 L 54 170 Z" fill="url(#kan-blazer-shade)" opacity="0.85" />
          <path d="M98 106 L 80 124 L 88 170 L 106 170 Z" fill="url(#kan-blazer-shade)" opacity="0.85" />

          {/* Hoodie under blazer */}
          <path d="M68 104 L 92 104 L 94 150 L 66 150 Z" fill="url(#kan-hoodie)" />
          {/* Hoodie drawstrings */}
          <path d="M76 116 L 76 124" stroke="#4C9AFF" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M84 116 L 84 124" stroke="#4C9AFF" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="76" cy="125" r="1.2" fill="#4C9AFF" />
          <circle cx="84" cy="125" r="1.2" fill="#4C9AFF" />

          {/* Neon piping along blazer edge */}
          <path
            d="M62 106 L 80 124 L 98 106"
            stroke="url(#kan-neon)"
            strokeWidth="1.2"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
            filter="url(#kan-glow)"
          />

          {/* Neck */}
          <rect x="73" y="88" width="14" height="14" rx="4" fill="url(#kan-skin)" />
          <path d="M73 94 L 87 94 L 86 102 L 74 102 Z" fill="url(#kan-skin-shade)" opacity="0.6" />

          {/* Head — slightly tapered anime jawline */}
          <path
            d="M58 64 C 58 46, 68 38, 80 38 C 92 38, 102 46, 102 64 C 102 78, 94 90, 80 92 C 66 90, 58 78, 58 64 Z"
            fill="url(#kan-skin)"
          />
          {/* Cheek shading */}
          <ellipse cx="66" cy="78" rx="4" ry="3" fill="#F4A78A" opacity="0.35" />
          <ellipse cx="94" cy="78" rx="4" ry="3" fill="#F4A78A" opacity="0.35" />

          {/* Anime hair — layered swept fringe */}
          <path
            d="M54 60 C 52 38, 70 26, 86 28 C 100 30, 110 40, 108 58 C 102 50, 92 48, 84 50 C 80 42, 72 44, 68 50 C 64 52, 60 56, 58 64 Z"
            fill="url(#kan-hair)"
          />
          {/* Fringe pieces */}
          <path d="M62 50 C 64 56, 68 60, 70 62 L 64 64 Z" fill="url(#kan-hair)" />
          <path d="M82 50 C 86 56, 92 58, 96 58 L 100 64 L 92 62 Z" fill="url(#kan-hair)" />
          {/* Violet highlight streak */}
          <path
            d="M70 36 C 78 32, 90 34, 98 42"
            stroke="url(#kan-hair-hi)"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
          {/* Side ear tuft */}
          <path d="M56 64 C 54 70, 56 76, 60 76 L 60 66 Z" fill="url(#kan-hair)" />

          {/* Eyes — anime, expressive but elegant */}
          <g>
            {/* Eye whites */}
            <ellipse cx="70" cy="68" rx="4" ry="5" fill="#FFFFFF" />
            <ellipse cx="90" cy="68" rx="4" ry="5" fill="#FFFFFF" />
            {/* Iris — Jira blue */}
            <ellipse cx="70" cy="69" rx="2.6" ry="3.6" fill="#0052CC" />
            <ellipse cx="90" cy="69" rx="2.6" ry="3.6" fill="#0052CC" />
            {/* Pupil */}
            <ellipse cx="70" cy="69.5" rx="1.2" ry="2" fill="#091E42" />
            <ellipse cx="90" cy="69.5" rx="1.2" ry="2" fill="#091E42" />
            {/* Catchlights */}
            <circle cx="71.2" cy="67.4" r="1" fill="#FFFFFF" />
            <circle cx="91.2" cy="67.4" r="1" fill="#FFFFFF" />
            <circle cx="69" cy="71" r="0.5" fill="#4C9AFF" />
            <circle cx="89" cy="71" r="0.5" fill="#4C9AFF" />
          </g>
          {/* Blink lids */}
          <rect className="qt-kan-blink" x="64" y="66" width="32" height="5" rx="2.5" fill="url(#kan-skin)" />

          {/* Eyebrows — clean */}
          <path d="M65 61 Q 70 59 74 61" stroke="#091E42" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M86 61 Q 90 59 95 61" stroke="#091E42" strokeWidth="1.6" strokeLinecap="round" fill="none" />

          {/* Nose hint */}
          <path d="M79 77 Q 80 80 81.5 77" stroke="#D49A7B" strokeWidth="1.1" strokeLinecap="round" fill="none" opacity="0.75" />

          {/* Soft smile */}
          <path d="M74 84 Q 80 88 86 84" stroke="#091E42" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {/* Mouth interior tint */}
          <path d="M76 85 Q 80 86.6 84 85" stroke="#E07A8A" strokeWidth="0.8" strokeLinecap="round" fill="none" opacity="0.6" />

          {/* === LEFT ARM presenting a holo card ==================== */}
          <path
            d="M44 140 C 36 130, 38 120, 52 118"
            stroke="url(#kan-blazer)"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <ellipse cx="54" cy="118" rx="6" ry="5" fill="url(#kan-skin)" />

          {/* Holographic checklist card resting on left hand */}
          <g className="qt-kan-clipboard">
            <rect
              x="40"
              y="98"
              width="44"
              height="30"
              rx="5"
              fill="url(#kan-glass)"
              stroke="url(#kan-neon)"
              strokeWidth="0.8"
            />
            {/* Glow border */}
            <rect
              x="40"
              y="98"
              width="44"
              height="30"
              rx="5"
              fill="none"
              stroke="#4C9AFF"
              strokeWidth="0.4"
              opacity="0.6"
              filter="url(#kan-glow)"
            />
            <rect x="44" y="102" width="18" height="2.4" rx="1.2" fill="#0747A6" />
            {/* Checklist rows */}
            <circle cx="46" cy="110" r="1.6" fill="#00B8D9" />
            <rect x="50" y="109" width="28" height="1.8" rx="0.9" fill="#4C9AFF" />
            <circle cx="46" cy="116" r="1.6" fill="#00B8D9" />
            <rect x="50" y="115" width="22" height="1.8" rx="0.9" fill="#2684FF" />
            <circle cx="46" cy="122" r="1.6" fill="#B3D4FF" />
            <rect x="50" y="121" width="18" height="1.8" rx="0.9" fill="#B3D4FF" />
            {/* Animated check overlay */}
            <path
              className="qt-kan-check"
              d="M72 121 L 75 124 L 80 118"
              stroke="#00B8D9"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              filter="url(#kan-glow)"
            />
          </g>

          {/* === RIGHT ARM — waving ================================== */}
          <g
            className={mode === "wave" ? "qt-kan-wave" : ""}
            style={{ transformOrigin: "118px 116px" }}
          >
            <path
              d="M118 116 C 130 104, 140 86, 132 72"
              stroke="url(#kan-blazer)"
              strokeWidth="13"
              strokeLinecap="round"
              fill="none"
            />
            {/* Sleeve cuff accent */}
            <path
              d="M130 78 C 132 76, 136 74, 138 76"
              stroke="#00B8D9"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
              opacity="0.8"
              filter="url(#kan-glow)"
            />
            {/* Waving hand */}
            <ellipse cx="132" cy="68" rx="6.5" ry="6" fill="url(#kan-skin)" />
            {/* Finger hints */}
            <path d="M129 63 L 129 60" stroke="#D49A7B" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M132 62 L 132 58.5" stroke="#D49A7B" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M135 63 L 135.5 60" stroke="#D49A7B" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </g>
      </svg>
    </div>
  );
}
