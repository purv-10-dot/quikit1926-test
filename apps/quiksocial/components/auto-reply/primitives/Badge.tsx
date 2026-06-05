"use client";

import type { ReactNode } from "react";

/**
 * Pill badge — 9 variants ported from docs/AutoReplyPrototype.jsx Badge().
 * Inline-styled because the colour set is feature-specific and doesn't
 * belong in tailwind.config.js.
 */

type Variant =
  | "template"
  | "ai"
  | "sent"
  | "failed"
  | "skipped"
  | "pending"
  | "keyword"
  | "any"
  | "instagram"
  | "facebook"
  | "default";

const STYLES: Record<Variant, { background: string; color: string }> = {
  template: { background: "#E6F1FB", color: "#0C447C" },
  ai: { background: "#EAF3DE", color: "#27500A" },
  sent: { background: "#E1F5EE", color: "#085041" },
  failed: { background: "#FCEBEB", color: "#791F1F" },
  skipped: { background: "#FAEEDA", color: "#633806" },
  pending: { background: "#EEEDFE", color: "#3C3489" },
  keyword: { background: "#FBEAF0", color: "#72243E" },
  any: { background: "#F1EFE8", color: "#444441" },
  instagram: {
    background: "linear-gradient(135deg,#833AB4,#E1306C,#F77737)",
    color: "#fff",
  },
  facebook: { background: "#E6F1FB", color: "#185FA5" },
  default: { background: "#F1EFE8", color: "#5F5E5A" },
};

export function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  const s = STYLES[variant] ?? STYLES.default;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: 6,
        background: s.background,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
