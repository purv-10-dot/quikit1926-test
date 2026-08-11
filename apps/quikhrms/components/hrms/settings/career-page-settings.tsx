"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { ExternalLink, Save, Copy, Check, Code2, Link2 } from "lucide-react";

interface CareerPageSettings {
  careerPageEnabled: boolean;
  careerPageIntro: string | null;
  careerPageSlug: string | null;
  companyName: string;
  logo: string | null;
  orgSlug: string | null;
}

/**
 * Shared body for the Career Page settings form — rendered both standalone
 * (app/(dashboard)/settings/career-page/page.tsx, for direct links/bookmarks)
 * and inside the Settings hub's modal (app/(dashboard)/settings/page.tsx), so
 * there's exactly one copy of this logic.
 */
export function CareerPageSettingsContent() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [intro, setIntro] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "career-page"],
    queryFn: () => api.get<CareerPageSettings>("/api/v1/hrms/settings/career-page"),
  });

  useEffect(() => {
    if (data?.data) {
      setEnabled(data.data.careerPageEnabled);
      setIntro(data.data.careerPageIntro ?? "");
      setSlugInput(data.data.careerPageSlug ?? "");
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: (body: { careerPageEnabled?: boolean; careerPageIntro?: string | null; careerPageSlug?: string | null }) =>
      api.patch("/api/v1/hrms/settings/career-page", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "career-page"] });
      toast.success("Saved");
    },
    onError: (err) => toast.error("Couldn't save", err instanceof ApiError ? err.message : "Please try again."),
  });

  if (isLoading) return (
    <div className="p-4 space-y-2">
      <SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} />
    </div>
  );

  const orgSlug = data?.data?.orgSlug;
  const savedCustomSlug = data?.data?.careerPageSlug;
  // The custom slug is an ADDITIONAL alias, not a replacement — the default
  // /careers/{orgSlug} link always keeps working. Prefer showing the custom
  // one here once set, since that's what HR will actually hand out.
  const effectiveSlug = savedCustomSlug || orgSlug;
  const previewHref = effectiveSlug ? `/careers/${effectiveSlug}` : null;
  // window.location.origin (not a hardcoded domain) so the snippet is correct
  // whether HR copies it from local dev, UAT, or production.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedCode = effectiveSlug
    ? `<iframe src="${origin}/careers/${effectiveSlug}" width="100%" height="800" style="border:none;"></iframe>`
    : "";

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy", "Select and copy the code manually.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="surface-card p-4 space-y-4">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm font-medium text-gray-900">Enable career page</p>
            <p className="text-xs text-gray-500 mt-0.5">
              When off, your career page URL shows &ldquo;not found&rdquo; to visitors.
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-9 h-5 shrink-0 accent-accent-600"
          />
        </label>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Intro text (optional)</label>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Tell candidates a bit about your company and culture before they browse open roles…"
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
          />
        </div>

        {orgSlug && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Custom career page URL (optional)</label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 shrink-0">/careers/</span>
              <input
                value={slugInput}
                onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                placeholder={orgSlug}
                className="flex-1 min-w-0 border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Lowercase letters, numbers and hyphens only. Your default link (<span className="font-mono">/careers/{orgSlug}</span>) keeps working either way.
            </p>
          </div>
        )}

        {previewHref && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-800">Your career page link</p>
            <Link
              href={previewHref}
              target="_blank"
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
            >
              <Link2 size={11} /> /careers/{effectiveSlug} <ExternalLink size={12} />
            </Link>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => saveMut.mutate({
              careerPageEnabled: enabled,
              careerPageIntro: intro || null,
              careerPageSlug: slugInput.trim() || null,
            })}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Save size={13} /> {saveMut.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {orgSlug && (
        <div className="surface-card p-4 space-y-2.5">
          <div className="flex items-center gap-2">
            <Code2 size={15} className="text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Embed on your website</h2>
          </div>
          <p className="text-xs text-gray-500">
            Paste this into your own website (e.g. a &ldquo;Careers&rdquo; page) to show your career page there — no setup needed on our side.
          </p>
          <div className="relative">
            <pre className="text-[11px] bg-gray-900 text-gray-100 rounded-lg p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all">{embedCode}</pre>
            <button
              type="button"
              onClick={copyEmbed}
              title="Copy embed code"
              className="absolute top-2 right-2 w-7 h-7 rounded-md bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white flex items-center justify-center transition"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
