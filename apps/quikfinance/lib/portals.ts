import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";

type PortalType = "customer" | "ca";

export type PortalLink = {
  id: string;
  org_id: string;
  portal_type: PortalType;
  contact_id: string | null;
  display_name: string | null;
  email: string | null;
  access_token: string;
  expires_at: string | null;
  is_active: boolean;
};

export function createPortalToken() {
  return `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
}

export function createPortalUrl(portalType: PortalType, token: string) {
  const { appUrl } = getServerEnv();
  return `${appUrl}/portal/${portalType}/${token}`;
}

export async function getPortalLinkByToken(token: string) {
  const admin = db;
  const { data, error } = await admin
    .from("portal_links")
    .select("id, org_id, portal_type, contact_id, display_name, email, access_token, expires_at, is_active")
    .eq("access_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }

  await admin.from("portal_links").update({ last_accessed_at: new Date().toISOString() }).eq("id", data.id);

  return data as unknown as PortalLink;
}

export async function getCustomerPortalPayload(token: string) {
  const portal = await getPortalLinkByToken(token);
  if (!portal || portal.portal_type !== "customer" || !portal.contact_id) {
    return null;
  }

  const admin = db;
  const [{ data: organization }, { data: customer }, { data: invoices }, { data: paymentLinks }] = await Promise.all([
    admin.from("organizations").select("name, legal_name, base_currency, preferred_language").eq("id", portal.org_id).single(),
    admin.from("contacts").select("id, display_name, email, phone, tax_id").eq("org_id", portal.org_id).eq("id", portal.contact_id).single(),
    admin
      .from("invoices")
      .select("id, invoice_number, issue_date, due_date, total, balance_due, status")
      .eq("org_id", portal.org_id)
      .eq("contact_id", portal.contact_id)
      .order("issue_date", { ascending: false }),
    admin
      .from("invoice_payment_links")
      .select("invoice_id, short_url, status, amount, amount_paid")
      .eq("org_id", portal.org_id)
      .order("created_at", { ascending: false })
  ]);

  const paymentLinkByInvoice = new Map<string, { short_url: string | null; status: string; amount: number; amount_paid: number }>();
  for (const link of paymentLinks ?? []) {
    const invoiceId = String(link.invoice_id);
    if (!paymentLinkByInvoice.has(invoiceId)) {
      paymentLinkByInvoice.set(invoiceId, {
        short_url: typeof link.short_url === "string" ? link.short_url : null,
        status: String(link.status ?? "created"),
        amount: Number(link.amount ?? 0),
        amount_paid: Number(link.amount_paid ?? 0)
      });
    }
  }

  return {
    portal,
    organization,
    customer,
    invoices: (invoices ?? []).map((invoice) => ({
      ...invoice,
      payment_link: paymentLinkByInvoice.get(String(invoice.id)) ?? null
    }))
  };
}

export async function getCaPortalPayload(token: string) {
  const portal = await getPortalLinkByToken(token);
  if (!portal || portal.portal_type !== "ca") {
    return null;
  }

  const admin = db;
  const [{ data: organization }, { data: invoices }, { data: bills }, { data: journalEntries }, { data: auditLogs }] = await Promise.all([
    admin.from("organizations").select("name, legal_name, base_currency, gstin, pan").eq("id", portal.org_id).single(),
    admin.from("invoices").select("id, invoice_number, issue_date, total, balance_due, tax_total, status").eq("org_id", portal.org_id).order("issue_date", { ascending: false }).limit(10),
    admin.from("bills").select("id, bill_number, issue_date, total, balance_due, tax_total, status").eq("org_id", portal.org_id).order("issue_date", { ascending: false }).limit(10),
    admin.from("journal_entries").select("id, entry_number, entry_date, status, memo").eq("org_id", portal.org_id).order("entry_date", { ascending: false }).limit(10),
    admin.from("audit_logs").select("id, entity_type, action, created_at").eq("org_id", portal.org_id).order("created_at", { ascending: false }).limit(12)
  ]);

  const receivables = (invoices ?? []).reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0);
  const payables = (bills ?? []).reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0);
  const gstCollected = (invoices ?? []).reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);
  const gstInput = (bills ?? []).reduce((sum, row) => sum + Number(row.tax_total ?? 0), 0);

  return {
    portal,
    organization,
    summary: {
      receivables,
      payables,
      gstCollected,
      gstInput,
      journals: (journalEntries ?? []).length
    },
    invoices: invoices ?? [],
    bills: bills ?? [],
    journalEntries: journalEntries ?? [],
    auditLogs: auditLogs ?? []
  };
}
