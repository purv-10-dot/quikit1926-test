"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useCustomers, useCreateCustomer, useUpdateCustomer } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, TextAreaInput,
} from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateEmail, validatePhone, validateGSTIN, validatePAN,
  validatePincode, validateIFSC, validateMinLength,
} from "@/lib/validators";
import { StateCitySelect } from "@/components/StateCitySelect";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Customer Name", required: true },
  { key: "customerType", label: "Type", hint: "Govt | PSU | Private | Individual | Trust" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "address", label: "Address" },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State", required: true },
  { key: "pincode", label: "Pincode" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "creditLimit", label: "Credit Limit" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface CustomerRow { id: string; code: string; name: string; contactPerson?: string; phone?: string; city?: string; gstin?: string; status: string; }

const columns: MasterColumnDef<CustomerRow>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Customer", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "contactPerson", label: "Contact" },
  { key: "phone", label: "Phone", width: "120px" },
  { key: "city", label: "City" },
  { key: "gstin", label: "GSTIN", width: "160px" },
  { key: "status", label: "Status", type: "status" },
];

const CUSTOMER_TYPES = [
  { value: "Govt", label: "Government" }, { value: "PSU", label: "PSU" },
  { value: "Private", label: "Private" }, { value: "Individual", label: "Individual" },
  { value: "Trust", label: "Trust" },
];

const emptyForm = {
  name: "", customerType: "Private", contactPerson: "", phone: "", email: "",
  gstin: "", pan: "", bankName: "", accountNumber: "", ifscCode: "",
  address: "", billingAddress: "", shippingAddress: "", city: "", state: "", pincode: "",
  paymentTerms: "Net 30", creditLimit: "", status: "active",
};

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Customer name" },
    { validator: (v) => validateMinLength(v, 2, "Customer name") },
  ],
  phone: [{ validator: validatePhone }],
  email: [{ validator: validateEmail }],
  gstin: [{ validator: validateGSTIN }],
  pan: [{ validator: validatePAN }],
  pincode: [{ validator: validatePincode }],
  ifscCode: [{ validator: validateIFSC }],
  state: [{ required: true, label: "State" }],
  city: [{ required: true, label: "City" }],
};

export default function CustomersPage() {
  const { data: result, isLoading } = useCustomers();
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Customer name is required" };
    if (!row.city?.trim()) return { ok: false as const, error: "City is required" };
    if (!row.state?.trim()) return { ok: false as const, error: "State is required" };
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        customerType: row.customerType?.trim() || "Private",
        contactPerson: row.contactPerson?.trim() || undefined,
        phone: row.phone?.trim() || undefined,
        email: row.email?.trim() || undefined,
        gstin: row.gstin?.toUpperCase() || undefined,
        pan: row.pan?.toUpperCase() || undefined,
        address: row.address?.trim() || undefined,
        city: row.city.trim(),
        state: row.state.trim(),
        pincode: row.pincode?.replace(/\D/g, "") || undefined,
        paymentTerms: row.paymentTerms?.trim() || "Net 30",
        creditLimit: row.creditLimit?.trim() || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Create failed" };
    }
  };

  const set = (key: string, val: any) => {
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

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Customers / Clients" entityName="Customer" permissionUrl="/masters/customers" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        historyEntityType="customer"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete customer{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Building2 className="w-8 h-8" />}
        emptyDescription="Customers are the clients who commission your construction projects." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Customer" : "Add Customer"}
        subtitle={editingId ? "Update client details" : "Register a new client"} width="xl"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Basic Information">
          <FormRow>
            <Field label="Customer Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Client name" invalid={!!errors.name} />
            </Field>
            <Field label="Customer Type">
              <SelectInput value={form.customerType} onChange={v => set("customerType", v)} options={CUSTOMER_TYPES} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Contact Person" required>
              <TextInput value={form.contactPerson} onChange={v => set("contactPerson", v)} placeholder="Primary contact" />
            </Field>
            <Field label="Mobile" required error={errors.phone}>
              <TextInput value={form.phone} onChange={v => set("phone", v.replace(/\D/g, ""))} placeholder="9876543210" maxLength={10} invalid={!!errors.phone} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Email" error={errors.email}>
              <TextInput value={form.email} onChange={v => set("email", v)} placeholder="client@email.com" type="email" invalid={!!errors.email} />
            </Field>
            <Field label="Credit Limit (₹)">
              <NumberInput value={form.creditLimit} onChange={v => set("creditLimit", v)} min={0} placeholder="0" />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Tax Details">
          <FormRow>
            <Field label="GSTIN" error={errors.gstin}>
              <TextInput value={form.gstin} onChange={v => set("gstin", v.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} invalid={!!errors.gstin} />
            </Field>
            <Field label="PAN" error={errors.pan}>
              <TextInput value={form.pan} onChange={v => set("pan", v.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} invalid={!!errors.pan} />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Bank Details">
          <FormRow>
            <Field label="Bank Name"><TextInput value={form.bankName} onChange={v => set("bankName", v)} placeholder="Bank name" /></Field>
            <Field label="IFSC Code" error={errors.ifscCode}>
              <TextInput value={form.ifscCode} onChange={v => set("ifscCode", v.toUpperCase())} placeholder="SBIN0001234" maxLength={11} invalid={!!errors.ifscCode} />
            </Field>
          </FormRow>
          <Field label="Account Number">
            <TextInput value={form.accountNumber} onChange={v => set("accountNumber", v.replace(/\D/g, ""))} placeholder="Account number" maxLength={20} />
          </Field>
        </FormSection>

        <FormSection title="Address">
          <Field label="Registered Address" required>
            <TextAreaInput value={form.address} onChange={v => set("address", v)} placeholder="Registered address" rows={2} />
          </Field>
          <Field label="Billing Address">
            <TextAreaInput value={form.billingAddress} onChange={v => set("billingAddress", v)} placeholder="Billing address (if different)" rows={2} />
          </Field>
          <StateCitySelect
            required
            state={form.state}
            city={form.city}
            onStateChange={v => set("state", v)}
            onCityChange={v => set("city", v)}
            stateError={errors.state}
            cityError={errors.city}
            pincode={form.pincode}
            onPincodeChange={v => set("pincode", v)}
          />
          <Field label="PIN Code" error={errors.pincode}>
            <TextInput value={form.pincode} onChange={v => set("pincode", v.replace(/\D/g, ""))} placeholder="400001" maxLength={6} invalid={!!errors.pincode} />
          </Field>
        </FormSection>
        <FormSection title="Status">
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Customer"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
