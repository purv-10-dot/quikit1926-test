import type { TableRow } from "@/lib/modules";

export type ReportConfig = {
  key: string;
  title: string;
  description: string;
  apiPath: string;
  columns: { key: string; label: string; kind?: "text" | "money" | "number" }[];
  rows: TableRow[];
  summary: { label: string; value: number; tone: "good" | "warn" | "neutral"; kind?: "money" | "number" | "percent" }[];
};

export const reportConfigs: Record<string, ReportConfig> = {
  "profit-loss": {
    key: "profit-loss",
    title: "Profit & Loss",
    description: "Revenue, cost of goods sold, expenses, and net income for the selected period.",
    apiPath: "/api/v1/reports/profit-loss",
    columns: [
      { key: "account", label: "Account" },
      { key: "current", label: "Current", kind: "money" },
      { key: "comparison", label: "Comparison", kind: "money" },
      { key: "variance", label: "Variance", kind: "money" }
    ],
    rows: [
      { id: "pl-1", account: "Consulting Revenue", current: 143800, comparison: 118400, variance: 25400 },
      { id: "pl-2", account: "Cost of Goods Sold", current: 38400, comparison: 31200, variance: 7200 },
      { id: "pl-3", account: "Operating Expenses", current: 57800, comparison: 52600, variance: 5200 }
    ],
    summary: [
      { label: "Revenue", value: 143800, tone: "good" },
      { label: "Net income", value: 47600, tone: "good" },
      { label: "Margin", value: 33.1, tone: "neutral", kind: "percent" }
    ]
  },
  "balance-sheet": {
    key: "balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity as of the selected date.",
    apiPath: "/api/v1/reports/balance-sheet",
    columns: [
      { key: "section", label: "Section" },
      { key: "account", label: "Account" },
      { key: "amount", label: "Amount", kind: "money" }
    ],
    rows: [
      { id: "bs-1", section: "Assets", account: "Cash and Bank", amount: 102570 },
      { id: "bs-2", section: "Assets", account: "Accounts Receivable", amount: 24120 },
      { id: "bs-3", section: "Liabilities", account: "Accounts Payable", amount: 3280 },
      { id: "bs-4", section: "Equity", account: "Retained Earnings", amount: 123410 }
    ],
    summary: [
      { label: "Assets", value: 126690, tone: "neutral" },
      { label: "Liabilities", value: 3280, tone: "warn" },
      { label: "Equity", value: 123410, tone: "good" }
    ]
  },
  "trial-balance": {
    key: "trial-balance",
    title: "Trial Balance",
    description: "Debit and credit totals by account, balanced for the selected period.",
    apiPath: "/api/v1/reports/trial-balance",
    columns: [
      { key: "account", label: "Account" },
      { key: "debit", label: "Debit", kind: "money" },
      { key: "credit", label: "Credit", kind: "money" }
    ],
    rows: [
      { id: "tb-1", account: "Cash and Bank", debit: 102570, credit: 0 },
      { id: "tb-2", account: "Revenue", debit: 0, credit: 143800 },
      { id: "tb-3", account: "Expenses", debit: 57800, credit: 0 }
    ],
    summary: [
      { label: "Debits", value: 160370, tone: "neutral" },
      { label: "Credits", value: 160370, tone: "neutral" },
      { label: "Difference", value: 0, tone: "good" }
    ]
  },
  "cash-flow": {
    key: "cash-flow",
    title: "Cash Flow",
    description: "Operating, investing, and financing movements over the selected period.",
    apiPath: "/api/v1/reports/cash-flow",
    columns: [
      { key: "activity", label: "Activity" },
      { key: "amount", label: "Amount", kind: "money" }
    ],
    rows: [
      { id: "cf-1", activity: "Operating cash flow", amount: 38200 },
      { id: "cf-2", activity: "Investing cash flow", amount: -8600 },
      { id: "cf-3", activity: "Financing cash flow", amount: 0 }
    ],
    summary: [
      { label: "Net cash flow", value: 29600, tone: "good" },
      { label: "Opening cash", value: 72970, tone: "neutral" },
      { label: "Closing cash", value: 102570, tone: "good" }
    ]
  },
  aging: {
    key: "aging",
    title: "Aging",
    description: "Receivables and payables grouped by overdue bucket.",
    apiPath: "/api/v1/reports/aging",
    columns: [
      { key: "contact", label: "Contact" },
      { key: "current", label: "Current", kind: "money" },
      { key: "days_30", label: "1-30", kind: "money" },
      { key: "days_60", label: "31-60", kind: "money" },
      { key: "days_90", label: "90+", kind: "money" }
    ],
    rows: [
      { id: "age-1", contact: "Northstar Labs", current: 3200, days_30: 0, days_60: 0, days_90: 0 },
      { id: "age-2", contact: "Aarav Textiles", current: 0, days_30: 232000, days_60: 0, days_90: 0 }
    ],
    summary: [
      { label: "Current", value: 3200, tone: "neutral" },
      { label: "Overdue", value: 232000, tone: "warn" },
      { label: "Collection risk", value: 21.4, tone: "warn", kind: "percent" }
    ]
  },
  "gst-summary": {
    key: "gst-summary",
    title: "GST Summary",
    description: "Output GST, input GST, and net GST payable for the selected period.",
    apiPath: "/api/v1/reports/gst-summary",
    columns: [
      { key: "bucket", label: "Bucket" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "tax_amount", label: "GST", kind: "money" },
      { key: "documents", label: "Documents", kind: "number" }
    ],
    rows: [
      { id: "gst-1", bucket: "Sales output GST", taxable_value: 342000, tax_amount: 41040, documents: 18 },
      { id: "gst-2", bucket: "Bills input GST", taxable_value: 118000, tax_amount: 14160, documents: 9 },
      { id: "gst-3", bucket: "Expenses input GST", taxable_value: 22000, tax_amount: 2640, documents: 14 }
    ],
    summary: [
      { label: "Output GST", value: 41040, tone: "warn" },
      { label: "Input GST", value: 16800, tone: "neutral" },
      { label: "Net payable", value: 24240, tone: "warn" }
    ]
  },
  "gst-parity": {
    key: "gst-parity",
    title: "GST Parity Checks",
    description: "Checks document GST capture against expected tax behavior and highlights missing-tax issues.",
    apiPath: "/api/v1/reports/gst-parity",
    columns: [
      { key: "check", label: "Check" },
      { key: "expected", label: "Expected", kind: "money" },
      { key: "actual", label: "Actual", kind: "money" },
      { key: "variance", label: "Variance", kind: "money" },
      { key: "status", label: "Status" }
    ],
    rows: [
      { id: "gp-1", check: "Sales GST parity", expected: 41040, actual: 41040, variance: 0, status: "aligned" },
      { id: "gp-2", check: "Input GST parity", expected: 16800, actual: 16280, variance: -520, status: "review" },
      { id: "gp-3", check: "Sales docs missing GST", expected: 0, actual: 1, variance: 1, status: "review" }
    ],
    summary: [
      { label: "Active GST rates", value: 3, tone: "good", kind: "number" },
      { label: "Checks flagged", value: 2, tone: "warn", kind: "number" },
      { label: "Default GST %", value: 12, tone: "neutral", kind: "percent" }
    ]
  },
  "gstr-1": {
    key: "gstr-1",
    title: "GSTR-1",
    description: "Outward supply preparation with B2B, B2CL, B2CS, credit note, and export-style buckets.",
    apiPath: "/api/v1/reports/gstr-1",
    columns: [
      { key: "section", label: "Section" },
      { key: "documents", label: "Documents", kind: "number" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "tax_amount", label: "GST", kind: "money" }
    ],
    rows: [
      { id: "gstr1-1", section: "B2B", documents: 12, taxable_value: 268000, tax_amount: 32160 },
      { id: "gstr1-2", section: "B2CL", documents: 2, taxable_value: 120000, tax_amount: 14400 },
      { id: "gstr1-3", section: "B2CS", documents: 7, taxable_value: 54000, tax_amount: 6480 }
    ],
    summary: [
      { label: "Taxable value", value: 442000, tone: "neutral" },
      { label: "GST collected", value: 53040, tone: "warn" },
      { label: "Documents", value: 21, tone: "good", kind: "number" }
    ]
  },
  "gstr-3b": {
    key: "gstr-3b",
    title: "GSTR-3B",
    description: "Net tax payable, ITC, and outward supply roll-up for filing-ready review.",
    apiPath: "/api/v1/reports/gstr-3b",
    columns: [
      { key: "line_item", label: "Line item" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "cgst", label: "CGST", kind: "money" },
      { key: "sgst", label: "SGST", kind: "money" },
      { key: "igst", label: "IGST", kind: "money" }
    ],
    rows: [
      { id: "gstr3b-1", line_item: "Outward taxable supplies", taxable_value: 342000, cgst: 10260, sgst: 10260, igst: 20520 },
      { id: "gstr3b-2", line_item: "Eligible ITC", taxable_value: 140000, cgst: 3540, sgst: 3540, igst: 7080 }
    ],
    summary: [
      { label: "Output GST", value: 41040, tone: "warn" },
      { label: "Eligible ITC", value: 14160, tone: "good" },
      { label: "Net payable", value: 26880, tone: "warn" }
    ]
  },
  outstanding: {
    key: "outstanding",
    title: "Outstanding",
    description: "Open receivables and payables for follow-up, collections, and payment planning.",
    apiPath: "/api/v1/reports/outstanding",
    columns: [
      { key: "type", label: "Type" },
      { key: "contact", label: "Contact" },
      { key: "document_number", label: "Document" },
      { key: "due_date", label: "Due date" },
      { key: "balance_due", label: "Balance", kind: "money" },
      { key: "status", label: "Status" }
    ],
    rows: [
      { id: "out-1", type: "Receivable", contact: "Northstar Labs", document_number: "INV-0001", due_date: "2026-04-30", balance_due: 3200, status: "partial" },
      { id: "out-2", type: "Payable", contact: "Metro Cloud Hosting", document_number: "BILL-0001", due_date: "2026-04-30", balance_due: 1180, status: "approved" }
    ],
    summary: [
      { label: "Receivables", value: 3200, tone: "good" },
      { label: "Payables", value: 1180, tone: "warn" },
      { label: "Documents open", value: 2, tone: "neutral", kind: "number" }
    ]
  }
};

export function getReportConfig(key: string) {
  const config = reportConfigs[key];
  if (!config) {
    throw new Error(`Unknown report: ${key}`);
  }
  return config;
}
