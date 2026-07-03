export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type TableShape<Row extends Record<string, unknown>, Insert extends Record<string, unknown>, Update extends Record<string, unknown>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type TenantRow = {
  id: string;
  org_id: string;
  created_at: string;
  updated_at?: string | null;
};

export type ContactRow = TenantRow & {
  type: "customer" | "vendor" | "both";
  display_name: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  tax_id: string | null;
  pan: string | null;
  gst_treatment: string;
  state_code: string | null;
  currency: string;
  payment_terms: number;
  credit_limit: number | null;
  opening_balance: number;
  billing_address: Json;
  shipping_address: Json;
  notes: string | null;
  is_active: boolean;
};

export type DocumentRow = TenantRow & {
  contact_id: string;
  status: string;
  currency: string;
  exchange_rate: number;
  issue_date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  balance_due: number;
  notes: string | null;
};

export type InvoiceRow = DocumentRow & {
  invoice_number: string;
  place_of_supply: string | null;
  round_off: number;
  terms: string | null;
  template_type: string;
};

export type BillRow = DocumentRow & {
  bill_number: string;
  place_of_supply: string | null;
  tds_amount: number;
};

export type PaymentRow = TenantRow & {
  contact_id: string | null;
  payment_type: "received" | "made";
  payment_date: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  method: string;
  reference: string | null;
  status: string;
  memo: string | null;
};

export type JournalEntryRow = TenantRow & {
  entry_number: string;
  entry_date: string;
  status: string;
  memo: string | null;
  source_type: string | null;
  source_id: string | null;
};

export type AccountRow = TenantRow & {
  category_id: string | null;
  parent_id: string | null;
  code: string;
  name: string;
  description: string | null;
  account_type: string;
  currency: string;
  is_active: boolean;
  is_system: boolean;
  balance: number;
};

export type BankAccountRow = TenantRow & {
  account_id: string | null;
  name: string;
  institution_name: string | null;
  account_number_last4: string | null;
  currency: string;
  current_balance: number;
  is_active: boolean;
};

export type BankTransactionRow = {
  id: string;
  org_id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  reference: string | null;
  matched_journal_entry_id: string | null;
  reconciliation_id: string | null;
  status: string;
  created_at: string;
};

export type ReconciliationRow = {
  id: string;
  org_id: string;
  bank_account_id: string;
  statement_start: string;
  statement_end: string;
  statement_balance: number;
  book_balance: number;
  difference: number;
  status: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ExpenseRow = TenantRow & {
  expense_date: string;
  vendor_id: string | null;
  account_id: string;
  project_id: string | null;
  amount: number;
  tax_amount: number;
  currency: string;
  receipt_url: string | null;
  is_billable: boolean;
  description: string;
  status: string;
};

export type ProjectRow = TenantRow & {
  name: string;
  customer_id: string | null;
  status: string;
  budget_amount: number;
  billing_method: string;
};

export type InventoryItemRow = TenantRow & {
  sku: string;
  name: string;
  unit: string;
  sales_price: number;
  purchase_price: number;
  hsn_sac_code: string | null;
  gst_rate: number;
  category_name: string | null;
  barcode: string | null;
  track_inventory: boolean;
  quantity_on_hand: number;
  reorder_point: number;
  is_active: boolean;
};

export type OrganizationRow = TenantRow & {
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  gstin: string | null;
  pan: string | null;
  state_code: string | null;
  preferred_language: string;
  default_upi_id: string | null;
  base_currency: string;
  fiscal_year_start: number;
  timezone: string;
};

export type CommercialDocumentRow = TenantRow & {
  contact_id: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  currency: string;
  notes: string | null;
  status: string;
  created_by?: string | null;
};

export type QuotationRow = CommercialDocumentRow & {
  quotation_number: string;
};

export type SalesOrderRow = CommercialDocumentRow & {
  sales_order_number: string;
};

export type PurchaseOrderRow = CommercialDocumentRow & {
  purchase_order_number: string;
};

export type CreditNoteRow = CommercialDocumentRow & {
  invoice_id: string | null;
  credit_note_number: string;
};

export type VendorCreditRow = CommercialDocumentRow & {
  bill_id: string | null;
  vendor_credit_number: string;
};

export type TimeEntryRow = TenantRow & {
  project_id: string;
  user_id: string | null;
  work_date: string;
  hours: number;
  rate: number;
  description: string;
  is_billable: boolean;
  is_billed: boolean;
};

export type FixedAssetRow = TenantRow & {
  asset_number: string;
  name: string;
  purchase_date: string;
  purchase_cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  status: string;
};

export type BudgetRow = TenantRow & {
  name: string;
  fiscal_year: number;
  status: string;
  total_amount: number;
};

export type TaxRateRow = TenantRow & {
  name: string;
  rate: number;
  tax_type: string;
  is_compound: boolean;
  is_active: boolean;
};

export type CurrencyRow = {
  code: string;
  name: string;
  symbol: string;
  decimal_places: number;
};

export type ProfileRow = {
  id: string;
  org_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

export type AuditLogRow = {
  id: string;
  org_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Json;
  new_values: Json;
  created_at: string;
};

export type ImportJobRow = {
  id: string;
  org_id: string;
  source_type: string;
  entity_type: string;
  file_name: string | null;
  status: string;
  bank_account_id: string | null;
  raw_payload: string | null;
  total_rows: number;
  imported_rows: number;
  failed_rows: number;
  summary: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PeriodLockRow = {
  id: string;
  org_id: string;
  start_date: string;
  end_date: string;
  lock_scope: string;
  reason: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type OcrDocumentRow = {
  id: string;
  org_id: string;
  document_type: string;
  source_name: string;
  source_text: string;
  status: string;
  linked_entity_id: string | null;
  extracted_fields: Json;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type InvoicePaymentLinkRow = {
  id: string;
  org_id: string;
  invoice_id: string;
  provider: string;
  provider_link_id: string;
  reference_id: string | null;
  short_url: string | null;
  status: string;
  currency: string;
  amount: number;
  amount_paid: number;
  amount_refunded: number;
  callback_url: string | null;
  latest_payment_id: string | null;
  raw_response: Json;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type GatewayEventRow = {
  id: string;
  org_id: string;
  provider: string;
  event_id: string;
  event_type: string;
  invoice_id: string | null;
  provider_link_id: string | null;
  provider_payment_id: string | null;
  provider_refund_id: string | null;
  payload: Json;
  processed_at: string | null;
  created_at: string;
};

export type PortalLinkRow = {
  id: string;
  org_id: string;
  portal_type: "customer" | "ca";
  contact_id: string | null;
  display_name: string | null;
  email: string | null;
  access_token: string;
  permissions: Json;
  expires_at: string | null;
  last_accessed_at: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PortalCommentRow = {
  id: string;
  org_id: string;
  portal_link_id: string;
  author_name: string;
  author_email: string | null;
  body: string;
  created_at: string;
};

export type SupportConversationRow = {
  id: string;
  org_id: string;
  portal_link_id: string;
  contact_id: string | null;
  title: string | null;
  status: string;
  last_message_at: string;
  created_at: string;
  updated_at: string | null;
};

export type SupportMessageRow = {
  id: string;
  org_id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  body: string;
  metadata: Json;
  created_at: string;
};

export type SupportTicketRow = {
  id: string;
  org_id: string;
  portal_link_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  ticket_number: string;
  subject: string;
  summary: string;
  priority: string;
  status: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  source: string;
  created_at: string;
  updated_at: string | null;
};

type InsertOf<T extends Record<string, unknown>> = Partial<T> & Record<string, unknown>;
type UpdateOf<T extends Record<string, unknown>> = Partial<T> & Record<string, unknown>;

export type Database = {
  public: {
    Tables: {
      organizations: TableShape<OrganizationRow, InsertOf<OrganizationRow>, UpdateOf<OrganizationRow>>;
      profiles: TableShape<ProfileRow, InsertOf<ProfileRow>, UpdateOf<ProfileRow>>;
      contacts: TableShape<ContactRow, InsertOf<ContactRow>, UpdateOf<ContactRow>>;
      invoices: TableShape<InvoiceRow, InsertOf<InvoiceRow>, UpdateOf<InvoiceRow>>;
      bills: TableShape<BillRow, InsertOf<BillRow>, UpdateOf<BillRow>>;
      payments: TableShape<PaymentRow, InsertOf<PaymentRow>, UpdateOf<PaymentRow>>;
      expenses: TableShape<ExpenseRow, InsertOf<ExpenseRow>, UpdateOf<ExpenseRow>>;
      journal_entries: TableShape<JournalEntryRow, InsertOf<JournalEntryRow>, UpdateOf<JournalEntryRow>>;
      accounts: TableShape<AccountRow, InsertOf<AccountRow>, UpdateOf<AccountRow>>;
      bank_accounts: TableShape<BankAccountRow, InsertOf<BankAccountRow>, UpdateOf<BankAccountRow>>;
      bank_transactions: TableShape<BankTransactionRow, InsertOf<BankTransactionRow>, UpdateOf<BankTransactionRow>>;
      reconciliations: TableShape<ReconciliationRow, InsertOf<ReconciliationRow>, UpdateOf<ReconciliationRow>>;
      budgets: TableShape<BudgetRow, InsertOf<BudgetRow>, UpdateOf<BudgetRow>>;
      fixed_assets: TableShape<FixedAssetRow, InsertOf<FixedAssetRow>, UpdateOf<FixedAssetRow>>;
      items: TableShape<InventoryItemRow, InsertOf<InventoryItemRow>, UpdateOf<InventoryItemRow>>;
      projects: TableShape<ProjectRow, InsertOf<ProjectRow>, UpdateOf<ProjectRow>>;
      tax_rates: TableShape<TaxRateRow, InsertOf<TaxRateRow>, UpdateOf<TaxRateRow>>;
      currencies: TableShape<CurrencyRow, InsertOf<CurrencyRow>, UpdateOf<CurrencyRow>>;
      exchange_rates: TableShape<TenantRow & { from_currency: string; to_currency: string; rate: number; effective_date: string }, InsertOf<TenantRow & { from_currency: string; to_currency: string; rate: number; effective_date: string }>, UpdateOf<TenantRow & { from_currency: string; to_currency: string; rate: number; effective_date: string }>>;
      import_jobs: TableShape<ImportJobRow, InsertOf<ImportJobRow>, UpdateOf<ImportJobRow>>;
      period_locks: TableShape<PeriodLockRow, InsertOf<PeriodLockRow>, UpdateOf<PeriodLockRow>>;
      ocr_documents: TableShape<OcrDocumentRow, InsertOf<OcrDocumentRow>, UpdateOf<OcrDocumentRow>>;
      invoice_payment_links: TableShape<InvoicePaymentLinkRow, InsertOf<InvoicePaymentLinkRow>, UpdateOf<InvoicePaymentLinkRow>>;
      gateway_events: TableShape<GatewayEventRow, InsertOf<GatewayEventRow>, UpdateOf<GatewayEventRow>>;
      audit_logs: TableShape<AuditLogRow, InsertOf<AuditLogRow>, UpdateOf<AuditLogRow>>;
      portal_links: TableShape<PortalLinkRow, InsertOf<PortalLinkRow>, UpdateOf<PortalLinkRow>>;
      portal_comments: TableShape<PortalCommentRow, InsertOf<PortalCommentRow>, UpdateOf<PortalCommentRow>>;
      support_conversations: TableShape<SupportConversationRow, InsertOf<SupportConversationRow>, UpdateOf<SupportConversationRow>>;
      support_messages: TableShape<SupportMessageRow, InsertOf<SupportMessageRow>, UpdateOf<SupportMessageRow>>;
      support_tickets: TableShape<SupportTicketRow, InsertOf<SupportTicketRow>, UpdateOf<SupportTicketRow>>;
      quotations: TableShape<QuotationRow, InsertOf<QuotationRow>, UpdateOf<QuotationRow>>;
      sales_orders: TableShape<SalesOrderRow, InsertOf<SalesOrderRow>, UpdateOf<SalesOrderRow>>;
      purchase_orders: TableShape<PurchaseOrderRow, InsertOf<PurchaseOrderRow>, UpdateOf<PurchaseOrderRow>>;
      credit_notes: TableShape<CreditNoteRow, InsertOf<CreditNoteRow>, UpdateOf<CreditNoteRow>>;
      vendor_credits: TableShape<VendorCreditRow, InsertOf<VendorCreditRow>, UpdateOf<VendorCreditRow>>;
      time_entries: TableShape<TimeEntryRow, InsertOf<TimeEntryRow>, UpdateOf<TimeEntryRow>>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
