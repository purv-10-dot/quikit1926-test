/**
 * Real-DB helper for integration tests.
 *
 * Exports a shared PrismaClient and a cleanup utility that deletes all test
 * data for a given tenant ID.  Use a unique tenantId per describe block to
 * keep test runs isolated.
 */
import { PrismaClient } from "@quikit/database";

export const integrationPrisma = new PrismaClient();

/**
 * Delete all rows with `tenantId` from every table the disposition-rule-engine
 * touches.  Call in afterAll so failures still leave data inspectable.
 */
export async function cleanupTenant(tenantId: string): Promise<void> {
  await integrationPrisma.crmAuditLog.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmTask.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmActivity.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmCallLog.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmAutomationRule.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmCallDisposition.deleteMany({ where: { tenantId } });
  await integrationPrisma.crmLead.deleteMany({ where: { tenantId } });
}
