"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
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

export default function NewEquipmentLogPage() {
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
      router.push("/equipment/log-book");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save log") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/log-book")}
        title="New Equipment Log"
        subtitle="Daily reading — submit for PM approval"
      />

      <PageContainer className="max-w-4xl">
        {errors.form && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors.form}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Equipment" required error={errors.equipmentId}>
              <select
                value={form.equipmentId}
                onChange={(e) => set("equipmentId", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                <option value="">Select machine</option>
                {machinery.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project" error={errors.projectId}>
              <select
                value={form.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date" required error={errors.logDate}>
              <input
                type="date"
                value={form.logDate}
                onChange={(e) => set("logDate", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Shift">
              <select
                value={form.shift}
                onChange={(e) => set("shift", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                {SHIFT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">{meterLabel}</h3>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={form.meterReset}
                  onChange={(e) => set("meterReset", e.target.checked)}
                  className="rounded border-gray-300"
                />
                Meter reset
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Opening">
                <input
                  type="number"
                  step="0.01"
                  value={form.openingMeter}
                  onChange={(e) => set("openingMeter", e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                />
              </Field>
              <Field label="Closing" required error={errors.closingMeter}>
                <input
                  type="number"
                  step="0.01"
                  value={form.closingMeter}
                  onChange={(e) => set("closingMeter", e.target.value)}
                  className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                />
              </Field>
              <Field label="Run (auto)">
                <input
                  type="number"
                  readOnly
                  value={runAuto}
                  className="w-full h-10 rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm text-gray-600"
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Idle Hrs">
              <input
                type="number"
                step="0.01"
                value={form.idleHours}
                onChange={(e) => set("idleHours", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Breakdown Hrs">
              <input
                type="number"
                step="0.01"
                value={form.breakdownHours}
                onChange={(e) => set("breakdownHours", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Diesel Issued (L)">
              <input
                type="number"
                step="0.01"
                value={form.dieselIssued}
                onChange={(e) => set("dieselIssued", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Operator">
              <input
                type="text"
                placeholder="Operator name"
                value={form.operatorName}
                onChange={(e) => set("operatorName", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Productivity Qty">
              <input
                type="number"
                step="0.01"
                placeholder="e.g. 320"
                value={form.productivityQty}
                onChange={(e) => set("productivityQty", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Output UOM">
              <input
                type="text"
                placeholder="CUM / MT / SQM"
                value={form.outputUom}
                onChange={(e) => set("outputUom", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
          </div>

          <Field label="Remarks">
            <textarea
              rows={3}
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={() => router.push("/equipment/log-book")}
            className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSave(false)}
            className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Save Draft
          </button>
          <PrimaryButton
            disabled={submitting}
            onClick={() => void handleSave(true)}
          >
            <CheckCircle2 className="w-4 h-4" />
            Submit for Approval
          </PrimaryButton>
        </div>
      </PageContainer>
    </>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
