"use client";

/**
 * AssetTransferForm — shared form for the fixed-asset "New Asset Transfer"
 * create flow (full page + drawer).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Truck, Loader2 } from "lucide-react";
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
import { useAssets, useProjects } from "@/hooks/use-masters";
import { useCreateFixedAssetTransfer } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

const emptyForm = {
  assetId: "",
  destinationProjectId: "",
  destinationLocation: "",
  quantity: "1",
  transferDate: new Date().toISOString().slice(0, 10),
  reason: "",
};

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function AssetTransferForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateFixedAssetTransfer();
  const { data: assetsData } = useAssets();
  const { data: projectsData } = useProjects();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];
  const projects = projectsData?.data ?? [];

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
    if (!form.destinationProjectId)
      next.destinationProjectId = "Destination is required";
    if (!form.transferDate) next.transferDate = "Transfer date is required";
    if (!form.quantity || Number(form.quantity) <= 0)
      next.quantity = "Quantity is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        assetId: form.assetId,
        destinationProjectId: form.destinationProjectId,
        destinationLocation: form.destinationLocation || null,
        quantity: Number(form.quantity),
        transferDate: form.transferDate,
        reason: form.reason || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to dispatch transfer") });
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
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Transfer">
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
            label="Destination Project"
            required
            error={errors.destinationProjectId}
          >
            <SelectInput
              value={form.destinationProjectId}
              onChange={(v) => set("destinationProjectId", v)}
              options={projectOptions}
              placeholder="Select project"
              invalid={!!errors.destinationProjectId}
            />
          </Field>
          <Field label="Destination Location">
            <TextInput
              value={form.destinationLocation}
              onChange={(v) => set("destinationLocation", v)}
              placeholder="Store / yard"
            />
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            <NumberInput
              value={form.quantity}
              onChange={(v) => set("quantity", v)}
              min={1}
              invalid={!!errors.quantity}
            />
          </Field>
          <Field label="Transfer Date" required error={errors.transferDate}>
            <DateInput
              value={form.transferDate}
              onChange={(v) => set("transferDate", v)}
              invalid={!!errors.transferDate}
            />
          </Field>
        </FormRow>
        <Field label="Reason">
          <TextAreaInput
            value={form.reason}
            onChange={(v) => set("reason", v)}
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
          <Truck className="w-4 h-4" />
        )}
        Dispatch
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
