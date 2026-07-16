/**
 * Grouped navigation definitions for every role. Each group has a label and
 * a list of items with an icon, label, path, and optional feature flag.
 *
 * Tenant-Admin items are split into school vs corporate variants because the
 * two tenant types expose fundamentally different feature sets.
 */
import {
  LayoutDashboard, Building2, UserPlus, LibraryBig, Trophy, BadgeCheck,
  ShieldCheck, HeartPulse, School, GraduationCap, UserRound, Users,
  Layers, BookOpen, BookPlus, Sparkles, FileEdit, Database, Clock,
  DollarSign, CreditCard, CalendarClock, Star, ListChecks, PhoneCall,
  TrendingUp, MessageSquare, Video, UserCheck, Send, Palette, HardDrive,
  FileText, BarChart3, LayoutGrid, ClipboardCheck, Inbox, CalendarDays,
  // NOTE: lucide-react@0.294 exports this icon as `PlayCircle`; `CirclePlay` is
  // the name from later versions and is `undefined` here (breaks the prod build
  // with "Element type is invalid"). Aliased so usages below stay unchanged.
  BookUser, Award, Calendar, Home, PlayCircle as CirclePlay, Wallet, Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FeatureSet } from '@/lib/features';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  feature?: keyof FeatureSet;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

type TenantType = 'corporate' | 'school' | null;

// ── Super Admin ──────────────────────────────────────────────────────────────

function superAdminGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard',    path: '/dashboard',    icon: LayoutDashboard },
      ],
    },
    {
      id: 'organizations',
      label: 'Organizations',
      items: [
        { label: 'Tenants',         path: '/tenants',    icon: Building2 },
        { label: 'Onboard Tenant',  path: '/onboarding', icon: UserPlus },
      ],
    },
    {
      id: 'content',
      label: 'Content Library',
      items: [
        { label: 'Master Courses',         path: '/master-courses',       icon: LibraryBig },
        { label: 'Certificate Templates',  path: '/certificate-templates', icon: Trophy },
        { label: 'Approvals',              path: '/approvals',             icon: BadgeCheck },
      ],
    },
    {
      id: 'system',
      label: 'System',
      items: [
        { label: 'Platform Analytics', path: '/platform-analytics', icon: BarChart3 },
        { label: 'Audit & Storage',    path: '/audit',              icon: ShieldCheck },
        { label: 'System Health',      path: '/system-health',      icon: HeartPulse },
      ],
    },
  ];
}

// ── Tenant Admin — School ────────────────────────────────────────────────────

function tenantAdminSchoolGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard',        path: '/school-dashboard',  icon: School },
      ],
    },
    {
      id: 'people',
      label: 'People',
      items: [
        { label: 'Students', path: '/students', icon: GraduationCap },
        { label: 'Teachers', path: '/teachers', icon: UserRound },
        { label: 'Parents',  path: '/parents',  icon: Users },
      ],
    },
    {
      id: 'academics',
      label: 'Academics',
      items: [
        { label: 'Batches',             path: '/batches',              icon: Layers },
        { label: 'Exams',               path: '/exams',                icon: FileEdit },
        { label: 'Question Bank',       path: '/question-bank',        icon: Database },
        { label: 'Course Assignment',   path: '/school-courses',       icon: BookPlus },
        { label: 'Create Course',       path: '/create-course',        icon: Sparkles },
        { label: 'Session Timestamps',  path: '/session-timestamps',   icon: Clock },
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { label: 'Payouts',              path: '/payouts',               icon: DollarSign,    feature: 'showPayouts' },
        { label: 'Credits Config',       path: '/credits-config',        icon: CreditCard,    feature: 'showCredits' },
        { label: 'Teacher Availability', path: '/teacher-availability',  icon: CalendarClock },
        { label: 'Teacher Levels',       path: '/teacher-levels',        icon: Star },
        { label: 'Non-Teaching Tasks',   path: '/non-teaching-tasks',    icon: ListChecks },
        { label: 'Escalation Log',       path: '/escalation-log',        icon: PhoneCall },
        { label: 'Demo Analytics',       path: '/demo-analytics',        icon: TrendingUp },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      items: [
        { label: 'School Analytics', path: '/school-analytics', icon: BarChart3,  feature: 'showAnalytics' },
        { label: 'Recordings',       path: '/recordings',       icon: CirclePlay, feature: 'showVideoClasses' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        { label: 'Certificates', path: '/certificates', icon: Trophy,    feature: 'showCertificates' },
        { label: 'Branding',     path: '/branding',     icon: Palette },
        { label: 'Storage',      path: '/storage',      icon: HardDrive },
        { label: 'Audit Log',    path: '/tenant-audit', icon: FileText },
      ],
    },
  ];
}

// ── Tenant Admin — Corporate ─────────────────────────────────────────────────

function tenantAdminCorporateGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/tenant-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'people',
      label: 'People',
      items: [
        { label: 'Learners', path: '/user-management', icon: Users },
        { label: 'Groups',   path: '/groups',          icon: LayoutGrid },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      items: [
        { label: 'Courses',            path: '/courses',              icon: BookOpen,  feature: 'showCourses' },
        { label: 'Course Assignments', path: '/course-analytics',     icon: BookPlus,  feature: 'showCourseAssignments' },
        { label: 'Create Course',      path: '/create-course',        icon: Sparkles },
        { label: 'Compliance',         path: '/compliance',           icon: ClipboardCheck, feature: 'showCompliance' },
        { label: 'Quiz Proctoring',    path: '/quiz-proctoring',      icon: Shield },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      items: [
        { label: 'Analytics', path: '/analytics', icon: BarChart3, feature: 'showAnalytics' },
      ],
    },
    {
      id: 'administration',
      label: 'Administration',
      items: [
        { label: 'Sub Admins',             path: '/sub-admins',              icon: UserCheck },
        { label: 'Sub Admin Submissions',  path: '/sub-admin-submissions',   icon: Inbox },
        { label: 'My Submissions',         path: '/my-submissions',          icon: Send },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
    {
      id: 'settings',
      label: 'Settings',
      items: [
        { label: 'Certificates', path: '/certificates', icon: Trophy,    feature: 'showCertificates' },
        { label: 'Branding',     path: '/branding',     icon: Palette },
        { label: 'Storage',      path: '/storage',      icon: HardDrive },
        { label: 'Audit Log',    path: '/tenant-audit', icon: FileText },
      ],
    },
  ];
}

// ── Sub Admin ────────────────────────────────────────────────────────────────

/**
 * Sub-Admin mirrors the full tenant-admin management set (school or corporate),
 * MINUS the sub-admin management items (no "Sub Admins", no "Sub Admin
 * Submissions"). The only structural difference from tenant-admin is that the
 * dashboard points at /sub-admin-dashboard. All management pages live at the
 * same top-level URLs (e.g. /students, /batches); middleware.ts gates those to
 * the admin roles, which includes SUB_ADMIN.
 */
function subAdminSchoolGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard',        path: '/school-dashboard',     icon: School },
        { label: 'Admin Dashboard',  path: '/sub-admin-dashboard',  icon: LayoutDashboard },
      ],
    },
    {
      id: 'people',
      label: 'People',
      items: [
        { label: 'Students', path: '/students', icon: GraduationCap },
        { label: 'Teachers', path: '/teachers', icon: UserRound },
        { label: 'Parents',  path: '/parents',  icon: Users },
      ],
    },
    {
      id: 'academics',
      label: 'Academics',
      items: [
        { label: 'Batches',             path: '/batches',              icon: Layers },
        { label: 'Exams',               path: '/exams',                icon: FileEdit },
        { label: 'Question Bank',       path: '/question-bank',        icon: Database },
        { label: 'Course Assignment',   path: '/school-courses',       icon: BookPlus },
        { label: 'Create Course',       path: '/create-course',        icon: Sparkles },
        { label: 'Session Timestamps',  path: '/session-timestamps',   icon: Clock },
      ],
    },
    {
      id: 'operations',
      label: 'Operations',
      items: [
        { label: 'Payouts',              path: '/payouts',               icon: DollarSign,    feature: 'showPayouts' },
        { label: 'Credits Config',       path: '/credits-config',        icon: CreditCard,    feature: 'showCredits' },
        { label: 'Teacher Availability', path: '/teacher-availability',  icon: CalendarClock },
        { label: 'Teacher Levels',       path: '/teacher-levels',        icon: Star },
        { label: 'Non-Teaching Tasks',   path: '/non-teaching-tasks',    icon: ListChecks },
        { label: 'Escalation Log',       path: '/escalation-log',        icon: PhoneCall },
        { label: 'Demo Analytics',       path: '/demo-analytics',        icon: TrendingUp },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      items: [
        { label: 'School Analytics', path: '/school-analytics', icon: BarChart3,  feature: 'showAnalytics' },
        { label: 'Recordings',       path: '/recordings',       icon: CirclePlay, feature: 'showVideoClasses' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
    {
      id: 'work',
      label: 'My Work',
      items: [
        { label: 'My Submissions', path: '/my-submissions', icon: Send },
        { label: 'Certificates',   path: '/certificates',   icon: Trophy, feature: 'showCertificates' },
        { label: 'Branding',       path: '/branding',       icon: Palette },
        { label: 'Storage',        path: '/storage',        icon: HardDrive },
        { label: 'Audit Log',      path: '/tenant-audit',   icon: FileText },
      ],
    },
  ];
}

function subAdminCorporateGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/sub-admin-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'people',
      label: 'People',
      items: [
        { label: 'Learners', path: '/user-management', icon: Users },
        { label: 'Groups',   path: '/groups',          icon: LayoutGrid },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      items: [
        { label: 'Courses',            path: '/courses',              icon: BookOpen,  feature: 'showCourses' },
        { label: 'Course Assignments', path: '/course-analytics',     icon: BookPlus,  feature: 'showCourseAssignments' },
        { label: 'Create Course',      path: '/create-course',        icon: Sparkles },
        { label: 'Compliance',         path: '/compliance',           icon: ClipboardCheck, feature: 'showCompliance' },
        { label: 'Quiz Proctoring',    path: '/quiz-proctoring',      icon: Shield },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      items: [
        { label: 'Analytics', path: '/analytics', icon: BarChart3, feature: 'showAnalytics' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
    {
      id: 'work',
      label: 'My Work',
      items: [
        { label: 'My Submissions', path: '/my-submissions', icon: Send },
        { label: 'Certificates',   path: '/certificates',   icon: Trophy, feature: 'showCertificates' },
        { label: 'Branding',       path: '/branding',       icon: Palette },
        { label: 'Storage',        path: '/storage',        icon: HardDrive },
        { label: 'Audit Log',      path: '/tenant-audit',   icon: FileText },
      ],
    },
  ];
}

// ── Manager ──────────────────────────────────────────────────────────────────

function managerGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/manager-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'team',
      label: 'My Team',
      items: [
        { label: 'Team', path: '/manager-dashboard/team', icon: Users },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      items: [
        { label: 'Courses', path: '/manager-dashboard/courses', icon: BookOpen },
      ],
    },
    {
      id: 'achievements',
      label: 'Achievements',
      items: [
        { label: 'Certificates', path: '/manager-dashboard/certificates', icon: Award, feature: 'showCertificates' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
  ];
}

// ── Teacher ──────────────────────────────────────────────────────────────────

function teacherGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/teacher-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'classes',
      label: 'My Classes',
      items: [
        { label: 'Batches',     path: '/teacher-dashboard/batches',     icon: CalendarDays },
        { label: 'Attendance',  path: '/teacher-dashboard/attendance',  icon: ClipboardCheck },
        { label: 'Homework',    path: '/teacher-dashboard/homework',    icon: BookOpen },
        { label: 'Tutoring',    path: '/teacher-dashboard/tutoring',    icon: BookUser },
      ],
    },
    {
      id: 'growth',
      label: 'My Growth',
      items: [
        { label: 'My Level',    path: '/teacher-dashboard/level',        icon: Star },
        { label: 'Availability', path: '/teacher-dashboard/availability', icon: CalendarClock },
      ],
    },
    {
      id: 'finance',
      label: 'Finance',
      items: [
        { label: 'Payouts',       path: '/teacher-dashboard/payouts',       icon: Wallet,     feature: 'showPayouts' },
        { label: 'Non-Teaching',  path: '/teacher-dashboard/non-teaching',  icon: ListChecks },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
  ];
}

// ── Parent ───────────────────────────────────────────────────────────────────

function parentGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/parent-dashboard', icon: LayoutDashboard },
      ],
    },
    {
      id: 'child',
      label: "My Child",
      items: [
        { label: 'Schedule',  path: '/parent-dashboard/schedule',     icon: Calendar },
        { label: 'Homework',  path: '/parent-dashboard/homework',     icon: FileEdit },
      ],
    },
    {
      id: 'classes',
      label: 'Classes',
      items: [
        { label: 'Live Classes', path: '/parent-dashboard/live-classes', icon: Video, feature: 'showVideoClasses' },
      ],
    },
    {
      id: 'finance',
      label: 'Finance',
      items: [
        { label: 'Credits', path: '/parent-dashboard/credits', icon: CreditCard, feature: 'showCredits' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
  ];
}

// ── Learner ──────────────────────────────────────────────────────────────────

function learnerSchoolGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/learner/dashboard', icon: Home },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      items: [
        { label: 'My Courses', path: '/learner/course-status', icon: BookOpen },
        { label: 'Schedule',   path: '/learner/schedule',      icon: Calendar,    feature: 'showSchedule' },
        { label: 'Homework',   path: '/learner/homework',      icon: FileEdit,    feature: 'showHomework' },
        { label: 'Exams',      path: '/learner/exams',         icon: ClipboardCheck },
      ],
    },
    {
      id: 'support',
      label: 'Support',
      items: [
        { label: 'Tutoring', path: '/learner/tutoring', icon: BookUser },
      ],
    },
    {
      id: 'achievements',
      label: 'Achievements',
      items: [
        { label: 'Certificates', path: '/learner/certificates', icon: Award, feature: 'showCertificates' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
  ];
}

function learnerCorporateGroups(): NavGroup[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      items: [
        { label: 'Dashboard', path: '/learner/dashboard', icon: Home },
      ],
    },
    {
      id: 'learning',
      label: 'Learning',
      items: [
        { label: 'My Courses', path: '/learner/course-status', icon: BookOpen },
        { label: 'Compliance', path: '/learner/course-status', icon: ClipboardCheck, feature: 'showCompliance' },
      ],
    },
    {
      id: 'achievements',
      label: 'Achievements',
      items: [
        { label: 'Certificates', path: '/learner/certificates', icon: Award, feature: 'showCertificates' },
      ],
    },
    {
      id: 'communication',
      label: 'Communication',
      items: [
        { label: 'Messages', path: '/messages', icon: MessageSquare, feature: 'showMessaging' },
      ],
    },
  ];
}

// ── Main export ──────────────────────────────────────────────────────────────

export function getNavGroups(role: string, tenantType: TenantType): NavGroup[] {
  switch (role) {
    case 'SUPER_ADMIN':  return superAdminGroups();
    case 'TENANT_ADMIN': return tenantType === 'corporate' ? tenantAdminCorporateGroups() : tenantAdminSchoolGroups();
    case 'SUB_ADMIN':    return tenantType === 'corporate' ? subAdminCorporateGroups() : subAdminSchoolGroups();
    case 'MANAGER':      return managerGroups();
    case 'TEACHER':      return teacherGroups();
    case 'PARENT':       return parentGroups();
    case 'LEARNER':      return tenantType === 'corporate' ? learnerCorporateGroups() : learnerSchoolGroups();
    default:             return [];
  }
}
