"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { useCreateVendor, useUpdateVendor, useItemGroups, useDeleteVendor } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, MultiSelectInput, TextAreaInput, CheckboxInput, DateInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import {
  validateForm, type ValidationRules, validateEmail, validateMobile,
  validateGSTIN, validatePAN, validateIFSC, validatePincode, validateMinLength,
  validateNonNegativeNumber,
} from "@/lib/validators";
import { StateCitySelect } from "@/components/StateCitySelect";
import { OpenCageAddressAutocomplete } from "@/components/OpenCageAddressAutocomplete";
import { toast } from "@/lib/toast";

interface VendorRow {
  id: string; code: string; name: string; companyName?: string; gstin?: string;
  contactPerson?: string; phone?: string; city?: string; state?: string;
  vendorType?: string; category?: string; status: string;
}

/** Full vendor record consumed by Edit — superset of the list row, with the
 *  bank / payment alias fields the detail API also returns. */
interface VendorEditRow {
  id: string;
  name?: string; companyName?: string; contactPerson?: string;
  vendorType?: string; category?: string; phone?: string; email?: string;
  paymentTermsDays?: number | string; paymentTerms?: string;
  gstType?: string; gstin?: string; pan?: string;
  msmeStatus?: string; msmeNumber?: string;
  bankName?: string; branchName?: string;
  bankAccountNo?: string; accountNumber?: string;
  bankIfsc?: string; ifscCode?: string; accountType?: string;
  address?: string; city?: string; state?: string; pincode?: string;
  blacklistReason?: string; blacklistedUntil?: string | null;
  status?: string;
}

const columns: MasterColumnDef<VendorRow>[] = [
  { key: "code", label: "Code", width: "90px" },
  { key: "companyName", label: "Company / Firm", render: (row) => (
    <div>
      <span className="font-medium text-gray-900">{row.companyName || row.name}</span>
      {row.companyName && row.name && row.companyName !== row.name && (
        <span className="text-[10px] text-gray-500 block">{row.name}</span>
      )}
    </div>
  )},
  { key: "vendorType", label: "Type", width: "100px", type: "select",
    options: ["Supplier", "Transporter", "Service"] },
  { key: "category", label: "Category", width: "140px",
    render: (row) => row.category ? row.category : <span className="text-gray-400">—</span> },
  { key: "phone", label: "Mobile", width: "110px" },
  { key: "gstin", label: "GSTIN", width: "160px" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "status", label: "Status", type: "status" },
];

// Subcontractor intentionally removed — subcontractors are managed as
// their own entity under Masters › Contractors / Sub-contractors.
const VENDOR_TYPES = [
  { value: "Supplier", label: "Supplier" },
  { value: "Transporter", label: "Transporter" },
  { value: "Service", label: "Service Provider" },
];

const GST_TYPES = [
  { value: "Regular", label: "Regular" },
  { value: "Composition", label: "Composition" },
  { value: "Unregistered", label: "Unregistered" },
];

const emptyForm = {
  name: "", companyName: "", contactPerson: "",
  vendorType: "Supplier", category: "", mobile: "", email: "", creditPeriod: "30",
  gstType: "Regular", gstin: "", pan: "", msmeStatus: "Unregistered", msmeNumber: "",
  bankName: "", branchName: "", accountNumber: "", ifscCode: "", accountType: "current",
  address: "", city: "", state: "", pincode: "", paymentTerms: "Net 30",
  isBlacklisted: false, blacklistReason: "", blacklistedUntil: "",
  status: "active",
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
];

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Vendor name" },
    { validator: (v) => validateMinLength(String(v ?? ""), 2, "Vendor name") },
  ],
  vendorType: [{ required: true, label: "Vendor type" }],
  address: [
    { required: true, label: "Address" },
    { validator: (v) => validateMinLength(String(v ?? ""), 5, "Address") },
  ],
  mobile: [{ validator: validateMobile }],
  email: [{ required: true, label: "Email" }, { validator: validateEmail }],
  creditPeriod: [{ validator: (v) => validateNonNegativeNumber(v, "Credit period") }],
  gstin: [{ validator: validateGSTIN }],
  pan: [{ validator: validatePAN }],
  ifscCode: [{ validator: validateIFSC }],
  accountNumber: [{ validator: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return { valid: true };
      if (!/^\d{6,20}$/.test(s)) return { valid: false, error: "Account number must be 6–20 digits" };
      return { valid: true };
  } }],
  pincode: [{ validator: validatePincode }],
  msmeNumber: [{ validator: (v) => {
      const s = String(v ?? "").trim();
      if (!s) return { valid: true };
      if (!/^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i.test(s)) return { valid: false, error: "MSME format: UDYAM-XX-00-0000000" };
      return { valid: true };
  } }],
};

// Import field definitions — column headers in the user's spreadsheet
// auto-map to these by case + spacing-insensitive label match.
const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Name", required: true, hint: "Vendor / contact name" },
  { key: "companyName", label: "Company / Firm" },
  { key: "vendorType", label: "Vendor Type", hint: "Supplier | Transporter | Service" },
  { key: "category", label: "Category", hint: "Must match an Item Group name (Masters › Item Groups)" },
  { key: "contactPerson", label: "Contact Person" },
  { key: "mobile", label: "Mobile", hint: "10-digit Indian mobile" },
  { key: "email", label: "Email", required: true },
  { key: "creditPeriod", label: "Credit Period" },
  { key: "paymentTerms", label: "Payment Terms" },
  { key: "gstType", label: "GST Type", hint: "Regular | Composition | Unregistered" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "PAN" },
  { key: "msmeStatus", label: "MSME Status" },
  { key: "msmeNumber", label: "MSME Number" },
  { key: "bankName", label: "Bank Name" },
  { key: "branchName", label: "Branch Name" },
  { key: "accountNumber", label: "Account Number" },
  { key: "ifscCode", label: "IFSC Code" },
  { key: "accountType", label: "Account Type", hint: "current | savings" },
  { key: "address", label: "Address", required: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pincode", label: "Pincode" },
];

export default function VendorsPage() {
  const { data: itemGroupsResult } = useItemGroups();
  const itemGroupCategoryOptions = useMemo(() => {
    const groups = (itemGroupsResult?.data ?? []).filter(
      (g: { status?: string }) =>
        g.status !== "inactive" && g.status !== "deleted",
    );
    const names = groups
      .map((g: { name?: string }) => String(g.name ?? "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(names));
    unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return unique.map((name) => ({ value: name, label: name }));
  }, [itemGroupsResult]);

  const { data: wb } = useQuery({
    queryKey: ["integrations", "whitebooks-config"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/whitebooks/config");
      const json = await res.json().catch(() => null);
      if (!json?.ok) return { gstVerifyEnabled: false };
      return json.data as { gstVerifyEnabled: boolean };
    },
    staleTime: 5 * 60_000,
  });
  const gstVerifyEnabled = wb?.gstVerifyEnabled === true;
  const createMutation = useCreateVendor();
  const updateMutation = useUpdateVendor();
  const deleteMutation = useDeleteVendor();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "inactive" | "blacklisted">("all");

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Name is required" };
    if (!row.email?.trim()) return { ok: false as const, error: "Email is required" };
    if (!row.address?.trim()) return { ok: false as const, error: "Address is required" };
    if (gstVerifyEnabled && !String(row.gstin ?? "").trim()) {
      return {
        ok: false as const,
        error:
          "GSTIN is required in the import row while Whitebooks verification is enabled (WHITEBOOKS_ACCOUNT_EMAIL).",
      };
    }
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        companyName: row.companyName || undefined,
        vendorType: row.vendorType?.trim() || "Supplier",
        category: row.category?.trim() || undefined,
        contactPerson: row.contactPerson || undefined,
        mobile: row.mobile.replace(/\D/g, ""),
        email: row.email || undefined,
        creditPeriod: row.creditPeriod || "30",
        paymentTerms: row.paymentTerms || "Net 30",
        gstType: row.gstType?.trim() || "Regular",
        gstin: row.gstin?.toUpperCase() || undefined,
        pan: row.pan?.toUpperCase() || undefined,
        msmeStatus: row.msmeStatus?.trim() || "Unregistered",
        msmeNumber: row.msmeNumber?.toUpperCase() || undefined,
        bankName: row.bankName || undefined,
        branchName: row.branchName || undefined,
        accountNumber: row.accountNumber?.replace(/\D/g, "") || undefined,
        ifscCode: row.ifscCode?.toUpperCase() || undefined,
        accountType: row.accountType?.toLowerCase() || "current",
        address: row.address.trim(),
        city: row.city || undefined,
        state: row.state || undefined,
        pincode: row.pincode?.replace(/\D/g, "") || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Failed to create vendor") };
    }
  };

  const set = <K extends keyof typeof emptyForm>(
    key: K,
    val: (typeof emptyForm)[K],
  ) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (form.msmeStatus === "Registered" && !String(form.msmeNumber || "").trim()) {
      errs.msmeNumber = "MSME number is required when registered";
    }
    if (form.isBlacklisted && !String(form.blacklistReason || "").trim()) {
      errs.blacklistReason = "Blacklist reason is required";
    }
    if (form.isBlacklisted && !String(form.blacklistedUntil || "").trim()) {
      errs.blacklistedUntil = "Blacklisted until date is required";
    }
    if (gstVerifyEnabled) {
      if (!String(form.gstin ?? "").trim()) {
        errs.gstin =
          "GSTIN is required while Whitebooks GST verification is enabled. It is stored on the vendor and used for PO checks.";
      } else {
        const g = validateGSTIN(form.gstin);
        if (!g.valid) errs.gstin = g.error ?? "Invalid GSTIN";
      }
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, ...form });
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

  // Category is stored as a comma-separated string on the vendor record.
  // The UI edits it as a list of selected Item Groups.
  const categoryValues = useMemo(
    () =>
      String(form.category ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [form.category],
  );

  const vendorCategoryMultiOptions = useMemo(() => {
    const base = [...itemGroupCategoryOptions];
    // Keep any already-selected value that no longer maps to an Item Group so
    // it stays selectable/visible instead of silently disappearing.
    for (const cur of categoryValues) {
      if (!base.some((o) => o.value === cur)) {
        base.push({ value: cur, label: `${cur} (not in Item Groups)` });
      }
    }
    return base;
  }, [itemGroupCategoryOptions, categoryValues]);

  const handleEdit = (item: VendorEditRow) => {
    setEditId(item.id);
    setForm({
      name: item.name ?? "",
      vendorType: item.vendorType ?? "Supplier",
      category: item.category ?? "",
      mobile: item.phone ?? "", email: item.email ?? "",
      creditPeriod: String(item.paymentTermsDays ?? "30"),
      gstType: item.gstType ?? "Regular", gstin: item.gstin ?? "",
      pan: item.pan ?? "", msmeStatus: item.msmeStatus ?? "Unregistered",
      msmeNumber: item.msmeNumber ?? "", bankName: item.bankName ?? "",
      branchName: item.branchName ?? "",
      accountNumber: item.bankAccountNo ?? item.accountNumber ?? "",
      ifscCode: item.bankIfsc ?? item.ifscCode ?? "",
      accountType: item.accountType ?? "current",
      address: item.address ?? "", city: item.city ?? "",
      state: item.state ?? "", pincode: item.pincode ?? "",
      paymentTerms: item.paymentTerms ?? "Net 30",
      companyName: item.companyName ?? "",
      contactPerson: item.contactPerson ?? "",
      isBlacklisted: item.status === "blacklisted",
      blacklistReason: item.blacklistReason ?? "", status: item.status ?? "active",
      blacklistedUntil: item.blacklistedUntil ? String(item.blacklistedUntil).slice(0, 10) : "",
    });
    setDrawerOpen(true);
  };

  return (
    <>
      <MasterListPage
        title="Vendors / Suppliers"
        entityName="Vendor"
        permissionUrl="/masters/vendors"
        columns={columns}
        externalStatusFilter
        infinite={{
          queryKey: "vendors-infinite",
          endpoint: "/api/masters/vendors",
          pageSize: 25,
          // The custom status tabs below drive this server filter.
          filters: { status: statusFilter },
          defaultSortBy: "createdAt",
          defaultSortOrder: "desc",
        }}
        historyEntityType="vendor"
        filters={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === "all"
                  ? "bg-accent-50 text-accent-700 border-accent-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === "inactive"
                  ? "bg-accent-50 text-accent-700 border-accent-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Inactive
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("blacklisted")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                statusFilter === "blacklisted"
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Blacklisted
            </button>
          </div>
        }
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setErrors({}); handleEdit(item); }}
        onDelete={handleDelete}
        onImport={() => setImportOpen(true)}
        deleteConfirmMessage={(item) => (
          <>
            Delete vendor{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be removed from the list. To keep a vendor but pause it,
            set its status to Inactive instead — those stay under the Inactive tab.
          </>
        )}
        canExport canImport
        emptyIcon={<Truck className="w-8 h-8" />}
        emptyDescription="Vendors supply materials to your projects."
      />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editId ? "Edit Vendor" : "Add Vendor"} subtitle={editId ? "Update vendor details" : "Register a new vendor/supplier"}
        width="xl" onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editId ? "Save Changes" : "Save"}>

        <FormSection title="Basic Information">
          <FormRow>
            <Field label="Vendor / Contact Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Contact person / proprietor name" invalid={!!errors.name} />
            </Field>
            <Field label="Company / Firm Name" hint="Registered business name">
              <TextInput value={form.companyName ?? ""} onChange={v => set("companyName", v)} placeholder="e.g. Tata Steel Ltd" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Vendor Type" required error={errors.vendorType}>
              <SelectInput value={form.vendorType} onChange={v => set("vendorType", v)} options={VENDOR_TYPES} invalid={!!errors.vendorType} />
            </Field>
            <Field
              label="Category"
              hint="Select one or more Item Groups. Add groups in Masters › Item Groups to see them here."
            >
              <MultiSelectInput
                values={categoryValues}
                onChange={(vals) => set("category", vals.join(", "))}
                options={vendorCategoryMultiOptions}
                placeholder="Select item groups"
              />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Contact Person">
              <TextInput value={form.contactPerson ?? ""} onChange={v => set("contactPerson", v)} placeholder="Primary contact" />
            </Field>
            <div />
          </FormRow>
          <FormRow>
            <Field label="Mobile Number" error={errors.mobile} hint="10-digit Indian mobile">
              <TextInput value={form.mobile} onChange={v => set("mobile", v.replace(/\D/g, ""))} placeholder="9876543210" maxLength={10} invalid={!!errors.mobile} />
            </Field>
            <Field label="Email Address" required error={errors.email}>
              <TextInput value={form.email} onChange={v => set("email", v)} placeholder="vendor@email.com" type="email" invalid={!!errors.email} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Credit Period (Days)" error={errors.creditPeriod}>
              <NumberInput value={form.creditPeriod} onChange={v => set("creditPeriod", v)} min={0} placeholder="30" invalid={!!errors.creditPeriod} />
            </Field>
            <Field label="Payment Terms">
              <TextInput value={form.paymentTerms} onChange={v => set("paymentTerms", v)} placeholder="Net 30" />
            </Field>
          </FormRow>
        </FormSection>

        <FormSection title="Tax Details">
          <FormRow>
            <Field label="GST Registration Type">
              <SelectInput value={form.gstType} onChange={v => set("gstType", v)} options={GST_TYPES} />
            </Field>
            <Field
              label="GSTIN"
              required={gstVerifyEnabled}
              error={errors.gstin}
              hint={
                gstVerifyEnabled
                  ? "Required for POs — Whitebooks reads this from the vendor record (not the .env email)."
                  : "15-character GST number"
              }
            >
              <TextInput value={form.gstin} onChange={v => set("gstin", v.toUpperCase())}
                placeholder="22AAAAA0000A1Z5"
                disabled={form.gstType === "Unregistered" && !gstVerifyEnabled}
                maxLength={15} invalid={!!errors.gstin} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="PAN Number" error={errors.pan}>
              <TextInput value={form.pan} onChange={v => set("pan", v.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} invalid={!!errors.pan} />
            </Field>
            <Field label="MSME Status">
              <SelectInput value={form.msmeStatus} onChange={v => set("msmeStatus", v)}
                options={[{ value: "Unregistered", label: "Unregistered" }, { value: "Registered", label: "Registered" }]} />
            </Field>
          </FormRow>
          {form.msmeStatus === "Registered" && (
            <Field label="MSME Registration Number" required error={errors.msmeNumber}>
              <TextInput value={form.msmeNumber} onChange={v => set("msmeNumber", v.toUpperCase())} placeholder="UDYAM-XX-00-0000000" invalid={!!errors.msmeNumber} />
            </Field>
          )}
        </FormSection>

        <FormSection title="Bank Details">
          <FormRow>
            <Field label="Bank Name">
              <TextInput value={form.bankName} onChange={v => set("bankName", v)} placeholder="State Bank of India" />
            </Field>
            <Field label="Branch Name">
              <TextInput value={form.branchName} onChange={v => set("branchName", v)} placeholder="Mumbai Main Branch" />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Account Number" error={errors.accountNumber}>
              <TextInput value={form.accountNumber} onChange={v => set("accountNumber", v.replace(/\D/g, ""))} placeholder="Account number" maxLength={20} invalid={!!errors.accountNumber} />
            </Field>
            <Field label="IFSC Code" error={errors.ifscCode} hint="11-char IFSC e.g. SBIN0001234">
              <TextInput value={form.ifscCode} onChange={v => set("ifscCode", v.toUpperCase())} placeholder="SBIN0001234" maxLength={11} invalid={!!errors.ifscCode} />
            </Field>
          </FormRow>
          <Field label="Account Type">
            <SelectInput value={form.accountType} onChange={v => set("accountType", v)} options={ACCOUNT_TYPE_OPTIONS} />
          </Field>
        </FormSection>

        <FormSection title="Address">
          <Field label="Address" span={2} required error={errors.address}>
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
            pincode={form.pincode}
            onPincodeChange={v => set("pincode", v)}
          />
          <Field label="PIN Code" error={errors.pincode}>
            <TextInput value={form.pincode} onChange={v => set("pincode", v.replace(/\D/g, ""))} placeholder="400001" maxLength={6} invalid={!!errors.pincode} />
          </Field>
        </FormSection>

        <FormSection title="Status">
          <Field label="Status">
            <SelectInput
              value={form.status}
              onChange={v => set("status", v)}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          {form.status === "inactive" && <InactiveStatusNotice entityName="Vendor" />}
          </Field>
          {editId && (
            <>
              <CheckboxInput
                checked={form.isBlacklisted}
                onChange={(v) => {
                  set("isBlacklisted", v);
                  if (!v) {
                    set("blacklistReason", "");
                    set("blacklistedUntil", "");
                  }
                }}
                label="Blacklisted (prevents new POs)"
              />
              {form.isBlacklisted && (
                <>
                  <Field label="Blacklisted Until" required error={errors.blacklistedUntil} hint="Vendor will be treated as blacklisted until this date">
                    <DateInput
                      value={form.blacklistedUntil}
                      onChange={(v) => set("blacklistedUntil", v)}
                      invalid={!!errors.blacklistedUntil}
                    />
                  </Field>
                  <Field label="Blacklist Reason" required error={errors.blacklistReason}>
                    <TextAreaInput
                      value={form.blacklistReason}
                      onChange={v => set("blacklistReason", v)}
                      placeholder="Reason for blacklisting"
                      rows={2}
                      invalid={!!errors.blacklistReason}
                    />
                  </Field>
                </>
              )}
            </>
          )}
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Vendor"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
