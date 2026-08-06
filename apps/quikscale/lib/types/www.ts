export type WWWItem = {
  id: string;
  orgId: string;
  who: string;
  /** Full assignee list. */
  whoIds: string[];
  what: string;
  when: string;
  /**
   * True when the due date is "To Be Decided". `when` still carries a
   * placeholder date (the creation date) so existing consumers keep working —
   * read this flag before rendering `when`.
   */
  dueDateTBD?: boolean;
  status: string;
  notes?: string | null;
  category?: string | null;
  originalDueDate?: string | null;
  revisedDates: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Audit columns — populated by GET /api/www via decorateAudit.
  updatedBy?: string | null;
  createdByName?: string;
  createdByInitials?: string;
  updatedByName?: string | null;
  updatedByInitials?: string | null;
  who_user?: { id: string; firstName: string; lastName: string } | null;
  /** Hydrated assignees in `whoIds` order. */
  who_users?: Array<{ id: string; firstName: string; lastName: string; email?: string }>;
};
