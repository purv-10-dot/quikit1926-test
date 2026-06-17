/**
 * App manifest — QuikHRMS (HR management system).
 *
 * The launcher (apps/quikit) reads this at build time. Static only — no
 * runtime work. Do not edit appId/routePrefix after integration sign-off.
 *
 * Shape mirrors apps/quiktrack/manifest.ts so the launcher can consume every
 * app's manifest uniformly.
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
  appId: "quikhrms",
  name: "QuikHRMS",
  description:
    "HR management — Employees, Payroll, Leave, Attendance, Recruitment, Performance",
  routePrefix: "/quikhrms",
  icon: "Users",
  permissions: [
    "quikhrms.employee.read",
    "quikhrms.employee.write",
    "quikhrms.payroll.read",
    "quikhrms.payroll.write",
    "quikhrms.leave.read",
    "quikhrms.leave.write",
    "quikhrms.attendance.read",
    "quikhrms.attendance.write",
    "quikhrms.recruit.read",
    "quikhrms.recruit.write",
    "quikhrms.performance.read",
    "quikhrms.performance.write",
    "quikhrms.report.read",
    "quikhrms.settings.admin",
  ],
  navigation: [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Employees", href: "/employees", icon: "Users" },
    { label: "Payroll", href: "/payroll", icon: "Wallet" },
    { label: "Leaves", href: "/leaves", icon: "CalendarDays" },
    { label: "Attendance", href: "/attendance", icon: "Clock" },
    { label: "Recruitment", href: "/recruit", icon: "UserPlus" },
    { label: "Performance", href: "/performance", icon: "Target" },
    { label: "Reports", href: "/reports", icon: "BarChart3" },
  ],
};

export default manifest;
