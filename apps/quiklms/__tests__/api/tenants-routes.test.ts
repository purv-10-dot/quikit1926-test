import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireRoles: vi.fn(),
  assertTenantMatch: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
  orgFindUnique: vi.fn(),
  orgFindMany: vi.fn(),
  orgUpdate: vi.fn(),
}));

vi.mock('@/lib/auth/context', () => ({
  requireAuth: h.requireAuth,
  requireRoles: h.requireRoles,
  assertTenantMatch: h.assertTenantMatch,
  // REAL implementation, not a stub. `/api/tenants/:id` takes the org id from the
  // PATH, and `requireRoles(['ADMIN'])` was its only gate — so any holder of
  // that role could read, PATCH or DELETE another org's tenant by naming it in the
  // URL. Stubbing this guard would hide exactly that.
  assertOrgAccess: (u: { isSuperAdmin?: boolean; orgId?: string | null }, target?: string | null) => {
    if (u?.isSuperAdmin === true) return;
    if (!target) return;
    if (target !== u?.orgId) throw new Error('Access denied: cross-tenant access not allowed');
  },
}));
// `org` is mocked because tenant STATUS now lives on the platform Org, not on a
// column of `tenants` — the service reads it back on every tenant read and
// writes it on a status PATCH. See lib/tenant-status.ts.
vi.mock('@/lib/db', () => ({
  db: {
    lmsTenant: { findUnique: h.findUnique, findFirst: h.findFirst, update: h.update, create: h.create },
    org: { findUnique: h.orgFindUnique, findMany: h.orgFindMany, update: h.orgUpdate },
  },
}));
vi.mock('@/lib/env', () => ({ optionalEnv: () => 'ap-south-1', env: { ENCRYPTION_KEY: 'k'.repeat(32) } }));
// The branding route presigns a logo only when it is one of our bucket URLs;
// mirror that gate so the "non-S3 logo passes through" case still holds.
vi.mock('@/lib/s3', () => ({
  presignFromUrlOrKey: h.presignFromUrlOrKey,
  isManagedStorageUrl: (v: unknown) =>
    typeof v === 'string' && (/\.amazonaws\.com/.test(v) || v.includes('storage.googleapis.com')),
}));
// identity-service pulls in bcrypt/prisma; tenants-service only needs it for
// provisioning, which these tests do not exercise.
vi.mock('@/lib/services/identity-service', () => ({
  provisionOrgForTenant: vi.fn(),
  provisionLmsUser: vi.fn(),
}));

import { PATCH as videoConfigPATCH } from '@/app/api/tenants/[id]/video-config/route';
import { PATCH as tenantPATCH } from '@/app/api/tenants/[id]/route';
import { PATCH as languagePATCH } from '@/app/api/tenants/[id]/language-config/route';
import { POST as tenantsPOST } from '@/app/api/tenants/route';
import { GET as brandingGET } from '@/app/api/tenants/branding/public/route';

function req(url: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: body === undefined ? 'GET' : 'PATCH',
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }
      : { headers }),
  }) as never;
}
function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }) as never;
}

const ctx = { params: { id: 'org-1' } };
const actor = { id: 'u1', role: 'ADMIN', orgId: 'org-1', isActive: true };

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.requireAuth.mockResolvedValue(actor);
  h.requireRoles.mockReturnValue(undefined);
  h.assertTenantMatch.mockReturnValue(undefined);
  // Tenant status is derived from the platform Org on every read.
  h.orgFindUnique.mockResolvedValue({ status: 'active' });
  h.orgFindMany.mockResolvedValue([]);
  h.orgUpdate.mockResolvedValue({});
});

describe('PATCH /api/tenants/:id/video-config — merge, not replace', () => {
  it('preserves keys the request omits', async () => {
    // The regression: PATCH {provider:'zoom'} used to wipe stored credentials,
    // because Prisma writes the whole JSON column while the legacy Mongo code
    // spread `{...existing, ...body}`.
    h.findUnique.mockResolvedValue({
      id: 'org-1',
      videoConfig: { provider: 'jitsi', credentials: { apiKey: 'SECRET', apiSecret: 'SHH' } },
    });
    h.update.mockImplementation(({ data }: any) => ({ videoConfig: data.videoConfig }));

    const res = await videoConfigPATCH(req('http://x/api/tenants/org-1/video-config', { provider: 'zoom' }), ctx);

    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data.videoConfig).toEqual({
      provider: 'zoom',
      credentials: { apiKey: 'SECRET', apiSecret: 'SHH' },
    });
  });

  it('overwrites keys the request does supply', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', videoConfig: { provider: 'jitsi', region: 'eu' } });
    h.update.mockImplementation(({ data }: any) => ({ videoConfig: data.videoConfig }));

    await videoConfigPATCH(req('http://x/api/tenants/org-1/video-config', { region: 'us' }), ctx);
    expect(h.update.mock.calls[0][0].data.videoConfig).toEqual({ provider: 'jitsi', region: 'us' });
  });

  it('handles a tenant with no existing config', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', videoConfig: null });
    h.update.mockImplementation(({ data }: any) => ({ videoConfig: data.videoConfig }));

    await videoConfigPATCH(req('http://x/api/tenants/org-1/video-config', { provider: 'zoom' }), ctx);
    expect(h.update.mock.calls[0][0].data.videoConfig).toEqual({ provider: 'zoom' });
  });

  it('uses the legacy message string', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', videoConfig: {} });
    h.update.mockResolvedValue({ videoConfig: {} });
    const res = await videoConfigPATCH(req('http://x/api/tenants/org-1/video-config', { a: 1 }), ctx);
    expect((await res.json()).message).toBe('Video config updated');
  });
});

describe('PATCH /api/tenants/:id — featureConfig merge + mass assignment', () => {
  it('merges featureConfig instead of replacing it', async () => {
    h.findUnique.mockResolvedValue({
      id: 'org-1',
      featureConfig: { enableScorm: true, enableBatches: false, enableCredits: true },
    });
    h.update.mockImplementation(({ data }: any) => ({ id: 'org-1', ...data }));

    const res = await tenantPATCH(
      req('http://x/api/tenants/org-1', { featureConfig: { enableBatches: true } }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data.featureConfig).toEqual({
      enableScorm: true,
      enableBatches: true,
      enableCredits: true,
    });
  });

  it('rejects unknown keys (forbidNonWhitelisted parity — UpdateTenantDto is a real DTO)', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', featureConfig: {} });
    const res = await tenantPATCH(req('http://x/api/tenants/org-1', { nope: 'x' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('nope');
  });

  it('blocks mass assignment of identity columns', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', featureConfig: {} });
    for (const evil of [{ id: 'other' }, { orgId: 'other' }, { tenantKey: 'tk_evil' }, { subdomain: 'evil' }]) {
      const res = await tenantPATCH(req('http://x/api/tenants/org-1', evil), ctx);
      expect(res.status, `${JSON.stringify(evil)} must be rejected`).toBe(400);
    }
    expect(h.update).not.toHaveBeenCalled();
  });

  it('enforces the DTO storageLimit bounds (@Min(1) @Max(1000))', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', featureConfig: {} });
    for (const bad of [0, 1001]) {
      const res = await tenantPATCH(req('http://x/api/tenants/org-1', { storageLimit: bad }), ctx);
      expect(res.status).toBe(400);
    }
  });

  it('drops undefined fields rather than writing them', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1', featureConfig: {} });
    h.update.mockImplementation(({ data }: any) => ({ id: 'org-1', ...data }));
    await tenantPATCH(req('http://x/api/tenants/org-1', { name: 'New', website: undefined }), ctx);
    expect(h.update.mock.calls[0][0].data).toEqual({ name: 'New' });
  });
});

describe('PATCH /api/tenants/:id/language-config', () => {
  it('writes both fields', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1' });
    h.update.mockResolvedValue({ defaultLanguage: 'fr', enabledLanguages: ['en', 'fr'] });

    const res = await languagePATCH(
      req('http://x/api/tenants/org-1/language-config', { defaultLanguage: 'fr', enabledLanguages: ['en', 'fr'] }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { defaultLanguage: 'fr', enabledLanguages: ['en', 'fr'] },
      message: 'Language config updated',
    });
  });

  it('reproduces the legacy falsy-guard: empty string is ignored, empty array is NOT', async () => {
    // Legacy used `if (body.defaultLanguage)` / `if (body.enabledLanguages)`,
    // not `!== undefined`. So `''` is falsy and silently dropped — you cannot
    // clear defaultLanguage — while `[]` is TRUTHY and does clear the list.
    // Asymmetric, and faithful to the original.
    h.findUnique.mockResolvedValue({ id: 'org-1' });
    h.update.mockResolvedValue({ defaultLanguage: 'en', enabledLanguages: [] });

    await languagePATCH(
      req('http://x/api/tenants/org-1/language-config', { defaultLanguage: '', enabledLanguages: [] }),
      ctx,
    );
    expect(h.update.mock.calls[0][0].data).toEqual({ enabledLanguages: [] });
  });

  it('ignores omitted fields entirely', async () => {
    h.findUnique.mockResolvedValue({ id: 'org-1' });
    h.update.mockResolvedValue({ defaultLanguage: 'en', enabledLanguages: ['en'] });
    await languagePATCH(req('http://x/api/tenants/org-1/language-config', {}), ctx);
    expect(h.update.mock.calls[0][0].data).toEqual({});
  });
});

describe('POST /api/tenants', () => {
  const valid = {
    name: 'Acme Corp',
    gstNumber: '27AAPFU0939F1ZV',
    orgName: 'Acme Corp',
    fullAddress: '1 Road',
    country: 'IN',
    officialPhone: '123',
    officialEmail: 'ops@acme.test',
    contactFirstName: 'A',
    contactLastName: 'B',
    contactPhone: '456',
    contactEmail: 'a@acme.test',
    contactRoleInOrganization: 'CTO',
    billingFirstName: 'A',
    billingLastName: 'B',
    billingAddress: '1 Road',
  };

  it('generates subdomain + tenantKey rather than trusting the client', async () => {
    h.findUnique.mockResolvedValue(null);
    h.create.mockImplementation(({ data }: any) => ({ ...data }));

    const res = await tenantsPOST(post('http://x/api/tenants', valid), {});
    expect(res.status).toBe(201);

    const data = h.create.mock.calls[0][0].data;
    expect(data.subdomain).toBe('acme-corp');
    expect(data.tenantKey).toMatch(/^tk_[0-9a-f]{32}$/);
  });

  it('rejects a client-supplied subdomain/tenantKey', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await tenantsPOST(post('http://x/api/tenants', { ...valid, subdomain: 'evil', tenantKey: 'tk_evil' }), {});
    expect(res.status).toBe(400);
  });

  it('enforces the GST format regex', async () => {
    h.findUnique.mockResolvedValue(null);
    const res = await tenantsPOST(post('http://x/api/tenants', { ...valid, gstNumber: 'NOT-A-GST' }), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid GST Number format');
  });

  it('requires gstNumber', async () => {
    h.findUnique.mockResolvedValue(null);
    const { gstNumber, ...without } = valid;
    const res = await tenantsPOST(post('http://x/api/tenants', without), {});
    expect(res.status).toBe(400);
  });

  it('409s on a duplicate subdomain with the legacy message', async () => {
    h.findUnique.mockResolvedValueOnce({ id: 'other' });
    const res = await tenantsPOST(post('http://x/api/tenants', valid), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Subdomain already exists');
  });

  it('409s on a duplicate GST with the legacy message', async () => {
    h.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' });
    const res = await tenantsPOST(post('http://x/api/tenants', valid), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('GST Number already registered');
  });

  it('derives clientUrl from NEXTAUTH_URL (never a bare localhost in prod)', async () => {
    // NEXTAUTH_URL is the platform-standard self-origin var and is ALWAYS set in
    // prod (NextAuth cannot boot without it), so clientUrl tracks the real domain
    // — the localhost fallback only applies in local dev.
    process.env.NEXTAUTH_URL = 'https://quikskills.quikit.ai';
    h.findUnique.mockResolvedValue(null);
    h.create.mockImplementation(({ data }: any) => ({ ...data }));

    const res = await tenantsPOST(post('http://x/api/tenants', valid), {});
    const body = await res.json();
    expect(body.clientUrl).toBe('https://quikskills.quikit.ai/acme-corp');
  });
});

describe('GET /api/tenants/branding/public', () => {
  it('resolves the tenant from the middleware subdomain header', async () => {
    h.findUnique.mockResolvedValue({ logoUrl: null, primaryColor: '#111', secondaryColor: '#222' });
    const res = await brandingGET(req('http://x/api/tenants/branding/public', undefined, { 'x-tenant-subdomain': 'acme' }), {});
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ logo: null, primaryColor: '#111', secondaryColor: '#222' });
    expect(h.findUnique).toHaveBeenCalledWith({ where: { subdomain: 'acme' } });
  });

  it('ignores a ?subdomain= query override — no unauthenticated enumeration', async () => {
    // The override had no counterpart in the original and let any caller read any
    // tenant's branding by guessing subdomains.
    h.findUnique.mockResolvedValue(null);
    const res = await brandingGET(req('http://x/api/tenants/branding/public?subdomain=victim'), {});
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBeNull();
    expect(h.findUnique).not.toHaveBeenCalled();
  });

  it('presigns an S3 logo', async () => {
    h.findUnique.mockResolvedValue({
      logoUrl: 'https://b.s3.ap-south-1.amazonaws.com/logo.png',
      primaryColor: '#1',
      secondaryColor: '#2',
    });
    h.presignFromUrlOrKey.mockResolvedValue('https://signed/logo.png?sig=1');

    const res = await brandingGET(req('http://x/api/tenants/branding/public', undefined, { 'x-tenant-subdomain': 'acme' }), {});
    expect((await res.json()).data.logo).toBe('https://signed/logo.png?sig=1');
  });

  it('passes a non-S3 logo through without presigning', async () => {
    h.findUnique.mockResolvedValue({ logoUrl: 'https://cdn.example/logo.png', primaryColor: '#1', secondaryColor: '#2' });
    const res = await brandingGET(req('http://x/api/tenants/branding/public', undefined, { 'x-tenant-subdomain': 'acme' }), {});
    expect((await res.json()).data.logo).toBe('https://cdn.example/logo.png');
    expect(h.presignFromUrlOrKey).not.toHaveBeenCalled();
  });

  it('swallows errors into {success:true, data:null}', async () => {
    h.findUnique.mockRejectedValue(new Error('db down'));
    const res = await brandingGET(req('http://x/api/tenants/branding/public', undefined, { 'x-tenant-subdomain': 'acme' }), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: null });
  });
});
