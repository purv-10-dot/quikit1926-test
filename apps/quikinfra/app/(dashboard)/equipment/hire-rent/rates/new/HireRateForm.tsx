"use client";

/**
 * HireRateForm — shared form for the "Add Hire Rate" create flow.
 *
 * Used from:
 *   - /equipment/hire-rent/rates/new   (full page — embedded omitted)
 *   - HireRateDrawer                   (side drawer — embedded + onSaved)
 *
 * Built on the shared FormDrawer field primitives. When `embedded` the body
 * scrolls and the footer is pinned; after a successful save `onSaved` fires
 * instead of navigating.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PageShell";
import {
  Field,
  FormSection,
  FormRow,
  TextInput,
  NumberInput,
  SelectInput,
  DateInput,
} from "@/components/FormDrawer";
import { useMachinery, useVendors, useCustomers, useGSTCodes } from "@/hooks/use-masters";
import { useCreateHireRate } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const DIRECTIONS = [
  { value: "hire_in", label: "Hire-In (vendor → Quik)" },
];

const BASIS_OPTIONS = [
  { value: "hour", label: "Per Hour" },
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
];

const emptyForm = {
  direction: "hire_in",
  rateBasis: "hour",
  equipmentId: "",
  equipmentType: "",
  vendorId: "",
  customerId: "",
  rate: "",
  sacCode: "",
  gstPercent: "18",
  minGuaranteedQty: "",
  effectiveFrom: "",
};

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function HireRateForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateHireRate();
  const { data: machineryData } = useMachinery();
  const { data: vendorsData } = useVendors();
  const { data: customersData } = useCustomers();
  const { data: gstData } = useGSTCodes();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const machinery = machineryData?.data ?? [];
  const vendors = vendorsData?.data ?? [];
  const customers = customersData?.data ?? [];
  const gstCodes = gstData?.data ?? [];

  // Equipment hire is a service, so only SAC codes from the GST master apply.
  const sacCodes = useMemo(
    () =>
      gstCodes.filter(
        (g) => (g.codeType ?? "").toUpperCase() === "SAC" && g.status === "active",
      ),
    [gstCodes],
  );

  const selectedMachine = useMemo(
    () => machinery.find((m) => m.id === form.equipmentId),
    [machinery, form.equipmentId],
  );

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.equipmentId) next.equipmentId = "Equipment is required";
    if (!form.rate || Number(form.rate) <= 0) next.rate = "Rate is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        direction: form.direction,
        rateBasis: form.rateBasis,
        equipmentId: form.equipmentId || null,
        equipmentType: form.equipmentType || selectedMachine?.type || null,
        vendorId: form.direction === "hire_in" ? form.vendorId || null : null,
        customerId: form.direction === "rent_out" ? form.customerId || null : null,
        rate: Number(form.rate),
        sacCode: form.sacCode || "995463",
        gstPercent: Number(form.gstPercent) || 18,
        minGuaranteedQty:
          form.minGuaranteedQty !== "" ? Number(form.minGuaranteedQty) : null,
        effectiveFrom: form.effectiveFrom || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/hire-rent");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save hire rate") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/hire-rent");
  };

  const machineOptions = machinery.map((m) => ({
    value: m.id,
    label: `${m.code} — ${m.name}`,
  }));
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const customerOptions = customers.map((c) => ({ value: c.id, label: c.name }));
  const sacOptions = sacCodes.map((g) => ({
    value: g.code,
    label: `${g.code} — ${g.description}`,
  }));

  // Picking a SAC code carries its GST rate over from the master.
  const handleSacChange = (code: string) => {
    set("sacCode", code);
    const match = sacCodes.find((g) => g.code === code);
    if (match) set("gstPercent", String(match.rate ?? match.igstRate ?? ""));
  };

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Rate Card">
        <FormRow>
          <Field label="Direction" required error={errors.direction}>
            <SelectInput
              value={form.direction}
              onChange={(v) => set("direction", v)}
              options={DIRECTIONS}
            />
          </Field>
          <Field label="Rate Basis">
            <SelectInput
              value={form.rateBasis}
              onChange={(v) => set("rateBasis", v)}
              options={BASIS_OPTIONS}
            />
          </Field>
          <Field label="Equipment" required error={errors.equipmentId}>
            <SelectInput
              value={form.equipmentId}
              onChange={(v) => set("equipmentId", v)}
              options={machineOptions}
              placeholder="Specific machine"
              invalid={!!errors.equipmentId}
            />
          </Field>
          <Field label="Equipment Type (optional)">
            <TextInput
              value={form.equipmentType || selectedMachine?.type || ""}
              onChange={(v) => set("equipmentType", v)}
              placeholder="e.g. Excavator"
            />
          </Field>
          {form.direction === "hire_in" ? (
            <Field label="Vendor">
              <SelectInput
                value={form.vendorId}
                onChange={(v) => set("vendorId", v)}
                options={vendorOptions}
                placeholder="Select vendor"
              />
            </Field>
          ) : (
            <Field label="Customer">
              <SelectInput
                value={form.customerId}
                onChange={(v) => set("customerId", v)}
                options={customerOptions}
                placeholder="Select customer"
              />
            </Field>
          )}
          <Field label="Rate ₹" required error={errors.rate}>
            <NumberInput
              value={form.rate}
              onChange={(v) => set("rate", v)}
              step="0.01"
              invalid={!!errors.rate}
            />
          </Field>
          <Field label="SAC Code">
            <SelectInput
              value={form.sacCode}
              onChange={handleSacChange}
              options={sacOptions}
              placeholder="Select SAC code"
              searchable
            />
          </Field>
          <Field label="GST %" hint="Auto-filled from SAC code">
            <NumberInput
              value={form.gstPercent}
              onChange={(v) => set("gstPercent", v)}
              step="0.01"
            />
          </Field>
          <Field label="Min Guaranteed Qty">
            <NumberInput
              value={form.minGuaranteedQty}
              onChange={(v) => set("minGuaranteedQty", v)}
            />
          </Field>
          <Field label="Effective From">
            <DateInput
              value={form.effectiveFrom}
              onChange={(v) => set("effectiveFrom", v)}
            />
          </Field>
        </FormRow>
      </FormSection>
    </>
  );

  const footer = (
    <>
      <button
        type="button"
        onClick={handleCancel}
        className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Cancel
      </button>
      <PrimaryButton disabled={submitting} onClick={() => void handleSubmit()}>
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Rate
      </PrimaryButton>
    </>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {body}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:px-8">
          {footer}
        </div>
      </div>
    );
  }

  return (
    <div>
      {body}
      <div className="flex justify-end gap-3 mt-6">{footer}</div>
    </div>
  );
}
