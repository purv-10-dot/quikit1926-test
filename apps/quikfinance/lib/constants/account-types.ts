/**
 * Chart of Accounts type metadata (Zoho-style). The `value`s match the GL
 * `account_type` enum used across posting/reporting — only the labels, grouping,
 * and descriptions are presentation. `normalBalance` drives the Dr/Cr display.
 */
export type AccountGroup = "Asset" | "Liability" | "Equity" | "Income" | "Expense";

export type AccountTypeMeta = {
  value: string;
  label: string;
  group: AccountGroup;
  normalBalance: "debit" | "credit";
  description: string;
};

export const ACCOUNT_TYPES: AccountTypeMeta[] = [
  // Asset
  { value: "other_asset", label: "Other Asset", group: "Asset", normalBalance: "debit", description: "Track special assets like goodwill and other intangible assets." },
  { value: "other_current_asset", label: "Other Current Asset", group: "Asset", normalBalance: "debit", description: "Any short term asset that can be converted into cash or cash equivalents easily, such as prepaid expenses, stocks and mutual funds." },
  { value: "cash", label: "Cash", group: "Asset", normalBalance: "debit", description: "Cash on hand and petty cash held by the business." },
  { value: "bank", label: "Bank", group: "Asset", normalBalance: "debit", description: "Money held in your bank and deposit accounts." },
  { value: "fixed_asset", label: "Fixed Asset", group: "Asset", normalBalance: "debit", description: "Long-term tangible assets such as equipment, furniture, and buildings." },
  { value: "accounts_receivable", label: "Accounts Receivable", group: "Asset", normalBalance: "debit", description: "Money owed to your business by your customers." },
  // Liability
  { value: "other_current_liability", label: "Other Current Liability", group: "Liability", normalBalance: "credit", description: "Short-term obligations due within a year, such as taxes payable and unearned revenue." },
  { value: "long_term_liability", label: "Long Term Liability", group: "Liability", normalBalance: "credit", description: "Obligations due beyond a year, such as loans and mortgages." },
  { value: "accounts_payable", label: "Accounts Payable", group: "Liability", normalBalance: "credit", description: "Money your business owes to its vendors." },
  // Equity
  { value: "equity", label: "Equity", group: "Equity", normalBalance: "credit", description: "Owner's residual interest in the business after liabilities — capital and drawings." },
  { value: "retained_earnings", label: "Retained Earnings", group: "Equity", normalBalance: "credit", description: "Accumulated net profits retained in the business." },
  // Income
  { value: "revenue", label: "Income", group: "Income", normalBalance: "credit", description: "Income earned from the primary operations of your business." },
  { value: "other_income", label: "Other Income", group: "Income", normalBalance: "credit", description: "Income earned from sources other than primary operations, such as interest." },
  // Expense
  { value: "expense", label: "Expense", group: "Expense", normalBalance: "debit", description: "Costs incurred in the regular running of your business." },
  { value: "cost_of_goods_sold", label: "Cost of Goods Sold", group: "Expense", normalBalance: "debit", description: "Direct costs of producing the goods sold by your business." },
  { value: "other_expense", label: "Other Expense", group: "Expense", normalBalance: "debit", description: "Miscellaneous expenses that are not part of normal operations." }
];

export const ACCOUNT_GROUP_ORDER: AccountGroup[] = ["Asset", "Liability", "Equity", "Income", "Expense"];

const BY_VALUE = new Map(ACCOUNT_TYPES.map((t) => [t.value, t]));

export function accountTypeMeta(value: string | null | undefined): AccountTypeMeta | undefined {
  return value ? BY_VALUE.get(value) : undefined;
}

export function accountTypeLabel(value: string | null | undefined): string {
  return accountTypeMeta(value)?.label ?? (value ? String(value) : "—");
}

/** Grouped options for a <select> with <optgroup>. */
export function groupedAccountTypes(): { group: AccountGroup; types: AccountTypeMeta[] }[] {
  return ACCOUNT_GROUP_ORDER.map((group) => ({ group, types: ACCOUNT_TYPES.filter((t) => t.group === group) }));
}
