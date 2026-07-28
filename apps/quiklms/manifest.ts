/**
 * App manifest — QuikLMS (Learning Management System).
 *
 * The launcher (apps/quikit) reads this at build time. Static only — no
 * runtime work. Do not edit appId/routePrefix after integration sign-off.
 *
 * NOTE: QuikLMS renders role-specific sidebars at runtime (learner, teacher,
 * tenant-admin, sub-admin, super-admin, manager, parent) resolved by
 * `lib/auth/resolve-role.ts`. The `navigation` list below is the launcher-level
 * summary of the app's primary destinations, not the per-role runtime nav.
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
  appId: "quiklms",
  name: "QuikLMS",
  description:
    "Learning Management System — courses, batches, exams, attendance, certificates, teacher/learner portals",
  routePrefix: "/quiklms",
  icon: "GraduationCap",
  permissions: [
    "quiklms.course.read",
    "quiklms.course.write",
    "quiklms.course.admin",
    "quiklms.batch.read",
    "quiklms.batch.write",
    "quiklms.exam.read",
    "quiklms.exam.write",
    "quiklms.exam.evaluate",
    "quiklms.attendance.read",
    "quiklms.attendance.write",
    "quiklms.certificate.read",
    "quiklms.certificate.issue",
    "quiklms.learner.read",
    "quiklms.teacher.admin",
    "quiklms.tenant.admin",
  ],
  navigation: [
    { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
    { label: "Courses", href: "/courses", icon: "BookOpen" },
    { label: "Exams", href: "/exams", icon: "FileCheck" },
    { label: "Certificates", href: "/certificates", icon: "Award" },
    { label: "Messages", href: "/messages", icon: "MessageSquare" },
  ],
};

export default manifest;
