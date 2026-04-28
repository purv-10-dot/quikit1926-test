"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const AVAILABLE_VARS = [
  "startup.name",
  "startup.contactName",
  "startup.contactEmail",
  "deal.fundingAskLakhs",
  "deal.fundingAskFormatted",
  "deal.loanType",
  "deal.tenureMonths",
  "deal.purpose",
  "fund.name",
  "today",
];

export default function TermSheetTemplateEditor({
  initialName,
  initialBodyHtml,
  updatedAt,
}: {
  initialName: string;
  initialBodyHtml: string;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [bodyHtml, setBodyHtml] = useState(initialBodyHtml);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/term-sheet-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, bodyHtml }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Save failed");
        return;
      }
      setSavedAt(new Date().toISOString());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function insertVar(v: string) {
    setBodyHtml((s) => s + `{{${v}}}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <label className="text-xs uppercase tracking-wider text-gray-500">Template name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-accent-400 focus:border-accent-400 outline-none"
          />
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="text-sm px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save template"}
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-gray-500">
            Saved {new Date(savedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 mb-1.5">Available variables</p>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_VARS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVar(v)}
              className="text-[11px] font-mono px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border border-gray-200"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={`px-4 py-2 text-xs font-medium ${tab === "edit" ? "bg-white text-gray-900 border-b-2 border-accent-600" : "text-gray-500 hover:text-gray-900"}`}
          >
            Edit HTML
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={`px-4 py-2 text-xs font-medium ${tab === "preview" ? "bg-white text-gray-900 border-b-2 border-accent-600" : "text-gray-500 hover:text-gray-900"}`}
          >
            Preview (raw, unsubstituted)
          </button>
        </div>
        {tab === "edit" ? (
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            spellCheck={false}
            className="w-full font-mono text-xs p-4 min-h-[480px] outline-none resize-y"
          />
        ) : (
          <article className="p-6 prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </article>
        )}
      </div>
    </div>
  );
}
