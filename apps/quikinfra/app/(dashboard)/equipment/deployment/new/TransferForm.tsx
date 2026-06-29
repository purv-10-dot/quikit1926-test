"use client";

/**
 * TransferForm — shared form for the "New Equipment Transfer" create flow.
 *
 * Used from:
 *   - /equipment/deployment/new   (full page — embedded omitted)
 *   - TransferDrawer              (side drawer — embedded + onSaved)
 *
 * Built on the shared FormDrawer field primitives. When `embedded` is true
 * the body scrolls and the footer is pinned; after a successful save
 * `onSaved` fires instead of navigating.
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
  SelectInput,
  TextAreaInput,
  DateInput,
} from "@/components/FormDrawer";
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
  returnableTo: "",
  reason: "",
  remarks: "",
};

interface Props {
  /** When true, render with drawer-body scroll + pinned footer. */
  embedded?: boolean;
  /** Called after a successful create when `embedded` is true. */
  onSaved?: () => void;
  /** Cancel handler — defaults to navigating back to deployment. */
  onCancel?: () => void;
}

export function TransferForm({ embedded = false, onSaved, onCancel }: Props) {
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
    if (form.transferType === "returnable") {
      if (!form.returnableTo) next.returnableTo = "Returnable until date is required";
      if (
        form.transferDate &&
        form.returnableTo &&
        form.returnableTo < form.transferDate
      ) {
        next.returnableTo = "Returnable until date must be on or after the transfer date";
      }
    }
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
        returnableTo:
          form.transferType === "returnable" ? form.returnableTo : null,
        reason: form.reason || null,
        remarks: form.remarks || null,
      });
      if (embedded) onSaved?.();
      else router.push("/equipment/deployment");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to dispatch transfer") });
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
  const projectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

  const body = (
    <>
      {errors.form && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <FormSection title="Transfer Details">
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
          <Field label="Transfer Type">
            <SelectInput
              value={form.transferType}
              onChange={(v) => set("transferType", v)}
              options={TRANSFER_TYPES}
            />
          </Field>
          <Field label="Transfer Date" required error={errors.transferDate}>
            <DateInput
              value={form.transferDate}
              onChange={(v) => set("transferDate", v)}
              invalid={!!errors.transferDate}
            />
          </Field>
          {form.transferType === "returnable" && (
            <Field
              label="Returnable Until"
              required
              error={errors.returnableTo}
            >
              <DateInput
                value={form.returnableTo}
                onChange={(v) => set("returnableTo", v)}
                invalid={!!errors.returnableTo}
              />
            </Field>
          )}
          <Field label="Reason" span={2}>
            <TextInput
              value={form.reason}
              onChange={(v) => set("reason", v)}
              placeholder="e.g. RCC works at Site B"
            />
          </Field>
        </FormRow>
      </FormSection>

      <Field label="Remarks">
        <TextAreaInput
          value={form.remarks}
          onChange={(v) => set("remarks", v)}
          rows={3}
          placeholder="Notes for the destination PM..."
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
