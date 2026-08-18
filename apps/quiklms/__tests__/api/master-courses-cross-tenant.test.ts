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
  // Real predicates — stubbing them would disable the guards under test.
  userHasRole: (u: { role?: string }, role: string) => u?.role === role,
  // Cross-tenant access is keyed on the PLATFORM CLAIM, not the role: an org's
  // founding admin holds the ADMIN role but must stay scoped.
  isPlatformOperator: (u: { isSuperAdmin?: boolean }) => u?.isSuperAdmin === true,
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
function actAs(role: string, orgId = 'org-attacker', isSuperAdmin = false) {
  h.requireAuth.mockResolvedValue({ id: 'u-att', role, orgId, isActive: true, isSuperAdmin });
}

const attackers: Array<[string, string]> = [
  ['TENANT_ADMIN of another tenant', 'TENANT_ADMIN'],
  ['SUB_ADMIN of another tenant', 'SUB_ADMIN'],
];

describe.each(attackers)('cross-tenant %s is blocked', (_label, role) => {
  beforeEach(() => actAs(role));

  it('cannot auto-save over another tenant’s draft', async () => {
    const res = await autoSavePOST(req('POST', { hijacked: true }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('You can only edit your own courses');
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
  beforeEach(() => actAs('TENANT_ADMIN', 'org-victim'));

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

describe('the platform OPERATOR stays unscoped', () => {
  // `isSuperAdmin: true` — the platform claim, written only by apps/quikit's audited
  // super-admin console. The ROLE alone is no longer enough and must not be: an org's
  // founding admin resolves to ADMIN (lib/auth/founding-admin.ts) and is covered
  // by the scoped case below.
  beforeEach(() => actAs('ADMIN', 'org-operator', true));

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

/**
 * An org's FOUNDING admin holds the ADMIN role with `isSuperAdmin: false`
 * (lib/auth/founding-admin.ts). Before the role/claim split, `assertCanEditMasterCourse`
 * returned early — completely unscoped — for anyone whose ROLE was ADMIN, so a
 * founding admin could read, overwrite and restructure any other tenant's master-course
 * drafts. They must be treated exactly like the tenant admin they are.
 */
describe('a founding admin (ADMIN role, not the operator) is scoped', () => {
  beforeEach(() => actAs('ADMIN', 'org-attacker', false));

  it('cannot auto-save another tenant’s course', async () => {
    const res = await autoSavePOST(req('POST', { ok: true }), ctx);
    expect(res.status).not.toBe(200);
  });

  it('cannot read another tenant’s draft', async () => {
    const res = await draftGET(req('GET'), ctx);
    expect(res.status).not.toBe(200);
  });

  it('cannot reorder another tenant’s course', async () => {
    const res = await reorderModulesPUT(req('PUT', { moduleIds: ['mod-1'] }), ctx);
    expect(res.status).not.toBe(200);
  });
});

describe('a tenant the course is merely assigned to', () => {
  it('cannot read the draft — assignment is not authorship', async () => {
    // canTenantAdminEditCourse only treats selectedTenants as ownership when
    // submittedByTenantId is absent (the backward-compat clause).
    actAs('TENANT_ADMIN', 'org-assigned');
    h.findFirst.mockResolvedValue({ ...victimCourse, submittedByTenantId: 'org-victim' });
    h.selectedFindMany.mockResolvedValue([{ orgId: 'org-assigned' }]);

    const res = await draftGET(req('GET'), ctx);
    expect(res.status).toBe(400);
  });
});
