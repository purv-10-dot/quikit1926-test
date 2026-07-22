"use client";

// Re-export the shared skeleton primitives so consumers can import from
// `@/components/ui/Skeleton` (matching the convention used in the finance/
// approvals pages copied in from sibling apps). All implementations live in
// `@quikit/ui/components/skeleton` and are kept consistent across apps.
export {
  Skeleton,
  TableRowSkeleton,
  TableSkeleton,
  CardSkeleton,
  CardRowSkeleton,
} from "@quikit/ui";
