"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { MemoSection } from "@/lib/memo/types";
import { cn } from "@/lib/utils";

interface VersionInfo {
  id: string;
  version: number;
  source: string;
  changeNote: string | null;
  createdAt: string;
}

export default function MemoEditor({
  dealId,
  initialSections,
  versionList,
}: {
  dealId: string;
  initialSections: MemoSection[];
  versionList: VersionInfo[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState<MemoSection[]>(initialSections);
  const [generatingSlug, setGeneratingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState<string>(
    initialSections[0]?.slug ?? "",
  );

  const updateSection = useCallback((slug: string, content: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.slug === slug
          ? {
              ...s,
              contentHtml: content,
              generatedBy: "analyst",
              generatedAt: new Date().toISOString(),
            }
          : s,
      ),
    );
  }, []);

  async function generateSection(slug: string) {
    setGeneratingSlug(slug);
    setError(null);
    try {
      const r = await fetch(`/api/memos/${dealId}/sections/${slug}/generate`, {
        method: "POST",
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Generation failed");
        return;
      }
      setSections((prev) =>
        prev.map((s) =>
          s.slug === slug
            ? {
                ...s,
                contentHtml: j.data.html,
                generatedBy: "claude",
                generatedAt: new Date().toISOString(),
              }
            : s,
        ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGeneratingSlug(null);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/memos/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "Save failed");
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Section outline (sticky) */}
      <aside className="lg:col-span-1">
        <div className="sticky top-4 bg-white border border-gray-200 rounded-xl p-3 space-y-2">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Sections</p>
          {sections.map((s) => {
            const hasContent = s.contentHtml.trim().length > 0;
            const isClaude = s.generatedBy === "claude";
            return (
              <button
                key={s.slug}
                type="button"
                onClick={() => setActiveSlug(s.slug)}
                className={cn(
                  "w-full text-left text-xs px-3 py-2 rounded-lg transition-colors",
                  activeSlug === s.slug
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                <span className="block font-medium">{s.title}</span>
                <span className="block text-[10px] text-gray-400 mt-0.5">
                  {hasContent
                    ? isClaude
                      ? "AI-drafted · edit before saving"
                      : "Manual"
                    : "Empty"}
                </span>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-gray-100 space-y-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="w-full text-xs px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save version"}
            </button>
            {savedAt && (
              <p className="text-[10px] text-gray-400 text-center">Saved at {savedAt}</p>
            )}
            {error && <p className="text-[10px] text-red-600">{error}</p>}
          </div>
        </div>

        {/* Version history */}
        {versionList.length > 0 && (
          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">Version history</p>
            <ul className="space-y-1.5 text-[11px]">
              {versionList.map((v) => (
                <li key={v.id} className="flex items-center justify-between text-gray-600">
                  <span>v{v.version}</span>
                  <span className="text-gray-400">
                    {new Date(v.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Editor */}
      <div className="lg:col-span-3 space-y-4">
        {sections.map((section) => {
          const isActive = activeSlug === section.slug;
          if (!isActive) return null;
          const isGenerating = generatingSlug === section.slug;
          return (
            <article
              key={section.slug}
              className="bg-white border border-gray-200 rounded-xl p-5 space-y-3"
            >
              <header className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-900">{section.title}</h3>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => generateSection(section.slug)}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg disabled:opacity-50"
                >
                  {isGenerating ? "Generating…" : section.contentHtml ? "Re-draft with AI" : "Draft with AI"}
                </button>
              </header>
              <textarea
                rows={14}
                className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                placeholder="Write or generate this section…"
                value={section.contentHtml}
                onChange={(e) => updateSection(section.slug, e.target.value)}
              />
              <p className="text-[10px] text-gray-400">
                {section.contentHtml.length} chars · last edit{" "}
                {new Date(section.generatedAt).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {section.generatedBy}
              </p>
              {section.contentHtml.includes("<") && (
                <div
                  className="prose prose-sm max-w-none border-t border-gray-100 pt-3 text-gray-700"
                  dangerouslySetInnerHTML={{ __html: section.contentHtml }}
                />
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
