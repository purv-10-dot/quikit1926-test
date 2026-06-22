"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Plus, Trash2 } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
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

export default function NewJobCardPage() {
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
      .map((s) => ({
        qty: Number(s.qty) || 0,
        rate: Number(s.rate) || 0,
      }));
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
      router.push("/equipment/maintenance");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to create job card") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/maintenance")}
        title="New Maintenance Job Card"
        subtitle="Machine moves to Under Maintenance until closed"
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
            <Field label="Type">
              <select
                value={form.jobType}
                onChange={(e) => set("jobType", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                {JOB_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select
                value={form.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                <option value="">Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service Date" required error={errors.serviceDate}>
              <input
                type="date"
                value={form.serviceDate}
                onChange={(e) => set("serviceDate", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Meter at Service">
              <input
                type="number"
                step="0.01"
                value={form.meterAtService}
                onChange={(e) => set("meterAtService", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Downtime (hrs)">
              <input
                type="number"
                step="0.01"
                value={form.downtimeHours}
                onChange={(e) => set("downtimeHours", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
          </div>

          <Field label="Reported Problem">
            <input
              type="text"
              placeholder="e.g. engine overheating"
              value={form.reportedProblem}
              onChange={(e) => set("reportedProblem", e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">
                Spares Consumed
              </h3>
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
              <p className="text-sm text-gray-400 py-2">
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
                  <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      className="col-span-6 h-10 rounded-lg border border-gray-200 px-3 text-sm"
                      value={row.description}
                      onChange={(e) =>
                        setSpares((prev) =>
                          prev.map((s) =>
                            s.id === row.id
                              ? { ...s, description: e.target.value }
                              : s,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="col-span-2 h-10 rounded-lg border border-gray-200 px-3 text-sm"
                      value={row.qty}
                      onChange={(e) =>
                        setSpares((prev) =>
                          prev.map((s) =>
                            s.id === row.id ? { ...s, qty: e.target.value } : s,
                          ),
                        )
                      }
                    />
                    <input
                      type="number"
                      step="0.01"
                      className="col-span-3 h-10 rounded-lg border border-gray-200 px-3 text-sm"
                      value={row.rate}
                      onChange={(e) =>
                        setSpares((prev) =>
                          prev.map((s) =>
                            s.id === row.id ? { ...s, rate: e.target.value } : s,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSpares((prev) => prev.filter((s) => s.id !== row.id))
                      }
                      className="col-span-1 p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Labour Cost">
              <input
                type="number"
                step="0.01"
                value={form.labourCost}
                onChange={(e) => set("labourCost", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="External Service Cost">
              <input
                type="number"
                step="0.01"
                value={form.serviceCost}
                onChange={(e) => set("serviceCost", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Total (auto)">
              <div className="h-10 flex items-center px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold tabular-nums">
                ₹ {totalAuto.toLocaleString("en-IN")}
              </div>
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
            onClick={() => router.push("/equipment/maintenance")}
            className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <PrimaryButton disabled={submitting} onClick={() => void handleSubmit()}>
            <Wrench className="w-4 h-4" />
            Create Job Card
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
