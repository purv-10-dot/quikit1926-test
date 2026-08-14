import {
  Globe,
  Calendar as CalendarIcon,
  List as ListIcon,
  Zap,
  Columns,
  LayoutGrid,
  ListChecks,
  ListTree,
  Clock,
  FileText,
  Lightbulb,
  BarChart3,
  Code,
  FlaskConical,
} from "lucide-react";

/**
 * Icon for each project tab, keyed by its path. Shared by the tab bar
 * (project-header.tsx) and the tab customizer so they stay in sync. Paths match
 * the registry in lib/projectTabs.ts.
 */
export const TAB_ICONS: Record<string, typeof Globe> = {
  summary: Globe,
  timeline: CalendarIcon,
  backlog: ListIcon,
  epics: Zap,
  board: Columns,
  "grouped-kanban": LayoutGrid,
  list: ListChecks,
  "task-table": ListTree,
  reports: BarChart3,
  test: FlaskConical,
  development: Code,
  timesheet: Clock,
  docs: FileText,
  ideas: Lightbulb,
};
