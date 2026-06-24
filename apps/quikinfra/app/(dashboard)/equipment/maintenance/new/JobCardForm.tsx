"use client";

/**
 * JobCardForm — shared form for the "New Maintenance Job Card" create flow.
 *
 * Used from:
 *   - /equipment/maintenance/new   (full page — embedded omitted)
 *   - JobCardDrawer                (side drawer — embedded + onSaved)
 *
 * Built on the shared FormDrawer field primitives so the inputs match the
 * rest of the app's drawers. When `embedded` is true the body scrolls and
 * the footer is pinned; after a successful save `onSaved` fires instead of
 * navigating, letting the drawer host close itself and refresh the list.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wrench, Loader2 } from "lucide-react";
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
} from "@/components/FormDrawer";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import { useCreateJobCard } from "@/hooks/use-equipment";
import { computeJobCardTotal } from "@/lib/equipment/equipment-calculations";
import { toErrorMessage } from "@/lib/api/errors";

const JOB_TYPES = [
  { value: "breakdown", label: "Breakdown" },
  { value: "preventive", label: "Preventive" },
];

interface SpareRow {
  id: string;
  description: string;
  qty: string;
  rate: string;
}

const emptySpare = (): SpareRow => ({
  id: Math.random().toString(36).slice(2),
  description: "",
  qty: "",
  rate: "",
});

const emptyForm = {
  equipmentId: "",
  projectId: "",
  jobType: "breakdown",
  serviceDate: new Date().toISOString().slice(0, 10),
  meterAtService: "",
  downtimeHours: "0",
  reportedProblem: "",
  labourCost: "0",
  serviceCost: "0",
  remarks: "",
};

interface Props {
  /** When true, render with drawer-body scroll + pinned footer. */
  embedded?: boolean;
  /** Called after a successful create when `embedded` is true. */
  onSaved?: () => void;
  /** Cancel handler — defaults to navigating back to maintenance. */
  onCancel?: () => void;
}

export function JobCardForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateJobCard();

  const { data: projectsData } = useProjects();
  const { data: machineryData } = useMachinery();

  const [form, setForm] = useState(emptyForm);
  const [spares, setSpares] = useState<SpareRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const projects = projectsData?.data ?? [];
  const machinery = machineryData?.data ?? [];

  useEffect(() => {
    if (!form.equipmentId) return;
    const m = machinery.find((x) => x.id === form.equipmentId);
    if (m && !form.meterAtService && m.currentMeter != null) {
      setForm((prev) => ({
        ...prev,
        meterAtService: String(m.currentMeter),
        projectId: prev.projectId || m.projectId || "",
      }));
    }
  }, [form.equipmentId, form.meterAtService, machinery]);

  const totalAuto = useMemo(() => {
    const spareInputs = spares
      .filter((s) => s.description.trim())
      .map((s) => ({ qty: Number(s.qty) || 0, rate: Number(s.rate) || 0 }));
    return computeJobCardTotal(
      spareInputs,
      Number(form.labourCost) || 0,
      Number(form.serviceCost) || 0,
    );
  }, [spares, form.labourCost, form.serviceCost]);

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

  const updateSpare = (id: string, field: keyof SpareRow, value: string) => {
    setSpares((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    );
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.equipmentId) next.equipmentId = "Equipment is required";
    if (!form.serviceDate) next.serviceDate = "Service date is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        projectId: form.projectId || null,
        jobType: form.jobType,
        serviceDate: form.serviceDate,
        meterAtService:
          form.meterAtService !== "" ? Number(form.meterAtService) : null,
        downtimeHours: Number(form.downtimeHours) || 0,
        reportedProblem: form.reportedProblem || null,
        labourCost: Number(form.labourCost) || 0,
        serviceCost: Number(form.serviceCost) || 0,
        spares: spares
          .filter((s) => s.description.trim())
          .map((s) => ({
            description: s.description.trim(),
            qty: Number(s.qty) || 0,
            rate: Number(s.rate) || 0,
          })),
        remarks: form.remarks || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/maintenance");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to create job card") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/maintenance");
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

      <FormSection title="Job Details">
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
          <Field label="Type">
            <SelectInput
              value={form.jobType}
              onChange={(v) => set("jobType", v)}
              options={JOB_TYPES}
            />
          </Field>
          <Field label="Project">
            <SelectInput
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              options={projectOptions}
              placeholder="Select project"
            />
          </Field>
          <Field label="Service Date" required error={errors.serviceDate}>
            <DateInput
              value={form.serviceDate}
              onChange={(v) => set("serviceDate", v)}
              invalid={!!errors.serviceDate}
            />
          </Field>
          <Field label="Meter at Service">
            <NumberInput
              value={form.meterAtService}
              onChange={(v) => set("meterAtService", v)}
              step="0.01"
            />
          </Field>
          <Field label="Downtime (hrs)">
            <NumberInput
              value={form.downtimeHours}
              onChange={(v) => set("downtimeHours", v)}
              step="0.01"
            />
          </Field>
          <Field label="Reported Problem" span={2}>
            <TextInput
              value={form.reportedProblem}
              onChange={(v) => set("reportedProblem", v)}
              placeholder="e.g. engine overheating"
            />
          </Field>
        </FormRow>
      </FormSection>

      <FormSection title="Spares Consumed">
        <div className="flex justify-end -mt-1">
          <button
            type="button"
            onClick={() => setSpares((prev) => [...prev, emptySpare()])}
            className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
          >
            <Plus className="w-4 h-4" />
            Add spare
          </button>
        </div>
        {spares.length === 0 ? (
          <p className="text-sm text-gray-400 py-1">
            No spares added. Click &quot;Add spare&quot; to log parts used.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
              <div className="col-span-6">Spare description</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-3">Rate</div>
              <div className="col-span-1" />
            </div>
            {spares.map((row) => (
              <div key={row.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-6">
                  <TextInput
                    value={row.description}
                    onChange={(v) => updateSpare(row.id, "description", v)}
                    placeholder="Spare description"
                  />
                </div>
                <div className="col-span-2">
                  <NumberInput
                    value={row.qty}
                    onChange={(v) => updateSpare(row.id, "qty", v)}
                    step="0.01"
                  />
                </div>
                <div className="col-span-3">
                  <NumberInput
                    value={row.rate}
                    onChange={(v) => updateSpare(row.id, "rate", v)}
                    step="0.01"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSpares((prev) => prev.filter((s) => s.id !== row.id))
                  }
                  className="col-span-1 mt-1.5 p-2 text-gray-400 hover:text-red-600"
                  aria-label="Remove spare"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Costs">
        <FormRow>
          <Field label="Labour Cost">
            <NumberInput
              value={form.labourCost}
              onChange={(v) => set("labourCost", v)}
              step="0.01"
            />
          </Field>
          <Field label="External Service Cost">
            <NumberInput
              value={form.serviceCost}
              onChange={(v) => set("serviceCost", v)}
              step="0.01"
            />
          </Field>
          <Field label="Total (auto)" span={2}>
            <div className="h-[38px] flex items-center px-3 rounded-lg border border-gray-300 bg-gray-50 text-sm font-semibold tabular-nums text-gray-900">
              ₹ {totalAuto.toLocaleString("en-IN")}
            </div>
          </Field>
        </FormRow>
      </FormSection>

      <Field label="Remarks">
        <TextAreaInput
          value={form.remarks}
          onChange={(v) => set("remarks", v)}
          rows={3}
          placeholder="Notes, observations, corrective actions..."
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
      <PrimaryButton disabled={submitting} onClick={() => void handleSubmit()}>
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wrench className="w-4 h-4" />
        )}
        Create Job Card
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
