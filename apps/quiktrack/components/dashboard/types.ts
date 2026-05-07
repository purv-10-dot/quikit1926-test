/** Widget kinds the dashboard knows how to render. */
export type WidgetType =
  | "introduction"
  | "projects"
  | "assigned-to-me"
  | "activity-stream"
  | "status-chart";

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  /** Layout column — `left` or `right`. Two-column layout matches Jira's
   *  default dashboard. */
  column: "left" | "right";
}

export interface DashboardConfig {
  widgets: WidgetConfig[];
}

export const DEFAULT_DASHBOARD: DashboardConfig = {
  widgets: [
    { id: "w-intro", type: "introduction", column: "left" },
    { id: "w-projects", type: "projects", column: "left" },
    { id: "w-assigned", type: "assigned-to-me", column: "right" },
    { id: "w-activity", type: "activity-stream", column: "right" },
  ],
};

export const WIDGET_META: Record<
  WidgetType,
  { label: string; description: string }
> = {
  introduction: {
    label: "Introduction",
    description: "Welcome card with quick links to common areas.",
  },
  projects: {
    label: "Projects",
    description: "List of recent projects with their leads.",
  },
  "assigned-to-me": {
    label: "Assigned to me",
    description: "Work items assigned to the current user.",
  },
  "activity-stream": {
    label: "Activity stream",
    description: "Recent activity across your projects.",
  },
  "status-chart": {
    label: "Issues by status",
    description: "Donut chart of open issues grouped by status category.",
  },
};
