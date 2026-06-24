"use client";

/**
 * IssueAssetForm — shared form for the "Issue Asset" create flow.
 *
 * Used from:
 *   - /equipment/fixed-assets/issue/new   (full page)
 *   - IssueAssetDrawer                    (side drawer — embedded + onSaved)
 */

import { useState } from "react";
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
import { useAssets, useProjects } from "@/hooks/use-masters";
import { useCreateFixedAssetIssuance } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

const ISSUE_TO_TYPES = [
  { value: "user", label: "User" },
  { value: "department", label: "Department" },
  { value: "site", label: "Site" },
];

const emptyForm = {
  assetId: "",
  issuedToType: "user",
  issuedTo: "",
  projectId: "",
  quantity: "1",
  returnable: true,
  expectedReturnDate: "",
  notes: "",
};

interface Props {
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function IssueAssetForm({ embedded = false, onSaved, onCancel }: Props) {
  const router = useRouter();
  const createMutation = useCreateFixedAssetIssuance();
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
    if (!form.issuedTo.trim()) next.issuedTo = "Issued To is required";
    if (!form.quantity || Number(form.quantity) <= 0)
      next.quantity = "Quantity is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        assetId: form.assetId,
        issuedToType: form.issuedToType,
        issuedTo: form.issuedTo,
        projectId: form.projectId || null,
        quantity: Number(form.quantity),
        returnable: form.returnable,
        expectedReturnDate:
          form.returnable && form.expectedReturnDate
            ? form.expectedReturnDate
            : null,
        notes: form.notes || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to issue asset") });
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

      <FormSection title="Issuance">
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
          <Field label="Issue To Type">
            <SelectInput
              value={form.issuedToType}
              onChange={(v) => set("issuedToType", v)}
              options={ISSUE_TO_TYPES}
            />
          </Field>
          <Field label="Issued To" required error={errors.issuedTo}>
            <TextInput
              value={form.issuedTo}
              onChange={(v) => set("issuedTo", v)}
              placeholder="Name / dept / site"
              invalid={!!errors.issuedTo}
            />
          </Field>
          <Field label="Project">
            <SelectInput
              value={form.projectId}
              onChange={(v) => set("projectId", v)}
              options={projectOptions}
              placeholder="Project / WO cost"
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
        </FormRow>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div className="flex items-center h-[38px]">
            <CheckboxInput
              checked={form.returnable}
              onChange={(v) => set("returnable", v)}
              label="Returnable"
            />
          </div>
          {form.returnable && (
            <Field label="Expected Return">
              <DateInput
                value={form.expectedReturnDate}
                onChange={(v) => set("expectedReturnDate", v)}
              />
            </Field>
          )}
        </div>

        <Field label="Notes">
          <TextAreaInput
            value={form.notes}
            onChange={(v) => set("notes", v)}
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
          <CheckCircle2 className="w-4 h-4" />
        )}
        Issue
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
