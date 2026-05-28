"use client";

import { useCallback, useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useBanks, useCreateBank, useUpdateBank, useCompanies } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateIFSC, validateMinLength } from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "bankName", label: "Bank Name", required: true },
  { key: "branchName", label: "Branch Name" },
  { key: "accountNo", label: "Account Number", required: true },
  { key: "ifscCode", label: "IFSC Code", required: true },
  { key: "accountType", label: "Account Type", hint: "current | savings" },
  { key: "companyName", label: "Company", required: true, hint: "Must match an existing company name" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row {
  id: string;
  bankName: string;
  branchName?: string;
  accountNo: string;
  ifscCode: string;
  accountType: string;
  companyId?: string;
  companyName?: string;
  status: string;
}

const emptyForm = { bankName: "", branchName: "", accountNo: "", ifscCode: "", accountType: "current", companyId: "", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  bankName: [{ required: true, label: "Bank name" }],
  accountNo: [
    { required: true, label: "Account number" },
    { validator: (v) => {
        const cleaned = String(v ?? "").trim();
        if (!/^\d{6,20}$/.test(cleaned)) return { valid: false, error: "Account number must be 6–20 digits" };
        return { valid: true };
    } },
  ],
  ifscCode: [
    { required: true, label: "IFSC code" },
    { validator: validateIFSC },
  ],
  branchName: [{ validator: (v) => validateMinLength(String(v ?? ""), 2, "Branch name") }],
};

export default function BanksPage() {
  const { data: result, isLoading } = useBanks();
  const { data: companiesResult } = useCompanies();
  const createMutation = useCreateBank();
  const updateMutation = useUpdateBank();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const companies = useMemo(() => companiesResult?.data ?? [], [companiesResult]);
  const companyOptions = companies.map((c: any) => ({ value: c.id, label: c.name }));

  // id → name lookup used by the Company column. Rebuilds only when the
  // company master list changes — not on every keystroke in the form.
  const companyNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of companies) map[c.id] = c.name;
    return map;
  }, [companies]);

  // Resolve a row's company name. Prefer a live lookup (so renames flow
  // through); fall back to the denormalised `companyName` on seeded rows
  // that have no `companyId`.
  const resolveCompany = useCallback(
    (row: Row): string =>
      (row.companyId && companyNameById[row.companyId]) || row.companyName || "—",
    [companyNameById]
  );

  const columns: MasterColumnDef<Row>[] = useMemo(() => [
    { key: "bankName", label: "Bank", render: (row) => <span className="font-medium text-gray-900">{row.bankName}</span> },
    { key: "branchName", label: "Branch" },
    { key: "accountNo", label: "Account No", width: "160px" },
    { key: "ifscCode", label: "IFSC", width: "120px" },
    { key: "accountType", label: "Type", width: "100px" },
    {
      key: "companyName",
      label: "Company",
      render: (row) => <span className="text-gray-700">{resolveCompany(row)}</span>,
      getValue: (row) => resolveCompany(row),
    },
    { key: "status", label: "Status", type: "status" },
  ], [resolveCompany]);

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.bankName?.trim()) return { ok: false as const, error: "Bank name is required" };
    if (!row.accountNo?.trim()) return { ok: false as const, error: "Account number is required" };
    if (!row.ifscCode?.trim()) return { ok: false as const, error: "IFSC code is required" };
    const compInput = row.companyName?.trim();
    if (!compInput) return { ok: false as const, error: "Company is required" };
    const company = companies.find((c: any) =>
      c.name?.toLowerCase() === compInput.toLowerCase() || c.id === compInput,
    );
    if (!company) return { ok: false as const, error: `Company "${compInput}" not found` };
    try {
      await createMutation.mutateAsync({
        bankName: row.bankName.trim(),
        branchName: row.branchName?.trim() || undefined,
        accountNo: row.accountNo.replace(/\D/g, ""),
        ifscCode: row.ifscCode.trim().toUpperCase(),
        accountType: row.accountType?.toLowerCase() || "current",
        companyId: company.id,
        companyName: company.name,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Create failed" };
    }
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // Denormalise the company name onto the row. Keeps CSV exports readable
    // and means the table still shows a company even if the companies
    // master query hasn't loaded yet.
    const payload = {
      ...form,
      companyName: form.companyId ? companyNameById[form.companyId] ?? "" : "",
    };
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload });
      else await createMutation.mutateAsync(payload);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Bank Accounts" entityName="Bank" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete bank account{" "}
            <span className="font-semibold text-gray-900">“{item.bankName}”</span>
            {item.accountNo ? <> (A/C <span className="font-mono">{item.accountNo}</span>)</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Landmark className="w-8 h-8" />}
        emptyDescription="Bank accounts linked to companies for payment processing." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Bank Account" : "Add Bank Account"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Bank Details">
          <FormRow>
            <Field label="Bank Name" required error={errors.bankName}>
              <TextInput value={form.bankName} onChange={v => set("bankName", v)} placeholder="State Bank of India" invalid={!!errors.bankName} />
            </Field>
            <Field label="Branch Name" error={errors.branchName}>
              <TextInput value={form.branchName} onChange={v => set("branchName", v)} placeholder="Mumbai Main Branch" invalid={!!errors.branchName} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Account Number" required error={errors.accountNo}>
              <TextInput value={form.accountNo} onChange={v => set("accountNo", v.replace(/\D/g, ""))} placeholder="Account number" invalid={!!errors.accountNo} />
            </Field>
            <Field label="IFSC Code" required error={errors.ifscCode} hint="11-char IFSC e.g. SBIN0001234">
              <TextInput value={form.ifscCode} onChange={v => set("ifscCode", v.toUpperCase())} placeholder="SBIN0001234" maxLength={11} invalid={!!errors.ifscCode} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Account Type"><SelectInput value={form.accountType} onChange={v => set("accountType", v)}
              options={[{ value: "current", label: "Current" }, { value: "savings", label: "Savings" }]} /></Field>
            <Field label="Company"><SelectInput value={form.companyId} onChange={v => set("companyId", v)} options={companyOptions} placeholder="Select company" /></Field>
          </FormRow>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Bank"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
