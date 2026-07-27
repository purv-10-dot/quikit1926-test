"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, Image as ImageIcon, Stamp, PenLine, FileText, Eye, RotateCcw } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { PageBackground } from "@/components/hrms/page-background";
import { JOINING_LETTER_FIELDS, DEFAULT_JOINING_LETTER_BODY } from "@/lib/recruit/joining-letter-fields";

interface Branding {
  letterheadKey?: string | null;
  sealKey?: string | null;
  signatureKey?: string | null;
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  offerLetterFooter?: string | null;
  offerLetterBody?: string | null;
  joiningLetterBody?: string | null;
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

export default function JoiningLetterBrandingPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [previewing, setPreviewing] = useState(false);

  // Insert a {{field}} token at the cursor in the body textarea.
  const insertField = (name: string) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const cur = form.joiningLetterBody ?? "";
    const s = el?.selectionStart ?? cur.length;
    const e = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, s) + token + cur.slice(e);
    setForm((f) => ({ ...f, joiningLetterBody: next }));
    requestAnimationFrame(() => { el?.focus(); if (el) el.selectionStart = el.selectionEnd = s + token.length; });
  };

  // Render a sample PDF (dummy data) with the current, unsaved template.
  const previewSample = async () => {
    setPreviewing(true);
    try {
      await api.downloadPost(
        "/api/v1/hrms/settings/branding/preview",
        { type: "joining", body: form.joiningLetterBody ?? "" },
        "Joining-Letter-Sample.pdf",
      );
    } catch {
      toast.error("Preview failed", "Could not generate the sample letter.");
    } finally {
      setPreviewing(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "branding"],
    queryFn: () => api.get<Branding>("/api/v1/hrms/settings/branding"),
  });

  const [form, setForm] = useState<Branding>({});
  useEffect(() => { if (data?.data) setForm(data.data); }, [data]);

  const saveMut = useMutation({
    mutationFn: (payload: Branding) => api.put<Branding>("/api/v1/hrms/settings/branding", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "branding"] });
      toast.success("Branding saved", "Joining-letter branding updated.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const save = () => saveMut.mutate({
    letterheadKey: form.letterheadKey ?? null,
    sealKey: form.sealKey ?? null,
    signatureKey: form.signatureKey ?? null,
    signatoryName: form.signatoryName ?? null,
    signatoryDesignation: form.signatoryDesignation ?? null,
    offerLetterFooter: form.offerLetterFooter ?? null,
    joiningLetterBody: form.joiningLetterBody ?? null,
  });

  if (isLoading) {
    return <div className="p-4"><Loader2 className="animate-spin text-green-600" /></div>;
  }

  return (
    <div className="p-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div>
        <h1 className="text-base font-semibold text-gray-900">Joining Letter Branding</h1>
        <p className="text-xs text-gray-500 mt-1">
          Edit the joining (appointment) letter. It uses the same letterhead, seal and signature as the offer letter — change those once and both stay in sync.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Left — shared branding assets + save */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon size={14} className="text-green-600" />
              <label className="text-xs font-medium text-gray-900">Letterhead (blank, A4 portrait)</label>
            </div>
            <FileUploadInput
              value={keyToProxyUrl(form.letterheadKey)}
              accept="image/png,image/jpeg,image/webp"
              placeholder="Upload letterhead image"
              maxMB={5}
              onChange={(url) => setForm(f => ({ ...f, letterheadKey: url ? keyFromProxyUrl(url) : null }))}
            />
            <p className="text-[11px] text-gray-500 mt-1">Shared with the offer letter. Recommended 2480 × 3508 px (A4 at 300 DPI).</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Stamp size={14} className="text-green-600" />
                <label className="text-xs font-medium text-gray-900">Company Seal</label>
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
                <PenLine size={14} className="text-green-600" />
                <label className="text-xs font-medium text-gray-900">Authorised Signature</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Signatory Name</label>
              <input
                type="text"
                className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs"
                value={form.signatoryName ?? ""}
                onChange={(e) => setForm(f => ({ ...f, signatoryName: e.target.value }))}
                placeholder="e.g. Priya Nair"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Signatory Designation</label>
              <input
                type="text"
                className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs"
                value={form.signatoryDesignation ?? ""}
                onChange={(e) => setForm(f => ({ ...f, signatoryDesignation: e.target.value }))}
                placeholder="Head of Human Resources"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Footer Text</label>
            <textarea
              className="mt-1 w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs"
              rows={2}
              value={form.offerLetterFooter ?? ""}
              onChange={(e) => setForm(f => ({ ...f, offerLetterFooter: e.target.value }))}
              placeholder="Printed at the bottom of every letter (e.g. address, CIN)."
            />
          </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save Branding
            </button>
            {saveMut.isError && (
              <p className="text-xs text-red-600">Save failed. Check network and try again.</p>
            )}
            {saveMut.isSuccess && (
              <p className="text-xs text-green-600">Saved.</p>
            )}
          </div>
        </div>

        {/* Right — joining letter content (editable body with dynamic {{fields}}) */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-green-600" />
            <label className="text-xs font-medium text-gray-900">Joining Letter Content</label>
          </div>
          <p className="text-[11px] text-gray-500">
            The appointment letter generated on the onboarding page. Click a field to insert it — it&apos;s replaced with the employee&apos;s real value when generated.
            Use <code className="rounded bg-gray-100 px-1">{"{{signature}}"}</code> to place the signature image.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {JOINING_LETTER_FIELDS.map((f) => (
              <button
                key={f.name}
                type="button"
                title={f.label}
                onClick={() => insertField(f.name)}
                className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-green-50 hover:border-green-200"
              >
                {`{{${f.name}}}`}
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            rows={18}
            value={form.joiningLetterBody ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, joiningLetterBody: e.target.value }))}
            placeholder={DEFAULT_JOINING_LETTER_BODY}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono resize-y"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, joiningLetterBody: DEFAULT_JOINING_LETTER_BODY }))}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RotateCcw size={13} /> Reset to default
            </button>
            <button
              type="button"
              onClick={previewSample}
              disabled={previewing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 disabled:opacity-60"
            >
              {previewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              Preview sample
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
