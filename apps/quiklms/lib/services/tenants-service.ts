/**
 * Tenants service — ported from TenantsService (Prisma).
 * Storage usage sums resource fileSizes embedded in master-course module JSON
 * for courses linked to the tenant (selectedTenants join or submittedByTenantId).
 */
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Conflict, NotFound } from '@/lib/http';
import { provisionOrgForTenant, provisionLmsUser } from './identity-service';

const SCHOOL_FEATURES = {
  enableCourses: false, enableScorm: false, enableCompliance: false, enableManagerReports: false, enableSelfEnrollment: false,
  enableBatches: true, enableAttendance: true, enableHomework: true, enableCredits: true, enablePayouts: true,
  enableVideoClasses: true, enableParentPortal: true, enableMessaging: true, enableCertificates: true, enableAnalytics: true,
};
const CORPORATE_FEATURES = {
  enableCourses: true, enableScorm: true, enableCompliance: true, enableManagerReports: true, enableSelfEnrollment: false,
  enableBatches: false, enableAttendance: false, enableHomework: false, enableCredits: false, enablePayouts: false,
  enableVideoClasses: false, enableParentPortal: false, enableMessaging: true, enableCertificates: true, enableAnalytics: true,
};

export interface OnboardInput {
  tenantType?: 'corporate' | 'school';
  orgName: string;
  fullAddress: string;
  country: string;
  officialPhone: string;
  website?: string;
  officialEmail: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  phone: string;
  email: string;
  roleInOrganization: string;
  billingFirstName: string;
  billingMiddleName?: string;
  billingLastName: string;
  billingAddress: string;
  storageLimit?: number;
  /**
   * Platform quikit `Org.id` to link this tenant to (Phase-3 fold). Optional
   * until the provisioning flow creates the paired platform Org — when present,
   * it makes `resolveOrgToTenantId` an exact lookup instead of a natural-key
   * guess. Leave unset and the backfill (subdomain↔slug) links it later.
   */
  orgId?: string;
}

async function uniqueSubdomain(orgName: string): Promise<string> {
  const base = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tenant';
  let candidate = base;
  let n = 1;
  while (await prisma.lmsTenant.findUnique({ where: { subdomain: candidate } })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

/**
 * Onboard a tenant: create the tenant record + its TENANT_ADMIN (who receives a
 * setup-password welcome email). NOTE: the legacy Auth0 organization/invite path
 * is intentionally dropped — this build uses local JWT auth (+ Google/MS OAuth),
 * matching the target stack.
 */
export async function onboardTenant(dto: OnboardInput) {
  const tenantType = dto.tenantType || 'corporate';
  const subdomain = await uniqueSubdomain(dto.orgName);
  const tenantKey = `tk_${randomUUID().replace(/-/g, '')}`;

  const existingAdmin = await prisma.lmsUser.findFirst({ where: { email: dto.email.toLowerCase().trim() } });
  if (existingAdmin) throw Conflict('A user with the admin email already exists');

  // 1) Provision the platform Org (+ enable QuikLMS). Its id IS the LMS Tenant id
  //    (orgId-native), and it's what lets the tenant admin SSO-log-in.
  const orgId = dto.orgId ?? (await provisionOrgForTenant({ name: dto.orgName, billingEmail: dto.officialEmail }));

  const tenant = await prisma.lmsTenant.create({
    data: {
      id: orgId,
      orgId,
      name: dto.orgName,
      subdomain,
      tenantType,
      tenantKey,
      orgName: dto.orgName,
      fullAddress: dto.fullAddress,
      country: dto.country,
      officialPhone: dto.officialPhone,
      website: dto.website,
      officialEmail: dto.officialEmail,
      contactFirstName: dto.firstName,
      contactMiddleName: dto.middleName,
      contactLastName: dto.lastName,
      contactPhone: dto.phone,
      contactEmail: dto.email,
      contactRoleInOrganization: dto.roleInOrganization,
      billingFirstName: dto.billingFirstName,
      billingMiddleName: dto.billingMiddleName,
      billingLastName: dto.billingLastName,
      billingAddress: dto.billingAddress,
      storageLimit: Math.round(dto.storageLimit || 2),
      featureConfig: tenantType === 'school' ? SCHOOL_FEATURES : CORPORATE_FEATURES,
      loginUrl: `${process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3020'}/login`,
    },
  });

  // 3) Tenant admin — CENTRALIZED (platform User + OrgMember + UserAppAccess +
  //    LMS row, all keyed on orgId). This is what makes the admin SSO-log-in
  //    capable. Returns a temp password for the super-admin to relay.
  const admin = await provisionLmsUser({
    email: dto.email,
    firstName: dto.firstName,
    lastName: dto.lastName,
    orgId,
    lmsRole: 'TENANT_ADMIN',
    phone: dto.phone,
  });

  return { ...tenant, adminTempPassword: admin.tempPassword };
}

/**
 * 1:1 port of `TenantsService.generateSubdomain` (`tenants.service.ts:109-116`).
 *
 * Deliberately NOT the same as `uniqueSubdomain` above, which serves `onboard`
 * and appends a -1/-2 suffix to dodge collisions. `create` does no such thing: it
 * derives the slug and 409s on collision. Keeping both mirrors the original,
 * which also had two different behaviors on these two paths.
 */
function generateSubdomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/** 1:1 port of `TenantsService.generateTenantKey` — `tk_` + uuid with dashes stripped. */
function generateTenantKey(): string {
  return `tk_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Input for `createTenant`.
 *
 * The first four fields are `CreateTenantDto` (`create-tenant.dto.ts`). The rest
 * are NOT in that DTO — they are the columns the tenant schema marks
 * non-nullable, and they are required here for a reason worth recording:
 *
 * **The legacy `POST /tenants` could never succeed.** `CreateTenantDto` carried
 * only {name, gstNumber, dbConnectionString?, tenantType?}, but the Mongoose
 * schema declared `orgName`, `fullAddress`, `country`, `officialPhone`,
 * `officialEmail`, all five contact fields and all three billing fields as
 * `required: true` (`tenant.schema.ts:197-247`). So `new tenantModel({...dto}).save()`
 * always threw a Mongoose ValidationError → 500 — while sending the missing
 * fields tripped `forbidNonWhitelisted` → 400. The endpoint was unreachable from
 * either direction; `POST /tenants/onboard` (which has a complete DTO) is what
 * actually worked.
 *
 * Prisma reproduced that required set exactly, so a create is impossible without
 * these. Rather than reproduce a permanently-500 endpoint, this keeps the working
 * superset. See the QUESTION in the migration summary.
 */
export interface CreateTenantInput {
  name: string;
  gstNumber: string;
  dbConnectionString?: string;
  tenantType?: 'corporate' | 'school';
  // Schema-required (tenant.schema.ts `required: true`) — not in CreateTenantDto.
  orgName: string;
  fullAddress: string;
  country: string;
  officialPhone: string;
  officialEmail: string;
  contactFirstName: string;
  contactLastName: string;
  contactPhone: string;
  contactEmail: string;
  contactRoleInOrganization: string;
  billingFirstName: string;
  billingLastName: string;
  billingAddress: string;
  // Schema-optional.
  website?: string;
  contactMiddleName?: string;
  billingMiddleName?: string;
}

/**
 * Create a tenant. Port of `TenantsService.create` (`tenants.service.ts`).
 *
 * `subdomain` and `tenantKey` are GENERATED here, never accepted from the
 * request — the legacy service generated both. This route previously took them
 * from the client, letting a caller choose another tenant's key namespace.
 *
 * Both conflict checks are explicit rather than left to Prisma's P2002, because
 * the legacy messages are distinct ('Subdomain already exists' vs 'GST Number
 * already registered') and P2002 collapses them into one generic 409.
 */
export async function createTenant(dto: CreateTenantInput) {
  const subdomain = generateSubdomain(dto.name);

  const existingTenant = await prisma.lmsTenant.findUnique({ where: { subdomain } });
  if (existingTenant) throw Conflict('Subdomain already exists');

  // Legacy guarded with `if (createTenantDto.gstNumber)` even though its own DTO
  // made the field required — reproduced.
  if (dto.gstNumber) {
    const existingGst = await prisma.lmsTenant.findUnique({ where: { gstNumber: dto.gstNumber } });
    if (existingGst) throw Conflict('GST Number already registered');
  }

  const { tenantType, ...rest } = dto;
  return prisma.lmsTenant.create({
    data: {
      ...rest,
      ...(tenantType ? { tenantType } : {}),
      subdomain,
      tenantKey: generateTenantKey(),
    },
  });
}

export interface CreateAdminCredentialsResult {
  tenant: string;
  success: boolean;
  email?: string;
  password?: string;
  loginUrl?: string | null;
  message?: string;
  error?: string;
}

/**
 * Provision the TENANT_ADMIN for one tenant. Port of
 * `SeedService.createTenantAdminForTenant` (`seed.service.ts`).
 *
 * DELIBERATE DEVIATION — the password. The legacy seeder hashed a hardcoded
 * `'TenantAdmin@123'` itself and returned that literal. Password creation is auth
 * internals, which this migration pass must not reimplement, so this consumes the
 * existing `provisionLmsUser` helper (exactly as `onboardTenant` above does) and
 * returns the temp password it mints. The response SHAPE is unchanged; the
 * password is now per-admin and random instead of one shared constant across
 * every tenant. Flagged in the migration summary.
 */
export async function createTenantAdminForTenant(
  tenantId: string,
): Promise<CreateAdminCredentialsResult> {
  const tenant = await findTenant(tenantId);
  const contactEmail = tenant.contactEmail || tenant.officialEmail;

  if (!contactEmail) {
    // Legacy threw a bare Error here, which Nest surfaced as a 500. Reproduced as
    // a thrown error rather than a 4xx to keep the status identical.
    throw new Error('No contact email found for tenant');
  }

  // Idempotency check, matching the legacy seeder: an existing TENANT_ADMIN on
  // this tenant with this email short-circuits with password 'Already exists'.
  const existingAdmin = await prisma.lmsUser.findFirst({
    where: { email: contactEmail.toLowerCase().trim(), orgId: tenant.orgId, role: 'TENANT_ADMIN' },
    select: { id: true },
  });
  if (existingAdmin) {
    return {
      tenant: tenant.orgName ?? tenant.name,
      success: true,
      email: contactEmail,
      password: 'Already exists',
      loginUrl: tenant.loginUrl,
      message: 'User already exists',
    };
  }

  const admin = await provisionLmsUser({
    email: contactEmail,
    // `Tenant.id === orgId` is the orgId-native invariant recorded on the schema
    // column itself, so `id` is the correct fallback for a tenant whose orgId
    // link has not been back-filled yet.
    orgId: tenant.orgId ?? tenant.id,
    firstName: tenant.contactFirstName || 'Tenant',
    lastName: tenant.contactLastName || 'Admin',
    lmsRole: 'TENANT_ADMIN',
  });

  return {
    tenant: tenant.orgName ?? tenant.name,
    success: true,
    email: contactEmail,
    // `tempPassword` is null when the platform user already had one — the same
    // situation the legacy seeder reported as 'Already exists'.
    password: admin.tempPassword ?? 'Already exists',
    loginUrl: tenant.loginUrl,
  };
}

/**
 * Provision admins for every tenant. Port of
 * `SeedService.createTenantAdminsForAllTenants`.
 *
 * Per-tenant failures are collected into the results array rather than aborting
 * the run — the legacy seeder wrapped each tenant in its own try/catch and pushed
 * `{tenant, success:false, error}`. Reproduced, including the partial-success
 * response.
 */
export async function createTenantAdminsForAllTenants(): Promise<{
  success: boolean;
  results: CreateAdminCredentialsResult[];
}> {
  const tenants = await prisma.lmsTenant.findMany({ select: { id: true, orgName: true, name: true } });
  const results: CreateAdminCredentialsResult[] = [];

  for (const t of tenants) {
    try {
      results.push(await createTenantAdminForTenant(t.id));
    } catch (error: unknown) {
      results.push({
        tenant: t.orgName ?? t.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { success: true, results };
}

export async function findAllTenants() {
  return prisma.lmsTenant.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function findTenant(id: string) {
  const tenant = await prisma.lmsTenant.findUnique({ where: { id } });
  if (!tenant) throw NotFound('Tenant not found');
  return tenant;
}

/**
 * Update a tenant. Port of `TenantsService.update` (`tenants.service.ts`).
 *
 * `featureConfig` MERGES, it does not replace. The original built a flat `$set`
 * with dot-notation keys (`featureConfig.enableScorm`), which Mongo applies
 * per-key, preserving every flag the request omitted. Prisma writes the whole
 * JSON column, so passing `featureConfig` straight through DESTROYS the omitted
 * flags — a tenant PATCHing one flag would silently lose the rest.
 *
 * The merge is shallow / one level deep, exactly matching the legacy
 * dot-notation, which only ever went one level.
 *
 * Undefined-stripping is also the legacy behavior: `$set` was built by skipping
 * `val === undefined`, so an omitted field is untouched.
 */
export async function updateTenant(
  id: string,
  data: Record<string, unknown> & { featureConfig?: Record<string, unknown> },
) {
  const existing = await findTenant(id);
  const { featureConfig, ...rest } = data;

  const setFields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rest)) {
    if (val !== undefined) setFields[key] = val;
  }

  if (featureConfig && typeof featureConfig === 'object') {
    const current = (existing.featureConfig ?? {}) as Record<string, unknown>;
    setFields.featureConfig = { ...current, ...featureConfig };
  }

  return prisma.lmsTenant.update({
    where: { id },
    data: setFields as Prisma.LmsTenantUpdateInput,
  });
}

export async function removeTenant(id: string) {
  await findTenant(id);
  await prisma.lmsTenant.delete({ where: { id } });
}

export async function getStorageUsage(orgId: string): Promise<{ currentUsage: number; storageLimit: number }> {
  const tenant = await findTenant(orgId);
  const storageLimit = (tenant.storageLimit || 2) * 1024 * 1024 * 1024; // GB → bytes

  // Master courses linked to this tenant
  const links = await prisma.lmsMasterCourseSelectedTenant.findMany({ where: { orgId }, select: { masterCourseId: true } });
  const ids = links.map((l) => l.masterCourseId);
  const courses = await prisma.lmsMasterCourse.findMany({
    where: { OR: [{ id: { in: ids } }, { submittedByTenantId: orgId }] },
    select: { modules: true },
  });

  let currentUsage = 0;
  for (const c of courses) {
    const modules = (c.modules as unknown as Array<{ subModules?: Array<{ resources?: Array<{ fileSize?: number }> }> }>) || [];
    for (const m of modules) {
      for (const sm of m.subModules || []) {
        for (const r of sm.resources || []) {
          currentUsage += r.fileSize || 0;
        }
      }
    }
  }

  return { currentUsage, storageLimit };
}
