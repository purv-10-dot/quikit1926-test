import { type TabSpec } from "@/lib/tab-counts";

export const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "responses_received", label: "Responses" },
  { key: "evaluated", label: "Evaluated" },
  { key: "closed", label: "Closed" },
];
