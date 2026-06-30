import type { ApiContext } from "@/lib/api/auth";
import type { ReportConfig } from "@/lib/reports";

type ContactLite = {
  id: string;
  display_name: string;
  tax_id?: string | null;
  state_code?: string | null;
};

type InvoiceLite = {
  id: string;
  contact_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance_due: number;
  status: string;
  place_of_supply?: string | null;
};

type BillLite = {
  id: string;
  contact_id: string;
  bill_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance_due: number;
  status: string;
  place_of_supply?: string | null;
};

type ExpenseLite = {
  id: string;
  expense_date: string;
  description: string;
  amount: number;
  tax_amount: number;
  status: string;
};

function matchesDateRange(date: string, from: string, to: string) {
  return date >= from && date <= to;
}

async function fetchContacts(context: ApiContext) {
  const { data, error } = await context.db.from("contacts").select("id, display_name, tax_id, state_code").eq("org_id", context.orgId);
  if (error) {
    throw new Error(error.message);
  }

  return new Map<string, ContactLite>(
    (data ?? []).map(
      (contact) =>
        [
          String(contact.id),
          {
            id: String(contact.id),
            display_name: String(contact.display_name ?? "Unknown"),
            tax_id: typeof contact.tax_id === "string" ? contact.tax_id : null,
            state_code: typeof contact.state_code === "string" ? contact.state_code : null
          }
        ] satisfies [string, ContactLite]
    )
  );
}

async function fetchInvoices(context: ApiContext) {
  const { data, error } = await context.db
    .from("invoices")
    .select("id, contact_id, invoice_number, issue_date, due_date, subtotal, tax_total, total, balance_due, status, place_of_supply")
    .eq("org_id", context.orgId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as InvoiceLite[];
}

async function fetchBills(context: ApiContext) {
  const { data, error } = await context.db
    .from("bills")
    .select("id, contact_id, bill_number, issue_date, due_date, subtotal, tax_total, total, balance_due, status, place_of_supply")
    .eq("org_id", context.orgId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as BillLite[];
}

async function fetchExpenses(context: ApiContext) {
  const { data, error } = await context.db
    .from("expenses")
    .select("id, expense_date, description, amount, tax_amount, status")
    .eq("org_id", context.orgId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as ExpenseLite[];
}

async function fetchTaxRates(context: ApiContext) {
  const { data, error } = await context.db.from("tax_rates").select("name, rate, tax_type, is_active").eq("org_id", context.orgId);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

async function fetchOrganization(context: ApiContext) {
  const { data, error } = await context.db.from("organizations").select("id, state_code").eq("id", context.orgId).single();
  if (error) {
    throw new Error(error.message);
  }
  return data ?? { id: context.orgId, state_code: null };
}

function contactName(contacts: Map<string, ContactLite>, id: string) {
  return contacts.get(id)?.display_name ?? "Unknown";
}

export async function buildGstSummaryReport(context: ApiContext, from: string, to: string): Promise<ReportConfig> {
  const [invoices, bills, expenses] = await Promise.all([fetchInvoices(context), fetchBills(context), fetchExpenses(context)]);

  const sales = invoices.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const purchases = bills.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const operatingExpenses = expenses.filter((row) => matchesDateRange(row.expense_date, from, to) && row.status !== "void");

  const salesTax = sales.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);
  const purchaseTax = purchases.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);
  const expenseTax = operatingExpenses.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0);
  const inputTax = purchaseTax + expenseTax;

  return {
    key: "gst-summary",
    title: "GST Summary",
    description: "Output GST, input GST, and the resulting net payable for the selected period.",
    apiPath: "/api/v1/reports/gst-summary",
    columns: [
      { key: "bucket", label: "Bucket" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "tax_amount", label: "GST", kind: "money" },
      { key: "documents", label: "Documents", kind: "number" }
    ],
    rows: [
      {
        id: "gst-sales",
        bucket: "Sales output GST",
        taxable_value: sales.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0),
        tax_amount: salesTax,
        documents: sales.length
      },
      {
        id: "gst-bills",
        bucket: "Bills input GST",
        taxable_value: purchases.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0),
        tax_amount: purchaseTax,
        documents: purchases.length
      },
      {
        id: "gst-expenses",
        bucket: "Expenses input GST",
        taxable_value: operatingExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        tax_amount: expenseTax,
        documents: operatingExpenses.length
      }
    ],
    summary: [
      { label: "Output GST", value: salesTax, tone: salesTax > 0 ? "good" : "neutral" },
      { label: "Input GST", value: inputTax, tone: inputTax > 0 ? "neutral" : "warn" },
      { label: "Net payable", value: salesTax - inputTax, tone: salesTax - inputTax >= 0 ? "warn" : "good" }
    ]
  };
}

export async function buildGstParityReport(context: ApiContext, from: string, to: string): Promise<ReportConfig> {
  const [invoices, bills, expenses, taxRates] = await Promise.all([
    fetchInvoices(context),
    fetchBills(context),
    fetchExpenses(context),
    fetchTaxRates(context)
  ]);

  const activeRates = taxRates.filter((rate) => Boolean(rate.is_active));
  const defaultRate = Number(activeRates[0]?.rate ?? 0) / 100;

  const sales = invoices.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const purchases = bills.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const operatingExpenses = expenses.filter((row) => matchesDateRange(row.expense_date, from, to) && row.status !== "void");

  const salesExpected = defaultRate > 0 ? sales.reduce((sum, row) => sum + Number(row.subtotal ?? 0) * defaultRate, 0) : sales.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);
  const purchasesExpected =
    defaultRate > 0
      ? purchases.reduce((sum, row) => sum + Number(row.subtotal ?? 0) * defaultRate, 0) + operatingExpenses.reduce((sum, row) => sum + Number(row.amount ?? 0) * defaultRate, 0)
      : purchases.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0) + operatingExpenses.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0);

  const salesActual = sales.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);
  const purchasesActual = purchases.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0) + operatingExpenses.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0);
  const missingSalesTaxDocs = sales.filter((row) => Number(row.subtotal ?? 0) > 0 && Number(row.tax_total ?? 0) === 0).length;
  const missingPurchaseTaxDocs = [...purchases, ...operatingExpenses].filter((row) => Number("tax_total" in row ? row.tax_total : row.tax_amount) === 0).length;

  const rows = [
    {
      id: "parity-sales",
      check: "Sales GST parity",
      expected: Number(salesExpected.toFixed(2)),
      actual: Number(salesActual.toFixed(2)),
      variance: Number((salesActual - salesExpected).toFixed(2)),
      status: Math.abs(salesActual - salesExpected) < 1 ? "aligned" : "review"
    },
    {
      id: "parity-purchases",
      check: "Input GST parity",
      expected: Number(purchasesExpected.toFixed(2)),
      actual: Number(purchasesActual.toFixed(2)),
      variance: Number((purchasesActual - purchasesExpected).toFixed(2)),
      status: Math.abs(purchasesActual - purchasesExpected) < 1 ? "aligned" : "review"
    },
    {
      id: "parity-sales-coverage",
      check: "Sales docs missing GST",
      expected: 0,
      actual: missingSalesTaxDocs,
      variance: missingSalesTaxDocs,
      status: missingSalesTaxDocs === 0 ? "aligned" : "review"
    },
    {
      id: "parity-purchase-coverage",
      check: "Purchase docs missing GST",
      expected: 0,
      actual: missingPurchaseTaxDocs,
      variance: missingPurchaseTaxDocs,
      status: missingPurchaseTaxDocs === 0 ? "aligned" : "review"
    }
  ];

  return {
    key: "gst-parity",
    title: "GST Parity Checks",
    description: "Cross-check GST captured on documents against expected tax rates and highlight missing-tax documents.",
    apiPath: "/api/v1/reports/gst-parity",
    columns: [
      { key: "check", label: "Check" },
      { key: "expected", label: "Expected", kind: "money" },
      { key: "actual", label: "Actual", kind: "money" },
      { key: "variance", label: "Variance", kind: "money" },
      { key: "status", label: "Status" }
    ],
    rows,
    summary: [
      { label: "Active GST rates", value: activeRates.length, tone: activeRates.length > 0 ? "good" : "warn", kind: "number" },
      { label: "Checks flagged", value: rows.filter((row) => row.status !== "aligned").length, tone: rows.some((row) => row.status !== "aligned") ? "warn" : "good", kind: "number" },
      { label: "Default GST %", value: Number((defaultRate * 100).toFixed(2)), tone: "neutral", kind: "percent" }
    ]
  };
}

export async function buildOutstandingReport(context: ApiContext, from: string, to: string): Promise<ReportConfig> {
  const [contacts, invoices, bills] = await Promise.all([fetchContacts(context), fetchInvoices(context), fetchBills(context)]);

  const outstandingInvoices = invoices.filter((row) => matchesDateRange(row.issue_date, from, to) && Number(row.balance_due ?? 0) > 0 && row.status !== "void");
  const outstandingBills = bills.filter((row) => matchesDateRange(row.issue_date, from, to) && Number(row.balance_due ?? 0) > 0 && row.status !== "void");

  const rows = [
    ...outstandingInvoices.map((row) => ({
      id: `ar-${row.id}`,
      type: "Receivable",
      contact: contactName(contacts, row.contact_id),
      document_number: row.invoice_number,
      due_date: row.due_date,
      balance_due: row.balance_due,
      status: row.status
    })),
    ...outstandingBills.map((row) => ({
      id: `ap-${row.id}`,
      type: "Payable",
      contact: contactName(contacts, row.contact_id),
      document_number: row.bill_number,
      due_date: row.due_date,
      balance_due: row.balance_due,
      status: row.status
    }))
  ];

  return {
    key: "outstanding",
    title: "Outstanding",
    description: "Open receivables and payables, ready for collections and AP follow-up.",
    apiPath: "/api/v1/reports/outstanding",
    columns: [
      { key: "type", label: "Type" },
      { key: "contact", label: "Contact" },
      { key: "document_number", label: "Document" },
      { key: "due_date", label: "Due date", kind: "text" },
      { key: "balance_due", label: "Balance", kind: "money" },
      { key: "status", label: "Status" }
    ],
    rows,
    summary: [
      { label: "Receivables", value: outstandingInvoices.reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0), tone: "good" },
      { label: "Payables", value: outstandingBills.reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0), tone: "warn" },
      { label: "Documents open", value: rows.length, tone: "neutral", kind: "number" }
    ]
  };
}

export async function buildGstr1Report(context: ApiContext, from: string, to: string): Promise<ReportConfig> {
  const [contacts, invoices] = await Promise.all([fetchContacts(context), fetchInvoices(context)]);
  const rowsBySection = new Map<string, { documents: number; taxable_value: number; tax_amount: number }>();

  const register = (section: string, subtotal: number, taxAmount: number) => {
    const current = rowsBySection.get(section) ?? { documents: 0, taxable_value: 0, tax_amount: 0 };
    current.documents += 1;
    current.taxable_value += Number(subtotal ?? 0);
    current.tax_amount += Number(taxAmount ?? 0);
    rowsBySection.set(section, current);
  };

  invoices
    .filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void")
    .forEach((row) => {
      const contact = contacts.get(row.contact_id);
      const hasGstin = Boolean(contact?.tax_id);
      const section = hasGstin ? "B2B" : Number(row.total ?? 0) >= 250000 ? "B2CL" : "B2CS";
      register(section, Number(row.subtotal ?? 0), Number(row.tax_total ?? 0));
    });

  const rows = Array.from(rowsBySection.entries()).map(([section, aggregate]) => ({
    id: `gstr1-${section.toLowerCase()}`,
    section,
    documents: aggregate.documents,
    taxable_value: Number(aggregate.taxable_value.toFixed(2)),
    tax_amount: Number(aggregate.tax_amount.toFixed(2))
  }));

  return {
    key: "gstr-1",
    title: "GSTR-1",
    description: "Outward supply preparation grouped by B2B and B2C filing buckets.",
    apiPath: "/api/v1/reports/gstr-1",
    columns: [
      { key: "section", label: "Section" },
      { key: "documents", label: "Documents", kind: "number" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "tax_amount", label: "GST", kind: "money" }
    ],
    rows,
    summary: [
      { label: "Taxable value", value: rows.reduce((sum, row) => sum + Number(row.taxable_value ?? 0), 0), tone: "neutral" },
      { label: "GST collected", value: rows.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0), tone: "warn" },
      { label: "Documents", value: rows.reduce((sum, row) => sum + Number(row.documents ?? 0), 0), tone: "good", kind: "number" }
    ]
  };
}

export async function buildGstr3bReport(context: ApiContext, from: string, to: string): Promise<ReportConfig> {
  const [organization, contacts, invoices, bills, expenses] = await Promise.all([
    fetchOrganization(context),
    fetchContacts(context),
    fetchInvoices(context),
    fetchBills(context),
    fetchExpenses(context)
  ]);

  const outward = invoices.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const inward = bills.filter((row) => matchesDateRange(row.issue_date, from, to) && row.status !== "void");
  const expenseRows = expenses.filter((row) => matchesDateRange(row.expense_date, from, to) && row.status !== "void");

  const outwardSplit = outward.reduce(
    (totals, row) => {
      const contact = contacts.get(row.contact_id);
      const placeOfSupply = row.place_of_supply ?? contact?.state_code ?? organization.state_code ?? null;
      const isInterstate = Boolean(placeOfSupply && organization.state_code && placeOfSupply !== organization.state_code);
      const tax = Number(row.tax_total ?? 0);
      totals.taxable_value += Number(row.subtotal ?? 0);
      if (isInterstate) {
        totals.igst += tax;
      } else {
        totals.cgst += tax / 2;
        totals.sgst += tax / 2;
      }
      return totals;
    },
    { taxable_value: 0, cgst: 0, sgst: 0, igst: 0 }
  );

  const inwardTax = inward.reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0) + expenseRows.reduce((sum, row) => sum + Number(row.tax_amount ?? 0), 0);
  const inwardSplit = {
    taxable_value: inward.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0) + expenseRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    cgst: inwardTax / 2,
    sgst: inwardTax / 2,
    igst: 0
  };

  const rows = [
    {
      id: "gstr3b-outward",
      line_item: "Outward taxable supplies",
      taxable_value: Number(outwardSplit.taxable_value.toFixed(2)),
      cgst: Number(outwardSplit.cgst.toFixed(2)),
      sgst: Number(outwardSplit.sgst.toFixed(2)),
      igst: Number(outwardSplit.igst.toFixed(2))
    },
    {
      id: "gstr3b-itc",
      line_item: "Eligible ITC",
      taxable_value: Number(inwardSplit.taxable_value.toFixed(2)),
      cgst: Number(inwardSplit.cgst.toFixed(2)),
      sgst: Number(inwardSplit.sgst.toFixed(2)),
      igst: Number(inwardSplit.igst.toFixed(2))
    }
  ];

  const outputTax = rows[0].cgst + rows[0].sgst + rows[0].igst;
  const inputTax = rows[1].cgst + rows[1].sgst + rows[1].igst;

  return {
    key: "gstr-3b",
    title: "GSTR-3B",
    description: "Filing-ready outward tax, ITC, and net payable summary.",
    apiPath: "/api/v1/reports/gstr-3b",
    columns: [
      { key: "line_item", label: "Line item" },
      { key: "taxable_value", label: "Taxable Value", kind: "money" },
      { key: "cgst", label: "CGST", kind: "money" },
      { key: "sgst", label: "SGST", kind: "money" },
      { key: "igst", label: "IGST", kind: "money" }
    ],
    rows,
    summary: [
      { label: "Output GST", value: outputTax, tone: "warn" },
      { label: "Eligible ITC", value: inputTax, tone: "good" },
      { label: "Net payable", value: outputTax - inputTax, tone: outputTax - inputTax > 0 ? "warn" : "good" }
    ]
  };
}
