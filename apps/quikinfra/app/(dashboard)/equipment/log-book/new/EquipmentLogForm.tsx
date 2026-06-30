"use client";

/**
 * EquipmentLogForm — shared form for the "New Equipment Log" create flow.
 *
 * Used from:
 *   - /equipment/log-book/new        (full page — embedded omitted)
 *   - EquipmentLogDrawer             (side drawer — embedded + onSaved)
 *
 * Built on the shared FormDrawer field primitives so the inputs match the
 * rest of the app's drawers (rounded borders, orange focus ring, custom
 * select dropdowns). When `embedded` is true the form drops its page error
 * banner padding and, after a successful save, calls `onSaved` instead of
 * navigating — letting the drawer host close itself and refresh the list.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PageShell";
import {
  Field,
  FormSection,
  FormRow,
  TextInput,
  NumberInput,
  SelectInput,
  TextAreaInput,
  DateInput,
  CheckboxInput,
} from "@/components/FormDrawer";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import { useCreateEquipmentLog } from "@/hooks/use-equipment";
import { computeRun } from "@/lib/equipment/equipment-calculations";
import { toErrorMessage } from "@/lib/api/errors";

const SHIFT_OPTIONS = [
  { value: "Day", label: "Day" },
  { value: "Night", label: "Night" },
  { value: "General", label: "General" },
];

const emptyForm = {
  equipmentId: "",
  projectId: "",
  logDate: new Date().toISOString().slice(0, 10),
  shift: "Day",
  openingMeter: "",
  closingMeter: "",
  meterReset: false,
  idleHours: "0",
  breakdownHours: "0",
  dieselIssued: "0",
  operatorName: "",
  productivityQty: "",
  outputUom: "",
  remarks: "",
};

interface Props {
  /** When true, render with drawer-body padding instead of standalone. */
  embedded?: boolean;
  /** Called after a successful create when `embedded` is true. */
  onSaved?: () => void;
  /** Cancel handler — defaults to navigating back to the log book. */
  onCancel?: () => void;
}

export function EquipmentLogForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateEquipmentLog();

  const { data: projectsData } = useProjects();
  const { data: machineryData } = useMachinery();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const projects = projectsData?.data ?? [];
  const machinery = machineryData?.data ?? [];

  const selectedMachine = useMemo(
    () => machinery.find((m) => m.id === form.equipmentId),
    [machinery, form.equipmentId],
  );

  const meterLabel =
    selectedMachine?.meterType === "km" ? "Meter (KM)" : "Meter (Hours)";

  const runAuto = useMemo(() => {
    const opening =
      form.openingMeter !== "" ? Number(form.openingMeter) : null;
    const closing =
      form.closingMeter !== "" ? Number(form.closingMeter) : null;
    if (closing == null || !Number.isFinite(closing)) return 0;
    const run = computeRun(
      opening != null && Number.isFinite(opening) ? opening : null,
      closing,
      form.meterReset,
    );
    return run ?? 0;
  }, [form.openingMeter, form.closingMeter, form.meterReset]);

  useEffect(() => {
    if (!form.equipmentId) return;
    const m = machinery.find((x) => x.id === form.equipmentId);
    if (m?.currentMeter != null && form.openingMeter === "") {
      setForm((prev) => ({
        ...prev,
        openingMeter: String(m.currentMeter),
        projectId: prev.projectId || m.projectId || "",
      }));
    }
  }, [form.equipmentId, form.openingMeter, machinery]);

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

  const validate = (submit: boolean) => {
    const next: Record<string, string> = {};
    if (!form.equipmentId) next.equipmentId = "Equipment is required";
    if (!form.logDate) next.logDate = "Date is required";
    if (!form.closingMeter) next.closingMeter = "Closing meter is required";
    if (submit && !form.projectId) {
      next.projectId = "Project is required before submitting for approval";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => ({
    equipmentId: form.equipmentId,
    projectId: form.projectId || null,
    logDate: form.logDate,
    shift: form.shift,
    openingMeter: form.openingMeter !== "" ? Number(form.openingMeter) : null,
    closingMeter: Number(form.closingMeter),
    meterReset: form.meterReset,
    idleHours: Number(form.idleHours) || 0,
    breakdownHours: Number(form.breakdownHours) || 0,
    dieselIssued: Number(form.dieselIssued) || 0,
    operatorName: form.operatorName || null,
    productivityQty:
      form.productivityQty !== "" ? Number(form.productivityQty) : null,
    outputUom: form.outputUom || null,
    remarks: form.remarks || null,
  });

  const handleSave = async (submit: boolean) => {
    if (!validate(submit)) return;
    setSubmitting(true);
    try {
      const created = (await createMutation.mutateAsync(
        buildPayload(),
      )) as { id: string };
      if (submit) {
        const res = await fetch(`/api/equipment/logs/${created.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
      }
      if (embedded) {
        onSaved?.();
      } else {
        router.push("/equipment/log-book");
      }
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save log") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/log-book");
  };

  const machineOptions = machinery.map((m) => ({
    value: m.id,
    label: `${m.code} — ${m.name}`,
  }));
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Log Details">
        <FormRow>
          <Field label="Equipment" required error={errors.equipmentId}>
            <SelectInput
              value={form.equipmentId}
              onChange={(v) => set("equipmentId", v)}
              options={machineOptions}
              placeholder="Select machine"
              invalid={!!errors.equipmentId}
            />
          </Field>
          <Field label="Project" error={errors.projectId}>
            <SelectInput
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              options={projectOptions}
              placeholder="Select project"
              invalid={!!errors.projectId}
            />
          </Field>
          <Field label="Date" required error={errors.logDate}>
            <DateInput
              value={form.logDate}
              onChange={(v) => set("logDate", v)}
              invalid={!!errors.logDate}
            />
          </Field>
          <Field label="Shift">
            <SelectInput
              value={form.shift}
              onChange={(v) => set("shift", v)}
              options={SHIFT_OPTIONS}
            />
          </Field>
        </FormRow>
      </FormSection>

      <FormSection title={meterLabel}>
        <div className="flex justify-end -mt-1">
          <CheckboxInput
            checked={form.meterReset}
            onChange={(v) => set("meterReset", v)}
            label="Meter reset"
          />
        </div>
        <FormRow>
          <Field label="Opening">
            <NumberInput
              value={form.openingMeter}
              onChange={(v) => set("openingMeter", v)}
              step="0.01"
            />
          </Field>
          <Field label="Closing" required error={errors.closingMeter}>
            <NumberInput
              value={form.closingMeter}
              onChange={(v) => set("closingMeter", v)}
              step="0.01"
              invalid={!!errors.closingMeter}
            />
          </Field>
          <Field label="Run (auto)" span={2}>
            <NumberInput value={runAuto} onChange={() => {}} disabled />
          </Field>
        </FormRow>
      </FormSection>

      <FormSection title="Utilisation & Fuel">
        <FormRow>
          <Field label="Idle Hrs">
            <NumberInput
              value={form.idleHours}
              onChange={(v) => set("idleHours", v)}
              step="0.01"
            />
          </Field>
          <Field label="Breakdown Hrs">
            <NumberInput
              value={form.breakdownHours}
              onChange={(v) => set("breakdownHours", v)}
              step="0.01"
            />
          </Field>
          <Field label="Diesel Issued (L)">
            <NumberInput
              value={form.dieselIssued}
              onChange={(v) => set("dieselIssued", v)}
              step="0.01"
            />
          </Field>
          <Field label="Operator">
            <TextInput
              value={form.operatorName}
              onChange={(v) => set("operatorName", v)}
              placeholder="Operator name"
            />
          </Field>
          <Field label="Productivity Qty">
            <NumberInput
              value={form.productivityQty}
              onChange={(v) => set("productivityQty", v)}
              step="0.01"
              placeholder="e.g. 320"
            />
          </Field>
          <Field label="Output UOM">
            <TextInput
              value={form.outputUom}
              onChange={(v) => set("outputUom", v)}
              placeholder="CUM / MT / SQM"
            />
          </Field>
        </FormRow>
      </FormSection>

      <Field label="Remarks">
        <TextAreaInput
          value={form.remarks}
          onChange={(v) => set("remarks", v)}
          rows={3}
          placeholder="Observations, deviations, corrective actions..."
        />
      </Field>
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
      <PrimaryButton
        disabled={submitting}
        onClick={() => void handleSave(false)}
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}
        Create
      </PrimaryButton>
    </>
  );

  // Embedded (drawer) mode: body scrolls, footer is pinned to the bottom.
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

  // Full-page mode: normal document flow.
  return (
    <div>
      {body}
      <div className="flex justify-end gap-3 mt-6">{footer}</div>
    </div>
  );
}
