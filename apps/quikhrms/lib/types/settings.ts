export type CompanyHolidayType = "National" | "Regional" | "Company" | "Optional";

export type ApprovalModule =
  | "Leave" | "Expense" | "Asset" | "Onboarding" | "Offboarding" | "Attendance" | "Document";

export type ApproverKind = "ROLE" | "USER";

export type NotificationPrefChannel = "Email" | "InApp" | "Push" | "Slack";

/** New fully-dynamic level shape. Old chains may have `approverType` instead. */
export interface ApprovalLevel {
  level: number;
  kind: ApproverKind;
  roleId?: string;
  userId?: string;
  escalateAfterHours?: number;
  allowSkip?: boolean;
}

export interface CompanySettingsData {
  id: string;
  orgId: string;
  companyName: string;
  logo: string | null;
  timezone: string;
  dateFormat: string;
  currency: string;
  fiscalYearStart: number;
  probationPeriodDays: number;
  noticePeriodDays: number;
  workWeek: string[] | null;
  workHoursPerDay: string | number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyHolidayData {
  id: string;
  orgId: string;
  name: string;
  date: string;
  year: number;
  type: CompanyHolidayType;
  isOptional: boolean;
  maxOptionalAllowed: number | null;
  applicableDepartments: string[] | null;
  applicableLocations: string[] | null;
  description: string | null;
}

export interface ApprovalChainData {
  id: string;
  orgId: string;
  name: string;
  module: ApprovalModule;
  levels: ApprovalLevel[];
  autoApproveAfterDays: number | null;
  isActive: boolean;
}


