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
  await integrationPrisma.qcfAuditLog.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfTask.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfActivity.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfCallLog.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfAutomationRule.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfCallDisposition.deleteMany({ where: { tenantId } });
  await integrationPrisma.qcfLead.deleteMany({ where: { tenantId } });
}
