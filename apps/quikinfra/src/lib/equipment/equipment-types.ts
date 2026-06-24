/** Client-safe equipment types — no server/db imports. */

import type { ApprovalInfo } from "@/lib/approvals/approval-info";

export type LogStatus = "draft" | "pending_approval" | "approved" | "rejected";

export interface EquipmentLogRecord {
  id: string;
  orgId: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentType: string;
  meterType: string;
  fuelNorm: number | null;
  projectId: string | null;
  projectName: string | null;
  logDate: string;
  shift: string;
  openingMeter: number | null;
  closingMeter: number | null;
  meterReset: boolean;
  run: number | null;
  idleHours: number | null;
  breakdownHours: number | null;
  dieselIssued: number | null;
  fuelRate: number | null;
  fuelAnomaly: boolean;
  operatorName: string | null;
  productivityQty: number | null;
  outputUom: string | null;
  remarks: string | null;
  status: LogStatus;
  approvalId?: string | null;
  canActOnCurrentStep?: boolean;
  /** Enriched approval timeline — attached by the detail GET route. */
  approval?: ApprovalInfo | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type JobCardStatus = "open" | "closed" | "cancelled";
export type JobCardType = "breakdown" | "preventive";

export interface JobCardSpareRecord {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface JobCardRecord {
  id: string;
  orgId: string;
  jobNumber: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentType: string;
  projectId: string | null;
  projectName: string | null;
  jobType: JobCardType;
  serviceDate: string;
  meterAtService: number | null;
  downtimeHours: number | null;
  reportedProblem: string | null;
  labourCost: number;
  serviceCost: number;
  totalCost: number;
  spares: JobCardSpareRecord[];
  remarks: string | null;
  status: JobCardStatus;
  /**
   * Enriched approval timeline — attached by the detail GET route when an
   * approval workflow is wired for job cards. Absent today (job cards have no
   * approval instance yet); the detail page renders a "not submitted"
   * placeholder until then.
   */
  approval?: ApprovalInfo | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface MaintenanceDueRecord {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  serviceIntervalValue: number | null;
  serviceIntervalUnit: string | null;
  currentMeter: number | null;
  lastServiceMeter: number | null;
  since: number;
  dueState: "overdue" | "due_soon" | "ok";
}

export type TransferStatus = "in_transit" | "received" | "cancelled";
export type TransferType = "reassignment" | "returnable";
export type DocComplianceState = "expired" | "expiring" | "ok";

export interface EquipmentTransferRecord {
  id: string;
  orgId: string;
  transferNumber: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  sourceProjectId: string | null;
  sourceProjectName: string | null;
  destinationProjectId: string;
  destinationProjectName: string;
  transferType: TransferType;
  transferDate: string;
  returnableFrom: string | null;
  returnableTo: string | null;
  reason: string | null;
  remarks: string | null;
  gatePassNo: string | null;
  status: TransferStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface EquipmentDocumentRecord {
  id: string;
  orgId: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  docType: string;
  docNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  alertDays: number;
  fileUrl: string | null;
  status: string;
  daysUntilExpiry: number | null;
  complianceState: DocComplianceState;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface DeploymentSummary {
  inTransit: number;
  docsExpired: number;
  docsExpiring: number;
}

export interface FleetKpis {
  machines: number;
  avgUtilisation: number;
  fuelCost: number;
  maintDue: number;
  docAlerts: number;
}

export interface FleetMachineRow {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  meterType: string;
  currentMeter: number | null;
  projectId: string | null;
  projectName: string | null;
  run: number;
  idle: number;
  breakdown: number;
  utilisationPct: number | null;
  fuelLPerUnit: number | null;
  fuelCost: number;
  maintenanceCost: number;
  costBurn: number;
  fuelFlag: boolean;
}

export interface FleetDashboardPayload {
  kpis: FleetKpis;
  machines: FleetMachineRow[];
}

export interface CostSheetLine {
  key: string;
  label: string;
  subtext: string;
  amount: number;
  isCredit?: boolean;
}

export interface CostSheetPayload {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentType: string;
  ownershipType: string;
  run: number;
  operatorDays: number;
  lines: CostSheetLine[];
  netMachineCost: number;
}

export interface Machine360Header {
  id: string;
  code: string;
  name: string;
  type: string;
  ownershipType: string;
  projectId: string | null;
  projectName: string | null;
  meterType: string;
  currentMeter: number | null;
  fuelNorm: number | null;
  status: string;
}

export interface Machine360Kpis {
  run: number;
  runSubtext: string;
  breakdownHours: number;
  fuelLitres: number;
  fuelRate: number | null;
  fuelCost: number;
  maintenanceCost: number;
  maintenanceLifetime: number;
  openJobCards: number;
  netMachineCost: number;
  rentOutRevenue: number;
  complianceState: "valid" | "expired" | "expiring";
  openJobCardsCompliance: number;
}

export interface Machine360ChartPoint {
  date: string;
  value: number;
  anomaly?: boolean;
}

export interface Machine360MonthlyPoint {
  month: string;
  run: number;
  idle: number;
  breakdown: number;
}

export interface Machine360CostBurnPoint {
  month: string;
  fuel: number;
  maintenance: number;
}

export interface Machine360TimelineEvent {
  date: string;
  kind: string;
  title: string;
  summary: string;
  amount: number | null;
  status: string;
  flag: boolean | null;
  refNumber: string | null;
}

export interface Machine360Payload {
  header: Machine360Header;
  kpis: Machine360Kpis;
  costSheet: CostSheetPayload;
  charts: {
    meterSeries: Machine360ChartPoint[];
    monthly: Machine360MonthlyPoint[];
    fuelSeries: Machine360ChartPoint[];
    costBurn: Machine360CostBurnPoint[];
  };
  timeline: Machine360TimelineEvent[];
  counts: {
    logs: number;
    maintenance: number;
    movement: number;
    compliance: number;
    commercials: number;
  };
}

export type HireRateDirection = "hire_in" | "rent_out";
export type HireRateBasis = "hour" | "day" | "month";
export type HireRentStatus =
  | "draft"
  | "computed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "active"
  | "inactive";

export interface HireRateRecord {
  id: string;
  orgId: string;
  direction: HireRateDirection;
  rateBasis: HireRateBasis;
  equipmentId: string | null;
  equipmentCode: string | null;
  equipmentName: string | null;
  equipmentType: string | null;
  scopeLabel: string;
  vendorId: string | null;
  vendorName: string | null;
  customerId: string | null;
  customerName: string | null;
  rate: number;
  sacCode: string | null;
  gstPercent: number;
  minGuaranteedQty: number | null;
  effectiveFrom: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HireInVerificationRecord {
  id: string;
  orgId: string;
  verificationNumber: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  vendorId: string | null;
  vendorName: string | null;
  projectId: string | null;
  periodFrom: string;
  periodTo: string;
  rate: number;
  rateBasis: HireRateBasis;
  vendorClaimedQty: number | null;
  minGuaranteedQty: number | null;
  gstPercent: number;
  loggedQty: number | null;
  billableQty: number | null;
  varianceQty: number | null;
  payableAmount: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  status: string;
  approvalId?: string | null;
  rejectReason?: string | null;
  returnReason?: string | null;
  /** Enriched approval timeline — attached by the detail GET route. */
  approval?: ApprovalInfo | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface RentOutBillRecord {
  id: string;
  orgId: string;
  billNumber: string;
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  periodFrom: string;
  periodTo: string;
  rateBasis: HireRateBasis;
  rate: number;
  minGuaranteedQty: number | null;
  sacCode: string | null;
  gstPercent: number;
  billableQty: number | null;
  amount: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface HireRentSummary {
  hireRates: number;
  hireInPayable: number;
  rentOutRevenue: number;
  rentBills: number;
}
