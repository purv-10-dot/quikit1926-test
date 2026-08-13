export interface KpiTarget {
  label: string;
  current: number;
  target: number;
  unit: string;
  lowerIsBetter?: boolean;
}

export interface TeamTask {
  id: string;
  title: string;
  assignee: string;
  status: "todo" | "progress" | "done";
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  tasksToday: { done: number; total: number };
  weeklyCompletion: number; // 0-100
  kpis: KpiTarget[];
}
