/**
 * Real-DB helper for integration tests.
 *
 * Exports a shared PrismaClient and a cleanup utility that deletes all test
 * data for a given tenant ID.  Use a unique orgId per describe block to
 * keep test runs isolated.
 */
import { PrismaClient } from "@quikit/database";

export const integrationPrisma = new PrismaClient();

/**
 * Delete all rows with `tenantId` from every table the disposition-rule-engine
 * touches.  Call in afterAll so failures still leave data inspectable.
 */
export async function cleanupTenant(orgId: string): Promise<void> {
  await integrationPrisma.qceAuditLog.deleteMany({ where: { orgId } });
  await integrationPrisma.qceTask.deleteMany({ where: { orgId } });
  await integrationPrisma.qceActivity.deleteMany({ where: { orgId } });
  await integrationPrisma.qceCallLog.deleteMany({ where: { orgId } });
  await integrationPrisma.qceAutomationRule.deleteMany({ where: { orgId } });
  await integrationPrisma.qceCallDisposition.deleteMany({ where: { orgId } });
  await integrationPrisma.qceLead.deleteMany({ where: { orgId } });
}
