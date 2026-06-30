import { Prisma } from "@prisma/client";
import type { CustomerInput } from "@/lib/validations/customer.schema";
import type { VendorInput } from "@/lib/validations/vendor.schema";
import { decryptField, encryptField, maskAccountNumber } from "@/lib/crypto";
import { loadCustomerVendorSettings } from "@/lib/settings/customer-vendor";

type Tx = Prisma.TransactionClient;
type PartyInput = CustomerInput | VendorInput;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type PartyType = "customer" | "vendor";

/** Next per-org party code, e.g. CUST-00001 / VEND-00001. */
async function nextPartyCode(tx: Tx, orgId: string, type: PartyType): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM contacts WHERE org_id = ${orgId}::uuid AND type = ${type}`;
  const next = Number(rows[0]?.count ?? 0) + 1;
  return `${type === "vendor" ? "VEND" : "CUST"}-${String(next).padStart(5, "0")}`;
}

/**
 * Create or update a customer (contact) with its nested children (contact
 * persons, bank accounts, documents) in one transaction. Bank account numbers
 * are encrypted at rest. Returns the contact id.
 */
export async function saveCustomer(
  tx: Tx,
  orgId: string,
  userId: string | null,
  input: PartyInput,
  contactId?: string,
  type: PartyType = "customer"
): Promise<{ id: string }> {
  const settings = await loadCustomerVendorSettings(tx, orgId);
  const billing = JSON.stringify(input.billing_address ?? {});
  const shipping = JSON.stringify(input.shipping_address ?? {});
  const customFields = JSON.stringify(input.custom_fields ?? []);
  // The form's single account field maps to A/R for customers, A/P for vendors.
  const arId = type === "customer" ? (input.ar_account_id ?? null) : null;
  const apId = type === "vendor" ? (input.ar_account_id ?? null) : null;

  // Enforce unique display name unless duplicates are allowed (Settings).
  if (!settings.allow_duplicate_names) {
    const dup = (await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM contacts WHERE org_id = ${orgId}::uuid AND lower(display_name) = lower(${input.display_name})
      ${contactId ? Prisma.sql`AND id <> ${contactId}::uuid` : Prisma.empty} LIMIT 1`);
    if (dup.length) throw new Error(`A customer or vendor named "${input.display_name}" already exists. Enable duplicate names in Settings → Customers & Vendors to allow this.`);
  }

  let id = contactId ?? "";
  if (contactId) {
    await tx.$executeRaw`
      UPDATE contacts SET
        contact_kind = ${input.contact_kind},
        customer_category = ${input.customer_category},
        display_name = ${input.display_name},
        company_name = ${input.company_name ?? null},
        first_name = ${input.first_name ?? null},
        last_name = ${input.last_name ?? null},
        email = ${input.email ?? null},
        phone = ${input.phone ?? null},
        mobile = ${input.mobile ?? null},
        website = ${input.website ?? null},
        customer_language = ${input.customer_language},
        date_format = ${input.date_format ?? null},
        status = ${input.status},
        is_active = ${input.is_active},
        tax_id = ${input.tax_id ?? null},
        pan = ${input.pan ?? null},
        tan = ${input.tan ?? null},
        msme_number = ${input.msme_number ?? null},
        cin_number = ${input.cin_number ?? null},
        tax_category = ${input.tax_category ?? null},
        tax_exempt = ${input.tax_exempt},
        gst_treatment = ${input.gst_treatment},
        state_code = ${input.state_code ?? null},
        currency = ${input.currency},
        ar_account_id = ${arId}::uuid,
        ap_account_id = ${apId}::uuid,
        payment_terms = ${input.payment_terms},
        credit_limit = ${input.credit_limit ?? null},
        credit_days = ${input.credit_days ?? null},
        opening_balance = ${input.opening_balance},
        price_list = ${input.price_list ?? null},
        tds_applicable = ${input.tds_applicable},
        billing_address = ${billing}::jsonb,
        shipping_address = ${shipping}::jsonb,
        account_owner = ${input.account_owner ?? null},
        salesperson = ${input.salesperson ?? null},
        lead_source = ${input.lead_source ?? null},
        customer_segment = ${input.customer_segment ?? null},
        territory = ${input.territory ?? null},
        region = ${input.region ?? null},
        referral_partner = ${input.referral_partner ?? null},
        portal_enabled = ${input.portal_enabled},
        portal_username = ${input.portal_username ?? null},
        mfa_enabled = ${input.mfa_enabled},
        project_name = ${input.project_name ?? null},
        site_name = ${input.site_name ?? null},
        project_manager = ${input.project_manager ?? null},
        contract_value = ${input.contract_value ?? null},
        customer_since = ${input.customer_since ?? null}::date,
        custom_fields = ${customFields}::jsonb,
        notes = ${input.notes ?? null},
        updated_by = ${userId ? userId : null}::uuid,
        updated_at = now()
      WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    // Auto-number only when enabled in Settings (else keep any explicit code, or none).
    const numbersEnabled = type === "vendor" ? settings.enable_vendor_numbers : settings.enable_customer_numbers;
    const code = input.customer_code && input.customer_code.length > 0
      ? input.customer_code
      : numbersEnabled
        ? await nextPartyCode(tx, orgId, type)
        : null;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO contacts (
        org_id, type, contact_kind, customer_category, customer_code, display_name, company_name, first_name, last_name,
        email, phone, mobile, website, customer_language, date_format, status, is_active, tax_id, pan, tan, msme_number, cin_number,
        tax_category, tax_exempt, gst_treatment, state_code, currency, ar_account_id, ap_account_id, payment_terms, credit_limit, credit_days,
        opening_balance, price_list, tds_applicable, billing_address, shipping_address, account_owner, salesperson, lead_source,
        customer_segment, territory, region, referral_partner, portal_enabled, portal_username, mfa_enabled, project_name,
        site_name, project_manager, contract_value, customer_since, custom_fields, notes, created_by, updated_by
      ) VALUES (
        ${orgId}::uuid, ${type}, ${input.contact_kind}, ${input.customer_category}, ${code}, ${input.display_name},
        ${input.company_name ?? null}, ${input.first_name ?? null}, ${input.last_name ?? null}, ${input.email ?? null},
        ${input.phone ?? null}, ${input.mobile ?? null}, ${input.website ?? null}, ${input.customer_language}, ${input.date_format ?? null}, ${input.status},
        ${input.is_active}, ${input.tax_id ?? null}, ${input.pan ?? null}, ${input.tan ?? null}, ${input.msme_number ?? null},
        ${input.cin_number ?? null}, ${input.tax_category ?? null}, ${input.tax_exempt}, ${input.gst_treatment},
        ${input.state_code ?? null}, ${input.currency}, ${arId}::uuid, ${apId}::uuid, ${input.payment_terms},
        ${input.credit_limit ?? null}, ${input.credit_days ?? null}, ${input.opening_balance}, ${input.price_list ?? null},
        ${input.tds_applicable}, ${billing}::jsonb, ${shipping}::jsonb, ${input.account_owner ?? null}, ${input.salesperson ?? null},
        ${input.lead_source ?? null}, ${input.customer_segment ?? null}, ${input.territory ?? null}, ${input.region ?? null},
        ${input.referral_partner ?? null}, ${input.portal_enabled}, ${input.portal_username ?? null}, ${input.mfa_enabled},
        ${input.project_name ?? null}, ${input.site_name ?? null}, ${input.project_manager ?? null}, ${input.contract_value ?? null},
        ${input.customer_since ?? null}::date, ${customFields}::jsonb, ${input.notes ?? null}, ${userId ? userId : null}::uuid, ${userId ? userId : null}::uuid
      ) RETURNING id`;
    id = rows[0].id;
  }

  // Replace nested children when provided (undefined = leave untouched).
  if (input.contacts_people) {
    await tx.$executeRaw`DELETE FROM contact_persons WHERE contact_id = ${id}::uuid AND org_id = ${orgId}::uuid`;
    let order = 0;
    for (const person of input.contacts_people) {
      await tx.$executeRaw`
        INSERT INTO contact_persons (org_id, contact_id, name, designation, department, email, mobile, whatsapp, is_primary, is_decision_maker, display_order)
        VALUES (${orgId}::uuid, ${id}::uuid, ${person.name}, ${person.designation ?? null}, ${person.department ?? null},
          ${person.email ?? null}, ${person.mobile ?? null}, ${person.whatsapp ?? null}, ${person.is_primary}, ${person.is_decision_maker}, ${order})`;
      order += 1;
    }
  }

  if (input.bank_accounts) {
    await tx.$executeRaw`DELETE FROM contact_bank_accounts WHERE contact_id = ${id}::uuid AND org_id = ${orgId}::uuid`;
    for (const bank of input.bank_accounts) {
      await tx.$executeRaw`
        INSERT INTO contact_bank_accounts (org_id, contact_id, account_holder_name, bank_name, account_number_enc, ifsc, branch, swift_code, upi_id)
        VALUES (${orgId}::uuid, ${id}::uuid, ${bank.account_holder_name ?? null}, ${bank.bank_name ?? null},
          ${encryptField(bank.account_number)}, ${bank.ifsc ?? null}, ${bank.branch ?? null}, ${bank.swift_code ?? null}, ${bank.upi_id ?? null})`;
    }
  }

  if (input.documents) {
    await tx.$executeRaw`DELETE FROM contact_documents WHERE contact_id = ${id}::uuid AND org_id = ${orgId}::uuid`;
    for (const doc of input.documents) {
      await tx.$executeRaw`
        INSERT INTO contact_documents (org_id, contact_id, doc_type, file_name, storage_url, mime_type, size_bytes, uploaded_by)
        VALUES (${orgId}::uuid, ${id}::uuid, ${doc.doc_type}, ${doc.file_name}, ${doc.storage_url ?? null}, ${doc.mime_type ?? null}, ${doc.size_bytes}, ${userId ? userId : null}::uuid)`;
    }
  }

  return { id };
}

export type CustomerFinancials = {
  outstanding_balance: number;
  unused_credits: number;
  total_invoices: number;
  total_revenue: number;
  last_payment_date: string | null;
  credit_utilization: number; // percentage 0..100+
};

/**
 * Live financial KPIs. For customers: receivables from invoices + payments
 * received. For vendors: payables from bills + payments made.
 */
export async function customerFinancials(tx: Tx, orgId: string, contactId: string, creditLimit: number | null, type: PartyType = "customer"): Promise<CustomerFinancials> {
  if (type === "vendor") {
    const billRows = await tx.$queryRaw<Array<{ cnt: bigint; spend: string | null; outstanding: string | null }>>`
      SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total), 0) AS spend, COALESCE(SUM(balance_due), 0) AS outstanding
      FROM bills WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid`;
    const payRows = await tx.$queryRaw<Array<{ last_date: Date | null; unused: string | null }>>`
      SELECT MAX(payment_date) AS last_date, COALESCE(SUM(unapplied_amount), 0) AS unused FROM payments
      WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND payment_type = 'made'`;
    const outstanding = round2(Number(billRows[0]?.outstanding ?? 0));
    return {
      outstanding_balance: outstanding,
      unused_credits: round2(Number(payRows[0]?.unused ?? 0)),
      total_invoices: Number(billRows[0]?.cnt ?? 0),
      total_revenue: round2(Number(billRows[0]?.spend ?? 0)),
      last_payment_date: payRows[0]?.last_date ? new Date(payRows[0].last_date).toISOString().slice(0, 10) : null,
      credit_utilization: creditLimit && creditLimit > 0 ? round2((outstanding / creditLimit) * 100) : 0
    };
  }

  const invRows = await tx.$queryRaw<Array<{ cnt: bigint; revenue: string | null; outstanding: string | null }>>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(balance_due), 0) AS outstanding
    FROM invoices WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid`;
  const payRows = await tx.$queryRaw<Array<{ last_date: Date | null; unused: string | null }>>`
    SELECT MAX(payment_date) AS last_date, COALESCE(SUM(unapplied_amount), 0) AS unused FROM payments
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND payment_type = 'received'`;

  const outstanding = round2(Number(invRows[0]?.outstanding ?? 0));
  const lastDate = payRows[0]?.last_date ? new Date(payRows[0].last_date).toISOString().slice(0, 10) : null;
  const utilization = creditLimit && creditLimit > 0 ? round2((outstanding / creditLimit) * 100) : 0;

  return {
    outstanding_balance: outstanding,
    unused_credits: round2(Number(payRows[0]?.unused ?? 0)),
    total_invoices: Number(invRows[0]?.cnt ?? 0),
    total_revenue: round2(Number(invRows[0]?.revenue ?? 0)),
    last_payment_date: lastDate,
    credit_utilization: utilization
  };
}

/** Load a customer/vendor with nested children (bank numbers masked) and computed KPIs. */
export async function loadCustomer(tx: Tx, orgId: string, contactId: string, type: PartyType = "customer") {
  const rows = (await tx.$queryRaw`
    SELECT * FROM contacts WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid AND type = ${type} LIMIT 1
  `) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const contact = rows[0];

  const people = (await tx.$queryRaw`
    SELECT * FROM contact_persons WHERE contact_id = ${contactId}::uuid ORDER BY display_order ASC
  `) as unknown[];
  const banksRaw = (await tx.$queryRaw`
    SELECT * FROM contact_bank_accounts WHERE contact_id = ${contactId}::uuid ORDER BY created_at ASC
  `) as Array<Record<string, unknown>>;
  const documents = (await tx.$queryRaw`
    SELECT * FROM contact_documents WHERE contact_id = ${contactId}::uuid ORDER BY created_at DESC
  `) as unknown[];

  const bank_accounts = banksRaw.map((bank) => {
    const decrypted = decryptField(bank.account_number_enc as string | null);
    return {
      ...bank,
      account_number_masked: maskAccountNumber(decrypted),
      account_number_enc: undefined
    };
  });

  const financials = await customerFinancials(tx, orgId, contactId, contact.credit_limit != null ? Number(contact.credit_limit) : null, type);

  // Last 6 months: invoiced income (customer) or billed spend (vendor).
  const incomeRows = type === "vendor"
    ? ((await tx.$queryRaw`
        SELECT to_char(m.d, 'Mon YYYY') AS label, COALESCE(SUM(b.total), 0) AS total
        FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months', date_trunc('month', CURRENT_DATE), interval '1 month') AS m(d)
        LEFT JOIN bills b ON date_trunc('month', b.issue_date) = m.d AND b.org_id = ${orgId}::uuid AND b.contact_id = ${contactId}::uuid
        GROUP BY m.d ORDER BY m.d`) as Array<{ label: string; total: string }>)
    : ((await tx.$queryRaw`
        SELECT to_char(m.d, 'Mon YYYY') AS label, COALESCE(SUM(i.total), 0) AS total
        FROM generate_series(date_trunc('month', CURRENT_DATE) - interval '5 months', date_trunc('month', CURRENT_DATE), interval '1 month') AS m(d)
        LEFT JOIN invoices i ON date_trunc('month', i.issue_date) = m.d AND i.org_id = ${orgId}::uuid AND i.contact_id = ${contactId}::uuid
        GROUP BY m.d ORDER BY m.d`) as Array<{ label: string; total: string }>);
  const monthly_income = incomeRows.map((r) => ({ month: r.label, total: round2(Number(r.total)) }));

  return { ...contact, contacts_people: people, bank_accounts, documents, financials, monthly_income };
}
