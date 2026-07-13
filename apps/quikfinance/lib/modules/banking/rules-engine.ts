export interface BankRule {
  id: string;
  match_field: "description" | "amount" | "reference";
  match_type: "contains" | "starts_with" | "ends_with" | "exact" | "regex";
  match_value: string;
  transaction_type?: "credit" | "debit" | null;
  category?: string | null;
  action_account_id?: string | null;
  action_contact_id?: string | null;
  auto_reconcile: boolean;
}

export interface BankTransaction {
  id: string;
  description: string;
  amount: number;
  reference?: string | null;
  transaction_type: "credit" | "debit";
}

export interface RuleMatch {
  ruleId: string;
  category: string | null;
  actionAccountId: string | null;
  actionContactId: string | null;
  autoReconcile: boolean;
}

function matchesRule(tx: BankTransaction, rule: BankRule): boolean {
  if (rule.transaction_type && rule.transaction_type !== tx.transaction_type) return false;

  const fieldValue =
    rule.match_field === "description"
      ? tx.description
      : rule.match_field === "reference"
      ? (tx.reference ?? "")
      : String(Math.abs(tx.amount));

  const v = rule.match_value;

  switch (rule.match_type) {
    case "contains":
      return fieldValue.toLowerCase().includes(v.toLowerCase());
    case "starts_with":
      return fieldValue.toLowerCase().startsWith(v.toLowerCase());
    case "ends_with":
      return fieldValue.toLowerCase().endsWith(v.toLowerCase());
    case "exact":
      return fieldValue.toLowerCase() === v.toLowerCase();
    case "regex":
      try {
        return new RegExp(v, "i").test(fieldValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Evaluates an ordered list of rules against a transaction.
 * Returns the first matching rule's suggested categorisation, or null.
 */
export function applyRules(tx: BankTransaction, rules: BankRule[]): RuleMatch | null {
  for (const rule of rules) {
    if (matchesRule(tx, rule)) {
      return {
        ruleId: rule.id,
        category: rule.category ?? null,
        actionAccountId: rule.action_account_id ?? null,
        actionContactId: rule.action_contact_id ?? null,
        autoReconcile: rule.auto_reconcile
      };
    }
  }
  return null;
}

/**
 * Applies rules to a batch of transactions.
 * Returns a map of transaction id → rule match (or null if no rule matched).
 */
export function applyRulesBatch(
  transactions: BankTransaction[],
  rules: BankRule[]
): Map<string, RuleMatch | null> {
  const result = new Map<string, RuleMatch | null>();
  for (const tx of transactions) {
    result.set(tx.id, applyRules(tx, rules));
  }
  return result;
}
