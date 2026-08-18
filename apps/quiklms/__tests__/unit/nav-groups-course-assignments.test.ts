import { describe, it, expect } from 'vitest';

import { getNavGroups } from '@/components/nav-groups';

/**
 * Every sidebar item must point at a page that can actually serve it.
 *
 * THE BUG. The corporate tenant-admin and sub-admin menus both carried
 * `{ label: 'Course Assignments', path: '/course-analytics' }`. `/course-analytics`
 * is `CourseAnalyticsPage`, which renders ONE course's metrics and is entered
 * per-course from the dashboard as `/course-analytics/{courseId}`. Opened without
 * an id it has no course to report on, so clicking the menu item appeared to do
 * nothing — and because the App Router serves a repeat soft-nav to an
 * already-visited route from its client cache, the Network tab stayed empty,
 * which read as "the page never loads".
 *
 * Meanwhile `app/(tenant-admin)/course-assignments/page.tsx` — the actual
 * assignment manager — had no link anywhere in the app and was unreachable.
 *
 * School tenants are deliberately different: `/school-courses`
 * (`SchoolCourseAssignmentPage`) is their assignment UI, so their entry stays put.
 */

function findItem(groups: ReturnType<typeof getNavGroups>, label: string) {
  return groups.flatMap((g) => g.items).find((i) => i.label === label);
}

describe('sidebar — Course Assignments target', () => {
  it.each(['TENANT_ADMIN', 'SUB_ADMIN'])(
    'points a corporate %s at the assignment manager, not the analytics page',
    (role) => {
      const item = findItem(getNavGroups(role, 'corporate'), 'Course Assignments');
      expect(item).toBeDefined();
      expect(item!.path).toBe('/course-assignments');
    },
  );

  it.each(['TENANT_ADMIN', 'SUB_ADMIN'])(
    'leaves a school %s on /school-courses, which is the school assignment UI',
    (role) => {
      const item = findItem(getNavGroups(role, 'school'), 'Course Assignment');
      expect(item).toBeDefined();
      expect(item!.path).toBe('/school-courses');
    },
  );

  /**
   * Authoring is only half a journey without somewhere to go back to.
   *
   * Both tenant types mount the SAME `<MasterCourseStudio isTenantAdmin />` from
   * /create-course, and on save it redirects to /my-submissions. Corporate tenant
   * admins had that page in their menu (under Administration) and school
   * SUB_ADMINS had it (under My Work), but the school TENANT_ADMIN did not — so a
   * school admin reached their own course exactly once, on the post-save
   * redirect, and afterwards had no route to edit, track or delete it.
   */
  it.each(['corporate', 'school'] as const)(
    'gives a %s tenant admin a route back to their own submissions',
    (tenantType) => {
      const item = findItem(getNavGroups('TENANT_ADMIN', tenantType), 'My Submissions');
      expect(item).toBeDefined();
      expect(item!.path).toBe('/my-submissions');
    },
  );

  // The per-course analytics route is still reachable — from the dashboard, with
  // an id. Nothing in the nav should link to the id-less base path.
  it('no menu item links to the id-less /course-analytics', () => {
    for (const role of ['TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'LEARNER', 'PARENT', 'ADMIN']) {
      for (const tenantType of ['corporate', 'school'] as const) {
        const paths = getNavGroups(role, tenantType).flatMap((g) => g.items).map((i) => i.path);
        expect(paths).not.toContain('/course-analytics');
      }
    }
  });
});
