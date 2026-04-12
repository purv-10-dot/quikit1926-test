# QuikIT Component Library Reference

> **Source of truth for all UI components.** Use this file when building any feature
> to identify which shared component to use. NEVER create local duplicates.

## Shared Components (`@quikit/ui`)

Import: `import { ComponentName } from "@quikit/ui"`

### Form Controls

```
┌─────────────────────────────────────────────────────────────────┐
│  Select                                                         │
│  ┌─────────────────────────────────┐                            │
│  │ Plan              ▾             │  Native <select> wrapper   │
│  │ ┌─────────────────────────────┐ │  with label + error state  │
│  │ │ ○ Startup                   │ │                            │
│  │ │ ● Growth                    │ │  USE FOR: 3-8 fixed        │
│  │ │ ○ Enterprise               │ │  options (role, plan,       │
│  │ └─────────────────────────────┘ │  status, day-of-week)      │
│  └─────────────────────────────────┘                            │
│  Props: label, options[], value, onChange, error, placeholder    │
│  File: packages/ui/components/select.tsx                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  FilterPicker                                                   │
│  ┌─────────────────────────────────┐                            │
│  │ All Teams           ▾          │  Searchable single-select   │
│  │ ┌─────────────────────────────┐ │  with avatars + sublabels  │
│  │ │ 🔍 Search...               │ │                            │
│  │ │ ● All Teams                │ │  USE FOR: Filtering lists   │
│  │ │ ○ Engineering    eng@...   │ │  by entity (team, owner,    │
│  │ │ ○ Marketing      mkt@...   │ │  parent team, action type)  │
│  │ └─────────────────────────────┘ │  10+ options or searchable  │
│  └─────────────────────────────────┘                            │
│  Props: value, onChange, options[], allLabel, placeholder        │
│  Type: FilterOption { value, label, sublabel?, avatarInitials? } │
│  File: packages/ui/components/filter-picker.tsx                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  UserSelect                                                     │
│  ┌─────────────────────────────────┐                            │
│  │ [AS] Ashwin Singone    ▾       │  Single OR multi user       │
│  │ ┌─────────────────────────────┐ │  picker with search +      │
│  │ │ 🔍 Search users...         │ │  avatars + chips            │
│  │ │ [AS] Ashwin  ash@...    ✓  │ │                            │
│  │ │ [SC] Sarah   sar@...       │ │  USE FOR: Assigning owners, │
│  │ │ [MJ] Marcus  mar@...       │ │  members, attendees in      │
│  │ └─────────────────────────────┘ │  any create/edit form       │
│  └─────────────────────────────────┘                            │
│  Props: mode("single"|"multi"), users[], value/values, onChange  │
│  Type: PickerUser { id, firstName, lastName, email }            │
│  File: packages/ui/components/user-select.tsx                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Input                                                          │
│  ┌─────────────────────────────────┐                            │
│  │ Email                           │  Text input with label +   │
│  │ ┌─────────────────────────────┐ │  error state               │
│  │ │ user@example.com            │ │                            │
│  │ └─────────────────────────────┘ │  USE FOR: All text/email/   │
│  │ ⚠ Invalid email address        │  password/url fields        │
│  └─────────────────────────────────┘                            │
│  Props: label, error, id, + all HTML input attributes           │
│  File: packages/ui/components/input.tsx                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Button                                                         │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐   │
│  │  Primary   │ │ Secondary  │ │  Outline   │ │  Danger    │   │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘   │
│  Props: variant, size(sm|md|lg), loading, disabled              │
│  Variants: primary, secondary, outline, ghost, danger           │
│  File: packages/ui/components/button.tsx                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  AddButton                                                      │
│  ┌──────────────────┐                                           │
│  │  + Add New KPI   │  Accent-themed add/create button          │
│  └──────────────────┘  with Plus icon                           │
│  Props: onClick, children, disabled, className                  │
│  USE FOR: Top-of-page "Add" / "New" actions                     │
│  File: packages/ui/components/add-button.tsx                    │
└─────────────────────────────────────────────────────────────────┘

### Layout Components

┌─────────────────────────────────────────────────────────────────┐
│  SlidePanel                                                     │
│  ┌──────────────────────────────────────┐ ┌──────────────────┐  │
│  │                                      │ │ Create Team    X │  │
│  │          Backdrop (black/30)         │ │ Add a new team   │  │
│  │          click to close              │ │ ──────────────── │  │
│  │                                      │ │ [form fields]    │  │
│  │                                      │ │                  │  │
│  │                                      │ │ ──────────────── │  │
│  │                                      │ │ Cancel   Submit  │  │
│  └──────────────────────────────────────┘ └──────────────────┘  │
│  Props: open, onClose, title, subtitle?, children, footer?      │
│  USE FOR: ALL create/edit forms (replaces centered modals)      │
│  Width: 480px, slides from right                                │
│  File: packages/ui/components/slide-panel.tsx                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Modal (Composable)                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              ┌─────────────────────┐                     │   │
│  │              │  Confirm Delete   X │                     │   │
│  │              │  Are you sure?      │                     │   │
│  │              │  Cancel    Delete   │                     │   │
│  │              └─────────────────────┘                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  Components: Modal, ModalContent, ModalHeader, ModalTitle,      │
│              ModalDescription, ModalBody, ModalFooter           │
│  Props: open, onOpenChange, children                            │
│  USE FOR: Confirmations, alerts, small dialogs (NOT forms)      │
│  File: packages/ui/components/modal.tsx                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  AppSwitcher                                                    │
│  ┌───┐  ┌─────────────────────┐                                 │
│  │⊞⊞⊞│→│ Apps                │  Google-style 3x3 grid icon     │
│  │⊞⊞⊞│ │ [📊] [⚙️] [🛡️]    │  that opens app popover         │
│  │⊞⊞⊞│ │  QS   Admin  SA    │                                  │
│  └───┘  │ View all apps       │  USE FOR: Every app header      │
│         └─────────────────────┘                                 │
│  Props: quikitUrl, currentAppSlug?, apiUrl?                     │
│  File: packages/ui/components/app-switcher.tsx                  │
└─────────────────────────────────────────────────────────────────┘

### Data Display

┌─────────────────────────────────────────────────────────────────┐
│  Pagination                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Showing 1-20 of 45    ◀ Previous  Page 1 of 3  Next ▶  │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Props: page, totalPages, total, limit, onPageChange            │
│  USE FOR: Bottom of any paginated list/table                    │
│  File: packages/ui/components/pagination.tsx                    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  EmptyState                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              📋                                         │    │
│  │        No items found.                                  │    │
│  │        [Create one →]                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Props: icon (LucideIcon), message, action? { label, onClick }  │
│  USE FOR: Empty tables, empty cards, no-results states          │
│  File: packages/ui/components/empty-state.tsx                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Badge                     │  Avatar                            │
│  ┌────────┐ ┌────────┐    │  ┌────┐                            │
│  │ Active │ │ Admin  │    │  │ AS │  Circle with initials      │
│  └────────┘ └────────┘    │  └────┘                            │
│  Pill-style status/role    │  Props: src, firstName, lastName,  │
│  Props: variant, children  │         size (sm|md|lg)            │
│  File: badge.tsx           │  File: avatar.tsx                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Card                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Card content with consistent border + radius + shadow    │    │
│  └─────────────────────────────────────────────────────────┘    │
│  Props: className, children                                     │
│  File: packages/ui/components/card.tsx                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Tooltip                                                        │
│  ┌──────────────┐                                               │
│  │ Hover text   │  Portal-rendered hover tooltip                │
│  └──┬───────────┘  with arrow positioning                       │
│     ▼                                                           │
│  [icon]                                                         │
│  Props: content, children, widthClass, arrow("left"|"center")   │
│  File: packages/ui/components/tooltip.tsx                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Skeleton (5 variants)                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░ ← Skeleton                 │    │
│  │ ░░░░░░░░  ░░░░░░  ░░░░░░░ ← TableRowSkeleton          │    │
│  │ ░░░░  ░░░░  ░░░░  ░░░░░░░ ← TableSkeleton (N rows)    │    │
│  │ ┌────────────────────────┐ ← CardSkeleton               │    │
│  │ │ ░░░░░░░░░░░  ░░░░░░░░ │                               │    │
│  │ └────────────────────────┘                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│  USE FOR: Loading states (replace "Loading..." text)            │
│  File: packages/ui/components/skeleton.tsx                      │
└─────────────────────────────────────────────────────────────────┘

### Table Utilities

┌─────────────────────────────────────────────────────────────────┐
│  ColMenu                        │  HiddenColsPill               │
│  ┌───┐ ┌──────────────────┐     │  ┌──────────────────────┐     │
│  │ ⋮ │→│ ↑ Sort Ascending │     │  │ 👁 3 hidden  ▾       │     │
│  └───┘ │ ↓ Sort Descending│     │  │ ┌──────────────────┐ │     │
│        │ 🔒 Freeze Column │     │  │ │ Show "Email"     │ │     │
│        │ 👁 Hide Column   │     │  │ │ Show "Phone"     │ │     │
│        └──────────────────┘     │  │ │ Show all         │ │     │
│  Props: colKey, onSort,         │  │ └──────────────────┘ │     │
│    onFreeze, onHide, frozen     │  └──────────────────────┘     │
│  File: col-menu.tsx             │  Props: hiddenCols[], colLabels│
│                                 │    onRestore, onRestoreAll     │
│                                 │  File: hidden-cols-pill.tsx    │
└─────────────────────────────────────────────────────────────────┘

### Theming

┌─────────────────────────────────────────────────────────────────┐
│  ThemeApplier                                                   │
│  Sets CSS custom properties (--accent-50 through --accent-900)  │
│  based on the tenant's chosen accent color.                     │
│  Props: none (fetches from /api/settings/company)               │
│  USE FOR: Dashboard layouts in tenant-facing apps               │
│  File: packages/ui/components/theme-applier.tsx                 │
└─────────────────────────────────────────────────────────────────┘

### Utilities (from @quikit/ui)

```
cn()                  — Tailwind class merger (clsx + tailwind-merge)
formatDate()          — "Jan 15, 2026"
formatDateTime()      — "Jan 15, 2026 2:30 PM"
formatRelativeDate()  — "2 hours ago"
generateInitials()    — "AS" from "Ashwin Singone"
slugify()             — "my-team" from "My Team"
isValidEmail()        — Email validation
truncateText()        — Truncate with ellipsis
```

---

## App-Level Components (NOT shared — app-specific)

These live inside each app and should NOT be extracted to @quikit/ui.

### QuikScale Only

| Component | Path | Why App-Specific |
|---|---|---|
| `sign-in.tsx` | `components/ui/sign-in.tsx` | Auth-specific animated login UI |
| `particles-bg.tsx` | `components/ui/particles-bg.tsx` | Decorative background for login |
| `KPITable.tsx` | `app/(dashboard)/kpi/components/` | Domain-specific table with traffic-light colors (🔒 LOCKED) |
| `PriorityTable.tsx` | `app/(dashboard)/priority/components/` | Domain-specific table (🔒 LOCKED) |
| `WWWTable.tsx` | `app/(dashboard)/www/components/` | Domain-specific table (🔒 LOCKED) |
| `providers.tsx` | `components/providers.tsx` | App bootstrap (SessionProvider + QueryClient + Theme) |
| `session-guard.tsx` | `components/session-guard.tsx` | Auth guard wrapper |

### Admin Only

| Component | Path | Why App-Specific |
|---|---|---|
| `sign-in.tsx` | `components/ui/sign-in.tsx` | Copy of QuikScale's login (branded "Admin Portal") |
| `particles-bg.tsx` | `components/ui/particles-bg.tsx` | Copy of QuikScale's particles |
| `stat-card.tsx` | `components/dashboard/stat-card.tsx` | Admin dashboard stats layout |
| `session-guard.tsx` | `components/session-guard.tsx` | Auth guard wrapper |

### Super Admin (QuikIT) Only

| Component | Path | Why App-Specific |
|---|---|---|
| `layout.tsx` | `app/(super-admin)/layout.tsx` | Custom dark sidebar + red shield branding (unique to super admin) |
| `sign-in.tsx` | `components/ui/sign-in.tsx` | Copy of QuikScale's login (branded "QuikIT") |

---

## Decision Guide: Which Component to Use

```
Creating a form field?
├── Text/email/password/url → Input
├── 3-8 fixed options (role, plan, status) → Select
├── 10+ options or needs search → FilterPicker
├── Picking users → UserSelect (single or multi mode)
└── Date → native <input type="date">

Creating a form container?
├── Create/Edit form → SlidePanel (right-sliding, 480px)
├── Confirmation dialog → Modal (centered, small)
└── Inline edit on detail page → toggle editMode state

Displaying data?
├── Loading state → Skeleton / TableSkeleton
├── Empty table/list → EmptyState
├── Paginated list → Pagination
├── Status/role indicator → Badge
├── User avatar → Avatar
├── Hover info → Tooltip

Table features?
├── Column sort/freeze/hide → ColMenu
└── Show hidden columns → HiddenColsPill

Navigation?
├── App switching → AppSwitcher (in header)
└── Sidebar nav → app-specific (each app has its own)

Theming?
├── Tenant-facing app → ThemeApplier
└── Platform admin → hardcoded indigo-* (no theme)
```

---

## Import Cheatsheet

```tsx
// Form controls
import { Input, Select, FilterPicker, UserSelect, AddButton, Button } from "@quikit/ui";
import type { SelectOption, FilterOption, PickerUser } from "@quikit/ui";

// Layout
import { SlidePanel, Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter, AppSwitcher } from "@quikit/ui";

// Data display
import { Pagination, EmptyState, Badge, Avatar, Card, Tooltip, Skeleton, TableSkeleton } from "@quikit/ui";

// Table utilities
import { ColMenu, HiddenColsPill } from "@quikit/ui";

// Theming
import { ThemeApplier } from "@quikit/ui";

// Utilities
import { cn, formatDate, formatDateTime, formatRelativeDate, generateInitials, slugify } from "@quikit/ui";
```
