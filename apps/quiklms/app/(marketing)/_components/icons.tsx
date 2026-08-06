/**
 * Hand-written icons for the landing page.
 *
 * WHY NOT lucide-react, which the rest of this app uses:
 *
 * The monorepo resolves TWO copies of lucide-react — `apps/quiklms` declares
 * `^1.18.0` (installed 1.25.0) while `packages/ui` declares `^0.294.0`, which
 * is what gets hoisted to the root `node_modules`. The server and client
 * bundles do not always pick the same one, and the icon geometry changed
 * between those majors, so a server-rendered lucide icon can arrive with
 * different `d` path data than the client re-render produces:
 *
 *   Warning: Prop `d` did not match.
 *     Server: "M22 10v6M2 10l10-5 10 5-10 5z"                      (0.294.0)
 *     Client: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18…"     (1.25.0)
 *
 * React treats that as a failed hydration and REPLACES THE WHOLE DOCUMENT with
 * a client render. That wipes the `data-theme` attribute the pre-paint theme
 * script sets on <html>, which is why the landing was stuck in light mode no
 * matter what the toggle or the OS preference said — the attribute was set,
 * then thrown away a moment later.
 *
 * Inlining the icons removes the shared dependency from this route entirely, so
 * the markup is identical on both sides by construction. It is also what the
 * QuikHRMS landing does (every icon there is raw SVG), presumably for the same
 * reason. Deduping lucide across the workspace would fix the root cause for the
 * whole repo, but that is a dependency change well outside a landing-page
 * restyle — flagged rather than done here.
 */

interface IconProps {
  /** Stroke width override — the brand mark uses a slightly heavier stroke. */
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

function Svg({
  children,
  width = 2,
  className,
  style,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const Award = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" />
  </Svg>
);

export const BarChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-3" />
  </Svg>
);

export const BookOpen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 7v13M3 18V5a1 1 0 0 1 1-1h4a4 4 0 0 1 4 3 4 4 0 0 1 4-3h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-5a3 3 0 0 0-3 2 3 3 0 0 0-3-2H4a1 1 0 0 1-1-1Z" />
  </Svg>
);

export const Calendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18M8 15h.01M12 15h.01M16 15h.01" />
  </Svg>
);

export const ClipboardCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="m9 14 2 2 4-4" />
  </Svg>
);

export const Eye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const FileCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="m9 15 2 2 4-4" />
  </Svg>
);

export const FileText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </Svg>
);

export const GraduationCap = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 4 10 5-10 5L2 9l10-5Z" />
    <path d="M6 11.5V17c3.3 2.7 8.7 2.7 12 0v-5.5M22 9v6" />
  </Svg>
);

export const Layers = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 2 10 5-10 5L2 7l10-5Z" />
    <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
  </Svg>
);

export const LayoutDashboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="12" width="8" height="9" rx="1.5" />
    <rect x="3" y="15" width="8" height="6" rx="1.5" />
  </Svg>
);

export const Menu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const MonitorPlay = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
    <path d="m10.5 7.5 4 2.5-4 2.5Z" />
  </Svg>
);

export const PlayCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m10 8 6 4-6 4Z" />
  </Svg>
);

export const Presentation = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 3h20M4 3v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V3" />
    <path d="M12 15v6M9 21l3-3 3 3M9 11V8M13 11V6M17 11v-2" />
  </Svg>
);

export const QrCode = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3h-3zM19.5 19.5h1.5M14 20.5h1.5M20.5 14v2" />
  </Svg>
);

export const ScrollText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h11a2 2 0 0 1 2 2v13a3 3 0 0 0 3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 1-2Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

export const Settings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 7h-8M9 7H4M20 17h-5M12 17H4" />
    <circle cx="9" cy="7" r="3" />
    <circle cx="15" cy="17" r="3" />
  </Svg>
);

export const ShieldCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);

export const Shuffle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </Svg>
);

export const Users = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="7" r="4" />
    <path d="M2 21v-1.5A4.5 4.5 0 0 1 6.5 15h5a4.5 4.5 0 0 1 4.5 4.5V21" />
    <path d="M16.5 3.6a4 4 0 0 1 0 6.8M22 21v-1.5a4.5 4.5 0 0 0-3.2-4.3" />
  </Svg>
);

export const Video = (p: IconProps) => (
  <Svg {...p}>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </Svg>
);
