import { formatDateForPattern } from "@/lib/utils/dates";

type DbLike = { from: (table: string) => any };

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asNumber(value: unknown) {
  return Number(value ?? 0);
}
function formatAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const r = value as Record<string, unknown>;
  return [r.line1, r.line2, r.city, r.state, r.postal_code ?? r.zip, r.country]
    .filter((i) => typeof i === "string" && i.trim().length > 0)
    .map((i) => String(i));
}

const REPORTING_LABEL: Record<string, string> = {
  accrual_and_cash: "Accrual and Cash", accrual_only: "Accrual Only", cash_only: "Cash Only"
};

export type JournalPdfData = {
  companyName: string;
  companyAddress: string[];
  companyGstin: string;
  journalNumber: string;
  journalDate: string;
  referenceNumber: string;
  notes: string;
  reportingMethod: string;
  currency: string;
  status: string;
  subtotalDebit: number;
  subtotalCredit: number;
  lines: { account: string; description: string; contact: string; debit: number; credit: number }[];
};

export async function loadJournalPdfData(db: DbLike, orgId: string, id: string): Promise<JournalPdfData> {
  const [{ data: je, error }, { data: organization }] = await Promise.all([
    db.from("journal_entries").select("id, entry_number, entry_date, status, memo, reference_number, reporting_method, currency").eq("org_id", orgId).eq("id", id).single(),
    db.from("organizations").select("name, gstin, address, date_format").eq("id", orgId).single()
  ]);
  if (error || !je) throw new Error("Journal entry was not found.");

  const { data: lineRows } = await db.from("journal_entry_lines").select("account_id, contact_id, description, debit, credit").eq("journal_entry_id", id).order("display_order", { ascending: true });
  const lines = (lineRows ?? []) as Array<Record<string, unknown>>;

  const accountIds = Array.from(new Set(lines.map((l) => asString(l.account_id)).filter(Boolean)));
  const contactIds = Array.from(new Set(lines.map((l) => asString(l.contact_id)).filter(Boolean)));
  const [{ data: accountRows }, { data: contactRows }] = await Promise.all([
    accountIds.length ? db.from("accounts").select("id, code, name").in("id", accountIds) : Promise.resolve({ data: [] }),
    contactIds.length ? db.from("contacts").select("id, display_name").in("id", contactIds) : Promise.resolve({ data: [] })
  ]);
  const accountById = new Map<string, string>((accountRows ?? []).map((a: Record<string, unknown>) => [asString(a.id), `${asString(a.code)} · ${asString(a.name)}`.replace(/^ · /, "")]));
  const contactById = new Map<string, string>((contactRows ?? []).map((c: Record<string, unknown>) => [asString(c.id), asString(c.display_name)]));

  let subtotalDebit = 0;
  let subtotalCredit = 0;
  const mapped = lines.map((l) => {
    const debit = asNumber(l.debit);
    const credit = asNumber(l.credit);
    subtotalDebit += debit;
    subtotalCredit += credit;
    return { account: accountById.get(asString(l.account_id)) || "Account", description: asString(l.description), contact: contactById.get(asString(l.contact_id)) || "", debit, credit };
  });

  return {
    companyName: asString(organization?.name, "Your Company"),
    companyAddress: formatAddress(organization?.address),
    companyGstin: asString(organization?.gstin),
    journalNumber: asString(je.entry_number),
    journalDate: formatDateForPattern(asString(je.entry_date), asString(organization?.date_format) || "DD/MM/YYYY"),
    referenceNumber: asString(je.reference_number),
    notes: asString(je.memo),
    reportingMethod: REPORTING_LABEL[asString(je.reporting_method, "accrual_and_cash")] ?? "Accrual and Cash",
    currency: asString(je.currency, "INR"),
    status: je.status === "posted" ? "Published" : "Draft",
    subtotalDebit: Math.round(subtotalDebit * 100) / 100,
    subtotalCredit: Math.round(subtotalCredit * 100) / 100,
    lines: mapped
  };
}
