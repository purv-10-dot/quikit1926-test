# Mobile Responsiveness Audit — 2026-04-18

Scope: `apps/quikit/app/(super-admin)/*`, `apps/quikit/app/(launcher)/apps/page.tsx`, `apps/quikscale/app/(dashboard)/dashboard/page.tsx`.
Viewport target: 375–768px.

## Top Issues (ranked by severity)

| # | Severity | File : line | Category | Fixed? |
|---|---|---|---|---|
| 1 | High | `packages/ui/components/slide-panel.tsx:46` | Fixed `w-[480px]` panel overflows 375px screens (used in organizations, platform-users, app-registry, pricing) | Yes — `w-full sm:w-[480px] sm:max-w-[90vw]` |
| 2 | High | `apps/quikit/app/(super-admin)/organizations/page.tsx:273` | `px-8 pt-8` + `text-4xl` + header button on one row → overflow + button wraps under title on mobile | Yes — `px-4 md:px-10`, `text-2xl md:text-4xl`, `flex-wrap gap-3` |
| 3 | High | `apps/quikit/app/(super-admin)/platform-users/page.tsx:231` | Same pattern as organizations | Yes — same treatment |
| 4 | High | `apps/quikit/app/(super-admin)/app-registry/page.tsx:259` | Same pattern (two toolbar buttons stack poorly) | Yes — same treatment |
| 5 | High | `apps/quikit/app/(super-admin)/audit/page.tsx:123` | `px-8 md:px-10` + `text-4xl` → oversized title, cramped padding on mobile | Yes — `px-4 md:px-10`, `text-2xl md:text-4xl` |
| 6 | High | `apps/quikit/app/(super-admin)/analytics/page.tsx:157` + :160 | `p-8 md:p-10` + `text-4xl` + reload/refresh buttons don't wrap | Yes — `p-4 md:p-10`, `text-2xl md:text-4xl`, `flex-wrap` on button row |
| 7 | Medium | `apps/quikit/app/(super-admin)/pricing/page.tsx:152,155` | `p-8 md:p-10`, `text-4xl`, table without overflow wrapper | Yes — responsive padding/heading + wrapped table in `overflow-x-auto` |
| 8 | Medium | `apps/quikit/app/(super-admin)/broadcasts/page.tsx:107,110` | Same padding + heading + header button | Yes — responsive padding/heading + `flex-wrap` |
| 9 | Medium | `apps/quikit/app/(super-admin)/feature-flags/page.tsx:34,36` | Same padding + heading | Yes — responsive padding/heading |
| 10 | Medium | Super-admin tables (`organizations`, `platform-users`, `audit`, `pricing`) | 6–7 column tables without `overflow-x-auto` wrapper | Yes — wrapped each `<table>` parent div |
| 11 | Medium | `apps/quikit/app/(super-admin)/organizations/[id]/components/BillingPanel.tsx:114` | `grid-cols-4` with $ values squeezes unreadably on 375px | Yes — `grid-cols-2 md:grid-cols-4` |
| 12 | Medium | `apps/quikit/app/(super-admin)/organizations/[id]/components/AnalyticsPanel.tsx:82,126` | `grid-cols-3` stat rows too cramped on mobile | Yes — `grid-cols-1 sm:grid-cols-3` |

## Launcher (`apps/quikit/app/(launcher)/apps/page.tsx`)

Header row at line 157 packs logo, org selector, super admin link, and search into a single `flex items-center justify-between`. On 375px the right-side group overflows horizontally. Org dropdown, super-admin link, and 224px-wide search field cannot fit.

Fixed: header wraps with `flex-wrap gap-3`, search input becomes `w-full sm:w-56`. App grid was already `grid-cols-1 sm:grid-cols-2 …` — good.

## QuikScale dashboard (`apps/quikscale/app/(dashboard)/dashboard/page.tsx:869`)

Header row combines "Dashboard" label, week badge, `AvgKPICard` (wide pill with donut + 4 stats), and right-side filter/year buttons. At 375–500px the `AvgKPICard` is wider than available space, causing horizontal scroll.

Fixed: outer header becomes `flex-wrap gap-2`. Did **not** touch the 4 locked tables (KPI, Priority, WWW). Their `overflow-auto` handling stays as-is per CLAUDE.md.

## Deferred (needs real refactor, not a class tweak)

1. **Super-admin tables → card view on mobile.** 6–8 column admin tables remain readable only with horizontal scroll. Converting to stacked cards on `<sm` would be a real UX win but requires per-page component restructure (~150 LOC each).
2. **`AvgKPICard` compacting on mobile.** The 4-stat-plus-donut pill at `dashboard/page.tsx:343` is information-dense; on `<sm` it should collapse to just the % number + donut. Needs a conditional render, not a class change.
3. **`audit/page.tsx` date-range input pair** (lines 147-162). On 320px the two date inputs plus labels wrap awkwardly; needs a stacked label/input layout on mobile.
4. **Sidebar/topbar in super-admin `layout.tsx`.** Already handles mobile via hamburger + `motion.aside` at line 210 — looks fine, left as-is.

## Verification

`npx turbo typecheck && npx turbo lint` — green (see report back).

## Files Touched

See the patch: 1 shared (`slide-panel.tsx`), 8 super-admin pages, 2 org-detail sub-components, 1 launcher, 1 quikscale dashboard = **13 files**.
