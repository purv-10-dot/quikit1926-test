// ─── UI Component Library ────────────────────────────────────────────────────
// Central export for all shared components and design tokens.
// Import from here to keep UI consistent across the entire app.
//
// Usage:
//   import { Skeleton, TableSkeleton } from "@/components/ui";
//   import { FilterPicker } from "@/components/ui";
//   import { UserPicker } from "@/components/ui";

// ── Loading / Skeleton ────────────────────────────────────────────────────────
export { Skeleton, TableRowSkeleton, TableSkeleton, CardSkeleton, CardRowSkeleton } from "./Skeleton";

// ── Pickers ───────────────────────────────────────────────────────────────────
// FilterPicker  — searchable dropdown with checkmark for filter panels (Team, Owner, Status)
// UserPicker    — avatar + name + email picker used inside create/edit modals
export { FilterPicker, userToFilterOption } from "../FilterPicker";
export type { FilterOption } from "../FilterPicker";
export { UserPicker } from "../UserPicker";
export type { PickerUser } from "../UserPicker";
