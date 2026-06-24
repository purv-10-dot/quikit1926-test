"use client";

/**
 * ComplianceDocumentForm — shared form for the "Add Compliance Document"
 * create flow (full page + drawer). The File field is a real upload: the
 * chosen PDF/image is pushed to /api/uploads and the returned viewer URL is
 * stored on the record, with the uploaded file shown as a removable chip.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload, FileText, X, Loader2, ExternalLink } from "lucide-react";
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

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ComplianceDocumentForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateEquipmentDocument();
  const { data: machineryData } = useMachinery();
  const machinery = machineryData?.data ?? [];

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleFile = async (file: File) => {
    setUploading(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.fileUrl;
      return next;
    });
    try {
      const fd = new FormData();
      fd.append("files", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const up = json.files?.[0];
      if (!up?.url) throw new Error("Upload failed — no file returned");
      set("fileUrl", up.url);
      setFileMeta({ name: up.name, size: up.size });
    } catch (e) {
      setErrors((prev) => ({ ...prev, fileUrl: toErrorMessage(e, "Upload failed") }));
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    set("fileUrl", "");
    setFileMeta(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      if (embedded) onSaved?.();
      else router.push("/equipment/deployment");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to save document") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/deployment");
  };

  const machineOptions = machinery.map((m) => ({
    value: m.id,
    label: `${m.code} — ${m.name}`,
  }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Document">
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
          <Field label="Document Type" required error={errors.docType}>
            <SelectInput
              value={form.docType}
              onChange={(v) => set("docType", v)}
              options={DOC_TYPES}
              invalid={!!errors.docType}
            />
          </Field>
          <Field label="Document No">
            <TextInput
              value={form.docNumber}
              onChange={(v) => set("docNumber", v)}
              placeholder="Policy / cert no"
            />
          </Field>
          <Field label="Alert (days before)">
            <NumberInput
              value={form.alertDays}
              onChange={(v) => set("alertDays", v)}
            />
          </Field>
          <Field label="Issue Date">
            <DateInput value={form.issueDate} onChange={(v) => set("issueDate", v)} />
          </Field>
          <Field label="Expiry Date">
            <DateInput value={form.expiryDate} onChange={(v) => set("expiryDate", v)} />
          </Field>
        </FormRow>
      </FormSection>

      <Field label="Document File" error={errors.fileUrl}>
        {form.fileUrl ? (
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-gray-900">
                {fileMeta?.name ?? "Uploaded document"}
              </div>
              {fileMeta && (
                <div className="text-xs text-gray-400">
                  {(fileMeta.size / 1024).toFixed(0)} KB
                </div>
              )}
            </div>
            <a
              href={form.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View
            </a>
            <button
              type="button"
              onClick={clearFile}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
              uploading
                ? "border-orange-300 bg-orange-50/40"
                : "border-gray-300 hover:border-orange-300 hover:bg-orange-50/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span className="text-sm text-gray-600">Uploading…</span>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Click to upload document
                </span>
                <span className="text-xs text-gray-400">PDF or image · up to 10 MB</span>
              </>
            )}
          </label>
        )}
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
      <PrimaryButton disabled={submitting || uploading} onClick={() => void handleSubmit()}>
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save
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
