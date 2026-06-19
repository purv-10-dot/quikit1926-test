"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { Globe } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useCompanies, useCreateCompany, useUpdateCompany, useDeleteCompany } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, TextAreaInput, SelectInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { StateCitySelect } from "@/components/StateCitySelect";
import {
  validateForm, type ValidationRules,
  validateEmail, validatePAN, validateGSTIN, validateCIN,
  validatePincode, validatePhone, validateURL, validateIFSC,
} from "@/lib/validators";

const ACCOUNT_TYPE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; name: string; legalName: string; gstin: string; pan: string; city: string; state: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "name", label: "Company", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "legalName", label: "Legal Name" },
  { key: "gstin", label: "GSTIN", width: "160px" },
  { key: "pan", label: "PAN", width: "120px" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "status", label: "Status", type: "status" },
];

const emptyForm = {
  name: "", legalName: "", shortName: "", gstin: "", pan: "", cin: "",
  address: "", city: "", state: "", pincode: "", phone: "", email: "", website: "",
  bankName: "", branchName: "", accountNo: "", ifscCode: "", accountType: "current",
  status: "active",
};

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Company Name", required: true },
  { key: "legalName", label: "Legal Name" },
  { key: "shortName", label: "Short Name" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "cin", label: "CIN" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "bankName", label: "Bank Name" },
  { key: "branchName", label: "Branch Name" },
  { key: "accountNo", label: "Account Number" },
  { key: "ifscCode", label: "IFSC Code" },
  { key: "accountType", label: "Account Type", hint: "current | savings" },
];

const rules: ValidationRules<typeof emptyForm> = {
  name: [{ required: true, label: "Company name" }],
  email: [{ validator: validateEmail }],
  gstin: [{ validator: validateGSTIN }],
  pan: [{ validator: validatePAN }],
  cin: [{ validator: validateCIN }],
  pincode: [{ validator: validatePincode }],
  phone: [{ validator: validatePhone }],
  website: [{ validator: validateURL }],
  ifscCode: [{ validator: validateIFSC }],
  accountNo: [{ validator: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return { valid: true };
      if (!/^\d{6,20}$/.test(s)) return { valid: false, error: "Account number must be 6–20 digits" };
      return { valid: true };
  } }],
};

export default function CompaniesPage() {
  const { data: result, isLoading } = useCompanies();
  const createMutation = useCreateCompany();
  const updateMutation = useUpdateCompany();
  const deleteMutation = useDeleteCompany();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Company name is required" };
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        legalName: row.legalName || undefined,
        shortName: row.shortName || undefined,
        gstin: row.gstin?.toUpperCase() || undefined,
        pan: row.pan?.toUpperCase() || undefined,
        cin: row.cin?.toUpperCase() || undefined,
        address: row.address || undefined,
        city: row.city || undefined,
        state: row.state || undefined,
        pincode: row.pincode?.replace(/\D/g, "") || undefined,
        phone: row.phone || undefined,
        email: row.email || undefined,
        website: row.website || undefined,
        bankName: row.bankName || undefined,
        branchName: row.branchName || undefined,
        accountNo: row.accountNo?.replace(/\D/g, "") || undefined,
        ifscCode: row.ifscCode?.toUpperCase() || undefined,
        accountType: row.accountType?.toLowerCase() || "current",
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Create failed") };
    }
  };

  // Single-company-per-tenant rule: a tenant represents one legal
  // entity, so "Companies" is effectively a settings record. Once one
  // active row exists we hide both Add and Delete:
  //   - Add: prevents accidentally creating a second company that
  //     downstream pages (POs, projects, GST filings) would have to
  //     disambiguate against.
  //   - Delete: prevents the tenant from soft-deleting their own root
  //     entity, which would orphan every project / PO / vendor that
  //     references it. Edit stays open so the admin can correct
  //     details — name, GSTIN, address, etc.
  const activeCount = (result?.data ?? []).filter(
    (r) => r?.status !== "inactive",
  ).length;
  const hasCompany = activeCount >= 1;

  const set = <K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
  };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...form });
      } else {
        await createMutation.mutateAsync(form);
      }
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Companies" entityName="Company" permissionUrl="/masters/companies" columns={columns}
        data={(result?.data ?? []) as Row[]} total={result?.total ?? 0} isLoading={isLoading}
        canCreate={!hasCompany}
        canImport={!hasCompany} canExport
        historyEntityType="company"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={hasCompany ? undefined : handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete company{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Globe className="w-8 h-8" />}
        emptyDescription="Companies are the legal entities that own and operate projects." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Company" : "Add Company"}
        subtitle={editingId ? "Update registered legal entity" : "Register a legal entity"}
        width="xl"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Company Details">
          <FormRow>
            <Field label="Company Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Company name" invalid={!!errors.name} />
            </Field>
            <Field label="Legal Name"><TextInput value={form.legalName} onChange={v => set("legalName", v)} placeholder="Registered legal name" /></Field>
          </FormRow>
          <Field label="Short Name"><TextInput value={form.shortName} onChange={v => set("shortName", v)} placeholder="Short code" /></Field>
        </FormSection>
        <FormSection title="Tax Registration">
          <FormRow>
            <Field label="GSTIN" error={errors.gstin} hint="15-char GSTIN e.g. 27AABCQ1234M1ZP">
              <TextInput value={form.gstin} onChange={v => set("gstin", v.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} invalid={!!errors.gstin} />
            </Field>
            <Field label="PAN" error={errors.pan} hint="10-char PAN e.g. AABCQ1234M">
              <TextInput value={form.pan} onChange={v => set("pan", v.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} invalid={!!errors.pan} />
            </Field>
          </FormRow>
          <Field label="CIN (Corporate ID Number)" error={errors.cin} hint="21-char CIN e.g. L12345MH2000PLC123456">
            <TextInput value={form.cin} onChange={v => set("cin", v.toUpperCase())} placeholder="L12345MH2000PLC123456" maxLength={21} invalid={!!errors.cin} />
          </Field>
        </FormSection>
        <FormSection title="Contact & Address">
          <Field label="Address"><TextAreaInput value={form.address} onChange={v => set("address", v)} placeholder="Registered office address" rows={2} /></Field>
          <StateCitySelect
            state={form.state}
            city={form.city}
            onStateChange={v => set("state", v)}
            onCityChange={v => set("city", v)}
            pincode={form.pincode}
            onPincodeChange={v => set("pincode", v)}
          />
          <FormRow>
            <Field label="PIN Code" error={errors.pincode}>
              <TextInput value={form.pincode} onChange={v => set("pincode", v.replace(/\D/g, ""))} maxLength={6} placeholder="400001" invalid={!!errors.pincode} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <TextInput value={form.phone} onChange={v => set("phone", v)} placeholder="022-40001234 or 9876543210" maxLength={15} invalid={!!errors.phone} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Email" error={errors.email}>
              <TextInput value={form.email} onChange={v => set("email", v)} type="email" placeholder="contact@company.com" invalid={!!errors.email} />
            </Field>
            <Field label="Website" error={errors.website}>
              <TextInput value={form.website} onChange={v => set("website", v)} placeholder="https://" invalid={!!errors.website} />
            </Field>
          </FormRow>
        </FormSection>
        <FormSection title="Bank Details">
          <FormRow>
            <Field label="Bank Name"><TextInput value={form.bankName} onChange={v => set("bankName", v)} placeholder="State Bank of India" /></Field>
            <Field label="Branch Name"><TextInput value={form.branchName} onChange={v => set("branchName", v)} placeholder="Mumbai Main Branch" /></Field>
          </FormRow>
          <FormRow>
            <Field label="Account Number" error={errors.accountNo}>
              <TextInput value={form.accountNo} onChange={v => set("accountNo", v.replace(/\D/g, ""))} placeholder="Account number" maxLength={20} invalid={!!errors.accountNo} />
            </Field>
            <Field label="IFSC Code" error={errors.ifscCode} hint="11-char IFSC e.g. SBIN0001234">
              <TextInput value={form.ifscCode} onChange={v => set("ifscCode", v.toUpperCase())} placeholder="SBIN0001234" maxLength={11} invalid={!!errors.ifscCode} />
            </Field>
          </FormRow>
          <Field label="Account Type">
            <SelectInput value={form.accountType} onChange={v => set("accountType", v)} options={ACCOUNT_TYPE_OPTIONS} />
          </Field>
        </FormSection>
        <FormSection title="Status">
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Company" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Company"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
