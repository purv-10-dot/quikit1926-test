import { Prisma } from "@prisma/client";
import { assertPostingDateUnlocked, assertSourceUnlocked } from "@/lib/period-locks";

/**
 * Double-entry posting engine.
 *
 * Every financial document (invoice, payment, …) posts a balanced journal entry
 * to the general ledger. Account balances and the financial statements
 * (Trial Balance / P&L / Balance Sheet) are derived from journal_entry_lines via
 * the v_account_balances view, so correctness here is what makes the reports real.
 */

type Tx = Prisma.TransactionClient;

export type JournalLine = {
  account_id: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export type ControlAccounts = {
  receivable: string;
  payable: string | null;
  revenue: string;
  taxPayable: string;
  taxRecoverable: string | null;
  defaultExpense: string | null;
  inventoryAsset: string | null;
  cogs: string | null;
  // GST split accounts (output = payable, input = credit) + the org's home state.
  cgstOutput: string | null;
  sgstOutput: string | null;
  igstOutput: string | null;
  cgstInput: string | null;
  sgstInput: string | null;
  igstInput: string | null;
  tdsPayable: string | null;
  tcsPayable: string | null;
  customerAdvances: string | null;
  grni: string | null;
  orgState: string | null;
  bank: string;
  cash: string;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Resolve the org's control accounts from its chart of accounts (seeded by onboarding). */
export async function resolveControlAccounts(tx: Tx, orgId: string): Promise<ControlAccounts> {
  const rows = await tx.$queryRaw<Array<{ id: string; account_type: string; code: string }>>`
    SELECT id, account_type, code FROM accounts WHERE org_id = ${orgId}::uuid AND is_active = true`;

  const byType = (type: string) => rows.find((row) => row.account_type === type)?.id;
  const byCode = (code: string) => rows.find((row) => row.code === code)?.id;

  const orgRows = await tx.$queryRaw<Array<{ state_code: string | null }>>`
    SELECT state_code FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`;

  const receivable = byType("accounts_receivable");
  const revenue = byType("revenue");
  const bank = byType("bank");
  const cash = byType("cash") ?? bank;
  // Seeded "Tax Payable" is code 2200 (other_current_liability).
  const taxPayable = byCode("2200") ?? byType("other_current_liability");

  if (!receivable || !revenue || !bank || !taxPayable) {
    throw new Error(
      "Chart of accounts is missing a required control account (Accounts Receivable, Sales Revenue, Tax Payable, or Bank). Seed the default accounts first."
    );
  }

  return {
    receivable,
    payable: byType("accounts_payable") ?? null,
    revenue,
    taxPayable,
    // Input tax (seeded "Tax Recoverable", code 2210) and a default expense account for bills.
    taxRecoverable: byCode("2210") ?? byType("other_current_asset") ?? null,
    defaultExpense: byType("expense") ?? byCode("6000") ?? byType("cost_of_goods_sold") ?? null,
    // Inventory Asset (code 1400) and COGS (code 5000) for stock-tracked items.
    inventoryAsset: byCode("1400") ?? null,
    cogs: byCode("5000") ?? byType("cost_of_goods_sold") ?? null,
    cgstOutput: byCode("2201") ?? null,
    sgstOutput: byCode("2202") ?? null,
    igstOutput: byCode("2203") ?? null,
    cgstInput: byCode("2211") ?? null,
    sgstInput: byCode("2212") ?? null,
    igstInput: byCode("2213") ?? null,
    tdsPayable: byCode("2300") ?? null,
    tcsPayable: byCode("2310") ?? null,
    customerAdvances: byCode("2050") ?? null,
    grni: byCode("2400") ?? null,
    orgState: orgRows[0]?.state_code ?? null,
    bank,
    cash: cash as string
  };
}

/**
 * Build the tax journal line(s) for a document, splitting GST into CGST+SGST
 * (intra-state) or IGST (inter-state) by place-of-supply. Falls back to the
 * single Tax Payable / Tax Recoverable account when split accounts or the
 * org/place-of-supply state are unavailable.
 */
export function taxJournalLines(
  accounts: ControlAccounts,
  taxTotal: number,
  options: { kind: "output" | "input"; side: "Dr" | "Cr"; placeOfSupply: string | null }
): JournalLine[] {
  const tax = round2(taxTotal);
  if (tax === 0) return [];

  const isOutput = options.kind === "output";
  const cgst = isOutput ? accounts.cgstOutput : accounts.cgstInput;
  const sgst = isOutput ? accounts.sgstOutput : accounts.sgstInput;
  const igst = isOutput ? accounts.igstOutput : accounts.igstInput;
  const fallback = isOutput ? accounts.taxPayable : accounts.taxRecoverable;

  const place = options.placeOfSupply?.trim() || null;
  const intraState = Boolean(place && accounts.orgState && place === accounts.orgState);

  const mk = (accountId: string, amount: number, label: string): JournalLine =>
    options.side === "Cr"
      ? { account_id: accountId, debit: 0, credit: round2(amount), description: label }
      : { account_id: accountId, debit: round2(amount), credit: 0, description: label };

  if (intraState && cgst && sgst) {
    const half = round2(tax / 2);
    return [mk(cgst, half, "CGST"), mk(sgst, round2(tax - half), "SGST")];
  }
  if (!intraState && place && igst) {
    return [mk(igst, tax, "IGST")];
  }
  if (fallback) {
    return [mk(fallback, tax, "Tax")];
  }
  // Last resort: keep the entry balanced on whatever payable/recoverable exists.
  return [mk((isOutput ? accounts.taxPayable : accounts.taxRecoverable) ?? accounts.revenue, tax, "Tax")];
}

/** Next per-org sequential document number, e.g. `JE-00001`, `INV-00001`. */
export async function nextSequence(tx: Tx, orgId: string, table: string, column: string, prefix: string, floor = 1): Promise<string> {
  // table/column are internal constants (never user input) — safe to interpolate.
  // Use the highest existing numeric suffix for this prefix (NOT a row count) so
  // deletes never cause a collision and prefixes sharing a table (e.g. PR/PM in
  // payments) are numbered independently. `floor` lets settings pin a start number.
  const rows = await tx.$queryRawUnsafe<Array<{ maxnum: bigint | null }>>(
    `SELECT COALESCE(MAX(substring("${column}" from '([0-9]+)$')::bigint), 0) AS maxnum
     FROM "${table}" WHERE org_id = $1::uuid AND "${column}" LIKE $2`,
    orgId,
    `${prefix}-%`
  );
  const next = Math.max(Number(rows[0]?.maxnum ?? 0) + 1, floor);
  return `${prefix}-${String(next).padStart(5, "0")}`;
}

/**
 * Non-consuming preview of the next document number — same computation as
 * nextSequence() but callable outside a transaction (e.g. to prefill a form).
 * Accepts any client exposing $queryRawUnsafe (the base PrismaClient or a tx).
 */
export async function peekNextNumber(
  client: { $queryRawUnsafe: Tx["$queryRawUnsafe"] },
  orgId: string,
  table: string,
  column: string,
  prefix: string,
  floor = 1
): Promise<string> {
  const rows = await client.$queryRawUnsafe<Array<{ maxnum: bigint | null }>>(
    `SELECT COALESCE(MAX(substring("${column}" from '([0-9]+)$')::bigint), 0) AS maxnum
     FROM "${table}" WHERE org_id = $1::uuid AND "${column}" LIKE $2`,
    orgId,
    `${prefix}-%`
  );
  const next = Math.max(Number(rows[0]?.maxnum ?? 0) + 1, floor);
  return `${prefix}-${String(next).padStart(5, "0")}`;
}

/** Insert a balanced journal entry + lines. Throws if debits ≠ credits. */
export async function createJournalEntry(
  tx: Tx,
  params: {
    orgId: string;
    entryDate: string;
    memo?: string | null;
    sourceType: string;
    sourceId: string;
    createdBy: string | null;
    lines: JournalLine[];
  }
): Promise<string> {
  const lines = params.lines.filter((line) => round2(line.debit) !== 0 || round2(line.credit) !== 0);
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));

  if (lines.length < 2) {
    throw new Error("A journal entry needs at least two lines.");
  }
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal entry is not balanced: debits ${totalDebit} ≠ credits ${totalCredit}.`);
  }

  // Control: never post into a locked accounting period (covers every post* path).
  await assertPostingDateUnlocked(tx, params.orgId, params.entryDate, params.sourceType);

  const entryNumber = await nextSequence(tx, params.orgId, "journal_entries", "entry_number", "JE");

  const entryRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO journal_entries (org_id, entry_number, entry_date, status, memo, source_type, source_id, created_by, posted_by, posted_at)
    VALUES (
      ${params.orgId}::uuid, ${entryNumber}, ${params.entryDate}::date, 'posted', ${params.memo ?? null},
      ${params.sourceType}, ${params.sourceId}::uuid, ${params.createdBy ? params.createdBy : null}::uuid,
      ${params.createdBy ? params.createdBy : null}::uuid, now()
    )
    RETURNING id`;
  const journalEntryId = entryRows[0].id;

  let order = 0;
  for (const line of lines) {
    await tx.$executeRaw`
      INSERT INTO journal_entry_lines (org_id, journal_entry_id, account_id, description, debit, credit, display_order)
      VALUES (
        ${params.orgId}::uuid, ${journalEntryId}::uuid, ${line.account_id}::uuid, ${line.description ?? null},
        ${round2(line.debit)}, ${round2(line.credit)}, ${order}
      )`;
    order += 1;
  }

  return journalEntryId;
}

/** Remove any journal entry previously posted for a source document (used before reposting / on delete). */
export async function reverseJournalFor(tx: Tx, orgId: string, sourceType: string, sourceId: string): Promise<void> {
  // Control: refuse to delete/repost a journal that sits in a locked period.
  await assertSourceUnlocked(tx, orgId, sourceType, sourceId);
  // Delete the lines explicitly first: the DB has no ON DELETE CASCADE FK, so
  // deleting only the entry would leave orphaned lines that still feed the
  // account-balance views and silently inflate every report.
  await tx.$executeRaw`
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE org_id = ${orgId}::uuid AND source_type = ${sourceType} AND source_id = ${sourceId}::uuid
    )`;
  await tx.$executeRaw`
    DELETE FROM journal_entries
    WHERE org_id = ${orgId}::uuid AND source_type = ${sourceType} AND source_id = ${sourceId}::uuid`;
}

type InvoiceForPosting = {
  id: string;
  issue_date: string;
  invoice_number: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  round_off: number;
  total: number;
  place_of_supply?: string | null;
};

/**
 * Post a customer invoice:
 *   Dr Accounts Receivable  (total)
 *   Cr Sales Revenue        (subtotal − discount + round-off)
 *   Cr Tax Payable          (tax_total)
 */
export async function postInvoice(
  tx: Tx,
  orgId: string,
  userId: string | null,
  invoice: InvoiceForPosting,
  accounts: ControlAccounts,
  extraLines: JournalLine[] = [],
  // Multi-currency: foreign documents post BASE-currency amounts to the GL.
  // extraLines (COGS/inventory) are already base currency — never scaled here.
  exchangeRate = 1
): Promise<string> {
  await reverseJournalFor(tx, orgId, "invoice", invoice.id);

  const rate = exchangeRate || 1;
  const total = round2(invoice.total * rate);
  const revenue = round2((invoice.subtotal - invoice.discount_total + invoice.round_off) * rate);
  const lines: JournalLine[] = [
    { account_id: accounts.receivable, debit: total, credit: 0, description: `Invoice ${invoice.invoice_number}` },
    { account_id: accounts.revenue, debit: 0, credit: revenue, description: `Invoice ${invoice.invoice_number}` }
  ];
  lines.push(...taxJournalLines(accounts, round2(invoice.tax_total * rate), { kind: "output", side: "Cr", placeOfSupply: invoice.place_of_supply ?? null }));
  // COGS pair(s) for stock-tracked items (Dr COGS / Cr Inventory) — self-balancing.
  lines.push(...extraLines);

  return createJournalEntry(tx, {
    orgId,
    entryDate: invoice.issue_date,
    memo: `Invoice ${invoice.invoice_number}`,
    sourceType: "invoice",
    sourceId: invoice.id,
    createdBy: userId,
    lines
  });
}

/**
 * Post a customer payment:
 *   Dr Bank / deposit account (amount)
 *   Cr Accounts Receivable    (amount)
 */
export async function postPaymentReceived(
  tx: Tx,
  orgId: string,
  userId: string | null,
  payment: { id: string; payment_date: string; amount: number; reference?: string | null },
  depositAccountId: string,
  accounts: ControlAccounts
): Promise<string> {
  await reverseJournalFor(tx, orgId, "payment", payment.id);

  const lines: JournalLine[] = [
    { account_id: depositAccountId, debit: round2(payment.amount), credit: 0, description: `Payment ${payment.reference ?? ""}`.trim() },
    { account_id: accounts.receivable, debit: 0, credit: round2(payment.amount), description: "Customer payment" }
  ];

  return createJournalEntry(tx, {
    orgId,
    entryDate: payment.payment_date,
    memo: `Payment received ${payment.reference ?? ""}`.trim(),
    sourceType: "payment",
    sourceId: payment.id,
    createdBy: userId,
    lines
  });
}

type BillForPosting = {
  id: string;
  issue_date: string;
  bill_number: string;
  tax_total: number;
  total: number;
  tds_amount?: number;
  place_of_supply?: string | null;
};

/**
 * Post a vendor bill:
 *   Dr Expense account(s)   (net, distributed by line account)
 *   Dr Tax Recoverable      (input tax_total)
 *   Cr Accounts Payable     (total)
 */
export async function postBill(
  tx: Tx,
  orgId: string,
  userId: string | null,
  bill: BillForPosting,
  expenseDebits: Array<{ account_id: string; amount: number }>,
  accounts: ControlAccounts,
  // Multi-currency: foreign bills post BASE-currency amounts. expenseDebits must
  // be passed in DOCUMENT currency; this scales them with the same rate so the
  // entry stays balanced (inventory unit cost is converted in bill-service).
  exchangeRate = 1
): Promise<string> {
  if (!accounts.payable) {
    throw new Error("Chart of accounts is missing Accounts Payable.");
  }
  await reverseJournalFor(tx, orgId, "bill", bill.id);

  const rate = exchangeRate || 1;
  const lines: JournalLine[] = expenseDebits
    .filter((debit) => round2(debit.amount) !== 0)
    .map((debit) => ({ account_id: debit.account_id, debit: round2(debit.amount * rate), credit: 0, description: `Bill ${bill.bill_number}` }));

  lines.push(...taxJournalLines(accounts, round2(bill.tax_total * rate), { kind: "input", side: "Dr", placeOfSupply: bill.place_of_supply ?? null }));

  // TDS withheld from the vendor: credit a TDS Payable liability and reduce the
  // net amount owed to the vendor (Accounts Payable).
  const total = round2(bill.total * rate);
  const tds = round2((bill.tds_amount ?? 0) * rate);
  if (tds > 0 && accounts.tdsPayable) {
    lines.push({ account_id: accounts.tdsPayable, debit: 0, credit: tds, description: `TDS withheld ${bill.bill_number}` });
    lines.push({ account_id: accounts.payable, debit: 0, credit: round2(total - tds), description: `Bill ${bill.bill_number}` });
  } else {
    lines.push({ account_id: accounts.payable, debit: 0, credit: total, description: `Bill ${bill.bill_number}` });
  }

  return createJournalEntry(tx, {
    orgId,
    entryDate: bill.issue_date,
    memo: `Bill ${bill.bill_number}`,
    sourceType: "bill",
    sourceId: bill.id,
    createdBy: userId,
    lines
  });
}

/**
 * Post a vendor payment:
 *   Dr Accounts Payable       (amount)
 *   Cr Bank / payment account (amount)
 */
export async function postPaymentMade(
  tx: Tx,
  orgId: string,
  userId: string | null,
  payment: { id: string; payment_date: string; amount: number; reference?: string | null },
  paymentAccountId: string,
  accounts: ControlAccounts
): Promise<string> {
  if (!accounts.payable) {
    throw new Error("Chart of accounts is missing Accounts Payable.");
  }
  await reverseJournalFor(tx, orgId, "payment", payment.id);

  const lines: JournalLine[] = [
    { account_id: accounts.payable, debit: round2(payment.amount), credit: 0, description: "Vendor payment" },
    { account_id: paymentAccountId, debit: 0, credit: round2(payment.amount), description: `Payment ${payment.reference ?? ""}`.trim() }
  ];

  return createJournalEntry(tx, {
    orgId,
    entryDate: payment.payment_date,
    memo: `Payment made ${payment.reference ?? ""}`.trim(),
    sourceType: "payment",
    sourceId: payment.id,
    createdBy: userId,
    lines
  });
}

/**
 * Post a customer credit note (sales return):
 *   Dr Sales Revenue       (subtotal)
 *   Dr Tax Payable         (tax reversal)
 *   Cr Accounts Receivable (total)
 */
export async function postCreditNote(
  tx: Tx,
  orgId: string,
  userId: string | null,
  note: { id: string; issue_date: string; credit_note_number: string; subtotal: number; tax_total: number; total: number; place_of_supply?: string | null },
  accounts: ControlAccounts
): Promise<string> {
  await reverseJournalFor(tx, orgId, "credit_note", note.id);
  const lines: JournalLine[] = [
    { account_id: accounts.revenue, debit: round2(note.subtotal), credit: 0, description: `Credit note ${note.credit_note_number}` }
  ];
  lines.push(...taxJournalLines(accounts, note.tax_total, { kind: "output", side: "Dr", placeOfSupply: note.place_of_supply ?? null }));
  lines.push({ account_id: accounts.receivable, debit: 0, credit: round2(note.total), description: `Credit note ${note.credit_note_number}` });

  return createJournalEntry(tx, {
    orgId,
    entryDate: note.issue_date,
    memo: `Credit note ${note.credit_note_number}`,
    sourceType: "credit_note",
    sourceId: note.id,
    createdBy: userId,
    lines
  });
}

/**
 * Post a vendor credit (purchase return):
 *   Dr Accounts Payable    (total)
 *   Cr Expense             (subtotal)
 *   Cr Tax Recoverable     (input tax reversal)
 */
/**
 * Post a vendor credit (purchase return / supplier debit note) — the reverse of
 * a bill:
 *   Dr Accounts Payable     (total)
 *   Cr Expense account(s)    (net, distributed by line account)
 *   Cr Tax Recoverable       (input tax_total)
 */
export async function postVendorCredit(
  tx: Tx,
  orgId: string,
  userId: string | null,
  note: { id: string; issue_date: string; vendor_credit_number: string; tax_total: number; total: number; place_of_supply?: string | null },
  expenseCredits: Array<{ account_id: string; amount: number }>,
  accounts: ControlAccounts
): Promise<string> {
  if (!accounts.payable) {
    throw new Error("Chart of accounts is missing Accounts Payable.");
  }
  await reverseJournalFor(tx, orgId, "vendor_credit", note.id);

  // Distribute the credit across the line expense accounts; fall back to the
  // default expense account for the net amount when no line accounts are given
  // (e.g. a vendor credit created straight from a bill total).
  let credits = expenseCredits.filter((c) => c.account_id && round2(c.amount) !== 0);
  if (credits.length === 0) {
    if (!accounts.defaultExpense) {
      throw new Error("Chart of accounts is missing a default expense account.");
    }
    credits = [{ account_id: accounts.defaultExpense, amount: round2(note.total - note.tax_total) }];
  }

  const lines: JournalLine[] = [
    { account_id: accounts.payable, debit: round2(note.total), credit: 0, description: `Vendor credit ${note.vendor_credit_number}` },
    ...credits.map((c) => ({ account_id: c.account_id, debit: 0, credit: round2(c.amount), description: `Vendor credit ${note.vendor_credit_number}` }))
  ];
  lines.push(...taxJournalLines(accounts, note.tax_total, { kind: "input", side: "Cr", placeOfSupply: note.place_of_supply ?? null }));

  return createJournalEntry(tx, {
    orgId,
    entryDate: note.issue_date,
    memo: `Vendor credit ${note.vendor_credit_number}`,
    sourceType: "vendor_credit",
    sourceId: note.id,
    createdBy: userId,
    lines
  });
}

export { round2 };
