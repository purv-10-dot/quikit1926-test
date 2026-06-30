import {
  Activity,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  Cable,
  Calculator,
  LineChart,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileCheck2,
  FileText,
  FolderOpen,
  GitMerge,
  Globe,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  Repeat2,
  ScanText,
  Settings,
  ShieldCheck,
  Shuffle,
  Tags,
  TrendingDown,
  TrendingUp,
  Upload,
  UserCog,
  Users,
  Warehouse,
  Webhook,
  WalletCards,
  FolderTree
} from "lucide-react";
import { addDaysISO, todayISO } from "@/lib/utils/dates";

export type TableValue = string | number | boolean | null;
export type TableRow = { id: string } & Record<string, TableValue>;

export type DataColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  kind?: "text" | "money" | "date" | "status" | "number" | "boolean";
};

export type FieldType = "text" | "email" | "number" | "date" | "money" | "select" | "textarea" | "checkbox";

export type FormField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  required?: boolean;
};

export type ModuleConfig = {
  key: string;
  title: string;
  entityName: string;
  description: string;
  apiPath: string;
  newPath?: string;
  columns: DataColumn[];
  rows: TableRow[];
  formFields: FormField[];
  primaryAction?: string;
  /** Extra "New ▾" dropdown entries shown next to the primary action (e.g. Recurring Invoice). */
  secondaryActions?: { label: string; href: string }[];
  /** When set, grid "edit" navigates to `${detailBasePath}/${id}` (a dedicated page) instead of the inline dialog. */
  detailBasePath?: string;
};

export type NavItem = {
  title: string;
  /** Leaf items navigate via `href`. Parent items omit it and use `children`. */
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Nested sub-items rendered as an expandable group when the sidebar is expanded. */
  children?: NavItem[];
};

export const navigationGroups: { label: string; items: NavItem[] }[] = [
  { label: "Home", items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }] },
  {
    label: "Sales",
    items: [
      { title: "Point of Sale", href: "/pos", icon: CircleDollarSign },
      { title: "Quotations", href: "/quotations", icon: FileText },
      { title: "Sales Orders", href: "/sales-orders", icon: ClipboardList },
      { title: "Invoices", href: "/invoices", icon: FileText },
      { title: "Delivery Challans", href: "/delivery-challans", icon: FileCheck2 },
      { title: "Credit Notes", href: "/credit-notes", icon: Repeat2 },
      { title: "Payments Received", href: "/payments/received", icon: CircleDollarSign },
      { title: "Receivables", href: "/receivables", icon: TrendingUp }
    ]
  },
  {
    label: "Customers",
    items: [
      { title: "Customers", href: "/customers", icon: Users },
      { title: "Customer Statement", href: "/reports/customer-statement", icon: FileBarChart }
    ]
  },
  {
    label: "Vendors",
    items: [
      { title: "Vendors", href: "/vendors", icon: Building2 },
      { title: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
      { title: "Goods Receipts", href: "/goods-receipts", icon: FileCheck2 },
      { title: "Bills", href: "/bills", icon: Receipt },
      { title: "Vendor Submissions", href: "/vendor-submissions", icon: FileCheck2 },
      { title: "Vendor Credits", href: "/vendor-credits", icon: Repeat2 },
      { title: "Expenses", href: "/expenses", icon: WalletCards },
      { title: "Payments Made", href: "/payments/made", icon: CreditCard },
      { title: "Payables", href: "/payables", icon: TrendingDown },
      { title: "Vendor Statement", href: "/reports/vendor-statement", icon: FileBarChart }
    ]
  },
  {
    label: "Banking",
    items: [
      { title: "Overview", href: "/banking", icon: Landmark },
      { title: "Transactions", href: "/banking/transactions", icon: Activity },
      { title: "Import Statements", href: "/banking/import", icon: Upload },
      { title: "Bank Accounts", href: "/bank-accounts", icon: Landmark },
      { title: "Reconciliation", href: "/banking/reconciliation", icon: GitMerge },
      { title: "Settlements", href: "/banking/settlements", icon: CircleDollarSign },
      { title: "Rules", href: "/banking/rules", icon: ListChecks }
    ]
  },
  {
    label: "Money",
    items: [
      { title: "Chart of Accounts", href: "/chart-of-accounts", icon: BookOpen },
      { title: "Manual Journals", href: "/journal-entries", icon: Calculator },
      { title: "General Ledger", href: "/reports/general-ledger", icon: BookOpen },
      { title: "Day Book", href: "/reports/day-book", icon: Activity },
      { title: "Budgets", href: "/budgets", icon: WalletCards },
      { title: "Fixed Assets", href: "/fixed-assets", icon: Briefcase }
    ]
  },
  {
    label: "Inventory",
    items: [
      { title: "Items", href: "/inventory", icon: Package },
      { title: "Item Categories", href: "/inventory/categories", icon: FolderTree },
      { title: "Warehouses", href: "/inventory/warehouses", icon: Warehouse },
      { title: "Adjustments", href: "/inventory/adjustments", icon: Calculator },
      { title: "Transfers", href: "/inventory/transfers", icon: Shuffle }
    ]
  },
  {
    label: "Taxes",
    items: [
      { title: "GST Command Center", href: "/tax/gst-command-center", icon: ShieldCheck },
      {
        title: "GST Returns",
        icon: Receipt,
        children: [
          { title: "GSTR-1", href: "/reports/gstr-1", icon: Receipt },
          { title: "GSTR-3B", href: "/reports/gstr-3b", icon: Tags },
          { title: "GSTR-2B Recon", href: "/tax/gstr2b", icon: GitMerge },
          { title: "GST Summary", href: "/reports/gst-summary", icon: BarChart3 },
          { title: "GST Parity", href: "/reports/gst-parity", icon: Tags }
        ]
      }
    ]
  },
  {
    label: "Reports",
    items: [
      { title: "All Reports", href: "/reports", icon: FileBarChart },
      { title: "Trial Balance", href: "/reports/trial-balance", icon: BookOpen },
      { title: "P&L", href: "/reports/profit-loss", icon: BarChart3 },
      { title: "Balance Sheet", href: "/reports/balance-sheet", icon: LineChart },
      { title: "Cash Flow", href: "/reports/cash-flow", icon: TrendingUp },
      { title: "FX Revaluation", href: "/reports/fx-revaluation", icon: Globe },
      { title: "Aging", href: "/reports/aging", icon: Repeat2 },
      { title: "Sales Register", href: "/reports/sales-register", icon: TrendingUp },
      { title: "Purchase Register", href: "/reports/purchase-register", icon: TrendingDown },
      { title: "Stock Valuation", href: "/reports/stock-valuation", icon: Package },
      { title: "Budget vs Actual", href: "/reports/budget-vs-actual", icon: WalletCards },
      { title: "Project P&L", href: "/reports/project-profitability", icon: Boxes },
      { title: "Unit Economics", href: "/reports/unit-economics", icon: BarChart3 },
      { title: "Cost Intelligence", href: "/reports/cost-intelligence", icon: TrendingDown }
    ]
  },
  {
    label: "Automation",
    items: [
      { title: "Recurring", href: "/recurring", icon: Repeat2 },
      { title: "OCR Inbox", href: "/ocr-bills", icon: ScanText },
      { title: "Document Vault", href: "/documents/vault", icon: FolderOpen },
      { title: "Migration Center", href: "/documents/migration-center", icon: Upload },
      { title: "Imports", href: "/imports", icon: Globe },
      { title: "Projects", href: "/projects", icon: Boxes },
      { title: "Time Tracking", href: "/time-tracking", icon: Activity }
    ]
  },
  {
    label: "Settings",
    items: [{ title: "Settings", href: "/settings", icon: ShieldCheck }]
  }
];

const money = (value: number) => value;
const today = todayISO();
const dueSoon = addDaysISO(10);

const contactFields: FormField[] = [
  { name: "display_name", label: "Display name", type: "text", required: true },
  { name: "company_name", label: "Company", type: "text" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "tax_id", label: "GSTIN", type: "text" },
  { name: "pan", label: "PAN", type: "text" },
  { name: "state_code", label: "State code", type: "text" },
  { name: "currency", label: "Currency", type: "select", options: [{ label: "INR", value: "INR" }, { label: "USD", value: "USD" }, { label: "EUR", value: "EUR" }] },
  { name: "payment_terms", label: "Payment terms", type: "number" },
  { name: "opening_balance", label: "Opening balance", type: "money" },
  { name: "notes", label: "Notes", type: "textarea" }
];

const documentFields: FormField[] = [
  { name: "contact_id", label: "Contact ID", type: "text", required: true },
  { name: "issue_date", label: "Issue date", type: "date", required: true },
  { name: "due_date", label: "Due date", type: "date", required: true },
  { name: "subtotal", label: "Subtotal", type: "money", required: true },
  { name: "tax_total", label: "Tax", type: "money" },
  { name: "discount_total", label: "Discount", type: "money" },
  { name: "place_of_supply", label: "Place of supply", type: "text" },
  { name: "total", label: "Total", type: "money", required: true },
  { name: "notes", label: "Notes", type: "textarea" }
];

const invoiceDocumentFields: FormField[] = [...documentFields, { name: "round_off", label: "Round off", type: "money" }];

export const moduleConfigs: Record<string, ModuleConfig> = {
  customers: {
    key: "customers",
    title: "Customers",
    entityName: "customer",
    description: "Manage receivables contacts, statements, limits, and payment terms.",
    apiPath: "/api/v1/customers",
    newPath: "/customers/new",
    detailBasePath: "/customers",
    primaryAction: "New customer",
    columns: [
      { key: "display_name", label: "Customer" },
      { key: "email", label: "Email" },
      { key: "currency", label: "Currency", align: "center" },
      { key: "outstanding", label: "Outstanding", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "cust-1", display_name: "Northstar Labs", email: "ap@northstar.example", currency: "USD", outstanding: money(12840), status: "active" },
      { id: "cust-2", display_name: "Greenline Foods", email: "finance@greenline.example", currency: "USD", outstanding: money(6420), status: "active" },
      { id: "cust-3", display_name: "Aarav Textiles", email: "accounts@aarav.example", currency: "INR", outstanding: money(232000), status: "active" }
    ],
    formFields: contactFields
  },
  vendors: {
    key: "vendors",
    title: "Vendors",
    entityName: "vendor",
    description: "Track supplier terms, bills, tax registrations, and payables.",
    apiPath: "/api/v1/vendors",
    newPath: "/vendors/new",
    detailBasePath: "/vendors",
    primaryAction: "New vendor",
    columns: [
      { key: "display_name", label: "Vendor" },
      { key: "email", label: "Email" },
      { key: "currency", label: "Currency", align: "center" },
      { key: "balance", label: "Balance", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "ven-1", display_name: "LedgerWorks Advisory", email: "billing@ledgerworks.example", currency: "USD", balance: money(4200), status: "active" },
      { id: "ven-2", display_name: "Metro Cloud Hosting", email: "billing@metrocloud.example", currency: "USD", balance: money(1180), status: "active" }
    ],
    formFields: contactFields
  },
  invoices: {
    key: "invoices",
    title: "Invoices",
    entityName: "invoice",
    description: "Create, send, duplicate, collect, and age customer invoices.",
    apiPath: "/api/v1/invoices",
    newPath: "/invoices/new",
    detailBasePath: "/invoices",
    primaryAction: "New",
    secondaryActions: [{ label: "Recurring Invoice", href: "/recurring/new" }],
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "invoice_number", label: "Invoice#" },
      { key: "order_number", label: "Order Number" },
      { key: "customer_name", label: "Customer Name" },
      { key: "status", label: "Status", kind: "status" },
      { key: "due_date", label: "Due Date", kind: "date" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "balance_due", label: "Balance Due", kind: "money", align: "right" },
      { key: "location", label: "Location" }
    ],
    rows: [
      { id: "inv-1", date: today, invoice_number: "INV-0001", order_number: "", customer_name: "Northstar Labs", status: "partial", due_date: dueSoon, total: money(7200), balance_due: money(3200), location: "Main WH" }
    ],
    formFields: invoiceDocumentFields
  },
  quotations: {
    key: "quotations",
    title: "Quotes",
    entityName: "quote",
    description: "Prepare estimates, expiry-based proposals, and convert-ready sales quotes.",
    apiPath: "/api/v1/quotations",
    newPath: "/quotations/new",
    detailBasePath: "/quotations",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "quotation_number", label: "Quote Number" },
      { key: "reference_number", label: "Reference Number" },
      { key: "customer_name", label: "Customer Name" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Amount", kind: "money", align: "right" }
    ],
    rows: [{ id: "qt-1", date: today, location: "Main WH", quotation_number: "QT-00001", reference_number: "", customer_name: "Sample Customer", status: "draft", total: money(20) }],
    formFields: []
  },
  "sales-orders": {
    key: "sales-orders",
    title: "Sales Orders",
    entityName: "sales order",
    description: "Track committed sales, fulfillment staging, and order conversion into invoices.",
    apiPath: "/api/v1/sales-orders",
    newPath: "/sales-orders/new",
    detailBasePath: "/sales-orders",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "sales_order_number", label: "Sales Order#" },
      { key: "reference_number", label: "Reference#" },
      { key: "customer_name", label: "Customer Name" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "shipment_date", label: "Expected Shipment", kind: "date" },
      { key: "delivery_method", label: "Delivery Method" }
    ],
    rows: [{ id: "so-1", date: today, location: "Main WH", sales_order_number: "SO-00001", reference_number: "", customer_name: "Sample Customer", status: "draft", total: money(20), shipment_date: dueSoon, delivery_method: "" }],
    formFields: [
      { name: "contact_id", label: "Customer ID", type: "text", required: true },
      { name: "issue_date", label: "Order date", type: "date", required: true },
      { name: "due_date", label: "Expected delivery", type: "date", required: true },
      { name: "subtotal", label: "Subtotal", type: "money", required: true },
      { name: "tax_total", label: "Tax", type: "money" },
      { name: "total", label: "Total", type: "money", required: true },
      { name: "status", label: "Status", type: "select", options: [{ label: "Draft", value: "draft" }, { label: "Confirmed", value: "confirmed" }, { label: "Fulfilled", value: "fulfilled" }] },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  bills: {
    key: "bills",
    title: "Bills",
    entityName: "bill",
    description: "Approve vendor bills, schedule payments, and keep AP aging current.",
    apiPath: "/api/v1/bills",
    newPath: "/bills/new",
    detailBasePath: "/bills",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "bill_number", label: "Bill#" },
      { key: "reference_number", label: "Reference Number" },
      { key: "vendor_name", label: "Vendor Name" },
      { key: "status", label: "Status", kind: "status" },
      { key: "due_date", label: "Due Date", kind: "date" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "balance_due", label: "Balance Due", kind: "money", align: "right" }
    ],
    rows: [
      { id: "bill-1", date: today, location: "Main WH", bill_number: "BILL-00001", reference_number: "", vendor_name: "Metro Cloud Hosting", due_date: dueSoon, total: money(1180), balance_due: money(1180), status: "open" }
    ],
    formFields: documentFields
  },
  "purchase-orders": {
    key: "purchase-orders",
    title: "Purchase Orders",
    entityName: "purchase order",
    description: "Control vendor commitments, approvals, and expected receipt schedules.",
    apiPath: "/api/v1/purchase-orders",
    newPath: "/purchase-orders/new",
    detailBasePath: "/purchase-orders",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "purchase_order_number", label: "Purchase Order#" },
      { key: "reference_number", label: "Reference#" },
      { key: "vendor_name", label: "Vendor Name" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "delivery_date", label: "Delivery Date", kind: "date" }
    ],
    rows: [{ id: "po-1", date: today, location: "Main WH", purchase_order_number: "PO-00001", reference_number: "", vendor_name: "Sample Vendor", status: "draft", total: money(185), delivery_date: dueSoon }],
    formFields: [
      { name: "contact_id", label: "Vendor ID", type: "text", required: true },
      { name: "issue_date", label: "PO date", type: "date", required: true },
      { name: "due_date", label: "Expected date", type: "date", required: true },
      { name: "subtotal", label: "Subtotal", type: "money", required: true },
      { name: "tax_total", label: "Tax", type: "money" },
      { name: "total", label: "Total", type: "money", required: true },
      { name: "status", label: "Status", type: "select", options: [{ label: "Draft", value: "draft" }, { label: "Issued", value: "issued" }, { label: "Received", value: "received" }, { label: "Billed", value: "billed" }, { label: "Cancelled", value: "cancelled" }] },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  "credit-notes": {
    key: "credit-notes",
    title: "Credit Notes",
    entityName: "credit note",
    description: "Issue sales returns, reference original invoices, and reduce customer outstanding cleanly.",
    apiPath: "/api/v1/credit-notes",
    newPath: "/credit-notes/new",
    detailBasePath: "/credit-notes",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "credit_note_number", label: "Credit Note#" },
      { key: "reference_number", label: "Reference Number" },
      { key: "customer_name", label: "Customer Name" },
      { key: "invoice_no", label: "Invoice#" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "balance", label: "Balance", kind: "money", align: "right" }
    ],
    rows: [{ id: "cn-1", date: today, location: "Main WH", credit_note_number: "CN-00001", reference_number: "", customer_name: "Sample Customer", invoice_no: "", status: "draft", total: money(10), balance: money(10) }],
    formFields: [
      { name: "contact_id", label: "Customer ID", type: "text", required: true },
      { name: "invoice_id", label: "Original invoice ID", type: "text" },
      { name: "issue_date", label: "Date", type: "date", required: true },
      { name: "due_date", label: "Applies by", type: "date", required: true },
      { name: "subtotal", label: "Subtotal", type: "money", required: true },
      { name: "tax_total", label: "Tax", type: "money" },
      { name: "total", label: "Total", type: "money", required: true },
      { name: "status", label: "Status", type: "select", options: [{ label: "Draft", value: "draft" }, { label: "Issued", value: "issued" }, { label: "Applied", value: "applied" }] },
      { name: "notes", label: "Reason", type: "textarea" }
    ]
  },
  "vendor-credits": {
    key: "vendor-credits",
    title: "Vendor Credits",
    entityName: "vendor credit",
    description: "Capture supplier debit notes and reduce AP balances — apply against bills or record refunds after returns or disputes.",
    apiPath: "/api/v1/vendor-credits",
    newPath: "/vendor-credits/new",
    detailBasePath: "/vendor-credits",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "vendor_credit_number", label: "Vendor Credit#" },
      { key: "reference_number", label: "Reference Number" },
      { key: "vendor_name", label: "Vendor Name" },
      { key: "bill_no", label: "Bill#" },
      { key: "status", label: "Status", kind: "status" },
      { key: "total", label: "Amount", kind: "money", align: "right" },
      { key: "balance", label: "Balance", kind: "money", align: "right" }
    ],
    rows: [{ id: "vc-1", date: today, vendor_credit_number: "VC-00001", reference_number: "", vendor_name: "Sample Vendor", bill_no: "", status: "open", total: money(2400), balance: money(2400) }],
    formFields: [
      { name: "contact_id", label: "Vendor ID", type: "text", required: true },
      { name: "bill_id", label: "Related bill ID", type: "text" },
      { name: "issue_date", label: "Date", type: "date", required: true },
      { name: "subtotal", label: "Subtotal", type: "money", required: true },
      { name: "tax_total", label: "Tax", type: "money" },
      { name: "total", label: "Total", type: "money", required: true },
      { name: "status", label: "Status", type: "select", options: [{ label: "Draft", value: "draft" }, { label: "Open", value: "open" }, { label: "Closed", value: "closed" }, { label: "Void", value: "void" }] },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  "payments-received": {
    key: "payments-received",
    title: "Payments Received",
    entityName: "payment",
    description: "Allocate receipts against invoices or keep advances unapplied.",
    apiPath: "/api/v1/payments/received",
    newPath: "/payments/received/new",
    detailBasePath: "/payments/received",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "payment_number", label: "Payment#" },
      { key: "reference", label: "Reference Number" },
      { key: "customer_name", label: "Customer Name" },
      { key: "invoice_no", label: "Invoice#" },
      { key: "mode", label: "Mode" },
      { key: "amount", label: "Amount", kind: "money", align: "right" },
      { key: "unused_amount", label: "Unused Amount", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "pay-1", date: today, location: "Main WH", payment_number: "PR-00001", reference: "", customer_name: "Northstar Labs", invoice_no: "INV-0001", mode: "Cash", amount: money(4000), unused_amount: money(0), status: "paid" }
    ],
    formFields: []
  },
  "payments-made": {
    key: "payments-made",
    title: "Payments Made",
    entityName: "payment",
    description: "Record vendor payments and reconcile them to bank activity.",
    apiPath: "/api/v1/payments/made",
    newPath: "/payments/made/new",
    detailBasePath: "/payments/made",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "location", label: "Location" },
      { key: "payment_number", label: "Payment#" },
      { key: "reference", label: "Reference Number" },
      { key: "vendor_name", label: "Vendor Name" },
      { key: "bill_no", label: "Bill#" },
      { key: "mode", label: "Mode" },
      { key: "amount", label: "Amount", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "paym-1", date: today, location: "Main WH", payment_number: "PM-00001", reference: "", vendor_name: "LedgerWorks Advisory", bill_no: "BILL-00001", mode: "Cash", amount: money(2100), status: "posted" }
    ],
    formFields: []
  },
  expenses: {
    key: "expenses",
    title: "Expenses",
    entityName: "expense",
    description: "Capture receipts, tax, billable flags, and automatic journal entries.",
    apiPath: "/api/v1/expenses",
    newPath: "/expenses/new",
    detailBasePath: "/expenses",
    primaryAction: "New",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "account_name", label: "Expense Account" },
      { key: "reference", label: "Reference#" },
      { key: "vendor_name", label: "Vendor" },
      { key: "customer_name", label: "Customer" },
      { key: "billable_label", label: "Billable" },
      { key: "amount", label: "Amount", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "exp-1", date: today, account_name: "Travel", reference: "", vendor_name: "—", customer_name: "—", billable_label: "Non-billable", amount: money(640), status: "posted" }
    ],
    formFields: [
      { name: "expense_date", label: "Date", type: "date", required: true },
      { name: "description", label: "Description", type: "text", required: true },
      { name: "account_id", label: "Expense account ID", type: "text", required: true },
      { name: "amount", label: "Amount", type: "money", required: true },
      { name: "tax_amount", label: "Tax", type: "money" },
      { name: "is_billable", label: "Billable", type: "checkbox" }
    ]
  },
  "journal-entries": {
    key: "journal-entries",
    title: "Manual Journals",
    entityName: "journal",
    description: "Post balanced double-entry journals with reference, notes, contacts, and audit history.",
    apiPath: "/api/v1/journal-entries",
    newPath: "/journal-entries/new",
    detailBasePath: "/journal-entries",
    primaryAction: "New Journal",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "entry_number", label: "Journal#" },
      { key: "reference_number", label: "Reference#" },
      { key: "memo", label: "Notes" },
      { key: "amount", label: "Amount", kind: "money", align: "right" },
      { key: "display_status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "je-1", date: today, entry_number: "JE-00001", reference_number: "", memo: "Monthly payroll accrual", amount: money(9500), display_status: "published" }
    ],
    formFields: [
      { name: "entry_date", label: "Date", type: "date", required: true },
      { name: "memo", label: "Notes", type: "textarea", required: true },
      { name: "status", label: "Status", type: "select", options: [{ label: "Draft", value: "draft" }, { label: "Published", value: "posted" }] }
    ]
  },
  "chart-of-accounts": {
    key: "chart-of-accounts",
    title: "Chart of Accounts",
    entityName: "account",
    description: "Maintain the account tree, account types, and running balances.",
    apiPath: "/api/v1/accounts",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Account" },
      { key: "account_type", label: "Type", kind: "status" },
      { key: "balance", label: "Balance", kind: "money", align: "right" },
      { key: "is_active", label: "Active", kind: "boolean", align: "center" }
    ],
    rows: [
      { id: "acc-1", code: "1000", name: "Operating Bank", account_type: "bank", balance: money(88420), is_active: true },
      { id: "acc-2", code: "1200", name: "Accounts Receivable", account_type: "accounts_receivable", balance: money(24120), is_active: true },
      { id: "acc-3", code: "2000", name: "Accounts Payable", account_type: "accounts_payable", balance: money(3280), is_active: true },
      { id: "acc-4", code: "4000", name: "Consulting Revenue", account_type: "revenue", balance: money(143800), is_active: true }
    ],
    formFields: []
  },
  "bank-accounts": {
    key: "bank-accounts",
    title: "Bank Accounts",
    entityName: "bank account",
    description: "Import statements, match transactions, and reconcile balances.",
    apiPath: "/api/v1/bank-accounts",
    columns: [
      { key: "name", label: "Account" },
      { key: "institution_name", label: "Institution" },
      { key: "currency", label: "Currency", align: "center" },
      { key: "current_balance", label: "Balance", kind: "money", align: "right" },
      { key: "is_active", label: "Active", kind: "boolean", align: "center" }
    ],
    rows: [
      { id: "bank-1", name: "Operating Account", institution_name: "First Harbor Bank", currency: "USD", current_balance: money(88420), is_active: true },
      { id: "bank-2", name: "Tax Reserve", institution_name: "First Harbor Bank", currency: "USD", current_balance: money(14150), is_active: true }
    ],
    formFields: []
  },
  imports: {
    key: "imports",
    title: "Imports",
    entityName: "import job",
    description: "Bring in Tally, Zoho Books, CSV, and bank statement exports with processing history.",
    apiPath: "/api/v1/imports",
    newPath: "/imports/new",
    primaryAction: "New import",
    columns: [
      { key: "created_at", label: "Created", kind: "date" },
      { key: "source_type", label: "Source" },
      { key: "entity_type", label: "Entity" },
      { key: "imported_rows", label: "Imported", kind: "number", align: "right" },
      { key: "failed_rows", label: "Failed", kind: "number", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "imp-1", created_at: today, source_type: "tally", entity_type: "customers", imported_rows: 24, failed_rows: 0, status: "completed" },
      { id: "imp-2", created_at: "2026-04-19", source_type: "bank_statement", entity_type: "bank_transactions", imported_rows: 38, failed_rows: 2, status: "completed" }
    ],
    formFields: [
      {
        name: "source_type",
        label: "Source",
        type: "select",
        required: true,
        options: [
          { label: "CSV", value: "csv" },
          { label: "Tally", value: "tally" },
          { label: "Zoho Books", value: "zoho_books" },
          { label: "Bank Statement", value: "bank_statement" }
        ]
      },
      {
        name: "entity_type",
        label: "Entity",
        type: "select",
        required: true,
        options: [
          { label: "Customers", value: "customers" },
          { label: "Vendors", value: "vendors" },
          { label: "Invoices", value: "invoices" },
          { label: "Bills", value: "bills" },
          { label: "Payments", value: "payments" },
          { label: "Bank Transactions", value: "bank_transactions" }
        ]
      },
      { name: "file_name", label: "File name", type: "text" },
      { name: "bank_account_id", label: "Bank account ID", type: "text" },
      { name: "payload_text", label: "CSV or JSON payload", type: "textarea", required: true },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  "ocr-bills": {
    key: "ocr-bills",
    title: "OCR Bills",
    entityName: "OCR document",
    description: "Paste OCR output from supplier invoices, extract fields, and convert it into draft bills.",
    apiPath: "/api/v1/ocr/documents",
    newPath: "/ocr-bills/new",
    primaryAction: "New OCR draft",
    columns: [
      { key: "created_at", label: "Created", kind: "date" },
      { key: "source_name", label: "Source" },
      { key: "document_type", label: "Type" },
      { key: "vendor_name", label: "Vendor" },
      { key: "total", label: "Total", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "ocr-1", created_at: today, source_name: "Metro April bill scan", document_type: "bill", vendor_name: "Metro Cloud Hosting", total: money(1180), status: "parsed" }
    ],
    formFields: [
      {
        name: "document_type",
        label: "Document type",
        type: "select",
        required: true,
        options: [
          { label: "Bill", value: "bill" },
          { label: "Invoice", value: "invoice" }
        ]
      },
      { name: "source_name", label: "Source name", type: "text", required: true },
      { name: "source_text", label: "OCR text", type: "textarea", required: true },
      { name: "notes", label: "Notes", type: "textarea" }
    ]
  },
  "period-locks": {
    key: "period-locks",
    title: "Period Locks",
    entityName: "period lock",
    description: "Lock accounting periods after close to prevent back-dated edits across sales, purchases, banking, and journals.",
    apiPath: "/api/v1/period-locks",
    newPath: "/period-locks/new",
    primaryAction: "Lock period",
    columns: [
      { key: "start_date", label: "Start", kind: "date" },
      { key: "end_date", label: "End", kind: "date" },
      { key: "lock_scope", label: "Scope" },
      { key: "reason", label: "Reason" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "lock-1", start_date: "2026-03-01", end_date: "2026-03-31", lock_scope: "all", reason: "March close", status: "active" }
    ],
    formFields: [
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
      {
        name: "lock_scope",
        label: "Scope",
        type: "select",
        required: true,
        options: [
          { label: "All", value: "all" },
          { label: "Sales", value: "sales" },
          { label: "Purchases", value: "purchases" },
          { label: "Banking", value: "banking" },
          { label: "Journals", value: "journals" }
        ]
      },
      { name: "reason", label: "Reason", type: "textarea" },
      { name: "is_active", label: "Active", type: "checkbox" }
    ]
  },
  budgets: {
    key: "budgets",
    title: "Budgets",
    entityName: "budget",
    description: "Plan annual spend by account — company-wide or by department/division — and monitor variance against actuals.",
    apiPath: "/api/v1/budgets",
    newPath: "/budgets/new",
    detailBasePath: "/budgets",
    primaryAction: "New Budget",
    columns: [
      { key: "name", label: "Budget" },
      { key: "fiscal_year", label: "Fiscal Year", align: "center" },
      { key: "period", label: "Period", kind: "status" },
      { key: "department_name", label: "Department / Division" },
      { key: "total_amount", label: "Total", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "bud-1", name: "FY Operating Budget", fiscal_year: 2026, period: "monthly", department_name: "Company-wide", total_amount: money(420000), status: "active" }
    ],
    formFields: []
  },
  "fixed-assets": {
    key: "fixed-assets",
    title: "Fixed Assets",
    entityName: "asset",
    description: "Track asset purchases, depreciation schedules, disposals, and book value.",
    apiPath: "/api/v1/fixed-assets",
    newPath: "/fixed-assets/new",
    primaryAction: "New asset",
    columns: [
      { key: "asset_number", label: "Asset" },
      { key: "name", label: "Name" },
      { key: "purchase_cost", label: "Cost", kind: "money", align: "right" },
      { key: "book_value", label: "Book value", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "fa-1", asset_number: "FA-0001", name: "MacBook Pro fleet", purchase_cost: money(18600), book_value: money(15500), status: "active" }
    ],
    formFields: []
  },
  inventory: {
    key: "inventory",
    title: "Items",
    entityName: "item",
    description: "Maintain goods and services with their sales and purchase pricing.",
    apiPath: "/api/v1/inventory",
    newPath: "/inventory/new",
    detailBasePath: "/inventory",
    primaryAction: "New Item",
    columns: [
      { key: "name", label: "Name" },
      { key: "sku", label: "Item Code" },
      { key: "type_label", label: "Type" },
      { key: "category", label: "Category" },
      { key: "subcategory", label: "Sub Category" },
      { key: "purchase_price", label: "Purchase Rate", kind: "money", align: "right" },
      { key: "sales_price", label: "Rate", kind: "money", align: "right" },
      { key: "unit", label: "Usage Unit" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "item-1", name: "Consulting hour", sku: "SVC-CONSULT", type_label: "Service", category: "Services", subcategory: "Advisory", purchase_price: money(0), sales_price: money(180), unit: "hour", status: "Active" },
      { id: "item-2", name: "Implementation kit", sku: "KIT-IMPL", type_label: "Inventory", category: "Hardware", subcategory: "Kits", purchase_price: money(620), sales_price: money(950), unit: "pcs", status: "Active" }
    ],
    formFields: []
  },
  projects: {
    key: "projects",
    title: "Projects",
    entityName: "project",
    description: "Track budgets, billable work, expenses, and profitability by project.",
    apiPath: "/api/v1/projects",
    columns: [
      { key: "name", label: "Project" },
      { key: "customer", label: "Customer" },
      { key: "budget_amount", label: "Budget", kind: "money", align: "right" },
      { key: "profitability", label: "Profitability", kind: "money", align: "right" },
      { key: "status", label: "Status", kind: "status" }
    ],
    rows: [
      { id: "proj-1", name: "Northstar rollout", customer: "Northstar Labs", budget_amount: money(52000), profitability: money(18400), status: "active" }
    ],
    formFields: []
  },
  "time-tracking": {
    key: "time-tracking",
    title: "Time Tracking",
    entityName: "time entry",
    description: "Log project hours, mark billable work, and keep timesheet billing readiness visible.",
    apiPath: "/api/v1/time-entries",
    newPath: "/time-tracking/new",
    primaryAction: "Log time",
    columns: [
      { key: "work_date", label: "Date", kind: "date" },
      { key: "project_id", label: "Project" },
      { key: "description", label: "Description" },
      { key: "hours", label: "Hours", kind: "number", align: "right" },
      { key: "rate", label: "Rate", kind: "money", align: "right" },
      { key: "is_billable", label: "Billable", kind: "boolean", align: "center" }
    ],
    rows: [{ id: "time-1", work_date: today, project_id: "proj-1", description: "Discovery workshop and GST workflow mapping", hours: 6.5, rate: money(1800), is_billable: true }],
    formFields: [
      { name: "project_id", label: "Project ID", type: "text", required: true },
      { name: "work_date", label: "Work date", type: "date", required: true },
      { name: "hours", label: "Hours", type: "number", required: true },
      { name: "rate", label: "Billable rate", type: "money" },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "is_billable", label: "Billable", type: "checkbox" },
      { name: "is_billed", label: "Already billed", type: "checkbox" }
    ]
  },
  taxes: {
    key: "taxes",
    title: "Taxes",
    entityName: "tax rate",
    description: "Configure collected and recoverable tax rates, including compound tax.",
    apiPath: "/api/v1/taxes",
    columns: [
      { key: "name", label: "Tax" },
      { key: "rate", label: "Rate", kind: "number", align: "right" },
      { key: "tax_type", label: "Type" },
      { key: "is_compound", label: "Compound", kind: "boolean", align: "center" },
      { key: "is_active", label: "Active", kind: "boolean", align: "center" }
    ],
    rows: [
      { id: "tax-1", name: "GST 5%", rate: 5, tax_type: "GST", is_compound: false, is_active: true },
      { id: "tax-2", name: "VAT 20%", rate: 20, tax_type: "VAT", is_compound: false, is_active: true }
    ],
    formFields: []
  },
  currencies: {
    key: "currencies",
    title: "Currencies",
    entityName: "currency",
    description: "Manage enabled transaction currencies and decimal precision.",
    apiPath: "/api/v1/currencies",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "symbol", label: "Symbol", align: "center" },
      { key: "decimal_places", label: "Decimals", kind: "number", align: "right" }
    ],
    rows: [
      { id: "USD", code: "USD", name: "US Dollar", symbol: "$", decimal_places: 2 },
      { id: "INR", code: "INR", name: "Indian Rupee", symbol: "Rs", decimal_places: 2 },
      { id: "EUR", code: "EUR", name: "Euro", symbol: "EUR", decimal_places: 2 }
    ],
    formFields: []
  }
};

export function getModuleConfig(key: string) {
  const config = moduleConfigs[key];
  if (!config) {
    throw new Error(`Unknown module: ${key}`);
  }
  return config;
}
