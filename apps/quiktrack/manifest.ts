/**
 * App manifest — QuikTrack (Jira-clone PMS).
 *
 * The launcher (apps/quikit) reads this at build time. Static only — no
 * runtime work. Do not edit appId/routePrefix after integration sign-off.
 */
export interface AppManifest {
  appId: string;
  name: string;
  description: string;
  routePrefix: string;
  icon: string;
  permissions: string[];
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quiktrack",
  name: "QuikTrack",
  description: "Project management — Spaces, Sprints, Kanban, Timesheet, Reports",
  routePrefix: "/quiktrack",
  icon: "Kanban",
  permissions: [
    "quiktrack.project.read",
    "quiktrack.project.write",
    "quiktrack.project.admin",
    "quiktrack.issue.read",
    "quiktrack.issue.write",
    "quiktrack.timesheet.read",
    "quiktrack.timesheet.write",
    "quiktrack.report.read",
    "quiktrack.team.admin",
  ],
  navigation: [
    { label: "For you", href: "/", icon: "User" },
    { label: "Spaces", href: "/spaces", icon: "LayoutGrid" },
    { label: "Timesheet", href: "/timesheet", icon: "Clock" },
    { label: "Reports", href: "/reports/projects", icon: "BarChart3" },
    { label: "Teams", href: "/teams", icon: "Users" },
  ],
};

export default manifest;
