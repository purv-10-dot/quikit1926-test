import type { ApiContext } from "@/lib/api/auth";
import type { Json } from "@/types/database.types";
import { parseDateValue, parseMoneyValue, parseStructuredText, pickField } from "@/lib/imports/csv";
import { assertPeriodUnlocked } from "@/lib/period-locks";

type ImportEntity = "customers" | "vendors" | "invoices" | "bills" | "payments" | "bank_transactions";
type ImportSource = "csv" | "tally" | "zoho_books" | "bank_statement";

type ImportResult = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  preview: Json;
  notes: string[];
};

function sequence(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureContact(context: ApiContext, kind: "customer" | "vendor", row: Record<string, string>) {
  const displayName =
    pickField(row, ["display_name", "name", "customer_name", "vendor_name", "party_name", "contact_name"]) ||
    `${kind}-${Date.now()}`;
  const email = pickField(row, ["email", "contact_email"]);

  let query = context.db
    .from("contacts")
    .select("id, display_name, email")
    .eq("org_id", context.orgId)
    .eq("type", kind)
    .eq("display_name", displayName)
    .limit(1);

  if (email) {
    query = context.db
      .from("contacts")
      .select("id, display_name, email")
      .eq("org_id", context.orgId)
      .eq("type", kind)
      .or(`display_name.eq.${displayName},email.eq.${email}`)
      .limit(1);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const existing = (data ?? [])[0];
  if (existing?.id) {
    return String(existing.id);
  }

  const { data: created, error: createError } = await context.db
    .from("contacts")
    .insert({
      org_id: context.orgId,
      type: kind,
      display_name: displayName,
      company_name: displayName,
      email: email || null,
      phone: pickField(row, ["phone", "mobile", "contact"]),
      currency: (pickField(row, ["currency"]) || "USD").toUpperCase(),
      payment_terms: Number(pickField(row, ["payment_terms", "terms"])) || 30
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? `Failed to create ${kind}.`);
  }

  return String(created.id);
}

async function importContacts(context: ApiContext, entityType: "customers" | "vendors", rows: Record<string, string>[]) {
  let importedRows = 0;
  const preview: Json[] = [];
  const notes: string[] = [];

  for (const row of rows) {
    const displayName =
      pickField(row, ["display_name", "name", "customer_name", "vendor_name", "party_name", "contact_name"]) ||
      "";
    if (!displayName) {
      notes.push("Skipped one row because it did not contain a contact name.");
      continue;
    }

    await ensureContact(context, entityType === "customers" ? "customer" : "vendor", row);
    importedRows += 1;
    preview.push({
      display_name: displayName,
      email: pickField(row, ["email", "contact_email"]) || null
    });
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: rows.length - importedRows,
    preview,
    notes
  } satisfies ImportResult;
}

async function importInvoicesOrBills(context: ApiContext, entityType: "invoices" | "bills", rows: Record<string, string>[]) {
  let importedRows = 0;
  const preview: Json[] = [];
  const notes: string[] = [];
  const table = entityType === "invoices" ? "invoices" : "bills";

  for (const row of rows) {
    const contactId = await ensureContact(context, entityType === "invoices" ? "customer" : "vendor", row);
    const issueDate = parseDateValue(pickField(row, ["issue_date", "invoice_date", "bill_date", "date"]), todayIso());
    const lockResponse = await assertPeriodUnlocked(context, issueDate, entityType === "invoices" ? "sales" : "purchases");
    if (lockResponse) {
      notes.push(`Skipped ${table.slice(0, -1)} dated ${issueDate} because the period is locked.`);
      continue;
    }

    const subtotal = parseMoneyValue(pickField(row, ["subtotal", "taxable_amount", "net_amount", "amount"]));
    const taxTotal = parseMoneyValue(pickField(row, ["tax_total", "gst_amount", "tax", "gst"]));
    const total = parseMoneyValue(pickField(row, ["total", "grand_total", "amount"])) || subtotal + taxTotal;
    const dueDate = parseDateValue(pickField(row, ["due_date", "due_on"]), issueDate);
    const number =
      pickField(row, entityType === "invoices" ? ["invoice_number", "invoice_no", "voucher_number"] : ["bill_number", "voucher_number", "reference"]) ||
      sequence(entityType === "invoices" ? "INV" : "BILL");

    const payload =
      entityType === "invoices"
        ? {
            org_id: context.orgId,
            contact_id: contactId,
            invoice_number: number,
            issue_date: issueDate,
            due_date: dueDate,
            subtotal,
            tax_total: taxTotal,
            total,
            balance_due: total,
            currency: (pickField(row, ["currency"]) || "USD").toUpperCase(),
            notes: pickField(row, ["notes", "memo"]) || null,
            status: pickField(row, ["status"]) || "draft"
          }
        : {
            org_id: context.orgId,
            contact_id: contactId,
            bill_number: number,
            issue_date: issueDate,
            due_date: dueDate,
            subtotal,
            tax_total: taxTotal,
            total,
            balance_due: total,
            currency: (pickField(row, ["currency"]) || "USD").toUpperCase(),
            notes: pickField(row, ["notes", "memo"]) || null,
            status: pickField(row, ["status"]) || "draft"
          };

    const { error } = await context.db.from(table).insert(payload);
    if (error) {
      notes.push(`Skipped ${number}: ${error.message}`);
      continue;
    }

    importedRows += 1;
    preview.push({
      document_number: number,
      issue_date: issueDate,
      total
    });
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: rows.length - importedRows,
    preview,
    notes
  } satisfies ImportResult;
}

async function importPayments(context: ApiContext, rows: Record<string, string>[]) {
  let importedRows = 0;
  const preview: Json[] = [];
  const notes: string[] = [];

  for (const row of rows) {
    const paymentType = pickField(row, ["payment_type", "type"]).toLowerCase() === "made" ? "made" : "received";
    const contactId = await ensureContact(context, paymentType === "received" ? "customer" : "vendor", row);
    const paymentDate = parseDateValue(pickField(row, ["payment_date", "date"]), todayIso());
    const lockResponse = await assertPeriodUnlocked(context, paymentDate, paymentType === "received" ? "sales" : "purchases");
    if (lockResponse) {
      notes.push(`Skipped payment dated ${paymentDate} because the period is locked.`);
      continue;
    }

    const amount = parseMoneyValue(pickField(row, ["amount", "payment_amount", "received_amount", "paid_amount"]));
    const reference = pickField(row, ["reference", "payment_reference", "transaction_id"]) || null;

    const { error } = await context.db.from("payments").insert({
      org_id: context.orgId,
      contact_id: contactId,
      payment_type: paymentType,
      payment_date: paymentDate,
      amount,
      currency: (pickField(row, ["currency"]) || "USD").toUpperCase(),
      method: pickField(row, ["method", "mode", "payment_mode"]) || "Imported",
      reference,
      memo: pickField(row, ["memo", "notes"]) || null,
      status: pickField(row, ["status"]) || "posted"
    });

    if (error) {
      notes.push(`Skipped payment ${reference ?? amount}: ${error.message}`);
      continue;
    }

    importedRows += 1;
    preview.push({
      payment_date: paymentDate,
      amount,
      method: pickField(row, ["method", "mode", "payment_mode"]) || "Imported"
    });
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: rows.length - importedRows,
    preview,
    notes
  } satisfies ImportResult;
}

async function importBankTransactions(context: ApiContext, bankAccountId: string | null, rows: Record<string, string>[]) {
  if (!bankAccountId) {
    throw new Error("A bank account is required for bank statement imports.");
  }

  let importedRows = 0;
  const preview: Json[] = [];
  const notes: string[] = [];

  for (const row of rows) {
    const transactionDate = parseDateValue(pickField(row, ["date", "transaction_date", "value_date"]), todayIso());
    const lockResponse = await assertPeriodUnlocked(context, transactionDate, "banking");
    if (lockResponse) {
      notes.push(`Skipped bank transaction dated ${transactionDate} because the period is locked.`);
      continue;
    }

    const debit = parseMoneyValue(pickField(row, ["debit", "withdrawal"]));
    const credit = parseMoneyValue(pickField(row, ["credit", "deposit"]));
    const amount = credit !== 0 ? credit : debit !== 0 ? -Math.abs(debit) : parseMoneyValue(pickField(row, ["amount"]));
    const description = pickField(row, ["description", "particulars", "narration"]) || "Imported transaction";

    const { error } = await context.db.from("bank_transactions").insert({
      org_id: context.orgId,
      bank_account_id: bankAccountId,
      transaction_date: transactionDate,
      description,
      amount,
      reference: pickField(row, ["reference", "transaction_id", "ref"]) || null,
      status: "imported"
    });

    if (error) {
      notes.push(`Skipped bank transaction ${description}: ${error.message}`);
      continue;
    }

    importedRows += 1;
    preview.push({
      transaction_date: transactionDate,
      description,
      amount
    });
  }

  return {
    totalRows: rows.length,
    importedRows,
    failedRows: rows.length - importedRows,
    preview,
    notes
  } satisfies ImportResult;
}

export async function processImportPayload(
  context: ApiContext,
  sourceType: ImportSource,
  entityType: ImportEntity,
  payloadText: string,
  bankAccountId: string | null
) {
  const rows = parseStructuredText(payloadText);
  if (rows.length === 0) {
    throw new Error("No importable rows were found. Use CSV with a header row or a JSON array.");
  }

  if (sourceType === "bank_statement") {
    return importBankTransactions(context, bankAccountId, rows);
  }

  switch (entityType) {
    case "customers":
      return importContacts(context, "customers", rows);
    case "vendors":
      return importContacts(context, "vendors", rows);
    case "invoices":
      return importInvoicesOrBills(context, "invoices", rows);
    case "bills":
      return importInvoicesOrBills(context, "bills", rows);
    case "payments":
      return importPayments(context, rows);
    case "bank_transactions":
      return importBankTransactions(context, bankAccountId, rows);
    default:
      throw new Error(`Unsupported import entity: ${entityType}`);
  }
}
