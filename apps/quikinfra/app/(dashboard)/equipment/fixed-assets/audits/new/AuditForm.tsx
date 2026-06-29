"use client";

/**
 * AuditForm — shared form for the fixed-asset "Physical Audit" create flow
 * (full page + drawer).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PageShell";
import {
  Field,
  FormSection,
  FormRow,
  NumberInput,
  SelectInput,
  TextAreaInput,
  DateInput,
} from "@/components/FormDrawer";
import { useAssets } from "@/hooks/use-masters";
import { useCreateFixedAssetAudit } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

const emptyForm = {
  assetId: "",
  countedQty: "",
  auditDate: new Date().toISOString().slice(0, 10),
  remarks: "",
};

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function AuditForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateFixedAssetAudit();
  const { data: assetsData } = useAssets();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];

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

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Asset is required";
    if (form.countedQty === "") next.countedQty = "Counted qty is required";
    if (!form.auditDate) next.auditDate = "Audit date is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        assetId: form.assetId,
        countedQty: Number(form.countedQty),
        auditDate: form.auditDate,
        remarks: form.remarks || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to record audit") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else router.push("/equipment/fixed-assets");
  };

  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: `${a.assetCode} — ${a.name}`,
  }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Physical Audit">
        <Field label="Asset" required error={errors.assetId}>
          <SelectInput
            value={form.assetId}
            onChange={(v) => set("assetId", v)}
            options={assetOptions}
            placeholder="Select asset"
            invalid={!!errors.assetId}
          />
        </Field>
        <FormRow>
          <Field
            label="Physically Counted Qty"
            required
            error={errors.countedQty}
          >
            <NumberInput
              value={form.countedQty}
              onChange={(v) => set("countedQty", v)}
              invalid={!!errors.countedQty}
            />
          </Field>
          <Field label="Audit Date" required error={errors.auditDate}>
            <DateInput
              value={form.auditDate}
              onChange={(v) => set("auditDate", v)}
              invalid={!!errors.auditDate}
            />
          </Field>
        </FormRow>
        <Field label="Remarks">
          <TextAreaInput
            value={form.remarks}
            onChange={(v) => set("remarks", v)}
            rows={3}
          />
        </Field>
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
          <ClipboardCheck className="w-4 h-4" />
        )}
        Record
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
