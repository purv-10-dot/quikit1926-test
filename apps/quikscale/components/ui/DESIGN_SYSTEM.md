# UI Design System

This document is the single source of truth for reusable components, patterns, and styles.
Always use these instead of building one-off solutions to keep the UI consistent.

---

## Components

### Skeleton Loaders
`import { Skeleton, TableSkeleton, CardRowSkeleton } from "@/components/ui"`

| Component | Use when |
|---|---|
| `<Skeleton className="h-4 w-32" />` | Single shimmer line / block |
| `<TableSkeleton rows={10} cols={6} />` | Full table loading (KPI, Priority, WWW pages) |
| `<CardRowSkeleton count={4} />` | Grid of mini cards loading (Dashboard KPI overview) |
| `<CardSkeleton />` | Single card placeholder |

**Rule**: Every page that fetches data must show `<TableSkeleton>` or `<CardRowSkeleton>` while `isLoading === true`. No spinners.

---

### FilterPicker
`import { FilterPicker, userToFilterOption } from "@/components/ui"`

Searchable dropdown for filter panels. Used for Team and Owner/Who filters across all pages.

```tsx
// Team filter
<FilterPicker
  value={filterTeam}
  onChange={setFilterTeam}
  options={teams.map(t => ({ value: t.id, label: t.name }))}
  allLabel="All teams"
/>

// Owner filter (with avatar)
<FilterPicker
  value={filterOwner}
  onChange={setFilterOwner}
  options={users.map(userToFilterOption)}   // includes avatar initials + color
  allLabel="All owners"
/>
```

**Rule**: All Team and Owner dropdowns in filter panels must use `FilterPicker`. No native `<select>` for these.

---

### UserPicker
`import { UserPicker } from "@/components/ui"`

Avatar + name + email picker. Used inside **create/edit modals** for the Owner field.

```tsx
<UserPicker
  value={form.owner}
  onChange={v => setForm(f => ({ ...f, owner: v }))}
  users={users}
  error={!!errors.owner}
/>
```

**Rule**: All owner fields in modals (KPIModal, PriorityModal, WWWPanel, LogModal) must use `UserPicker`.

---

## Hooks

| Hook | File | Purpose |
|---|---|---|
| `useTeams()` | `lib/hooks/useTeams.ts` | Fetch org teams (cached 5 min) |
| `useUsers(teamId?)` | `lib/hooks/useUsers.ts` | Fetch users, optionally filtered by team |

**Rule**: Never fetch `/api/org/teams` via raw `useEffect + fetch`. Use `useTeams()`.

---

## Constants

### Status values
`import { STATUS_META, STATUS_DOT, STATUS_OPTIONS } from "@/lib/constants/status"`

| Export | Use for |
|---|---|
| `STATUS_META[status].label` | Display text: "On Track", "Behind Schedule" |
| `STATUS_META[status].bg` | Light cell background: `bg-green-50` |
| `STATUS_META[status].text` | Text color: `text-green-600` |
| `STATUS_DOT[status]` | Solid dot/cell fill: `bg-green-500` |
| `STATUS_OPTIONS` | `<select>` or `FilterPicker` options array |
| `KPI_STATUS_OPTIONS` | KPI-specific statuses (active/paused/completed) |

**Rule**: Never define status colors/labels inline. Import from `lib/constants/status`.

---

## API Patterns

### getTenantId
`import { getTenantId } from "@/lib/api/getTenantId"`

Every API route resolves the tenant like this:
```ts
const tenantId = await getTenantId(session.user.id);
if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
```

**Rule**: Never copy-paste the `getTenantId` function body inline. Import from `lib/api/getTenantId`.

---

## Soft Deletes

All models that support user-initiated deletion use soft delete via `deletedAt DateTime?`.

| Model | Has deletedAt |
|---|---|
| KPI | ✅ |
| Priority | ✅ |
| WWWItem | ✅ |

**Rule**: Delete handlers must use `update({ data: { deletedAt: new Date() } })`. All list queries must include `deletedAt: null` in `where`.

---

## Design Tokens (Tailwind)

| Token | Value | Usage |
|---|---|---|
| Page header | `px-6 py-3 border-b border-gray-200 bg-white` | All page headers |
| Filter panel | `w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4` | All filter popups |
| Filter label | `text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2` | Section labels inside filter panels |
| Primary button | `bg-gray-900 text-white text-xs font-medium rounded-md hover:bg-gray-700` | Add New, Save |
| Danger button | `bg-red-50 border border-red-200 text-red-600 rounded-md hover:bg-red-100` | Delete selected |
| Count badge | `text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium` | Items count in header |
| Period badge | `text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium` | Quarter · Week · Date range |

---

## Tooltip Direction
Tooltips always open **downward** (`top-full`, not `bottom-full`). Dark bg: `bg-gray-900 text-white`.
