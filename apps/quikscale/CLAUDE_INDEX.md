# QuikScale — Claude Implementation Index
> Use this file to avoid re-reading files. Update it whenever you make significant changes.

---

## Project Stack
- **Framework:** Next.js 14 App Router (`/app` dir)
- **Auth:** NextAuth v4 — `getServerSession(authOptions)` from `@/lib/auth`
- **DB:** PostgreSQL + Prisma ORM — client at `@/lib/db`
- **Styling:** Tailwind CSS + `cn()` from `@/lib/utils`
- **State:** React local state + TanStack React Query
- **Animations:** Framer Motion (available, not yet used in OPSP)

---

## Key Files & Their Purpose

### Auth
| File | Purpose |
|------|---------|
| `lib/auth.ts` | NextAuth config, `authOptions` export |
| `middleware.ts` | Route protection — redirects `/dashboard/**` to login if no session; passes `?preview=1` through |
| `app/(auth)/login/page.tsx` | Login page |

### Database
| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | DB schema — all models |
| `lib/db.ts` | Prisma client singleton |
| `prisma/migrations/` | Migration history |

### OPSP Feature
| File | Purpose |
|------|---------|
| `app/(dashboard)/opsp/page.tsx` | **Main OPSP page** — all UI + autosave logic (see below) |
| `app/api/opsp/route.ts` | GET (load) / PUT (save) / POST (finalize) |

---

## OPSP Page — Architecture Summary (`app/(dashboard)/opsp/page.tsx`)

### Data Model (`FormData` interface)
All fields stored as JSON in `OPSPData` table. Unique key: `tenantId + userId + year + quarter`.

```
FormData {
  year, quarter, targetYears, status
  employees[], customers[], shareholders[]   // 3 each
  coreValues (HTML), purpose (HTML)
  actions[]                                  // 5 strings
  profitPerX, bhag
  targetRows: TargetRow[]                    // {category, projected, y1-y5}
  sandbox
  keyThrusts: ThrustRow[]                    // {desc, owner} × 5
  brandPromiseKPIs, brandPromise
  goalRows: GoalRow[]                        // {category, projected, q1-q4}
  keyInitiatives (HTML string)               // rich text, NOT array
  criticalNumGoals, balancingCritNumGoals: CritCard
  processItems[], weaknesses[]               // 3 each
  makeBuy[], sell[], recordKeeping[]         // 3 each
  actionsQtr: ActionRow[]                    // {category, projected}
  rocks (HTML)
  criticalNumProcess, balancingCritNumProcess: CritCard
  theme, scoreboardDesign, celebration, reward  // plain text
  kpiAccountability: KPIAcctRow[]            // {kpi, goal}
  quarterlyPriorities: QPriorRow[]           // {priority, dueDate}
  criticalNumAcct, balancingCritNumAcct: CritCard
  trends[]                                   // 6 strings
}
```

### Autosave Logic
- **Debounce:** 1500ms after any form change
- **Session present:** PUT `/api/opsp` → JSON body
- **No session (401):** Falls back to `localStorage['opsp_draft_{year}_{quarter}']`
- **Load on mount:** GET `/api/opsp?year=&quarter=` → if 401, try localStorage
- `isFirstLoad` ref + `skipNextSave` ref prevent save triggering on initial/period load
  - `skipNextSave.current = true` is set before every `setForm(apiData)` call
  - Autosave effect clears it without saving on the first post-load render

### Key Components (all in same file)
| Component | Purpose |
|-----------|---------|
| `RichEditor` | contentEditable div + `RichToolbar`. Accepts `resetKey` prop — pass `form.year+"-"+form.quarter` so content re-syncs on quarter change. Use for coreValues, purpose, rocks, keyInitiatives |
| `RichToolbar` | Accepts `editorRef`, calls `document.execCommand` via `onMouseDown`+`preventDefault` |
| `TBtn` | Toolbar button — `onMouseDown` prop to prevent focus loss |
| `FInput` | Simple text input |
| `FTextarea` | Simple textarea — use where rich text NOT needed |
| `CategorySelect` | Dropdown for category options. Wrap in `<div className="flex-1 min-w-0">` when used in a flex row |
| `OwnerSelect` | Dropdown for owner options |
| `WithTooltip` | Always renders wrapper div (preserves flex-1), shows tooltip on hover |
| `CritBlock` | Critical # block with color bullets |
| `TargetsModal` | Full expanded view for Targets table |
| `GoalsModal` | Full expanded view for Goals table |
| `QuarterDropdown` | Q1-Q4 selector |

### Layout Notes
- **4-column grid:** `grid grid-cols-4 gap-4` in PEOPLE section. At 1440px viewport ≈ 317px per card.
- **Key Thrusts:** Side-by-side `[number | desc (flex-1) | owner (w-20)]`
- **Key Initiatives:** Single `RichEditor` (NOT numbered rows)
- **BHAG:** `flex-1 flex flex-col` — grows to fill Purpose card bottom
- **Brand Promise KPI + Brand Promise:** Equal split with `flex-1 flex flex-col` each inside a shared `flex-1 flex flex-col gap-3` wrapper
- **Theme card:** `flex flex-col gap-0 p-0` — 4 sections each `flex-1 flex flex-col p-4` (THEME, SCOREBOARD DESIGN, CELEBRATION, REWARD)
- **Targets/Goals compact header:** Info icon moved into card title (not in data rows). Header uses `flex items-center gap-2`. All data rows use same `flex items-center gap-2` — no per-row icon.
- **Actions QTR:** CategorySelect wrapped in `<div className="flex-1 min-w-0">` for proper flex expansion

### Dynamic Grid Warning
> ⚠️ Tailwind purges dynamic `grid-cols-[...]` classes. Use `style={{ gridTemplateColumns: "..." }}` for dynamic grids (e.g. TargetsModal, GoalsModal).

---

## Database Schema — Key Models

### `OPSPData`
```
id           String   @id @default(cuid())
tenantId     String
userId       String
year         Int
quarter      String
status       String   @default("draft")
// All form fields as Json columns:
employees    Json?
customers    Json?
shareholders Json?
coreValues   Json?
purpose      Json?
... (all FormData fields)
@@unique([tenantId, userId, year, quarter])
```

### Other Relevant Models
- `User` — has `tenantId`, linked to `OPSPData`
- `Tenant` — multi-tenant isolation
- Check `prisma/schema.prisma` for full list

---

## API Routes

### `/api/opsp/route.ts`
| Method | Purpose | Auth |
|--------|---------|------|
| GET | Load OPSP for year+quarter | Required (401 if missing) |
| PUT | Upsert (save) OPSP data | Required |
| POST | Finalize OPSP | Required |

All routes use `getServerSession(authOptions)`.

---

## Dashboard Layout

### Files
| File | Purpose |
|------|---------|
| `app/(dashboard)/layout.tsx` | Main layout — sidebar + content |
| `components/Dashboard/Sidebar.tsx` | Left nav |
| `components/Dashboard/Header.tsx` | Top bar |

### Navigation Items (in Sidebar)
- Dashboard `/dashboard`
- OPSP `/dashboard/opsp`
- KPI (planned) `/dashboard/kpi`
- Settings `/dashboard/settings`

---

## Common Gotchas & Fixes

| Problem | Fix |
|---------|-----|
| Dropdown clipped | Remove `overflow-hidden` from container; use `relative` |
| Dynamic Tailwind grid class purged | Use `style={{ gridTemplateColumns: "..." }}` |
| `WithTooltip` strips flex-1 | Always render wrapper div, only conditionally render tooltip bubble |
| Toolbar buttons lose editor focus | Use `onMouseDown` + `e.preventDefault()` instead of `onClick` |
| Autosave fails in preview mode | API returns 401 → fallback to localStorage |
| Autosave fires on initial load | Set `skipNextSave.current = true` before `setForm(apiData)`, clear in autosave effect |
| `contentEditable` + React state | Use `useRef` for DOM. Pass `resetKey` prop (year+quarter) to re-sync innerHTML on period change |
| Row header misaligns with data rows | All rows must use same `gap` and no per-row icons; move icons to section title instead |
| `CategorySelect` not filling flex row | Wrap in `<div className="flex-1 min-w-0">` — `w-full` alone doesn't work as a flex child |

---

## Pending / Future Work
- KPI page at `/dashboard/kpi` (planned, see plan file)
- Date picker for `quarterlyPriorities[].dueDate`
- Copy OPSP between quarters
- Preview/read-only mode (`Eye` button)
- Dashboard redesign (Corporate Professional theme — see plan file)
