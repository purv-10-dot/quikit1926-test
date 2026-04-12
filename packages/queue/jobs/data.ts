/**
 * Data processing job definitions.
 */

export interface KpiRollupData {
  tenantId: string;
  year: number;
  quarter: string;
  weekNumber: number;
}

export interface AuditDigestData {
  tenantId: string;
  date: string; // ISO date (YYYY-MM-DD)
}

export interface OpspPdfExportData {
  tenantId: string;
  userId: string;
  opspId: string;
  year: number;
  quarter: string;
}
