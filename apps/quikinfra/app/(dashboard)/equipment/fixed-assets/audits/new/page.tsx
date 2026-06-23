"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useAssets } from "@/hooks/use-masters";
import { useCreateFixedAssetAudit } from "@/hooks/use-fixed-assets";
import { toErrorMessage } from "@/lib/api/errors";

export default function NewAuditPage() {
  const router = useRouter();
  const createMutation = useCreateFixedAssetAudit();
  const { data: assetsData } = useAssets();

  const [form, setForm] = useState({
    assetId: "",
    countedQty: "",
    auditDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const assets = assetsData?.data ?? [];

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
      router.push("/equipment/fixed-assets");
    } catch (err) {
      setErrors({ form: toErrorMessage(err, "Failed to record audit") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Physical Audit"
        subtitle="Counted vs book quantity → variance (adjust to reconcile)"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer>
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {errors.form && <p className="mb-4 text-sm text-red-600">{errors.form}</p>}
          <div className="grid gap-4">
            <Field label="Asset" required error={errors.assetId}>
              <select value={form.assetId} onChange={(e) => setForm((p) => ({ ...p, assetId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="">Select asset</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.assetCode} — {a.name}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Physically Counted Qty" required error={errors.countedQty}>
                <input type="number" min="0" value={form.countedQty} onChange={(e) => setForm((p) => ({ ...p, countedQty: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
              <Field label="Audit Date" required error={errors.auditDate}>
                <input type="date" value={form.auditDate} onChange={(e) => setForm((p) => ({ ...p, auditDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </Field>
            </div>
            <Field label="Remarks">
              <textarea value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => router.push("/equipment/fixed-assets")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
            <PrimaryButton onClick={() => void handleSubmit()} disabled={submitting}>
              <ClipboardCheck className="h-4 w-4" />
              Record
            </PrimaryButton>
          </div>
        </div>
      </PageContainer>
    </>
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
