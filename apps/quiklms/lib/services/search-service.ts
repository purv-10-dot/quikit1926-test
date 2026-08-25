/**
 * Global nav-bar search — the type-ahead behind `GET /api/search`.
 *
 * Shape borrowed from quikhrms's `/api/v1/hrms/search` (its
 * `components/hrms/layout/nav-search.tsx` reads exactly this): a FLAT list of
 * typed hits, each already carrying the `href` the client should navigate to.
 * Keeping the href on the server is what lets one component serve seven roles
 * whose pages live at completely different paths (`/students` vs
 * `/user-management` vs `/manager-dashboard/team`).
 *
 * WHAT EACH ROLE MAY SEARCH — decided here, not in the route. The route is
 * authenticated but NOT role-gated (same as `/api/users/search`), because every
 * role has *something* to search; what differs is what comes back:
 *
 *   ADMIN / TENANT_ADMIN / SUB_ADMIN   courses + people + batches (org-scoped)
 *   MANAGER                            courses + their own reports
 *   TEACHER                            the batches they teach
 *   LEARNER                            only courses ASSIGNED to them
 *   PARENT                             nothing — the portal has no searchable index
 *
 * A learner searching every course title in the org would be a quiet catalogue
 * leak, so their query runs through `LmsCourseAssignment` instead of the course
 * table. The same reasoning keeps people out of the TEACHER and LEARNER results.
 */
import type { Prisma, LmsUserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { orgScope, type AuthUser } from '@/lib/auth/context';

export type SearchHitType = 'course' | 'user' | 'batch';

export interface SearchHit {
  type: SearchHitType;
  id: string;
  label: string;
  /** Secondary line — category, role + email, or grade/section/subject. */
  sub: string | null;
  href: string;
}

/** Below this the type-ahead is noise, and every prefix would scan the table. */
const MIN_QUERY = 2;
/** Per section, so one crowded section cannot push the others out of the panel. */
const SECTION_LIMIT = 5;

/** The same labels the account menu shows — one wording for a role app-wide. */
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Super Admin',
  TENANT_ADMIN: 'Admin',
  SUB_ADMIN: 'Sub Admin',
  MANAGER: 'Manager',
  TEACHER: 'Teacher',
  PARENT: 'Parent',
  LEARNER: 'Learner',
};

const ADMIN_TIER: LmsUserRole[] = ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN'];
const isAdminTier = (actor: AuthUser) => ADMIN_TIER.includes(actor.role);
const isSchool = (actor: AuthUser) => actor.tenantType === 'school';

/** Case-insensitive `contains` — the only match mode this search uses. */
const like = (term: string) => ({ contains: term, mode: 'insensitive' as const });

/**
 * Where a course hit lands. QuikLMS has no per-course admin page — there is
 * `/create-course?courseId=`, but that is the Studio, and dropping someone into
 * an EDITOR from a search box is not what they asked for — so every role except
 * the learner lands on the course list it already knows. The learner gets the
 * real thing: `(fullscreen)/learner/course/[courseId]`.
 */
function courseHref(actor: AuthUser, courseId: string): string {
  switch (actor.role) {
    case 'LEARNER': return `/learner/course/${courseId}`;
    case 'MANAGER': return '/manager-dashboard/courses';
    case 'ADMIN': return '/master-courses';
    default: return isSchool(actor) ? '/school-courses' : '/courses';
  }
}

/**
 * Where a person hit lands. School tenants split their directory three ways
 * (`/students`, `/teachers`, `/parents`); corporate keeps one
 * (`/user-management`); a manager only ever sees their own team page.
 */
function userHref(actor: AuthUser, hitRole: LmsUserRole): string {
  if (actor.role === 'MANAGER') return '/manager-dashboard/team';
  if (!isSchool(actor)) return '/user-management';
  if (hitRole === 'LEARNER') return '/students';
  if (hitRole === 'TEACHER') return '/teachers';
  if (hitRole === 'PARENT') return '/parents';
  return '/user-management';
}

/**
 * A multi-word query means "first last", not "one column containing both words"
 * — `contains: 'ada lovelace'` matches neither column. A single word stays a
 * plain OR across the three columns worth searching.
 */
function nameWhere(term: string): Prisma.LmsUserWhereInput {
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const [first, ...rest] = words;
    return { AND: [{ firstName: like(first) }, { lastName: like(rest.join(' ')) }] };
  }
  return { OR: [{ firstName: like(term) }, { lastName: like(term) }, { email: like(term) }] };
}

/** Dedupe by id while preserving order — master rows win over legacy ones. */
function dedupe<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/** Courses assigned to this learner, matched by title across BOTH course tables. */
async function learnerCourses(actor: AuthUser, orgId: string | undefined, term: string): Promise<SearchHit[]> {
  if (!orgId) return [];

  const assignments = await db.lmsCourseAssignment.findMany({
    where: { orgId, targetType: 'USER', targetId: actor.id },
    select: { courseId: true },
  });
  const ids = [...new Set(assignments.map((a) => a.courseId).filter(Boolean))];
  if (!ids.length) return [];

  // A course id resolves against `LmsMasterCourse` OR the legacy `LmsCourse` —
  // `getUserAssignments` checks both for exactly this reason, so search must too.
  const [master, legacy] = await Promise.all([
    db.lmsMasterCourse.findMany({
      where: { id: { in: ids }, title: like(term) },
      select: { id: true, title: true, category: true },
      take: SECTION_LIMIT,
    }),
    db.lmsCourse.findMany({
      where: { id: { in: ids }, title: like(term) },
      select: { id: true, title: true, category: true },
      take: SECTION_LIMIT,
    }),
  ]);

  return dedupe([...master, ...legacy])
    .slice(0, SECTION_LIMIT)
    .map((c) => ({
      type: 'course' as const,
      id: c.id,
      label: c.title,
      sub: c.category ?? null,
      href: courseHref(actor, c.id),
    }));
}

/** Org courses plus the master courses this tenant was granted, for staff roles. */
async function staffCourses(actor: AuthUser, orgId: string | undefined, term: string): Promise<SearchHit[]> {
  const [own, master] = await Promise.all([
    db.lmsCourse.findMany({
      where: { title: like(term), ...(orgId ? { orgId } : {}) },
      select: { id: true, title: true, category: true },
      orderBy: { updatedAt: 'desc' },
      take: SECTION_LIMIT,
    }),
    db.lmsMasterCourse.findMany({
      where: {
        title: like(term),
        parentCourseId: null,
        // The platform operator sees the whole catalogue; a tenant sees what was
        // published to it plus whatever it submitted itself — the same two
        // clauses `getAssignedCourses` uses.
        ...(orgId
          ? { OR: [{ selectedTenants: { some: { orgId } } }, { submittedByTenantId: orgId }] }
          : {}),
      },
      select: { id: true, title: true, category: true },
      orderBy: { updatedAt: 'desc' },
      take: SECTION_LIMIT,
    }),
  ]);

  return dedupe([...own, ...master])
    .slice(0, SECTION_LIMIT)
    .map((c) => ({
      type: 'course' as const,
      id: c.id,
      label: c.title,
      sub: c.category ?? null,
      href: courseHref(actor, c.id),
    }));
}

async function people(actor: AuthUser, orgId: string | undefined, term: string): Promise<SearchHit[]> {
  // Corporate tenants hide teachers and parents everywhere else (see
  // `/api/users/search`) — the nav search must not become the way around that.
  const excludeRoles: LmsUserRole[] = actor.tenantType === 'corporate' ? ['TEACHER', 'PARENT'] : [];

  const users = await db.lmsUser.findMany({
    where: {
      isActive: true,
      ...(orgId ? { orgId } : {}),
      // A manager's directory is their own reports, nobody else's.
      ...(actor.role === 'MANAGER' ? { managerId: actor.id } : {}),
      ...(excludeRoles.length ? { role: { notIn: excludeRoles } } : {}),
      ...nameWhere(term),
    },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: SECTION_LIMIT,
  });

  return users.map((u) => ({
    type: 'user' as const,
    id: u.id,
    label: `${u.firstName} ${u.lastName}`.trim() || u.email,
    sub: `${ROLE_LABELS[u.role] ?? u.role} · ${u.email}`,
    href: userHref(actor, u.role),
  }));
}

async function batches(actor: AuthUser, orgId: string | undefined, term: string): Promise<SearchHit[]> {
  const rows = await db.lmsBatch.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      // A teacher searches the classes they teach, not the school's timetable.
      ...(actor.role === 'TEACHER' ? { teacherId: actor.id } : {}),
      OR: [{ name: like(term) }, { subject: like(term) }],
    },
    select: { id: true, name: true, grade: true, section: true, subject: true },
    orderBy: { createdAt: 'desc' },
    take: SECTION_LIMIT,
  });

  return rows.map((b) => ({
    type: 'batch' as const,
    id: b.id,
    label: b.name,
    sub: [b.grade, b.section, b.subject].filter(Boolean).join(' · ') || null,
    href: actor.role === 'TEACHER' ? '/teacher-dashboard/batches' : '/batches',
  }));
}

/**
 * Run every section this actor is allowed to see, and flatten the results.
 *
 * `allSettled`, not `all` — the same call `getAuthContext` makes for the same
 * reason: one section failing (a table a tenant has never used, a client stub
 * that only covers part of the schema) must not blank the whole search box.
 */
export async function globalSearch(actor: AuthUser, rawQuery: string): Promise<SearchHit[]> {
  const term = rawQuery.trim();
  if (term.length < MIN_QUERY) return [];

  const orgId = orgScope(actor);
  const sections: Promise<SearchHit[]>[] = [];

  if (actor.role === 'LEARNER') {
    sections.push(learnerCourses(actor, orgId, term));
  } else if (actor.role !== 'PARENT' && actor.role !== 'TEACHER') {
    // TEACHER and PARENT have no courses page to land on (see `nav-groups.ts`),
    // so a course hit would be a dead end for them.
    sections.push(staffCourses(actor, orgId, term));
  }

  if (isAdminTier(actor) || actor.role === 'MANAGER') {
    sections.push(people(actor, orgId, term));
  }

  // Batches are a school-tenant concept (`showBatches: false` for corporate),
  // and only the roles with a batches PAGE can act on a hit.
  if (actor.tenantType !== 'corporate' && (isAdminTier(actor) || actor.role === 'TEACHER')) {
    sections.push(batches(actor, orgId, term));
  }

  const settled = await Promise.allSettled(sections);
  return settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
}
