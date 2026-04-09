export type PriorityWeeklyStatus = {
  id: string;
  priorityId: string;
  weekNumber: number;
  status: string;
  notes?: string | null;
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
  createdAt: string;
  owner_user?: { id: string; firstName: string; lastName: string } | null;
  team?: { id: string; name: string } | null;
  weeklyStatuses: PriorityWeeklyStatus[];
};
