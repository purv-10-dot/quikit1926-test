"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useAssets, useProjects } from "@/hooks/use-masters";
import { useCreateFixedAssetIssuance } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

const ISSUE_TO_TYPES = [
  { value: "user", label: "User" },
  { value: "department", label: "Department" },
  { value: "site", label: "Site" },
];

export default function IssueAssetPage() {
  const router = useRouter();
  const createMutation = useCreateFixedAssetIssuance();
  const { data: assetsData } = useAssets();
  const { data: projectsData } = useProjects();

  const [form, setForm] = useState({
    assetId: "",
    issuedToType: "user",
    issuedTo: "",
    projectId: "",
    quantity: "1",
    returnable: true,
    expectedReturnDate: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];
  const projects = projectsData?.data ?? [];

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (!form.assetId) next.assetId = "Asset is required";
    if (!form.issuedTo.trim()) next.issuedTo = "Issued To is required";
    if (!form.quantity || Number(form.quantity) <= 0) next.quantity = "Quantity is required";
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
        expectedReturnDate: form.returnable && form.expectedReturnDate ? form.expectedReturnDate : null,
        notes: form.notes || null,
      });
      router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to issue asset") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Issue Asset"
        subtitle="Quantity validated against available; gate pass on returnable exit"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer>
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && <p className="mb-4 text-sm text-red-600">{errors.form}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Asset" required error={errors.assetId} className="md:col-span-2">
              <select
                value={form.assetId}
                onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Select asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetCode} — {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Issue To Type">
              <select
                value={form.issuedToType}
                onChange={(e) => setForm((p) => ({ ...p, issuedToType: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {ISSUE_TO_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Issued To" required error={errors.issuedTo}>
              <input
                value={form.issuedTo}
                onChange={(e) => setForm((p) => ({ ...p, issuedTo: e.target.value }))}
                placeholder="Name / dept / site"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Project">
              <select
                value={form.projectId}
                onChange={(e) => setForm((p) => ({ ...p, projectId: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Project / WO cost</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity" required error={errors.quantity}>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="returnable"
                type="checkbox"
                checked={form.returnable}
                onChange={(e) => setForm((p) => ({ ...p, returnable: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <label htmlFor="returnable" className="text-sm text-slate-700">Returnable</label>
            </div>
            {form.returnable && (
              <Field label="Expected Return">
                <input
                  type="date"
                  value={form.expectedReturnDate}
                  onChange={(e) => setForm((p) => ({ ...p, expectedReturnDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </Field>
            )}
            <Field label="Notes" className="md:col-span-2">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => router.push("/equipment/fixed-assets")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <CheckCircle2 className="h-4 w-4" />
              Issue
            </PrimaryButton>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({ label, required, error, children, className }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
