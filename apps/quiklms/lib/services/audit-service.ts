/**
 * Audit service — ported from AuditService (Prisma). ADMIN / global scope.
 *
 * Storage usage is summed from MasterCourse.modules JSON (3-tier nested:
 * modules[].subModules[].resources[].fileSize) — computed in JS after fetching the
 * blobs, since the legacy Mongo $unwind aggregation has no direct Prisma equivalent.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';

const STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

interface NestedResource { fileSize?: number }
interface NestedSubModule { resources?: NestedResource[] }
interface NestedModule { subModules?: NestedSubModule[] }

function sumModuleFileSizes(modules: unknown): number {
  if (!Array.isArray(modules)) return 0;
  let total = 0;
  for (const mod of modules as NestedModule[]) {
    for (const sub of mod?.subModules ?? []) {
      for (const res of sub?.resources ?? []) {
        total += typeof res?.fileSize === 'number' ? res.fileSize : 0;
      }
    }
  }
  return total;
}

/**
 * @param orgIds The orgs this caller may see — pass `await visibleOrgIds(actor)`.
 *   `undefined` is platform-wide and for the operator alone. Unscoped, this told any
 *   holder of the ADMIN role the platform's total storage and tenant count.
 */
export async function getGlobalStorageUsage(orgIds?: string[]) {
  const courses = await db.lmsMasterCourse.findMany({
    where: orgIds
      ? {
          OR: [
            { submittedByTenantId: { in: orgIds } },
            { selectedTenants: { some: { orgId: { in: orgIds } } } },
          ],
        }
      : undefined,
    select: { modules: true },
  });
  const totalUsed = courses.reduce((sum, c) => sum + sumModuleFileSizes(c.modules), 0);
  const totalTenants = await db.lmsTenant.count({
    where: orgIds ? { id: { in: orgIds } } : undefined,
  });
  return {
    totalUsed,
    totalUsedMB: totalUsed / (1024 * 1024),
    totalUsedGB: totalUsed / (1024 * 1024 * 1024),
    totalTenants,
  };
}

export interface TenantStorageRow {
  orgId: string;
  orgName: string;
  storageUsed: number;
  storageUsedMB: number;
  percentage: number;
  lastActivity?: Date;
}

/**
 * @param orgIds The orgs this caller may see — pass `await visibleOrgIds(actor)`.
 *   Unscoped, this returned a row per tenant (org name + storage + last activity) to any
 *   holder of the ADMIN role, which is a directory of every customer on the platform.
 */
export async function getTenantStorageBreakdown(orgIds?: string[]): Promise<TenantStorageRow[]> {
  // Per-tenant storage from mastercourses: combine selectedTenants[] and submittedByTenantId.
  const courses = await db.lmsMasterCourse.findMany({
    where: orgIds
      ? {
          OR: [
            { submittedByTenantId: { in: orgIds } },
            { selectedTenants: { some: { orgId: { in: orgIds } } } },
          ],
        }
      : undefined,
    select: {
      modules: true,
      updatedAt: true,
      submittedByTenantId: true,
      selectedTenants: { select: { orgId: true } },
    },
  });

  const usageByTenant = new Map<string, { totalSize: number; lastUpdated: Date }>();
  for (const course of courses) {
    const size = sumModuleFileSizes(course.modules);
    if (size === 0) continue;
    const tenantIds = new Set<string>(course.selectedTenants.map((s) => s.orgId));
    if (course.submittedByTenantId) tenantIds.add(course.submittedByTenantId);
    for (const tid of tenantIds) {
      const cur = usageByTenant.get(tid) || { totalSize: 0, lastUpdated: course.updatedAt };
      cur.totalSize += size;
      if (course.updatedAt > cur.lastUpdated) cur.lastUpdated = course.updatedAt;
      usageByTenant.set(tid, cur);
    }
  }

  // Scoped too — the loop below only emits rows for `usageByTenant`, but reading every
  // tenant's orgName into memory for a scoped caller is a leak waiting for the next
  // person to widen the return shape.
  const tenants = await db.lmsTenant.findMany({
    where: orgIds ? { id: { in: orgIds } } : undefined,
    select: { id: true, orgName: true },
  });
  const tenantMap = new Map(tenants.map((t) => [t.id, t.orgName]));

  // Last activity per tenant (activity logs)
  const activityLogs = await db.lmsActivityLog.groupBy({
    by: ['orgId'],
    where: orgIds ? { orgId: { in: orgIds } } : { orgId: { not: null } },
    _max: { timestamp: true },
  });
  const activityMap = new Map<string, Date | null>();
  for (const a of activityLogs) if (a.orgId) activityMap.set(a.orgId, a._max.timestamp);

  const breakdown: TenantStorageRow[] = [];
  for (const [orgId, usage] of usageByTenant) {
    const storageUsed = usage.totalSize;
    const percentage = (storageUsed / STORAGE_LIMIT_BYTES) * 100;
    breakdown.push({
      orgId,
      orgName: tenantMap.get(orgId) || 'Unknown',
      storageUsed,
      storageUsedMB: storageUsed / (1024 * 1024),
      percentage: Math.min(100, percentage),
      lastActivity: activityMap.get(orgId) || usage.lastUpdated,
    });
  }

  // Add tenants with no storage
  for (const [orgId, orgName] of tenantMap) {
    if (!breakdown.find((b) => b.orgId === orgId)) {
      breakdown.push({
        orgId,
        orgName,
        storageUsed: 0,
        storageUsedMB: 0,
        percentage: 0,
        lastActivity: activityMap.get(orgId) || undefined,
      });
    }
  }

  return breakdown.sort((a, b) => b.storageUsedMB - a.storageUsedMB);
}

/**
 * @param orgIds Restrict to these orgs. A single-element array targets one org (the
 *   `?orgId=` case, already authorised by `assertOrgAccess`); the caller's full visible
 *   set is the default. `undefined` is platform-wide — the operator alone.
 */
export async function getActivityLogs(limit = 50, skip = 0, orgIds?: string[]) {
  const where = orgIds ? { orgId: { in: orgIds } } : {};
  const [rows, total] = await Promise.all([
    db.lmsActivityLog.findMany({ where, orderBy: { timestamp: 'desc' }, take: limit, skip }),
    db.lmsActivityLog.count({ where }),
  ]);

  // Mirror legacy populate('orgId','orgName') + populate('userId','firstName lastName email')
  const tenantIds = [...new Set(rows.map((r) => r.orgId).filter((x): x is string => !!x))];
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.lmsTenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, orgName: true } })
      : Promise.resolve([]),
    userIds.length
      ? db.lmsUser.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : Promise.resolve([]),
  ]);
  const tMap = new Map(tenants.map((t) => [t.id, { _id: t.id, orgName: t.orgName }]));
  const uMap = new Map(users.map((u) => [u.id, { _id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }]));

  const logs = rows.map((r) => ({
    ...r,
    _id: r.id,
    orgId: r.orgId ? tMap.get(r.orgId) ?? r.orgId : r.orgId,
    userId: r.userId ? uMap.get(r.userId) ?? r.userId : r.userId,
  }));
  return { logs, total };
}

async function upgradeInvoiceSubject(orgName: string): Promise<string> {
  let subject = `Storage Upgrade Required - ${orgName}`;
  try {
    const template = await db.lmsEmailTemplate.findUnique({ where: { type: 'upgrade_invoice' } });
    if (template?.subject) subject = template.subject.replace(/\{\{tenantName\}\}/g, orgName);
  } catch {
    /* use default subject */
  }
  return subject;
}

function generateUpgradeInvoiceHtml(
  tenant: { billingFirstName: string; contactFirstName: string; orgName: string; loginUrl: string | null },
  storage: { storageUsedMB: number; percentage: number },
): string {
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937;">Storage Upgrade Required</h2>
        <p>Dear ${tenant.billingFirstName || tenant.contactFirstName || 'Valued Customer'},</p>

        <p>Your organization <strong>${tenant.orgName}</strong> has reached <strong>${storage.percentage.toFixed(1)}%</strong> of your allocated storage limit (2GB).</p>

        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Current Usage:</h3>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Storage Used:</strong> ${storage.storageUsedMB.toFixed(2)} MB</li>
            <li><strong>Storage Limit:</strong> 2048 MB (2 GB)</li>
            <li><strong>Percentage Used:</strong> ${storage.percentage.toFixed(1)}%</li>
          </ul>
        </div>

        <p>To continue uploading content without interruption, please consider upgrading your storage plan.</p>

        <div style="margin: 30px 0;">
          <a href="${tenant.loginUrl || '#'}"
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Upgrade Options
          </a>
        </div>

        <p>If you have any questions, please contact our support team.</p>

        <p>Best regards,<br>QuikSkill LMS Team</p>
      </div>
    `;
}

export async function previewUpgradeInvoice(orgId: string) {
  const tenant = await db.lmsTenant.findUnique({ where: { id: orgId } });
  if (!tenant) throw new Error(`Tenant with ID ${orgId} not found`);

  const breakdown = await getTenantStorageBreakdown();
  const tenantStorage = breakdown.find((t) => t.orgId === orgId);
  if (!tenantStorage) throw new Error(`Storage data not found for tenant ${orgId}`);

  const billingEmail = tenant.officialEmail || tenant.contactEmail;
  if (!billingEmail) throw new Error(`No billing email found for tenant ${tenant.orgName}`);

  const subject = await upgradeInvoiceSubject(tenant.orgName);
  const html = generateUpgradeInvoiceHtml(tenant, tenantStorage);

  return {
    to: billingEmail,
    subject,
    html,
    tenantName: tenant.orgName,
    storagePercentage: tenantStorage.percentage,
    storageUsedMB: tenantStorage.storageUsedMB,
  };
}

export async function sendUpgradeInvoice(orgId: string) {
  const tenant = await db.lmsTenant.findUnique({ where: { id: orgId } });
  if (!tenant) throw new Error(`Tenant with ID ${orgId} not found`);

  const breakdown = await getTenantStorageBreakdown();
  const tenantStorage = breakdown.find((t) => t.orgId === orgId);
  if (!tenantStorage) throw new Error(`Storage data not found for tenant ${orgId}`);

  const billingEmail = tenant.officialEmail || tenant.contactEmail;
  if (!billingEmail) throw new Error(`No billing email found for tenant ${tenant.orgName}`);

  const subject = await upgradeInvoiceSubject(tenant.orgName);
  const html = generateUpgradeInvoiceHtml(tenant, tenantStorage);

  try {
    const result = await sendEmail({ to: billingEmail, subject, html });

    // `null` = no mail transport configured, so nothing was sent. The legacy
    // branched on exactly this (`audit.service.ts:396-422`) and recorded a
    // FAILURE. Without this branch the super admin is told the invoice went out,
    // and the activity log asserts `sent` forever, while the tenant received
    // nothing — unrecoverable after the fact.
    if (!result) {
      const message = 'Email service not configured (SMTP credentials missing)';
      await db.lmsActivityLog.create({
        data: {
          type: 'user_action',
          message: `Failed to send upgrade invoice email to ${tenant.orgName} (${billingEmail})`,
          orgId,
          metadata: {
            email: billingEmail,
            storagePercentage: tenantStorage.percentage,
            emailStatus: 'failed',
            error: message,
            failedAt: new Date().toISOString(),
          },
          timestamp: new Date(),
        },
      });
      return { success: false, error: message, email: billingEmail, tenantName: tenant.orgName };
    }

    await db.lmsActivityLog.create({
      data: {
        type: 'user_action',
        message: `Upgrade invoice email sent to ${tenant.orgName} (${billingEmail})`,
        orgId,
        metadata: {
          email: billingEmail,
          storagePercentage: tenantStorage.percentage,
          emailStatus: 'sent',
          // Captured so support can correlate a complaint with the provider's
          // send record — `getEmailDeliveryStatus` reads it back.
          messageId: result.messageId,
          sentAt: new Date().toISOString(),
        },
        timestamp: new Date(),
      },
    });

    return { success: true, email: billingEmail, tenantName: tenant.orgName, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.lmsActivityLog.create({
      data: {
        type: 'user_action',
        message: `Failed to send upgrade invoice email to ${tenant.orgName} (${billingEmail})`,
        orgId,
        metadata: {
          email: billingEmail,
          storagePercentage: tenantStorage.percentage,
          emailStatus: 'failed',
          error: message,
          failedAt: new Date().toISOString(),
        },
        timestamp: new Date(),
      },
    });

    return { success: false, error: message, email: billingEmail, tenantName: tenant.orgName };
  }
}

export async function getEmailDeliveryStatus(orgId: string) {
  // Most recent user_action log that actually carries metadata.emailStatus.
  //
  // The legacy pushed this predicate into the DB (`'metadata.emailStatus': { $exists: true }`,
  // `audit.service.ts:485-492`), so it always found the newest matching log. The
  // port fetched the latest 50 and filtered in JS, so once a tenant accumulated
  // 50 newer user_action logs without an emailStatus key, the status silently
  // degraded to 'unknown' and the last-sent date vanished — even though the
  // record was right there. Filtering on the JSON path restores the legacy's
  // semantics and does not depend on log volume.
  const recentEmail = await db.lmsActivityLog.findFirst({
    where: {
      orgId,
      type: 'user_action',
      NOT: { metadata: { path: ['emailStatus'], equals: Prisma.DbNull } },
    },
    orderBy: { timestamp: 'desc' },
  });

  if (!recentEmail || !recentEmail.metadata) {
    return { deliveryStatus: 'unknown' as const };
  }

  const metadata = recentEmail.metadata as Record<string, unknown>;
  const emailStatus = metadata.emailStatus as 'sent' | 'failed' | undefined;

  let deliveryStatus: 'delivered' | 'pending' | 'failed' | 'unknown' = 'unknown';
  if (emailStatus === 'sent') deliveryStatus = 'pending';
  else if (emailStatus === 'failed') deliveryStatus = 'failed';

  return {
    lastEmailSent: recentEmail.timestamp,
    lastEmailStatus: emailStatus,
    messageId: metadata.messageId as string | undefined,
    error: metadata.error as string | undefined,
    deliveryStatus,
  };
}
