"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Image as ImageIcon, Stamp, PenLine } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { FileUploadInput } from "@/components/hrms/file-upload-input";

interface Branding {
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  offerLetterFooter?: string | null;
  companyName?: string | null;
}

function keyFromProxyUrl(url: string): string {
  try {
    const m = url.match(/[?&]key=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : url;
  } catch {
    return url;
  }
}

function keyToProxyUrl(key?: string | null): string {
  if (!key) return "";
  return `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(key)}`;
}

export default function BrandingSettingsPage() {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "branding"],
    queryFn: () => api.get<Branding>("/api/v1/hrms/settings/branding"),
  });

  const [form, setForm] = useState<Branding>({});
  useEffect(() => { if (data?.data) setForm(data.data); }, [data]);

  const saveMut = useMutation({
    mutationFn: (payload: Branding) => api.put<Branding>("/api/v1/hrms/settings/branding", payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "branding"] }); },
  });

  const save = () => saveMut.mutate({
    letterheadKey: form.letterheadKey ?? null,
    sealKey: form.sealKey ?? null,
    signatureKey: form.signatureKey ?? null,
    signatoryName: form.signatoryName ?? null,
    signatoryDesignation: form.signatoryDesignation ?? null,
    offerLetterFooter: form.offerLetterFooter ?? null,
  });

  if (isLoading) {
    return <div className="p-6"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Offer Letter Branding</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload letterhead, seal and signature used for generated offer letters.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <ImageIcon size={14} className="text-blue-600" />
            <label className="text-sm font-medium text-gray-900">Letterhead (blank, A4 portrait)</label>
          </div>
          <FileUploadInput
            value={keyToProxyUrl(form.letterheadKey)}
            accept="image/png,image/jpeg,image/webp"
            placeholder="Upload letterhead image"
            maxMB={5}
            onChange={(url) => setForm(f => ({ ...f, letterheadKey: url ? keyFromProxyUrl(url) : null }))}
          />
          <p className="text-[11px] text-gray-500 mt-1">Recommended 2480 × 3508 px (A4 at 300 DPI). PNG or JPG.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Stamp size={14} className="text-blue-600" />
              <label className="text-sm font-medium text-gray-900">Company Seal</label>
            </div>
            <FileUploadInput
              value={keyToProxyUrl(form.sealKey)}
              accept="image/png,image/webp"
              placeholder="Upload seal (PNG, transparent)"
              maxMB={2}
              onChange={(url) => setForm(f => ({ ...f, sealKey: url ? keyFromProxyUrl(url) : null }))}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <PenLine size={14} className="text-blue-600" />
              <label className="text-sm font-medium text-gray-900">Authorised Signature</label>
            </div>
            <FileUploadInput
              value={keyToProxyUrl(form.signatureKey)}
              accept="image/png,image/webp"
              placeholder="Upload signature (PNG, transparent)"
              maxMB={2}
              onChange={(url) => setForm(f => ({ ...f, signatureKey: url ? keyFromProxyUrl(url) : null }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Signatory Name</label>
            <input
              type="text"
              className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              value={form.signatoryName ?? ""}
              onChange={(e) => setForm(f => ({ ...f, signatoryName: e.target.value }))}
              placeholder="e.g. Priya Nair"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Signatory Designation</label>
            <input
              type="text"
              className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              value={form.signatoryDesignation ?? ""}
              onChange={(e) => setForm(f => ({ ...f, signatoryDesignation: e.target.value }))}
              placeholder="Head of Human Resources"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Footer Text</label>
          <textarea
            className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
            rows={2}
            value={form.offerLetterFooter ?? ""}
            onChange={(e) => setForm(f => ({ ...f, offerLetterFooter: e.target.value }))}
            placeholder="Printed at the bottom of every offer letter (e.g. address, CIN)."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={save}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Branding
          </button>
        </div>
        {saveMut.isError && (
          <p className="text-xs text-red-600">Save failed. Check network and try again.</p>
        )}
        {saveMut.isSuccess && (
          <p className="text-xs text-green-600">Saved.</p>
        )}
      </div>
    </div>
  );
}
