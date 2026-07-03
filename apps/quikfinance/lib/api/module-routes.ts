import type { ApiContext } from "@/lib/api/auth";
import type { CrudConfig } from "@/lib/api/crud";
import { accountSchema } from "@/lib/validations/account.schema";
import { billSchema } from "@/lib/validations/bill.schema";
import {
  creditNoteSchema,
  purchaseOrderSchema,
  quotationSchema,
  salesOrderSchema,
  timeEntrySchema,
  vendorCreditSchema
} from "@/lib/validations/commercial.schema";
import { customerSchema } from "@/lib/validations/customer.schema";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import {
  bankAccountSchema,
  budgetSchema,
  currencySchema,
  expenseSchema,
  fixedAssetSchema,
  inventoryItemSchema,
  journalEntrySchema,
  paymentSchema,
  projectSchema,
  taxRateSchema
} from "@/lib/validations/operations.schema";
import { vendorSchema } from "@/lib/validations/vendor.schema";

function withoutFields(body: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => !fields.includes(key)));
}

function sequenceNumber(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function prepareInvoice(body: Record<string, unknown>) {
  const payload = withoutFields(body, ["line_items"]);
  return {
    ...payload,
    invoice_number: typeof payload.invoice_number === "string" && payload.invoice_number.length > 0 ? payload.invoice_number : sequenceNumber("INV")
  };
}

function prepareBill(body: Record<string, unknown>) {
  const payload = withoutFields(body, ["line_items"]);
  return {
    ...payload,
    bill_number: typeof payload.bill_number === "string" && payload.bill_number.length > 0 ? payload.bill_number : sequenceNumber("BILL")
  };
}

function prepareJournalEntry(body: Record<string, unknown>) {
  return {
    ...body,
    entry_number: typeof body.entry_number === "string" && body.entry_number.length > 0 ? body.entry_number : sequenceNumber("JE")
  };
}

function prepareQuotation(body: Record<string, unknown>) {
  return {
    ...body,
    quotation_number: typeof body.quotation_number === "string" && body.quotation_number.length > 0 ? body.quotation_number : sequenceNumber("QT")
  };
}

function prepareSalesOrder(body: Record<string, unknown>) {
  return {
    ...body,
    sales_order_number: typeof body.sales_order_number === "string" && body.sales_order_number.length > 0 ? body.sales_order_number : sequenceNumber("SO")
  };
}

function preparePurchaseOrder(body: Record<string, unknown>) {
  return {
    ...body,
    purchase_order_number:
      typeof body.purchase_order_number === "string" && body.purchase_order_number.length > 0 ? body.purchase_order_number : sequenceNumber("PO")
  };
}

function prepareCreditNote(body: Record<string, unknown>) {
  return {
    ...body,
    credit_note_number:
      typeof body.credit_note_number === "string" && body.credit_note_number.length > 0 ? body.credit_note_number : sequenceNumber("CN")
  };
}

function prepareVendorCredit(body: Record<string, unknown>) {
  return {
    ...body,
    vendor_credit_number:
      typeof body.vendor_credit_number === "string" && body.vendor_credit_number.length > 0 ? body.vendor_credit_number : sequenceNumber("VC")
  };
}

function prepareFixedAsset(body: Record<string, unknown>) {
  return {
    ...body,
    asset_number: typeof body.asset_number === "string" && body.asset_number.length > 0 ? body.asset_number : sequenceNumber("FA")
  };
}

function keepContext(_body: Record<string, unknown>, _context: ApiContext) {
  return _body;
}

export const customerRouteConfig: CrudConfig<"contacts"> = {
  table: "contacts",
  schema: customerSchema,
  entity: "customer",
  searchColumn: "display_name",
  orderColumn: "display_name",
  fixedFilters: { type: "customer" },
  prepareCreate: (body) => ({ ...body, type: "customer" })
};

export const vendorRouteConfig: CrudConfig<"contacts"> = {
  table: "contacts",
  schema: vendorSchema,
  entity: "vendor",
  searchColumn: "display_name",
  orderColumn: "display_name",
  fixedFilters: { type: "vendor" },
  prepareCreate: (body) => ({ ...body, type: "vendor" })
};

export const invoiceRouteConfig: CrudConfig<"invoices"> = {
  table: "invoices",
  schema: invoiceSchema,
  entity: "invoice",
  searchColumn: "invoice_number",
  lockDateField: "issue_date",
  lockScope: "sales",
  prepareCreate: prepareInvoice,
  prepareUpdate: prepareInvoice
};

export const quotationRouteConfig: CrudConfig<"quotations"> = {
  table: "quotations",
  schema: quotationSchema,
  entity: "quotation",
  searchColumn: "quotation_number",
  orderColumn: "issue_date",
  lockDateField: "issue_date",
  lockScope: "sales",
  prepareCreate: prepareQuotation,
  prepareUpdate: prepareQuotation
};

export const salesOrderRouteConfig: CrudConfig<"sales_orders"> = {
  table: "sales_orders",
  schema: salesOrderSchema,
  entity: "sales_order",
  searchColumn: "sales_order_number",
  orderColumn: "issue_date",
  lockDateField: "issue_date",
  lockScope: "sales",
  prepareCreate: prepareSalesOrder,
  prepareUpdate: prepareSalesOrder
};

export const billRouteConfig: CrudConfig<"bills"> = {
  table: "bills",
  schema: billSchema,
  entity: "bill",
  searchColumn: "bill_number",
  lockDateField: "issue_date",
  lockScope: "purchases",
  prepareCreate: prepareBill,
  prepareUpdate: prepareBill
};

export const purchaseOrderRouteConfig: CrudConfig<"purchase_orders"> = {
  table: "purchase_orders",
  schema: purchaseOrderSchema,
  entity: "purchase_order",
  searchColumn: "purchase_order_number",
  orderColumn: "issue_date",
  lockDateField: "issue_date",
  lockScope: "purchases",
  prepareCreate: preparePurchaseOrder,
  prepareUpdate: preparePurchaseOrder
};

export const creditNoteRouteConfig: CrudConfig<"credit_notes"> = {
  table: "credit_notes",
  schema: creditNoteSchema,
  entity: "credit_note",
  searchColumn: "credit_note_number",
  orderColumn: "issue_date",
  lockDateField: "issue_date",
  lockScope: "sales",
  prepareCreate: prepareCreditNote,
  prepareUpdate: prepareCreditNote
};

export const vendorCreditRouteConfig: CrudConfig<"vendor_credits"> = {
  table: "vendor_credits",
  schema: vendorCreditSchema,
  entity: "vendor_credit",
  searchColumn: "vendor_credit_number",
  orderColumn: "issue_date",
  lockDateField: "issue_date",
  lockScope: "purchases",
  prepareCreate: prepareVendorCredit,
  prepareUpdate: prepareVendorCredit
};

export const paymentRouteConfig: CrudConfig<"payments"> = {
  table: "payments",
  schema: paymentSchema,
  entity: "payment",
  orderColumn: "payment_date",
  lockDateField: "payment_date",
  lockScope: "all"
};

export const expenseRouteConfig: CrudConfig<"expenses"> = {
  table: "expenses",
  schema: expenseSchema,
  entity: "expense",
  searchColumn: "description",
  orderColumn: "expense_date",
  lockDateField: "expense_date",
  lockScope: "purchases"
};

export const journalRouteConfig: CrudConfig<"journal_entries"> = {
  table: "journal_entries",
  schema: journalEntrySchema,
  entity: "journal_entry",
  searchColumn: "entry_number",
  orderColumn: "entry_date",
  lockDateField: "entry_date",
  lockScope: "journals",
  prepareCreate: prepareJournalEntry,
  prepareUpdate: keepContext
};

export const accountRouteConfig: CrudConfig<"accounts"> = {
  table: "accounts",
  schema: accountSchema,
  entity: "account",
  searchColumn: "name",
  orderColumn: "code"
};

export const bankAccountRouteConfig: CrudConfig<"bank_accounts"> = {
  table: "bank_accounts",
  schema: bankAccountSchema,
  entity: "bank_account",
  searchColumn: "name",
  orderColumn: "name"
};

export const budgetRouteConfig: CrudConfig<"budgets"> = {
  table: "budgets",
  schema: budgetSchema,
  entity: "budget",
  searchColumn: "name",
  orderColumn: "fiscal_year"
};

export const fixedAssetRouteConfig: CrudConfig<"fixed_assets"> = {
  table: "fixed_assets",
  schema: fixedAssetSchema,
  entity: "fixed_asset",
  searchColumn: "name",
  prepareCreate: prepareFixedAsset,
  prepareUpdate: prepareFixedAsset
};

export const inventoryRouteConfig: CrudConfig<"items"> = {
  table: "items",
  schema: inventoryItemSchema,
  entity: "inventory_item",
  searchColumn: "name",
  orderColumn: "name",
  // Resolve category/sub-category names and friendly labels via correlated
  // subqueries so the grid and detail view can show them without a client join.
  select:
    "items.*, " +
    "(SELECT c.name FROM item_categories c WHERE c.id = items.category_id) AS category, " +
    "(SELECT c.name FROM item_categories c WHERE c.id = items.subcategory_id) AS subcategory, " +
    "CASE items.item_type WHEN 'inventory' THEN 'Inventory' WHEN 'non_inventory' THEN 'Non-Inventory' WHEN 'service' THEN 'Service' WHEN 'bundle' THEN 'Bundle' ELSE initcap(items.item_type) END AS type_label, " +
    "CASE WHEN items.is_active THEN 'Active' ELSE 'Inactive' END AS status",
  // SKU is required (NOT NULL, unique per org) — auto-generate a slug from the
  // name when the client omits it. Also derive tracked stock from item_type.
  prepareCreate: (body) => {
    const next: Record<string, unknown> = { ...body };
    if (typeof next.item_type === "string") next.track_inventory = next.item_type === "inventory";
    if (typeof next.sku === "string" && next.sku.trim().length > 0) return next;
    const base = String(next.name ?? "item").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "ITEM";
    next.sku = `${base}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    return next;
  },
  prepareUpdate: (body) => {
    if (typeof body.item_type === "string") return { ...body, track_inventory: body.item_type === "inventory" };
    return body;
  }
};

export const projectRouteConfig: CrudConfig<"projects"> = {
  table: "projects",
  schema: projectSchema,
  entity: "project",
  searchColumn: "name",
  orderColumn: "name"
};

export const timeEntryRouteConfig: CrudConfig<"time_entries"> = {
  table: "time_entries",
  schema: timeEntrySchema,
  entity: "time_entry",
  searchColumn: "description",
  orderColumn: "work_date"
};

export const taxRouteConfig: CrudConfig<"tax_rates"> = {
  table: "tax_rates",
  schema: taxRateSchema,
  entity: "tax_rate",
  searchColumn: "name",
  orderColumn: "name"
};

export const currencyRouteConfig: CrudConfig<"currencies"> = {
  table: "currencies",
  schema: currencySchema,
  entity: "currency",
  searchColumn: "name",
  orderColumn: "code",
  orgScoped: false
};
