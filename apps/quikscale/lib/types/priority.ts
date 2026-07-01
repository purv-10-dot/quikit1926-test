export type PriorityWeeklyStatus = {
  id: string;
  priorityId: string;
  weekNumber: number;
  status: string;
  notes?: string | null;
  /** ISO timestamp from Prisma. Used by Last Note column to pick the
   *  most recently edited week — see lib/utils/priorityHelpers.ts. */
  updatedAt?: string;
};

export type PriorityRow = {
  id: string;
  name: string;
  description?: string | null;
  owner: string;
  teamId?: string | null;
  quarter: string;
  year: number;
  startWeek?: number | null;
  endWeek?: number | null;
  overallStatus: string;
  notes?: string | null;
  /** True when created via the OPSP "Export → Create Priorities" flow (display-only). */
  importedFromOpsp?: boolean;
  createdAt: string;
  // Audit columns — populated by GET /api/priority (see lib/api/auditUsers.ts).
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string | null;
  createdByName?: string;
  createdByInitials?: string;
  updatedByName?: string | null;
  updatedByInitials?: string | null;
  owner_user?: { id: string; firstName: string; lastName: string } | null;
  team?: { id: string; name: string } | null;
  weeklyStatuses: PriorityWeeklyStatus[];
};
