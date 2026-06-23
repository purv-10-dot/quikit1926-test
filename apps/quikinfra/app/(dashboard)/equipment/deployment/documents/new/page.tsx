"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useMachinery } from "@/hooks/use-masters";
import { useCreateEquipmentDocument } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const DOC_TYPES = [
  { value: "insurance", label: "Insurance" },
  { value: "rc", label: "RC" },
  { value: "puc", label: "PUC" },
  { value: "fitness", label: "Fitness" },
  { value: "permit", label: "Permit" },
  { value: "road_tax", label: "Road Tax" },
];

const emptyForm = {
  equipmentId: "",
  docType: "insurance",
  docNumber: "",
  issueDate: "",
  expiryDate: "",
  alertDays: "30",
  fileUrl: "",
};

export default function NewComplianceDocumentPage() {
  const router = useRouter();
  const createMutation = useCreateEquipmentDocument();

  const { data: machineryData } = useMachinery();
  const machinery = machineryData?.data ?? [];

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
    if (!form.docType) next.docType = "Document type is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        docType: form.docType,
        docNumber: form.docNumber || null,
        issueDate: form.issueDate || null,
        expiryDate: form.expiryDate || null,
        alertDays: Number(form.alertDays) || 30,
        fileUrl: form.fileUrl || null,
      });
      router.push("/equipment/deployment");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save document") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/deployment")}
        title="Add Compliance Document"
        subtitle="Insurance / Fitness / Permit / PUC / Road Tax / RC — drives expiry alerts"
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
            <Field label="Document Type" required error={errors.docType}>
              <select
                value={form.docType}
                onChange={(e) => set("docType", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Document No">
              <input
                type="text"
                placeholder="Policy / cert no"
                value={form.docNumber}
                onChange={(e) => set("docNumber", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Alert (days before)">
              <input
                type="number"
                value={form.alertDays}
                onChange={(e) => set("alertDays", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Issue Date">
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => set("issueDate", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
            <Field label="Expiry Date">
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => set("expiryDate", e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
              />
            </Field>
          </div>
          <Field label="File URL">
            <input
              type="url"
              placeholder="https://..."
              value={form.fileUrl}
              onChange={(e) => set("fileUrl", e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
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
            <Save className="w-4 h-4" />
            Save
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
