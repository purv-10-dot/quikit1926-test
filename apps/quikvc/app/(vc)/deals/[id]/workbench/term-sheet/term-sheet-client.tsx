"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TermSheetClient({
  dealId,
  existing,
  canGenerate,
}: {
  dealId: string;
  existing: { version: number; status: string; renderedBodyHtml: string; updatedAt: string } | null;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/term-sheets/${dealId}`, { method: "POST" });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Generate failed");
        return;
      }
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  function downloadHTML() {
    if (!existing) return;
    const blob = new Blob([existing.renderedBodyHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `term-sheet-v${existing.version}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {canGenerate && (
          <button
            type="button"
            disabled={generating}
            onClick={generate}
            className="text-sm px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {generating ? "Generating…" : existing ? "Regenerate" : "Generate term sheet"}
          </button>
        )}
        {existing && (
          <a
            href={`/term-sheet/${dealId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
          >
            Save as PDF
          </a>
        )}
        {existing && (
          <button
            type="button"
            onClick={downloadHTML}
            className="text-sm px-3 py-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
          >
            Download HTML
          </button>
        )}
        {existing && (
          <span className="text-xs text-gray-500 ml-auto">
            v{existing.version} · {existing.status} ·{" "}
            {new Date(existing.updatedAt).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!existing ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-500">No term sheet generated yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            {canGenerate
              ? "Click \"Generate\" to render from your template."
              : "Generation is restricted to Partners and Fund Admins."}
          </p>
        </div>
      ) : (
        <article className="bg-white border border-gray-200 rounded-xl p-8 prose prose-sm max-w-none">
          <div dangerouslySetInnerHTML={{ __html: existing.renderedBodyHtml }} />
        </article>
      )}
    </div>
  );
}
