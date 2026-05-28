"use client";

/**
 * Project Form Drawer — Full form matching reference Construction ERP.
 * Fields: code, name, type, client, location, dates, contract value, budget,
 *         manager, site engineers, site address, GSTIN, purchase limit, department, phases.
 */

import { useState, useEffect } from "react";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, TextAreaInput, DateInput,
} from "@/components/FormDrawer";
import { OpenCageAddressAutocomplete } from "@/components/OpenCageAddressAutocomplete";
import { toast } from "@/lib/toast";
import { useCreateProject, useUpdateProject, useCompanies, useCustomers } from "@/hooks/use-masters";
import {
  validateForm, type ValidationRules,
  validateProjectCode, validateMinLength, validateDateISO, validateDateRange,
  validateNonNegativeNumber, validatePincode, validateGSTIN,
} from "@/lib/validators";
import { StateCitySelect } from "@/components/StateCitySelect";

const PROJECT_TYPES = [
  { value: "Road", label: "Road" }, { value: "Building", label: "Building" },
  { value: "Infrastructure", label: "Infrastructure" }, { value: "Highway", label: "Highway" },
  { value: "Bridge", label: "Bridge" }, { value: "Railway", label: "Railway" },
  { value: "Others", label: "Others" },
];

const PROJECT_STATUSES = [
  { value: "active", label: "Active" }, { value: "draft", label: "Draft" },
  { value: "on_hold", label: "On Hold" }, { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  // "inactive" is the universal soft-delete marker used by MasterListPage's
  // filter — included here so users can restore a deleted project by
  // flipping it back to active/draft/etc.
  { value: "inactive", label: "Inactive (deleted)" },
];

interface Props { open: boolean; onClose: () => void; editData?: any; }

const emptyForm = {
  code: "", name: "", description: "", projectType: "Building",
  companyId: "", clientId: "",
  address: "", city: "", state: "", pincode: "", siteGstin: "",
  startDate: "", expectedEndDate: "", actualEndDate: "",
  projectValue: "", budget: "", purchaseLimit: "",
  status: "active",
};

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Project name" },
    { validator: (v) => validateMinLength(v, 3, "Project name") },
  ],
  code: [{ required: true, label: "Project code" }, { validator: validateProjectCode }],
  companyId: [{ required: true, label: "Company" }],
  clientId: [{ required: true, label: "Client" }],
  startDate: [
    { required: true, label: "Start date" },
    { validator: (v) => validateDateISO(v, "Start date") },
  ],
  expectedEndDate: [{ validator: (v) => validateDateISO(v, "Expected end date") }],
  actualEndDate: [{ validator: (v) => validateDateISO(v, "Actual end date") }],
  projectValue: [{ validator: (v) => validateNonNegativeNumber(v, "Contract value") }],
  budget: [{ validator: (v) => validateNonNegativeNumber(v, "Budget") }],
  purchaseLimit: [{ validator: (v) => validateNonNegativeNumber(v, "Purchase limit") }],
  pincode: [{ validator: validatePincode }],
  siteGstin: [{ validator: validateGSTIN }],
};

export function ProjectFormDrawer({ open, onClose, editData }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const { data: companiesData } = useCompanies();
  const { data: customersData } = useCustomers();

  const set = (key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  useEffect(() => {
    if (open) {
      if (editData?.id) {
        setForm({
          ...emptyForm,
          ...editData,
          companyId: editData.companyId ?? "",
          clientId: editData.clientId ?? "",
          description: editData.description ?? "",
          projectType: editData.projectType ?? "Building",
          address: editData.address ?? "",
          city: editData.city ?? "",
          state: editData.state ?? "",
          pincode: editData.pincode ?? "",
          siteGstin: editData.siteGstin ?? "",
          startDate: editData.startDate ?? "",
          expectedEndDate: editData.expectedEndDate ?? "",
          actualEndDate: editData.actualEndDate ?? "",
          projectValue:
            editData.projectValue != null ? String(editData.projectValue) : "",
          budget: editData.budget != null ? String(editData.budget) : "",
          purchaseLimit:
            editData.purchaseLimit != null ? String(editData.purchaseLimit) : "",
          status: editData.status ?? "active",
        });
      } else {
        setForm(emptyForm);
      }
      setErrors({});
    }
  }, [open, editData?.id, editData]);

  const companies = (companiesData?.data ?? []).filter((c: any) => c?.status !== "inactive");
  // Company is a required FK in the DB. Since we removed the Company picker
  // from the modal, auto-select the first active company when creating.
  useEffect(() => {
    if (!open) return;
    if (editData?.id) return; // keep existing company on edits
    if (form.companyId) return;
    const first = companies[0];
    if (first?.id) setForm((prev) => ({ ...prev, companyId: first.id }));
  }, [open, editData?.id, form.companyId, companies]);

  const customerOptions = (customersData?.data ?? []).map((c: any) => ({ value: c.id, label: c.name }));

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    // Cross-field date range check — end dates must be on/after start date.
    if (!errs.expectedEndDate) {
      const rangeResult = validateDateRange(form.startDate, form.expectedEndDate, "Expected end date");
      if (!rangeResult.valid) errs.expectedEndDate = rangeResult.error!;
    }
    if (!errs.actualEndDate) {
      const rangeResult = validateDateRange(form.startDate, form.actualEndDate, "Actual end date");
      if (!rangeResult.valid) errs.actualEndDate = rangeResult.error!;
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editData?.id) {
        await updateMutation.mutateAsync({ id: editData.id, ...form });
      } else {
        await createMutation.mutateAsync(form);
      }
      onClose();
    } catch { /* error toast handled globally */ }
  };

  return (
    <FormDrawer open={open} onClose={onClose}
      title={editData ? "Edit Project" : "Add Project"}
      subtitle="Construction project registration"
      width="xl" onSubmit={handleSubmit}
      submitLabel={editData ? "Update Project" : "Create Project"}
      loading={createMutation.isPending || updateMutation.isPending}>

      <FormSection title="Project Information">
        <FormRow>
          <Field label="Project Code" required hint="Short unique code, e.g. BKP01" error={errors.code}>
            <TextInput value={form.code} onChange={v => set("code", v.toUpperCase())} placeholder="BKP01" invalid={!!errors.code} />
          </Field>
          <Field label="Project Name" required error={errors.name}>
            <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Barapukuria Highway Extension" invalid={!!errors.name} />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Project Type">
            <SelectInput value={form.projectType} onChange={v => set("projectType", v)} options={PROJECT_TYPES} />
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={PROJECT_STATUSES} />
          </Field>
        </FormRow>
        <Field label="Description">
          <TextAreaInput value={form.description} onChange={v => set("description", v)} placeholder="Brief project description..." rows={2} />
        </Field>
      </FormSection>

      <FormSection title="Organization">
        <FormRow>
          <Field label="Client" required span={2} error={errors.clientId}>
            <SelectInput value={form.clientId} onChange={v => set("clientId", v)} options={customerOptions} placeholder="Select client" invalid={!!errors.clientId} />
          </Field>
        </FormRow>
      </FormSection>

      <FormSection title="Financials">
        <FormRow>
          <Field label="Contract Value (₹)" hint="Total contract award value" error={errors.projectValue}>
            <NumberInput value={form.projectValue} onChange={v => set("projectValue", v)} min={0} step="0.01" placeholder="0.00" invalid={!!errors.projectValue} />
          </Field>
          <Field label="Budget (₹)" hint="Internal budget allocation" error={errors.budget}>
            <NumberInput value={form.budget} onChange={v => set("budget", v)} min={0} step="0.01" placeholder="0.00" invalid={!!errors.budget} />
          </Field>
        </FormRow>
        <Field label="Purchase Limit (₹)" hint="Per-PO authorization limit for site" error={errors.purchaseLimit}>
          <NumberInput value={form.purchaseLimit} onChange={v => set("purchaseLimit", v)} min={0} step="0.01" placeholder="500000" invalid={!!errors.purchaseLimit} />
        </Field>
      </FormSection>

      <FormSection title="Timeline">
        <FormRow>
          <Field label="Start Date" required error={errors.startDate}>
            <DateInput
              value={form.startDate}
              onChange={(v) => {
                set("startDate", v);
                // If the current expected-end is now before the new start, clear it
                // so the user has to re-pick — prevents stale invalid ranges.
                if (form.expectedEndDate && v && form.expectedEndDate < v) {
                  set("expectedEndDate", "");
                }
                if (form.actualEndDate && v && form.actualEndDate < v) {
                  set("actualEndDate", "");
                }
              }}
              invalid={!!errors.startDate}
            />
          </Field>
          <Field label="Expected End Date" error={errors.expectedEndDate} hint={form.startDate ? undefined : "Pick a start date first"}>
            <DateInput
              value={form.expectedEndDate}
              onChange={v => set("expectedEndDate", v)}
              min={form.startDate || undefined}
              invalid={!!errors.expectedEndDate}
            />
          </Field>
        </FormRow>
        {editData && (
          <Field label="Actual End Date" error={errors.actualEndDate}>
            <DateInput
              value={form.actualEndDate}
              onChange={v => set("actualEndDate", v)}
              min={form.startDate || undefined}
              invalid={!!errors.actualEndDate}
            />
          </Field>
        )}
      </FormSection>

      <FormSection title="Site Address">
        <Field label="Site Address">
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
        <FormRow>
          <Field label="PIN Code" error={errors.pincode}>
            <TextInput value={form.pincode} onChange={v => set("pincode", v.replace(/\D/g, ""))} maxLength={6} invalid={!!errors.pincode} />
          </Field>
          <Field label="Site GSTIN" error={errors.siteGstin}>
            <TextInput value={form.siteGstin} onChange={v => set("siteGstin", v.toUpperCase())} placeholder="Site-specific GSTIN" maxLength={15} invalid={!!errors.siteGstin} />
          </Field>
        </FormRow>
      </FormSection>
    </FormDrawer>
  );
}
