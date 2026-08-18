import { describe, it, expect } from 'vitest';

import { actionForMethod, isAction, resourceForPath, ACTIONS } from '@/lib/auth/permissions-registry';
import { PERMISSION_MATRIX, MATRIX_EXCEPTIONS } from '@/lib/auth/permission-matrix.generated';

/**
 * The resource rule is what makes the derived matrix safe, so it is worth pinning.
 *
 * Granularity was measured. One path segment left 47 of 135 resource:action pairs
 * self-contradictory — `certificates:view` spanned a ADMIN-only approval queue
 * and a learner's own certificate list, and seeding the union would have handed
 * learners the approval queue. Two segments left 6. Full depth plus `.item` leaves
 * ZERO across 392 pairs, which is why it is the rule.
 *
 * This function must stay identical to `resourceForSegments` in
 * scripts/derive-permission-matrix.mjs: a key produced here that the generator never
 * emitted is checked against a grant that does not exist, and reads as a denial. If
 * `resourceForPath` ever coarsens, that safety is gone silently — hence assertions on
 * the granularity itself, not just the happy path.
 */
describe('resourceForPath', () => {
  it('keeps every named segment, so sibling route families stay distinct', () => {
    expect(resourceForPath('/api/certificates/pending-approvals')).toBe('certificates.pending-approvals');
    expect(resourceForPath('/api/certificates/my-certificates')).toBe('certificates.my-certificates');
    expect(resourceForPath('/api/exam-sessions/exam/98765/submissions')).toBe('exam-sessions.exam.submissions');
    expect(resourceForPath('/api/exam-sessions/exam/98765/my-session')).toBe('exam-sessions.exam.my-session');
  });

  /**
   * `.item` is the other half of the rule. A collection and one row are different
   * permissions: a LEARNER may open an exam assigned to them (`exams.item`) but not
   * enumerate the tenant's exams (`exams`). Merging them seeds the union, and the
   * union is always the more permissive side.
   */
  it('marks the single-row form with .item', () => {
    expect(resourceForPath('/api/exams')).toBe('exams');
    expect(resourceForPath('/api/exams/12345')).toBe('exams.item');
    expect(resourceForPath('/api/master-courses/2f3f727f-9512-4996-ae4d-a160b7adb276')).toBe(
      'master-courses.item',
    );
  });

  it('drops ids from the KEY — they identify the row, not the permission', () => {
    // Two different courses are the same permission; only the .item suffix marks
    // that a single row rather than the collection was addressed.
    expect(resourceForPath('/api/courses/cms4h3juf000913ymvzqtjbvq')).toBe('courses.item');
    expect(resourceForPath('/api/courses/2f3f727f-9512-4996-ae4d-a160b7adb276')).toBe('courses.item');
  });

  /**
   * REGRESSION. An id in the MIDDLE of a path must not truncate the key. An earlier
   * version took the first two segments and only then dropped ids, which turned
   * `/api/tenants/<id>/branding` into `tenants` — seeded ADMIN-only — so the
   * shadow probe reported every tenant admin reading their own branding as a denial
   * of `tenants:view`. The generator had recorded `tenants.branding`.
   */
  it('drops a MIDDLE id without losing the segments after it', () => {
    expect(resourceForPath('/api/tenants/cms4h3juf000913ymvzqtjbvq/branding')).toBe('tenants.branding');
    expect(resourceForPath('/api/courses/cms4h3juf000913ymvzqtjbvq/modules')).toBe('courses.modules');
    expect(resourceForPath('/api/exam-sessions/exam/98765/analytics')).toBe('exam-sessions.exam.analytics');
  });

  it('treats a kebab-case route name as a name, not an id', () => {
    expect(resourceForPath('/api/course-assignments/assign-all-learners')).toBe(
      'course-assignments.assign-all-learners',
    );
  });

  it('works with or without the /api prefix, and ignores the query string', () => {
    expect(resourceForPath('/courses/master')).toBe('courses.master');
    expect(resourceForPath('/api/analytics/corporate?courseId=abc')).toBe('analytics.corporate');
  });

  it('never returns an empty key', () => {
    expect(resourceForPath('/api')).toBe('root');
    expect(resourceForPath('/')).toBe('root');
  });
});

describe('actionForMethod', () => {
  it('maps PUT and PATCH to the same action', () => {
    expect(actionForMethod('PUT')).toBe('update');
    expect(actionForMethod('PATCH')).toBe('update');
  });

  it('covers the CRUD-V set and refuses anything else', () => {
    expect(ACTIONS).toEqual(['view', 'create', 'update', 'delete']);
    expect(actionForMethod('GET')).toBe('view');
    expect(actionForMethod('POST')).toBe('create');
    expect(actionForMethod('DELETE')).toBe('delete');
    expect(actionForMethod('HEAD')).toBeNull();
    expect(actionForMethod('OPTIONS')).toBeNull();
  });

  it('isAction gates unknown strings — userCan fails closed on them', () => {
    expect(isAction('view')).toBe(true);
    expect(isAction('publish')).toBe(false);
  });
});

describe('the generated matrix', () => {
  it('only ever declares known actions', () => {
    for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const action of Object.keys(actions)) {
        expect(isAction(action), `${resource}:${action}`).toBe(true);
      }
    }
  });

  /**
   * The resource rule exists BECAUSE it drives contradictions to zero. A non-empty
   * exception list means two routes under one resource:action disagree, and the only
   * ways to seed that are to pick one policy or to seed the union — the union being
   * the more permissive. Neither is acceptable, so the rule is what must change.
   */
  it('has no contradictions left to hold back', () => {
    expect(MATRIX_EXCEPTIONS).toEqual([]);
  });

  it('never grants a resource:action to nobody', () => {
    // An empty role list would be a lock-out written as data. Handlers with no role
    // gate are granted to every role instead, matching what they do today.
    for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const [action, roles] of Object.entries(actions)) {
        expect(roles?.length, `${resource}:${action}`).toBeGreaterThan(0);
      }
    }
  });
});
