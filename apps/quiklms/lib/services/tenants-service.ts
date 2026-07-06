/**
 * Tenants service — ported from TenantsService (Prisma).
 * Storage usage sums resource fileSizes embedded in master-course module JSON
 * for courses linked to the tenant (selectedTenants join or submittedByTenantId).
 */
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { Conflict, NotFound } from '@/lib/http';
import { registerUser } from './auth-service';

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
}

async function uniqueSubdomain(orgName: string): Promise<string> {
  const base = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'tenant';
  let candidate = base;
  let n = 1;
  while (await prisma.tenant.findUnique({ where: { subdomain: candidate } })) {
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

  const existingAdmin = await prisma.user.findFirst({ where: { email: dto.email.toLowerCase().trim() } });
  if (existingAdmin) throw Conflict('A user with the admin email already exists');

  const tenant = await prisma.tenant.create({
    data: {
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

  // Tenant admin (random temp password; user sets their own via the welcome link)
  await registerUser({
    email: dto.email,
    password: randomUUID(),
    firstName: dto.firstName,
    lastName: dto.lastName,
    role: 'TENANT_ADMIN',
    tenantId: tenant.id,
    phone: dto.phone,
  });

  return tenant;
}

export async function createTenant(data: Prisma.TenantCreateInput) {
  return prisma.tenant.create({ data });
}

export async function findAllTenants() {
  return prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function findTenant(id: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) throw NotFound('Tenant not found');
  return tenant;
}

export async function updateTenant(id: string, data: Prisma.TenantUpdateInput) {
  await findTenant(id);
  return prisma.tenant.update({ where: { id }, data });
}

export async function removeTenant(id: string) {
  await findTenant(id);
  await prisma.tenant.delete({ where: { id } });
}

export async function getStorageUsage(tenantId: string): Promise<{ currentUsage: number; storageLimit: number }> {
  const tenant = await findTenant(tenantId);
  const storageLimit = (tenant.storageLimit || 2) * 1024 * 1024 * 1024; // GB → bytes

  // Master courses linked to this tenant
  const links = await prisma.masterCourseSelectedTenant.findMany({ where: { tenantId }, select: { masterCourseId: true } });
  const ids = links.map((l) => l.masterCourseId);
  const courses = await prisma.masterCourse.findMany({
    where: { OR: [{ id: { in: ids } }, { submittedByTenantId: tenantId }] },
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
