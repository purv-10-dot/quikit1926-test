"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useProjects, useMachinery } from "@/hooks/use-masters";
import { useCreateTransfer } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const TRANSFER_TYPES = [
  { value: "reassignment", label: "Reassignment" },
  { value: "returnable", label: "Returnable" },
];

const emptyForm = {
  equipmentId: "",
  destinationProjectId: "",
  transferType: "reassignment",
  transferDate: new Date().toISOString().slice(0, 10),
  reason: "",
  remarks: "",
};

export default function NewTransferPage() {
  const router = useRouter();
  const createMutation = useCreateTransfer();

  const { data: projectsData } = useProjects();
  const { data: machineryData } = useMachinery();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const projects = projectsData?.data ?? [];
  const machinery = machineryData?.data ?? [];

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
    if (!form.destinationProjectId) {
      next.destinationProjectId = "Destination project is required";
    }
    if (!form.transferDate) next.transferDate = "Transfer date is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        destinationProjectId: form.destinationProjectId,
        transferType: form.transferType,
        transferDate: form.transferDate,
        reason: form.reason || null,
        remarks: form.remarks || null,
      });
      router.push("/equipment/deployment");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to dispatch transfer") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/deployment")}
        title="New Equipment Transfer"
        subtitle="Generates a gate pass; destination PM acknowledges receipt"
      />

      <PageContainer className="max-w-3xl">
        {errors.form && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors.form}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
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
            <Field label="Destination Project" required error={errors.destinationProjectId}>
              <select
                value={form.destinationProjectId}
                onChange={(e) => set("destinationProjectId", e.target.value)}
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
            <Field label="Transfer Type">
              <select
                value={form.transferType}
                onChange={(e) => set("transferType", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                {TRANSFER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Transfer Date" required error={errors.transferDate}>
              <input
                type="date"
                value={form.transferDate}
                onChange={(e) => set("transferDate", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
          </div>
          <Field label="Reason">
            <input
              type="text"
              placeholder="e.g. RCC works at Site B"
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
            />
          </Field>
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
            onClick={() => router.push("/equipment/deployment")}
            className="h-10 px-5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <PrimaryButton disabled={submitting} onClick={() => void handleSubmit()}>
            <Truck className="w-4 h-4" />
            Dispatch
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
