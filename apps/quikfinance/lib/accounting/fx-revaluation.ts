import { Prisma } from "@prisma/client";
import { createJournalEntry, resolveControlAccounts, round2, type JournalLine } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

/**
 * Unrealised foreign-exchange revaluation.
 *
 * Open foreign-currency receivables and payables are booked at the rate on the
 * document date. At period close their base-currency value drifts with the spot
 * rate. This restates open AR/AP to the as-of rate and posts the unrealised
 * gain/loss to "FX Gain or Loss" (account 6900):
 *
 *   AR worth more  → Dr Accounts Receivable / Cr FX Gain
 *   AR worth less  → Dr FX Loss            / Cr Accounts Receivable
 *   AP worth more  → Dr FX Loss            / Cr Accounts Payable
 *   AP worth less  → Dr Accounts Payable   / Cr FX Gain
 *
 * Re-running for the same date replaces the prior revaluation entry, so it is
 * idempotent. The single net entry keeps the ledger balanced.
 */

export type FxLineDetail = {
  doc_type: "invoice" | "bill";
  doc_number: string;
  currency: string;
  balance_due: number;
  booked_rate: number;
  current_rate: number;
  booked_base: number;
  current_base: number;
  difference: number; // current_base − booked_base (signed)
};

export type FxRevaluationResult = {
  as_of: string;
  base_currency: string;
  details: FxLineDetail[];
  net_gain: number; // positive = gain, negative = loss
  journal_entry_id: string | null;
};

const POSTED_INVOICE = ["sent", "viewed", "partial", "overdue"];
const POSTED_BILL = ["approved", "partial", "open", "overdue"];

/** Latest rate for `currency` → base, on/before `asOf`, from exchange_rates (override wins). */
async function rateFor(tx: Tx, orgId: string, currency: string, base: string, asOf: string, overrides: Record<string, number>): Promise<number | null> {
  if (overrides[currency] != null) return overrides[currency];
  const rows = await tx.$queryRaw<Array<{ rate: string }>>`
    SELECT rate FROM exchange_rates
    WHERE org_id = ${orgId}::uuid AND from_currency = ${currency} AND to_currency = ${base} AND effective_date <= ${asOf}::date
    ORDER BY effective_date DESC LIMIT 1`;
  return rows.length ? Number(rows[0].rate) : null;
}

/**
 * Compute (and optionally post) the FX revaluation as of `asOf`. When `post` is
 * false the result is a preview only — nothing is written.
 */
export async function revalueForeignCurrency(
  tx: Tx,
  orgId: string,
  userId: string | null,
  asOf: string,
  options: { post: boolean; rates?: Record<string, number> } = { post: true }
): Promise<FxRevaluationResult> {
  const overrides = options.rates ?? {};
  const orgRows = await tx.$queryRaw<Array<{ base_currency: string }>>`
    SELECT base_currency FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`;
  const base = (orgRows[0]?.base_currency ?? "INR").trim();

  const accounts = await resolveControlAccounts(tx, orgId);
  const fxAccount = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM accounts WHERE org_id = ${orgId}::uuid AND code = '6900' LIMIT 1`;
  if (!fxAccount.length) throw new Error("Chart of accounts is missing the FX Gain or Loss account (6900).");
  const fxAccountId = fxAccount[0].id;

  const invoices = await tx.$queryRaw<Array<{ invoice_number: string; currency: string; balance_due: string; exchange_rate: string }>>`
    SELECT invoice_number, currency, balance_due, exchange_rate FROM invoices
    WHERE org_id = ${orgId}::uuid AND balance_due > 0 AND upper(currency) <> ${base.toUpperCase()}
      AND status = ANY(${POSTED_INVOICE})`;
  const bills = await tx.$queryRaw<Array<{ bill_number: string; currency: string; balance_due: string; exchange_rate: string }>>`
    SELECT bill_number, currency, balance_due, exchange_rate FROM bills
    WHERE org_id = ${orgId}::uuid AND balance_due > 0 AND upper(currency) <> ${base.toUpperCase()}
      AND status = ANY(${POSTED_BILL})`;

  const details: FxLineDetail[] = [];
  let arDiff = 0; // signed sum of AR base differences
  let apDiff = 0; // signed sum of AP base differences

  for (const inv of invoices) {
    const currency = inv.currency.trim();
    const current = await rateFor(tx, orgId, currency, base, asOf, overrides);
    if (current == null) continue;
    const balance = Number(inv.balance_due);
    const booked = Number(inv.exchange_rate);
    const bookedBase = round2(balance * booked);
    const currentBase = round2(balance * current);
    const difference = round2(currentBase - bookedBase);
    if (difference === 0) continue;
    arDiff = round2(arDiff + difference);
    details.push({ doc_type: "invoice", doc_number: inv.invoice_number, currency, balance_due: balance, booked_rate: booked, current_rate: current, booked_base: bookedBase, current_base: currentBase, difference });
  }

  for (const bill of bills) {
    const currency = bill.currency.trim();
    const current = await rateFor(tx, orgId, currency, base, asOf, overrides);
    if (current == null) continue;
    const balance = Number(bill.balance_due);
    const booked = Number(bill.exchange_rate);
    const bookedBase = round2(balance * booked);
    const currentBase = round2(balance * current);
    const difference = round2(currentBase - bookedBase);
    if (difference === 0) continue;
    apDiff = round2(apDiff + difference);
    details.push({ doc_type: "bill", doc_number: bill.bill_number, currency, balance_due: balance, booked_rate: booked, current_rate: current, booked_base: bookedBase, current_base: currentBase, difference });
  }

  // Net gain = AR gain (asset up) − AP increase (liability up).
  const netGain = round2(arDiff - apDiff);

  if (!options.post) {
    return { as_of: asOf, base_currency: base, details, net_gain: netGain, journal_entry_id: null };
  }

  // Replace any prior revaluation posted for this date (idempotent re-runs).
  // Delete lines first — no ON DELETE CASCADE FK exists on journal_entry_lines.
  await tx.$executeRaw`
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (
      SELECT id FROM journal_entries WHERE org_id = ${orgId}::uuid AND source_type = 'fx_revaluation' AND entry_date = ${asOf}::date
    )`;
  await tx.$executeRaw`
    DELETE FROM journal_entries WHERE org_id = ${orgId}::uuid AND source_type = 'fx_revaluation' AND entry_date = ${asOf}::date`;

  if (netGain === 0 && arDiff === 0 && apDiff === 0) {
    return { as_of: asOf, base_currency: base, details, net_gain: 0, journal_entry_id: null };
  }

  const lines: JournalLine[] = [];
  // Adjust the AR control account by its net difference.
  if (arDiff !== 0) {
    if (arDiff > 0) lines.push({ account_id: accounts.receivable, debit: arDiff, credit: 0, description: "FX revaluation (AR)" });
    else lines.push({ account_id: accounts.receivable, debit: 0, credit: Math.abs(arDiff), description: "FX revaluation (AR)" });
  }
  // Adjust the AP control account by its net difference.
  if (apDiff !== 0 && accounts.payable) {
    if (apDiff > 0) lines.push({ account_id: accounts.payable, debit: 0, credit: apDiff, description: "FX revaluation (AP)" });
    else lines.push({ account_id: accounts.payable, debit: Math.abs(apDiff), credit: 0, description: "FX revaluation (AP)" });
  }
  // Balancing FX gain/loss line. netGain>0 ⇒ gain (credit 6900); netGain<0 ⇒ loss (debit 6900).
  if (netGain > 0) lines.push({ account_id: fxAccountId, debit: 0, credit: netGain, description: "Unrealised FX gain" });
  else if (netGain < 0) lines.push({ account_id: fxAccountId, debit: Math.abs(netGain), credit: 0, description: "Unrealised FX loss" });

  const sourceId = crypto.randomUUID();
  const journalEntryId = await createJournalEntry(tx, {
    orgId,
    entryDate: asOf,
    memo: `FX revaluation as of ${asOf}`,
    sourceType: "fx_revaluation",
    sourceId,
    createdBy: userId,
    lines
  });

  return { as_of: asOf, base_currency: base, details, net_gain: netGain, journal_entry_id: journalEntryId };
}
