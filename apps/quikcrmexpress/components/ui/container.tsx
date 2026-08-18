import type { ReactNode } from "react";

type Size = "default" | "wide" | "narrow" | "full";

/**
 * Page-content width policy.
 *
 * Architectural decision (2026-05-12): list / table / kanban pages render
 * FLUID (no max-width cap). Gutters come from the parent `<main>`'s
 * horizontal padding in `app/(dashboard)/layout.tsx`, not from a centered
 * inner container. This matches the way Salesforce Lightning, HubSpot,
 * and Dynamics 365 render — full viewport width minus consistent rem
 * gutters, with caps reserved for text-heavy content where line-length
 * readability matters (~80ch ≈ max-w-3xl).
 *
 * Why the previous `wide` cap was wrong: `max-w-[1600px]` looked fine on
 * 1920px laptops but left 300–800px of dead band on 1440p QHD / ultrawide
 * / 4K displays — the exact monitors enterprise CRM users sit at all day.
 * Capping list pages while leaving forms uncapped was the opposite of
 * what enterprise CRM users want.
 *
 * Size semantics:
 *   - `default` / `wide` / `full` → fluid. The names are kept for
 *     backwards-compatibility + the slight semantic signal (a kanban
 *     calling `wide` is more self-documenting than `full`). They render
 *     identically — there is no longer a width cap on any of them.
 *   - `narrow` → capped at `max-w-3xl` (~768px). Use this for forms,
 *     settings panels, single-record detail pages, and anywhere the
 *     content is mostly prose / short labelled inputs.
 *
 * Adding a new size? Don't reach for hardcoded pixel widths. If you need
 * a narrower form, use `narrow`. If your content is genuinely wider than
 * `narrow` deserves, use the default fluid behaviour and structure your
 * page with internal grids/cards.
 */
const SIZE: Record<Size, string> = {
  default: "",
  wide: "",
  full: "",
  /** Forms, settings, single-record prose pages — cap at ~80ch for readability. */
  narrow: "max-w-3xl mx-auto",
};

/**
 * Standardized page wrapper. Pair with <PageHeader> at the top of each
 * route. Renders edge-to-edge within the dashboard <main> for list pages
 * and centered+capped for `narrow` pages.
 */
export function PageContainer({
  size = "default",
  className = "",
  children,
}: {
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`w-full ${SIZE[size]} ${className}`}>{children}</div>;
}
