"use client";

/**
 * HireInForm — shared form for the "Hire-In Verification" create flow.
 *
 * Used from:
 *   - /equipment/hire-rent/hire-in/new   (full page)
 *   - HireInDrawer                       (side drawer — embedded + onSaved)
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PageShell";
import {
  Field,
  FormSection,
  FormRow,
  NumberInput,
  SelectInput,
  DateInput,
} from "@/components/FormDrawer";
import { useMachinery, useVendors, useProjects } from "@/hooks/use-masters";
import { useCreateHireInVerification } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const BASIS_OPTIONS = [
  { value: "hour", label: "Per Hour" },
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
];

const emptyForm = {
  equipmentId: "",
  vendorId: "",
  projectId: "",
  periodFrom: "",
  periodTo: "",
  rate: "",
  rateBasis: "hour",
  vendorClaimedQty: "",
  minGuaranteedQty: "",
  gstPercent: "18",
};

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function HireInForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateHireInVerification();
  const { data: machineryData } = useMachinery();
  const { data: vendorsData } = useVendors();
  const { data: projectsData } = useProjects();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const machinery = machineryData?.data ?? [];
  const vendors = vendorsData?.data ?? [];
  const projects = projectsData?.data ?? [];

  const hiredMachines = useMemo(
    () => machinery.filter((m) => m.status !== "disposed"),
    [machinery],
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
    if (!form.equipmentId) next.equipmentId = "Machine is required";
    if (!form.projectId) next.projectId = "Project is required";
    if (!form.periodFrom) next.periodFrom = "Period From is required";
    if (!form.periodTo) next.periodTo = "Period To is required";
    if (form.periodFrom && form.periodTo && form.periodTo < form.periodFrom)
      next.periodTo = "Period To must be on or after Period From";
    if (!form.rate || Number(form.rate) <= 0) next.rate = "Rate is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        vendorId: form.vendorId || null,
        projectId: form.projectId || null,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        rate: Number(form.rate),
        rateBasis: form.rateBasis,
        vendorClaimedQty:
          form.vendorClaimedQty !== "" ? Number(form.vendorClaimedQty) : null,
        minGuaranteedQty:
          form.minGuaranteedQty !== "" ? Number(form.minGuaranteedQty) : null,
        gstPercent: Number(form.gstPercent) || 18,
        compute: true,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/hire-rent");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to compute verification") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/hire-rent");
  };

  const machineOptions = hiredMachines.map((m) => ({
    value: m.id,
    label: `${m.code} — ${m.name}`,
  }));
  const vendorOptions = vendors.map((v) => ({ value: v.id, label: v.name }));
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Verification Period">
        <FormRow>
          <Field label="Hired-In Machine" required error={errors.equipmentId}>
            <SelectInput
              value={form.equipmentId}
              onChange={(v) => set("equipmentId", v)}
              options={machineOptions}
              placeholder="Select machine"
              invalid={!!errors.equipmentId}
            />
          </Field>
          <Field label="Owner Vendor">
            <SelectInput
              value={form.vendorId}
              onChange={(v) => set("vendorId", v)}
              options={vendorOptions}
              placeholder="Select vendor"
            />
          </Field>
          <Field label="Project" required error={errors.projectId}>
            <SelectInput
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              options={projectOptions}
              placeholder="Select project"
              invalid={!!errors.projectId}
            />
          </Field>
          <Field label="Period From" required error={errors.periodFrom}>
            <DateInput
              value={form.periodFrom}
              onChange={(v) => set("periodFrom", v)}
              invalid={!!errors.periodFrom}
            />
          </Field>
          <Field label="Period To" required error={errors.periodTo}>
            <DateInput
              value={form.periodTo}
              onChange={(v) => set("periodTo", v)}
              min={form.periodFrom || undefined}
              invalid={!!errors.periodTo}
            />
          </Field>
        </FormRow>
      </FormSection>

      <FormSection title="Rate & Quantities">
        <FormRow>
          <Field label="Rate Basis">
            <SelectInput
              value={form.rateBasis}
              onChange={(v) => set("rateBasis", v)}
              options={BASIS_OPTIONS}
            />
          </Field>
          <Field label="Rate ₹" required error={errors.rate}>
            <NumberInput
              value={form.rate}
              onChange={(v) => set("rate", v)}
              step="0.01"
              invalid={!!errors.rate}
            />
          </Field>
          <Field label="Vendor Claimed Qty">
            <NumberInput
              value={form.vendorClaimedQty}
              onChange={(v) => set("vendorClaimedQty", v)}
            />
          </Field>
          <Field label="Min Guaranteed Qty">
            <NumberInput
              value={form.minGuaranteedQty}
              onChange={(v) => set("minGuaranteedQty", v)}
            />
          </Field>
          <Field label="GST %">
            <NumberInput
              value={form.gstPercent}
              onChange={(v) => set("gstPercent", v)}
              step="0.01"
            />
          </Field>
        </FormRow>
        <p className="text-xs text-gray-500">
          Billable qty = max(logged from approved logs, min guaranteed). Variance
          = claimed − logged.
        </p>
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
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <TrendingUp className="w-4 h-4" />
        )}
        Compute
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
