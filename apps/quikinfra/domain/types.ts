/**
 * QuikInfra — Domain Types
 *
 * All core entity types for the construction ERP domain.
 * Uses Decimal strings for money/qty (never float).
 * All entities are multi-tenant scoped: orgId.
 */

// ─── Shared ─────────────────────────────────────────────────────────

export type EntityStatus = "active" | "inactive";
export type ApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "returned"
  | "reversed"
  | "cancelled";

export type PRStatus =
  | "draft"
  | "pending_approval"
  | "approved_stock_available"
  | "approved_indent_required"
  | "rejected"
  | "cancelled"
  | "closed";

export type IndentStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "partially_ordered"
  | "fully_ordered"
  | "rejected"
  | "cancelled";

export type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "partially_received"
  | "fully_received"
  | "closed"
  | "cancelled";

export type GRNStatus =
  | "draft"
  | "pending_inspection"
  | "inspected"
  | "approved"
  | "partially_accepted"
  | "rejected"
  | "cancelled";

export type WOStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "in_progress"
  | "completed"
  | "closed"
  | "cancelled";

export type DPRStatus =
  | "draft"
  | "submitted"
  | "approved_l1"
  | "approved"
  | "rejected"
  | "reversed";

export type GatePassType = "inward" | "outward" | "returnable" | "non_returnable";

export type StockLedgerType =
  | "grn"
  | "issue"
  | "return_vendor"
  | "return_internal"
  | "transfer_out"
  | "transfer_in"
  | "reconciliation_adj"
  | "opening_balance";

export type QualityStatus = "pending" | "accepted" | "rejected" | "conditional";

// ─── Audit Mixin ────────────────────────────────────────────────────

export interface AuditFields {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface TenantScoped {
  orgId: string;
}

// ─── Master Data ────────────────────────────────────────────────────

export interface Company extends TenantScoped, AuditFields {
  id: string;
  name: string;
  legalName: string;
  gstin: string;
  pan: string;
  cin?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  status: EntityStatus;
}

export interface Project extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  description?: string;
  companyId: string;
  clientId?: string;
  address?: string;
  city?: string;
  state?: string;
  startDate?: string;
  expectedEndDate?: string;
  actualEndDate?: string;
  projectValue?: string; // Decimal string
  status: EntityStatus;
  projectManagerId?: string;
}

export interface ItemGroup extends TenantScoped, AuditFields {
  id: string;
  name: string;
  parentId?: string;
  depth: number;
  sortOrder: number;
  status: EntityStatus;
}

export interface Item extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  description?: string;
  groupId: string;
  uomId: string;
  hsnCode?: string;
  gstRate?: string; // Decimal
  minStockLevel?: string; // Decimal
  reorderLevel?: string; // Decimal
  standardRate?: string; // Decimal
  status: EntityStatus;
}

export interface UOM extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  status: EntityStatus;
}

export interface Vendor extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  paymentTermsDays?: number;
  rating?: number;
  status: EntityStatus;
}

export interface Contractor extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  licenseNo?: string;
  specialization?: string;
  status: EntityStatus;
}

export interface Customer extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  status: EntityStatus;
}

export interface Location extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  type: "site" | "warehouse" | "head_office" | "yard";
  projectId?: string;
  address?: string;
  city?: string;
  state?: string;
  inCharge?: string;
  status: EntityStatus;
}

export interface GSTCode extends TenantScoped, AuditFields {
  id: string;
  code: string;
  description: string;
  rate: string; // Decimal: 5, 12, 18, 28
  cgstRate: string;
  sgstRate: string;
  igstRate: string;
  status: EntityStatus;
}

export interface TDSCode extends TenantScoped, AuditFields {
  id: string;
  section: string;
  description: string;
  rate: string; // Decimal
  thresholdAmount?: string; // Decimal
  status: EntityStatus;
}

export interface Department extends TenantScoped, AuditFields {
  id: string;
  name: string;
  code: string;
  headUserId?: string;
  status: EntityStatus;
}

export interface WorkCategory extends TenantScoped, AuditFields {
  id: string;
  name: string;
  description?: string;
  status: EntityStatus;
}

export interface CostCenter extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  projectId?: string;
  status: EntityStatus;
}

export interface Machinery extends TenantScoped, AuditFields {
  id: string;
  code: string;
  name: string;
  type: string;
  make?: string;
  model?: string;
  registrationNo?: string;
  projectId?: string;
  locationId?: string;
  fuelType?: string;
  capacity?: string;
  status: EntityStatus;
}

export interface TermsCondition extends TenantScoped, AuditFields {
  id: string;
  title: string;
  body: string;
  applicableTo: "po" | "wo" | "rfq" | "general";
  isDefault: boolean;
  status: EntityStatus;
}

// ─── Purchase ───────────────────────────────────────────────────────

export interface PurchaseRequisition extends TenantScoped, AuditFields {
  id: string;
  prNumber: string;
  projectId: string;
  requestedById: string;
  requestDate: string;
  requiredDate?: string;
  purpose?: string;
  status: PRStatus;
  approvalId?: string;
  lines: PurchaseRequisitionLine[];
}

export interface PurchaseRequisitionLine {
  id: string;
  prId: string;
  itemId: string;
  quantity: string; // Decimal
  uomId: string;
  estimatedRate?: string; // Decimal
  estimatedAmount?: string; // Decimal
  specification?: string;
  currentStock?: string; // Decimal — system-calculated
  remarks?: string;
}

export interface PurchaseIndent extends TenantScoped, AuditFields {
  id: string;
  indentNumber: string;
  prId?: string;
  projectId: string;
  requestedById: string;
  indentDate: string;
  status: IndentStatus;
  approvalId?: string;
  lines: PurchaseIndentLine[];
}

export interface PurchaseIndentLine {
  id: string;
  indentId: string;
  prLineId?: string;
  itemId: string;
  requiredQty: string; // Decimal
  indentedQty: string; // Decimal
  orderedQty: string; // Decimal — system-managed
  pendingQty: string; // Decimal — system-managed
  uomId: string;
  remarks?: string;
}

export interface RFQ extends TenantScoped, AuditFields {
  id: string;
  rfqNumber: string;
  projectId: string;
  indentId?: string;
  rfqDate: string;
  dueDate?: string;
  status: "draft" | "sent" | "responses_received" | "evaluated" | "closed";
  vendorIds: string[];
  lines: RFQLine[];
  responses: RFQResponse[];
}

export interface RFQLine {
  id: string;
  rfqId: string;
  itemId: string;
  quantity: string;
  uomId: string;
  specification?: string;
}

export interface RFQResponse {
  id: string;
  rfqId: string;
  vendorId: string;
  submittedAt?: string;
  validUntil?: string;
  remarks?: string;
  lines: RFQResponseLine[];
}

export interface RFQResponseLine {
  id: string;
  responseId: string;
  rfqLineId: string;
  unitRate: string; // Decimal
  amount: string; // Decimal
  deliveryDays?: number;
  remarks?: string;
}

export interface PurchaseOrder extends TenantScoped, AuditFields {
  id: string;
  poNumber: string;
  projectId: string;
  vendorId: string;
  indentId?: string;
  rfqId?: string;
  poDate: string;
  deliveryDate?: string;
  deliveryLocationId?: string;
  subtotal: string; // Decimal
  taxAmount: string; // Decimal
  totalAmount: string; // Decimal
  status: POStatus;
  approvalId?: string;
  approvalThresholdMet: boolean;
  paymentTermsDays?: number;
  termsConditionId?: string;
  remarks?: string;
  isUrgentLocal: boolean;
  urgentLocalReason?: string;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderLine {
  id: string;
  poId: string;
  indentLineId?: string;
  itemId: string;
  quantity: string; // Decimal
  orderedQty: string; // Decimal — system-managed
  receivedQty: string; // Decimal — system-managed
  pendingQty: string; // Decimal — system-managed
  unitRate: string; // Decimal
  amount: string; // Decimal
  gstCodeId?: string;
  taxAmount: string; // Decimal
  totalAmount: string; // Decimal
  uomId: string;
  deliveryDate?: string;
  remarks?: string;
}

export interface GoodsReceiptNote extends TenantScoped, AuditFields {
  id: string;
  grnNumber: string;
  poId: string;
  projectId: string;
  vendorId: string;
  grnDate: string;
  locationId: string;
  storageLocationId?: string;
  supplierInvoiceNo?: string;
  supplierInvoiceDate?: string;
  challanNo?: string;
  challanDate?: string;
  receivedById: string;
  inspectedById?: string;
  weighbridgeSlipNo?: string;
  status: GRNStatus;
  approvalId?: string;
  remarks?: string;
  lines: GRNLine[];
}

export interface GRNLine {
  id: string;
  grnId: string;
  poLineId: string;
  itemId: string;
  receivedQty: string; // Decimal
  acceptedQty: string; // Decimal
  rejectedQty: string; // Decimal
  shortQty: string; // Decimal
  uomId: string;
  unitRate: string; // Decimal
  amount: string; // Decimal
  qualityStatus: QualityStatus;
  batchNo?: string;
  condition?: string;
  testCertRef?: string;
  shortDeliveryNote?: string;
  remarks?: string;
}

// ─── Store & Inventory ──────────────────────────────────────────────

export interface StockLedgerEntry extends TenantScoped {
  id: string;
  projectId: string;
  locationId: string;
  itemId: string;
  transactionType: StockLedgerType;
  transactionRefId: string;
  transactionRefNumber: string;
  transactionDate: string;
  qtyIn: string; // Decimal
  qtyOut: string; // Decimal
  unitRate: string; // Decimal
  amount: string; // Decimal
  runningBalance?: string; // Decimal — computed
  uomId: string;
  createdAt: string;
  createdBy: string;
}

export interface MaterialIssue extends TenantScoped, AuditFields {
  id: string;
  issueNumber: string;
  projectId: string;
  locationId: string;
  issuedToId: string;
  issuedById: string;
  issueDate: string;
  prId?: string;
  purpose?: string;
  status: "draft" | "issued" | "cancelled";
  lines: MaterialIssueLine[];
}

export interface MaterialIssueLine {
  id: string;
  issueId: string;
  itemId: string;
  issuedQty: string; // Decimal
  uomId: string;
  unitRate: string; // Decimal
  amount: string; // Decimal
  remarks?: string;
}

export interface GatePass extends TenantScoped, AuditFields {
  id: string;
  gatePassNumber: string;
  projectId: string;
  locationId: string;
  type: GatePassType;
  referenceType?: "grn" | "issue" | "return" | "transfer";
  referenceId?: string;
  referenceNumber?: string;
  vehicleNo?: string;
  driverName?: string;
  driverPhone?: string;
  purpose?: string;
  gatePassDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  authorizedById: string;
  status: "issued" | "returned" | "closed" | "cancelled";
  lines: GatePassLine[];
}

export interface GatePassLine {
  id: string;
  gatePassId: string;
  itemId: string;
  quantity: string; // Decimal
  uomId: string;
  remarks?: string;
}

export interface GoodReturn extends TenantScoped, AuditFields {
  id: string;
  returnNumber: string;
  projectId: string;
  locationId: string;
  vendorId: string;
  grnId?: string;
  returnDate: string;
  reason: string;
  status: "draft" | "pending_approval" | "approved" | "dispatched" | "cancelled";
  approvalId?: string;
  lines: GoodReturnLine[];
}

export interface GoodReturnLine {
  id: string;
  returnId: string;
  itemId: string;
  returnQty: string; // Decimal
  uomId: string;
  unitRate: string; // Decimal
  amount: string; // Decimal
  reason?: string;
}

export interface StockTransfer extends TenantScoped, AuditFields {
  id: string;
  transferNumber: string;
  fromProjectId: string;
  fromLocationId: string;
  toProjectId: string;
  toLocationId: string;
  transferDate: string;
  initiatedById: string;
  receivedById?: string;
  receivedDate?: string;
  status: "draft" | "dispatched" | "in_transit" | "received" | "cancelled";
  lines: StockTransferLine[];
}

export interface StockTransferLine {
  id: string;
  transferId: string;
  itemId: string;
  sentQty: string; // Decimal
  receivedQty?: string; // Decimal
  uomId: string;
  remarks?: string;
}

export interface StockReconciliation extends TenantScoped, AuditFields {
  id: string;
  reconciliationNumber: string;
  projectId: string;
  locationId: string;
  reconciliationDate: string;
  conductedById: string;
  approvedById?: string;
  status: "draft" | "pending_approval" | "approved" | "cancelled";
  approvalId?: string;
  lines: StockReconciliationLine[];
}

export interface StockReconciliationLine {
  id: string;
  reconciliationId: string;
  itemId: string;
  systemQty: string; // Decimal — system-calculated
  physicalQty: string; // Decimal
  varianceQty: string; // Decimal — system-calculated
  uomId: string;
  reason?: string;
}

export interface DieselLogEntry extends TenantScoped, AuditFields {
  id: string;
  projectId: string;
  locationId: string;
  logDate: string;
  machineryId: string;
  openingReading?: string; // Decimal
  closingReading?: string; // Decimal
  quantityIssued: string; // Decimal
  unitRate: string; // Decimal
  totalCost: string; // Decimal
  operatorName?: string;
  remarks?: string;
}

// ─── Project Management ─────────────────────────────────────────────

export interface BOQItem extends TenantScoped, AuditFields {
  id: string;
  projectId: string;
  parentId?: string;
  depth: number;
  sortOrder: number;
  isLeaf: boolean;
  category?: string; // Civil, Electrical, Road, Non-SOR
  itemCode?: string;
  description: string;
  uomId?: string;
  quantity?: string; // Decimal — negative for deduction items
  contractRate?: string; // Decimal
  workingRate?: string; // Decimal
  contractAmount?: string; // Decimal — system-calculated
  workingAmount?: string; // Decimal — system-calculated
  executedQty?: string; // Decimal — system-managed from DPR
  executedAmount?: string; // Decimal — system-managed
  progressPercent?: string; // Decimal — system-managed
  status: EntityStatus;
}

export interface MaterialEstimation extends TenantScoped, AuditFields {
  id: string;
  projectId: string;
  boqItemId: string;
  itemId: string;
  requiredQty: string; // Decimal
  wastePercent: string; // Decimal
  totalQty: string; // Decimal — requiredQty * (1 + wastePercent/100)
  standardRate: string; // Decimal
  estimatedCost: string; // Decimal
}

export interface WorkOrder extends TenantScoped, AuditFields {
  id: string;
  woNumber: string;
  projectId: string;
  contractorId: string;
  workCategoryId?: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  totalAmount: string; // Decimal
  status: WOStatus;
  approvalId?: string;
  termsConditionId?: string;
  lines: WorkOrderLine[];
}

export interface WorkOrderLine {
  id: string;
  woId: string;
  boqItemId: string;
  description: string;
  quantity: string; // Decimal
  uomId: string;
  negotiatedRate: string; // Decimal
  amount: string; // Decimal
}

export interface DailyProgressReport extends TenantScoped, AuditFields {
  id: string;
  dprNumber: string;
  projectId: string;
  reportDate: string;
  submittedById: string;
  weatherCondition?: string;
  remarks?: string;
  status: DPRStatus;
  approvalId?: string;
  workItems: DPRWorkItem[];
  labourEntries: DPRLabourEntry[];
  machineryEntries: DPRMachineryEntry[];
  materialEntries: DPRMaterialEntry[];
}

export interface DPRWorkItem {
  id: string;
  dprId: string;
  boqItemId: string;
  woId?: string;
  description: string;
  todayQty: string; // Decimal
  cumulativeQty: string; // Decimal — system-managed
  uomId: string;
  remarks?: string;
}

export interface DPRLabourEntry {
  id: string;
  dprId: string;
  category: string;
  skillType: string;
  count: number;
  hoursWorked: string; // Decimal
  contractorId?: string;
}

export interface DPRMachineryEntry {
  id: string;
  dprId: string;
  machineryId: string;
  hoursWorked: string; // Decimal
  fuelConsumed?: string; // Decimal
  operatorName?: string;
  remarks?: string;
}

export interface DPRMaterialEntry {
  id: string;
  dprId: string;
  itemId: string;
  consumedQty: string; // Decimal
  uomId: string;
  remarks?: string;
}

export interface RunningAccountBill extends TenantScoped, AuditFields {
  id: string;
  rabNumber: string;
  projectId: string;
  contractorId: string;
  woId: string;
  billPeriodFrom: string;
  billPeriodTo: string;
  previousBillAmount: string; // Decimal
  currentBillAmount: string; // Decimal
  cumulativeAmount: string; // Decimal
  retentionPercent?: string; // Decimal
  retentionAmount?: string; // Decimal
  deductions?: string; // Decimal
  netPayable: string; // Decimal
  status: "draft" | "submitted" | "approved" | "paid" | "cancelled";
  approvalId?: string;
  lines: RABLine[];
}

export interface RABLine {
  id: string;
  rabId: string;
  boqItemId: string;
  woLineId: string;
  description: string;
  uomId: string;
  totalQty: string; // Decimal
  previousQty: string; // Decimal
  currentQty: string; // Decimal — from approved DPR
  cumulativeQty: string; // Decimal
  rate: string; // Decimal
  previousAmount: string; // Decimal
  currentAmount: string; // Decimal
  cumulativeAmount: string; // Decimal
}

// ─── Approval Workflow ──────────────────────────────────────────────

export type ApprovalEntityType =
  | "purchase_requisitions"
  | "purchase_indents"
  | "purchase_order"
  | "grn"
  | "work_order"
  | "dpr"
  | "stock_reconciliation"
  | "good_return"
  | "stock_transfer";

export interface ApprovalWorkflow extends TenantScoped, AuditFields {
  id: string;
  name: string;
  entityType: ApprovalEntityType;
  isActive: boolean;
  steps: ApprovalWorkflowStep[];
}

export interface ApprovalWorkflowStep {
  id: string;
  workflowId: string;
  stepOrder: number;
  approverRoleId?: string;
  approverUserId?: string;
  approverDepartmentId?: string;
  amountThresholdMin?: string; // Decimal
  amountThresholdMax?: string; // Decimal
  isConditional: boolean;
  conditionField?: string;
  conditionOperator?: string;
  conditionValue?: string;
}

export interface ApprovalInstance extends TenantScoped {
  id: string;
  workflowId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  entityNumber: string;
  currentStepOrder: number;
  status: ApprovalStatus;
  requestedById: string;
  requestedAt: string;
  completedAt?: string;
  history: ApprovalHistoryEntry[];
}

export interface ApprovalHistoryEntry {
  id: string;
  instanceId: string;
  stepOrder: number;
  action: "approve" | "reject" | "return" | "reverse";
  actionById: string;
  actionAt: string;
  comments?: string;
}

// ─── Notification ───────────────────────────────────────────────────

export interface ConstructionNotification extends TenantScoped {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: "approval" | "stock_alert" | "info" | "action";
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Audit Log ──────────────────────────────────────────────────────

export interface ConstructionAuditLog extends TenantScoped {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "approve" | "reject" | "reverse" | "status_change";
  userId: string;
  timestamp: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  ipAddress?: string;
}
