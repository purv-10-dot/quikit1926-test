"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { HardHat } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useCreateContractor, useUpdateContractor, useDeleteContractor } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateEmail, validateMobile, validateGSTIN, validatePAN,
  validateMinLength, validateIFSC,
} from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "legalName", label: "Legal Name" },
  { key: "specialization", label: "Specialization", required: true, hint: "Civil Works | Electrical | …" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "licenseNo", label: "License No" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "bankName", label: "Bank Name" },
  { key: "branchName", label: "Branch Name" },
  { key: "accountNo", label: "Account Number" },
  { key: "ifscCode", label: "IFSC Code" },
  { key: "accountType", label: "Account Type", hint: "current | savings" },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
];
import { StateCitySelect } from "@/components/StateCitySelect";
import { OpenCageAddressAutocomplete } from "@/components/OpenCageAddressAutocomplete";
import { toast } from "@/lib/toast";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface ContractorRow {
  id: string; code: string; name: string; gstin?: string; contactPerson?: string;
  phone?: string; specialization?: string; licenseNo?: string; status: string;
}

/** Full contractor record consumed by Edit — superset of the list row. */
interface ContractorEditRow {
  id: string;
  name?: string; legalName?: string; contactPerson?: string;
  phone?: string; email?: string; gstin?: string; pan?: string;
  licenseNo?: string; specialization?: string;
  address?: string; city?: string; state?: string;
  bankName?: string; branchName?: string; accountNo?: string;
  ifscCode?: string; accountType?: string; status?: string;
}

const columns: MasterColumnDef<ContractorRow>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Contractor", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "gstin", label: "GSTIN", width: "160px" },
  { key: "contactPerson", label: "Contact" },
  { key: "phone", label: "Phone", width: "120px" },
  { key: "specialization", label: "Specialization" },
  { key: "licenseNo", label: "License No" },
  { key: "status", label: "Status", type: "status" },
];

const SPECIALIZATIONS = [
  "Civil Works", "Electrical", "Plumbing", "HVAC", "Structural", "Road Works",
  "Painting", "Waterproofing", "Landscaping", "MEP", "General",
  "Others",
].map(s => ({ value: s, label: s }));

const emptyForm = {
  name: "", legalName: "", contactPerson: "", phone: "", email: "",
  gstin: "", pan: "", licenseNo: "", specialization: "",
  address: "", city: "", state: "",
  bankName: "", branchName: "", accountNo: "", ifscCode: "", accountType: "current",
  status: "active",
};

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Contractor name" },
    { validator: (v) => validateMinLength(v, 2, "Contractor name") },
  ],
  specialization: [{ required: true, label: "Specialization" }],
  contactPerson: [{ validator: (v) => validateMinLength(v, 2, "Contact person") }],
  phone: [{ validator: validateMobile }],
  email: [{ validator: validateEmail }],
  gstin: [{ validator: validateGSTIN }],
  pan: [{ validator: validatePAN }],
  licenseNo: [{ validator: (v) => validateMinLength(v, 3, "License number") }],
  ifscCode: [{ validator: validateIFSC }],
  accountNo: [{ validator: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return { valid: true };
      if (!/^\d{6,20}$/.test(s)) return { valid: false, error: "Account number must be 6–20 digits" };
      return { valid: true };
  } }],
};

export default function ContractorsPage() {
  const createMutation = useCreateContractor();
  const updateMutation = useUpdateContractor();
  const deleteMutation = useDeleteContractor();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Contractor name is required" };
    if (!row.specialization?.trim()) return { ok: false as const, error: "Specialization is required" };
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        legalName: row.legalName?.trim() || undefined,
        specialization: row.specialization.trim(),
        contactPerson: row.contactPerson?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        email: row.email?.trim() || undefined,
        gstin: row.gstin?.toUpperCase() || undefined,
        pan: row.pan?.toUpperCase() || undefined,
        licenseNo: row.licenseNo?.trim() || undefined,
        address: row.address?.trim() || undefined,
        city: row.city?.trim() || undefined,
        state: row.state?.trim() || undefined,
        bankName: row.bankName?.trim() || undefined,
        branchName: row.branchName?.trim() || undefined,
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

  const set = <K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...form });
      else await createMutation.mutateAsync(form);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="Contractors / Sub-contractors"
        entityName="Contractor"
        permissionUrl="/masters/contractors"
        columns={columns}
        infinite={{
          queryKey: "contractors-infinite",
          endpoint: "/api/masters/contractors",
          pageSize: 25,
          defaultSortBy: "createdAt",
          defaultSortOrder: "desc",
        }}
        showStatusTabs
        historyEntityType="contractor"
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete contractor{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be removed from the list. To keep a contractor but pause it,
            set its status to Inactive instead — those stay under the Inactive tab.
          </>
        )}
        onEdit={(item: ContractorEditRow) => {
          setEditingId(item.id);
          setErrors({});
          setForm({
            name: item.name ?? "",
            legalName: item.legalName ?? "",
            contactPerson: item.contactPerson ?? "",
            phone: item.phone ?? "",
            email: item.email ?? "",
            gstin: item.gstin ?? "",
            pan: item.pan ?? "",
            licenseNo: item.licenseNo ?? "",
            specialization: item.specialization ?? "",
            address: item.address ?? "",
            city: item.city ?? "",
            state: item.state ?? "",
            bankName: item.bankName ?? "",
            branchName: item.branchName ?? "",
            accountNo: item.accountNo ?? "",
            ifscCode: item.ifscCode ?? "",
            accountType: item.accountType ?? "current",
            status: item.status ?? "active",
          });
          setDrawerOpen(true);
        }}
        emptyIcon={<HardHat className="w-8 h-8" />}
        emptyDescription="Contractors execute work on site. Add them to create work orders and track DPR."
      />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Contractor" : "Add Contractor"}
        subtitle={editingId ? "Update contractor details" : "Register a new contractor or sub-contractor"}
        width="xl" onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>

        <FormSection title="Basic Information">
          <FormRow>
            <Field label="Contractor Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Contractor firm name" invalid={!!errors.name} />
            </Field>
            <Field label="Legal Name">
              <TextInput value={form.legalName} onChange={v => set("legalName", v)} placeholder="Registered legal name" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Contact Person" error={errors.contactPerson}>
              <TextInput value={form.contactPerson} onChange={v => set("contactPerson", v)} placeholder="Primary contact" invalid={!!errors.contactPerson} />
            </Field>
            <Field label="Specialization" required error={errors.specialization}>
              <SelectInput value={form.specialization} onChange={v => set("specialization", v)}
                options={SPECIALIZATIONS} placeholder="Select work type" invalid={!!errors.specialization} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Phone" error={errors.phone}>
              <TextInput value={form.phone} onChange={v => set("phone", v.replace(/\D/g, ""))} placeholder="9876543210" maxLength={10} invalid={!!errors.phone} />
            </Field>
            <Field label="Email" error={errors.email}>
              <TextInput value={form.email} onChange={v => set("email", v)} placeholder="contractor@email.com" type="email" invalid={!!errors.email} />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Tax & License">
          <FormRow>
            <Field label="GSTIN" error={errors.gstin}>
              <TextInput value={form.gstin} onChange={v => set("gstin", v.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} invalid={!!errors.gstin} />
            </Field>
            <Field label="PAN" error={errors.pan}>
              <TextInput value={form.pan} onChange={v => set("pan", v.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} invalid={!!errors.pan} />
            </Field>
          </FormRow>
          <Field label="License / Registration No" error={errors.licenseNo}>
            <TextInput value={form.licenseNo} onChange={v => set("licenseNo", v)} placeholder="Labour license number" invalid={!!errors.licenseNo} />
          </Field>
        </FormSection>

        <FormSection title="Address">
          <Field label="Address" span={2}>
            <OpenCageAddressAutocomplete
              value={form.address}
              onChange={(v) => set("address", v)}
              onSuggestionPick={(pick) => {
                setForm((prev) => {
                  const nextState = pick.state ?? prev.state;
                  let nextCity = prev.city;
                  if (pick.cityMatched && pick.city) nextCity = pick.city;
                  else if (pick.state && pick.state !== prev.state) nextCity = "";
                  return {
                    ...prev,
                    address: pick.formatted,
                    state: nextState,
                    city: nextCity,
                  };
                });
                if (pick.cityMatched && pick.city) {
                  toast.success("Address, state, and city filled from suggestion.");
                } else if (pick.state) {
                  toast.info("Pick a city from the list if needed.");
                }
              }}
              placeholder="Search places in India…"
            />
          </Field>
          <StateCitySelect
            state={form.state}
            city={form.city}
            onStateChange={v => set("state", v)}
            onCityChange={v => set("city", v)}
          />
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
            {form.status === "inactive" && <InactiveStatusNotice entityName="Contractor" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Contractor"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
