/**
 * Constants for the Purchase Orders page.
 *
 * Extracted verbatim from orders/page.tsx as part of the god-file
 * decomposition.
 */

import { type TabSpec } from "@/lib/tab-counts";

export const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "partially_received", label: "Partial" },
  { key: "fully_received", label: "Received" },
  { key: "closed", label: "Closed" },
];
