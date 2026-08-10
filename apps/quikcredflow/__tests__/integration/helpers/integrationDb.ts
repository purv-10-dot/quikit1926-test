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
  await integrationPrisma.qcfAuditLog.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfTask.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfActivity.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfCallLog.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfAutomationRule.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfCallDisposition.deleteMany({ where: { orgId } });
  await integrationPrisma.qcfLead.deleteMany({ where: { orgId } });
}
