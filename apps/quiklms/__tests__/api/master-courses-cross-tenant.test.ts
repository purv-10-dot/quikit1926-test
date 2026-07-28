/**
 * GAP_REPORT §3.2 courses — the five cross-tenant ownership holes.
 *
 * `auto-save`, `draft` GET/DELETE, `reorder-modules` and `reorder-submodules`
 * each passed `params.id` straight to the service with no ownership check, and
 * `autoSaveDraft` filters only on `{id, isMaster:true}`. Any TENANT_ADMIN or
 * SUB_ADMIN of ANY tenant could therefore overwrite `draftData` on any master
 * course, read another tenant's unpublished draft, destroy it, or restructure
 * the course.
 *
 * The NestJS original had these holes verbatim, so closing them is a deliberate
 * behavior change (approved 2026-07-17), not migration parity.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  selectedFindMany: vi.fn(),
  selectedDeleteMany: vi.fn(),
  selectedCreateMany: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  // Real predicate — stubbing it would disable the guards under test.
  userHasRole: (u: { role?: string; secondaryRole?: string | null }, role: string) =>
    u?.role === role || u?.secondaryRole === role,
}));
vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: vi.fn(async (u: string) => u), s3: { send: vi.fn() }, S3_BUCKET: 'b' }));
vi.mock('@/lib/db', () => ({
  db: {
    lmsMasterCourse: { findFirst: h.findFirst, update: h.update },
    lmsMasterCourseSelectedTenant: {
      findMany: h.selectedFindMany,
      deleteMany: h.selectedDeleteMany,
      createMany: h.selectedCreateMany,
    },
  },
}));

import { POST as autoSavePOST } from '@/app/api/master-courses/[id]/auto-save/route';
import { GET as draftGET, DELETE as draftDELETE } from '@/app/api/master-courses/[id]/draft/route';
import { PUT as reorderModulesPUT } from '@/app/api/master-courses/[id]/reorder-modules/route';
import { PUT as reorderSubModulesPUT } from '@/app/api/master-courses/[id]/modules/[moduleId]/reorder-submodules/route';

const ctx = { params: { id: 'course-1' } };
const subCtx = { params: { id: 'course-1', moduleId: 'mod-1' } };

/** A master course owned by org-VICTIM. */
const victimCourse = {
  id: 'course-1',
  isMaster: true,
  submittedByTenantId: 'org-victim',
  status: 'PendingApproval',
  modules: [{ id: 'mod-1', subModules: [] }],
  draftData: { secret: 'victim work in progress' },
  lastAutoSaveAt: new Date('2026-01-01'),
};

function req(method: string, payload?: unknown) {
  return new Request('http://x/api/master-courses/course-1', {
    method,
    ...(payload !== undefined
      ? { body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } }
      : {}),
  }) as never;
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireRoles.mockReturnValue(undefined);
  h.findFirst.mockResolvedValue(victimCourse);
  h.update.mockImplementation(async ({ data }: any) => ({ ...victimCourse, ...data }));
  h.selectedFindMany.mockResolvedValue([]);
});

/** An attacker: a legitimate admin, but of a DIFFERENT tenant. */
function actAs(role: string, secondaryRole: string | null = null, orgId = 'org-attacker') {
  h.requireAuth.mockResolvedValue({ id: 'u-att', role, secondaryRole, orgId, isActive: true });
}

const attackers: Array<[string, string, string | null]> = [
  ['TENANT_ADMIN of another tenant', 'TENANT_ADMIN', null],
  ['SUB_ADMIN of another tenant', 'SUB_ADMIN', null],
  ['delegated SUB_ADMIN (secondaryRole)', 'TEACHER', 'SUB_ADMIN'],
  // The local predicate copies these routes used to rely on missed this case:
  // `secondaryRole === 'TENANT_ADMIN'` was not recognised as a tenant actor, so
  // the actor skipped the check onto the unscoped SUPER_ADMIN path. The legacy
  // helper checked both roles (`role-access.util.ts:24-32`).
  ['delegated TENANT_ADMIN (secondaryRole)', 'TEACHER', 'TENANT_ADMIN'],
];

describe.each(attackers)('cross-tenant %s is blocked', (_label, role, secondaryRole) => {
  beforeEach(() => actAs(role, secondaryRole));

  it('cannot auto-save over another tenant’s draft', async () => {
    const res = await autoSavePOST(req('POST', { hijacked: true }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('You can only edit your own courses');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('cannot read another tenant’s draft', async () => {
    const res = await draftGET(req('GET'), ctx);
    expect(res.status).toBe(400);
    // The victim's work-in-progress must not appear in the body.
    expect(JSON.stringify(await res.json())).not.toContain('victim work in progress');
  });

  it('cannot discard another tenant’s draft', async () => {
    const res = await draftDELETE(req('DELETE'), ctx);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('cannot reorder another tenant’s modules', async () => {
    const res = await reorderModulesPUT(req('PUT', { moduleIds: ['mod-1'] }), ctx);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it('cannot reorder another tenant’s sub-modules', async () => {
    const res = await reorderSubModulesPUT(req('PUT', { subModuleIds: ['sm-1'] }), subCtx);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});

describe('the owning tenant is unaffected', () => {
  beforeEach(() => actAs('TENANT_ADMIN', null, 'org-victim'));

  it('can auto-save its own draft', async () => {
    const res = await autoSavePOST(req('POST', { work: 'in progress' }), ctx);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalled();
  });

  it('can read its own draft', async () => {
    const res = await draftGET(req('GET'), ctx);
    expect(res.status).toBe(200);
  });

  it('can reorder its own modules', async () => {
    const res = await reorderModulesPUT(req('PUT', { moduleIds: ['mod-1'] }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('SUPER_ADMIN stays unscoped', () => {
  beforeEach(() => actAs('SUPER_ADMIN', null, 'org-operator'));

  it('can auto-save any course', async () => {
    const res = await autoSavePOST(req('POST', { ok: true }), ctx);
    expect(res.status).toBe(200);
  });

  it('can read any draft', async () => {
    const res = await draftGET(req('GET'), ctx);
    expect(res.status).toBe(200);
  });

  it('can reorder any course', async () => {
    const res = await reorderModulesPUT(req('PUT', { moduleIds: ['mod-1'] }), ctx);
    expect(res.status).toBe(200);
  });
});

describe('a tenant the course is merely assigned to', () => {
  it('cannot read the draft — assignment is not authorship', async () => {
    // canTenantAdminEditCourse only treats selectedTenants as ownership when
    // submittedByTenantId is absent (the backward-compat clause).
    actAs('TENANT_ADMIN', null, 'org-assigned');
    h.findFirst.mockResolvedValue({ ...victimCourse, submittedByTenantId: 'org-victim' });
    h.selectedFindMany.mockResolvedValue([{ orgId: 'org-assigned' }]);

    const res = await draftGET(req('GET'), ctx);
    expect(res.status).toBe(400);
  });
});
