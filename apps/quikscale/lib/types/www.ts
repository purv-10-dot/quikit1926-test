export type WWWItem = {
  id: string;
  tenantId: string;
  who: string;
  what: string;
  when: string;
  status: string;
  notes?: string | null;
  category?: string | null;
  originalDueDate?: string | null;
  revisedDates: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  who_user?: { id: string; firstName: string; lastName: string } | null;
};
