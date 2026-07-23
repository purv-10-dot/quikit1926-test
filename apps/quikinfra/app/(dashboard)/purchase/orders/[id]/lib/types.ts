/** Types for the PO detail page. Extracted from page.tsx. */

export interface ItemRow {
  id: string;
  name?: string;
  uomCode?: string;
}

export interface MailOutcome {
  sent?: boolean;
  email?: string;
  to?: string;
  skippedReason?: string;
  error?: string;
}

/** Matches PageShell's ApprovalTimeline entry shape. */
export interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}
