/**
 * QuikInfra — App Manifest
 *
 * Construction ERP for builders, contractors, developers & infra companies.
 * From BOQ to Billing, Site to HO, Material to Progress.
 */

export const CONSTRUCTION_EVENTS = {
  // Purchase
  PR_CREATED: 'construction.pr.created',
  PR_APPROVED: 'construction.pr.approved',
  INDENT_CREATED: 'construction.indent.created',
  INDENT_APPROVED: 'construction.indent.approved',
  PO_CREATED: 'construction.po.created',
  PO_APPROVED: 'construction.po.approved',
  GRN_CREATED: 'construction.grn.created',
  GRN_COMPLETED: 'construction.grn.completed',

  // Store
  ISSUE_CREATED: 'construction.issue.created',
  TRANSFER_INITIATED: 'construction.transfer.initiated',
  TRANSFER_RECEIVED: 'construction.transfer.received',
  GATE_PASS_CREATED: 'construction.gatepass.created',

  // Project
  BOQ_UPLOADED: 'construction.boq.uploaded',
  WO_CREATED: 'construction.wo.created',
  WO_APPROVED: 'construction.wo.approved',
  DPR_SUBMITTED: 'construction.dpr.submitted',
  DPR_APPROVED: 'construction.dpr.approved',
  RAB_GENERATED: 'construction.rab.generated',

  // Approvals
  APPROVAL_REQUESTED: 'construction.approval.requested',
  APPROVAL_COMPLETED: 'construction.approval.completed',
  APPROVAL_REJECTED: 'construction.approval.rejected',
} as const;

export const QUIKINFRA_MANIFEST = {
  appKey: 'quikinfra',
  appName: 'QuikInfra',
  appCategory: 'Construction ERP',
  appIcon: '🏗️',
  appColor: '#f97316',
  appVersion: '1.0.0',

  routes: {
    dashboard: '/dashboard',
    // Masters
    masters: '/masters',
    projects: '/masters/projects',
    items: '/masters/items',
    vendors: '/masters/vendors',
    contractors: '/masters/contractors',
    // Purchase
    purchase: '/purchase',
    purchaseRequisitions: '/purchase/requisitions',
    indents: '/purchase/indents',
    rfqs: '/purchase/rfqs',
    purchaseOrders: '/purchase/orders',
    // Store
    store: '/store',
    grn: '/store/grn',
    stockRegister: '/store/stock-register',
    materialIssue: '/store/issue',
    gatePass: '/store/gate-pass',
    goodReturn: '/store/good-return',
    stockTransfer: '/store/transfer',
    stockReconciliation: '/store/reconciliation',
    dieselLog: '/store/diesel-log',
    // Projects
    projectManagement: '/projects',
    boq: '/projects/boq',
    estimation: '/projects/estimation',
    workOrders: '/projects/work-orders',
    dpr: '/projects/dpr',
    rab: '/projects/rab',
    gantt: '/projects/gantt',
    // System
    approvals: '/approvals',
    reports: '/reports',
    settings: '/settings',
    users: '/settings/users',
    roles: '/settings/roles',
    workflows: '/settings/workflows',
  },

  featureFlags: [
    'construction.dashboard',
    'construction.masters',
    'construction.purchase',
    'construction.store',
    'construction.projects',
    'construction.boq',
    'construction.dpr',
    'construction.rab',
    'construction.approvals',
    'construction.reports',
    'construction.diesel',
  ],

  permissionKeys: [
    // Dashboard
    'construction.dashboard.view',
    // Masters
    'construction.masters.view',
    'construction.masters.create',
    'construction.masters.edit',
    'construction.masters.delete',
    'construction.masters.import',
    'construction.masters.export',
    // Purchase
    'construction.pr.view',
    'construction.pr.create',
    'construction.pr.approve',
    'construction.indent.view',
    'construction.indent.create',
    'construction.indent.approve',
    'construction.rfq.view',
    'construction.rfq.create',
    'construction.po.view',
    'construction.po.create',
    'construction.po.approve',
    'construction.grn.view',
    'construction.grn.create',
    'construction.grn.approve',
    // Store
    'construction.stock.view',
    'construction.issue.view',
    'construction.issue.create',
    'construction.gatepass.view',
    'construction.gatepass.create',
    'construction.return.view',
    'construction.return.create',
    'construction.transfer.view',
    'construction.transfer.create',
    'construction.transfer.receive',
    'construction.reconciliation.view',
    'construction.reconciliation.create',
    'construction.diesel.view',
    'construction.diesel.create',
    // Projects
    'construction.project.view',
    'construction.project.create',
    'construction.project.edit',
    'construction.boq.view',
    'construction.boq.create',
    'construction.boq.import',
    'construction.estimation.view',
    'construction.estimation.create',
    'construction.wo.view',
    'construction.wo.create',
    'construction.wo.approve',
    'construction.dpr.view',
    'construction.dpr.create',
    'construction.dpr.approve',
    'construction.dpr.reverse',
    'construction.rab.view',
    'construction.rab.create',
    // Settings
    'construction.settings.manage',
    'construction.users.manage',
    'construction.roles.manage',
    'construction.workflows.manage',
  ],

  eventTypes: Object.values(CONSTRUCTION_EVENTS),

  workProjectionMappings: {
    [CONSTRUCTION_EVENTS.PR_CREATED]: { workType: 'approval', statusField: 'status' },
    [CONSTRUCTION_EVENTS.INDENT_CREATED]: { workType: 'approval', statusField: 'status' },
    [CONSTRUCTION_EVENTS.PO_CREATED]: { workType: 'approval', statusField: 'status' },
    [CONSTRUCTION_EVENTS.DPR_SUBMITTED]: { workType: 'approval', statusField: 'status' },
    [CONSTRUCTION_EVENTS.WO_CREATED]: { workType: 'approval', statusField: 'status' },
  },

  searchIndexMappings: {
    project: { titleField: 'name', subtitleField: 'code', urlPattern: '/masters/projects/{id}' },
    item: { titleField: 'name', subtitleField: 'code', urlPattern: '/masters/items/{id}' },
    vendor: { titleField: 'name', subtitleField: 'gstin', urlPattern: '/masters/vendors/{id}' },
    purchaseOrder: { titleField: 'poNumber', subtitleField: 'vendor', urlPattern: '/purchase/orders/{id}' },
    grn: { titleField: 'grnNumber', subtitleField: 'project', urlPattern: '/store/grn/{id}' },
    workOrder: { titleField: 'woNumber', subtitleField: 'contractor', urlPattern: '/projects/work-orders/{id}' },
  },
} as const;
