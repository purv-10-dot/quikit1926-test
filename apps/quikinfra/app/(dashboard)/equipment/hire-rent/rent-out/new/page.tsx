"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useProjects, useMachinery, useCustomers } from "@/hooks/use-masters";
import { useCreateRentOutBill } from "@/hooks/use-equipment";
import { toErrorMessage } from "@/lib/api/errors";

const BASIS_OPTIONS = [
  { value: "hour", label: "Per Hour" },
  { value: "day", label: "Per Day" },
  { value: "month", label: "Per Month" },
];

const emptyForm = {
  equipmentId: "",
  customerId: "",
  projectId: "",
  periodFrom: "",
  periodTo: "",
  rateBasis: "hour",
  rate: "",
  minGuaranteedQty: "",
  sacCode: "995463",
  gstPercent: "18",
};

export default function NewRentOutBillPage() {
  const router = useRouter();
  const createMutation = useCreateRentOutBill();
  const { data: projectsData } = useProjects();
  const { data: machineryData } = useMachinery();
  const { data: customersData } = useCustomers();

  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const projects = projectsData?.data ?? [];
  const machinery = machineryData?.data ?? [];
  const customers = customersData?.data ?? [];

  const rentMachines = useMemo(
    () => machinery.filter((m) => m.status !== "disposed"),
    [machinery],
  );

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
    if (!form.equipmentId) next.equipmentId = "Machine is required";
    if (!form.customerId) next.customerId = "Customer is required";
    if (!form.periodFrom) next.periodFrom = "Period From is required";
    if (!form.periodTo) next.periodTo = "Period To is required";
    if (!form.rate || Number(form.rate) <= 0) next.rate = "Rate is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        equipmentId: form.equipmentId,
        customerId: form.customerId,
        projectId: form.projectId || null,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        rateBasis: form.rateBasis,
        rate: Number(form.rate),
        minGuaranteedQty:
          form.minGuaranteedQty !== "" ? Number(form.minGuaranteedQty) : null,
        sacCode: form.sacCode || "995463",
        gstPercent: Number(form.gstPercent) || 18,
        generate: true,
      });
      router.push("/equipment/hire-rent");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to generate bill") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New Rent-Out Bill"
        subtitle="Billable qty from approved logs · GST via customer-state comparison"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && (
            <p className="mb-4 text-sm text-red-600">{errors.form}</p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Machine" required error={errors.equipmentId}>
              <select
                value={form.equipmentId}
                onChange={(e) => set("equipmentId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select machine</option>
                {rentMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Customer" required error={errors.customerId}>
              <select
                value={form.customerId}
                onChange={(e) => set("customerId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project">
              <select
                value={form.projectId}
                onChange={(e) => set("projectId", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rate Basis">
              <select
                value={form.rateBasis}
                onChange={(e) => set("rateBasis", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {BASIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Period From" required error={errors.periodFrom}>
              <input
                type="date"
                value={form.periodFrom}
                onChange={(e) => set("periodFrom", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Period To" required error={errors.periodTo}>
              <input
                type="date"
                value={form.periodTo}
                onChange={(e) => set("periodTo", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Rate ₹" required error={errors.rate}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(e) => set("rate", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Min Guaranteed Qty">
              <input
                type="number"
                min="0"
                value={form.minGuaranteedQty}
                onChange={(e) => set("minGuaranteedQty", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="SAC Code">
              <input
                value={form.sacCode}
                onChange={(e) => set("sacCode", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="GST %">
              <input
                type="number"
                value={form.gstPercent}
                onChange={(e) => set("gstPercent", e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/equipment/hire-rent")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <TrendingUp className="h-4 w-4" />
              Generate Bill
            </PrimaryButton>
          </div>
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
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
