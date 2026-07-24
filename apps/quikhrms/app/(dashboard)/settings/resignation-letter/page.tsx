"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, FileText, RotateCcw } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { RESIGNATION_LETTER_FIELDS, DEFAULT_RESIGNATION_LETTER_BODY } from "@/lib/offboarding/resignation-letter-fields";

interface Body { resignationLetterBody?: string | null }

export default function ResignationLetterSettingsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "resignation-letter"],
    queryFn: () => api.get<Body>("/api/v1/hrms/settings/resignation-letter"),
  });
  useEffect(() => { if (data?.data) setBody(data.data.resignationLetterBody ?? ""); }, [data]);

  const saveMut = useMutation({
    mutationFn: (payload: Body) => api.put<Body>("/api/v1/hrms/settings/resignation-letter", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "resignation-letter"] });
      toast.success("Saved", "Resignation-letter template updated.");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const insertField = (name: string) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    const next = body.slice(0, s) + token + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { el?.focus(); if (el) el.selectionStart = el.selectionEnd = s + token.length; });
  };

  if (isLoading) return <div className="p-4"><Loader2 className="animate-spin text-green-600" /></div>;

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-base font-semibold text-gray-900">Resignation Acceptance Letter</h1>
        <p className="text-xs text-gray-500 mt-1">
          Edit the resignation-acceptance letter issued on the offboarding page. It uses the same letterhead, seal and signature as the offer &amp; joining letters (set those in Joining Letter Branding).
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-green-600" />
          <label className="text-xs font-medium text-gray-900">Letter Content</label>
        </div>
        <p className="text-[11px] text-gray-500">
          Click a field to insert it — it&apos;s replaced with the employee&apos;s real value when generated.
          Use <code className="rounded bg-gray-100 px-1">{"{{signature}}"}</code> to place the signature image.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RESIGNATION_LETTER_FIELDS.map((f) => (
            <button key={f.name} type="button" title={f.label} onClick={() => insertField(f.name)}
              className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-green-50 hover:border-green-200">
              {`{{${f.name}}}`}
            </button>
          ))}
        </div>
        <textarea
          ref={bodyRef}
          rows={20}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={DEFAULT_RESIGNATION_LETTER_BODY}
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono resize-y"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setBody(DEFAULT_RESIGNATION_LETTER_BODY)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <RotateCcw size={13} /> Reset to default
          </button>
          <button type="button" onClick={() => saveMut.mutate({ resignationLetterBody: body || null })} disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60">
            {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
