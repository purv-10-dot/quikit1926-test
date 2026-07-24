"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Loader2, FileText, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { EXIT_LETTER_FIELDS, DEFAULT_RELIEVING_LETTER_BODY, DEFAULT_EXPERIENCE_LETTER_BODY } from "@/lib/offboarding/exit-letter-fields";

type LetterType = "relieving" | "experience";
const DEFAULTS: Record<LetterType, string> = { relieving: DEFAULT_RELIEVING_LETTER_BODY, experience: DEFAULT_EXPERIENCE_LETTER_BODY };
const TITLES: Record<LetterType, string> = { relieving: "Relieving Letter", experience: "Experience Letter" };

export default function ExitLettersSettingsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState<LetterType>("relieving");
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "exit-letter", type],
    queryFn: () => api.get<{ body: string | null }>(`/api/v1/hrms/settings/exit-letter/${type}`),
  });
  useEffect(() => { setBody(data?.data?.body ?? ""); }, [data, type]);

  const saveMut = useMutation({
    mutationFn: (payload: { body: string | null }) => api.put(`/api/v1/hrms/settings/exit-letter/${type}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "exit-letter", type] }); toast.success("Saved", `${TITLES[type]} template updated.`); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const insertField = (name: string) => {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); if (el) el.selectionStart = el.selectionEnd = s + token.length; });
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-base font-semibold text-gray-900">Exit Letters</h1>
        <p className="text-xs text-gray-500 mt-1">
          Edit the Relieving &amp; Experience letters issued on the offboarding page. They use the same letterhead, seal and signature as the other letters (set those in Joining Letter Branding).
        </p>
      </div>

      <div className="flex gap-2">
        {(["relieving", "experience"] as LetterType[]).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={clsx("px-3 py-1.5 rounded-lg text-xs font-semibold border", type === t ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50")}>
            {TITLES[t]}
          </button>
        ))}
      </div>

      {isLoading ? <div className="p-4"><Loader2 className="animate-spin text-green-600" /></div> : (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-green-600" />
            <label className="text-xs font-medium text-gray-900">{TITLES[type]} Content</label>
          </div>
          <p className="text-[11px] text-gray-500">
            Click a field to insert it — replaced with the employee&apos;s real value when generated. Use <code className="rounded bg-gray-100 px-1">{"{{signature}}"}</code> to place the signature image.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXIT_LETTER_FIELDS.map((f) => (
              <button key={f.name} type="button" title={f.label} onClick={() => insertField(f.name)}
                className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-green-50 hover:border-green-200">
                {`{{${f.name}}}`}
              </button>
            ))}
          </div>
          <textarea ref={bodyRef} rows={20} value={body} onChange={(e) => setBody(e.target.value)} placeholder={DEFAULTS[type]}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs font-mono resize-y" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setBody(DEFAULTS[type])}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              <RotateCcw size={13} /> Reset to default
            </button>
            <button type="button" onClick={() => saveMut.mutate({ body: body || null })} disabled={saveMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-60">
              {saveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
