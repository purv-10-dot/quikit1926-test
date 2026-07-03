export const defaultAccountGroups = [
  { code: "1000", name: "Cash and Bank", type: "asset", normalBalance: "debit" },
  { code: "1200", name: "Accounts Receivable", type: "asset", normalBalance: "debit" },
  { code: "1400", name: "Inventory", type: "asset", normalBalance: "debit" },
  { code: "1500", name: "Fixed Assets", type: "asset", normalBalance: "debit" },
  { code: "2000", name: "Accounts Payable", type: "liability", normalBalance: "credit" },
  { code: "2200", name: "Tax Payable", type: "liability", normalBalance: "credit" },
  { code: "3000", name: "Owner Equity", type: "equity", normalBalance: "credit" },
  { code: "4000", name: "Revenue", type: "revenue", normalBalance: "credit" },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", normalBalance: "debit" },
  { code: "6000", name: "Operating Expenses", type: "expense", normalBalance: "debit" }
] as const;
