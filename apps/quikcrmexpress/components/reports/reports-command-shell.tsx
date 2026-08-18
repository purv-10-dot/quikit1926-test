"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Command } from "lucide-react";
import {
  LeadCommandPalette,
  useCommandPaletteShortcut,
} from "@/components/leads/dashboard/command-palette";
import { buildReportsCommandActions } from "@/lib/reports/build-reports-command-actions";
import {
  presetToRange,
  type RangeValue,
} from "@/components/dashboard/date-range-picker";

type CannedSummary = {
  id: string;
  title: string;
  category: string;
};

function defaultRange(): RangeValue {
  return presetToRange("30d");
}

export function ReportsCommandShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [canned, setCanned] = useState<CannedSummary[]>([]);

  useCommandPaletteShortcut(() => setCmdOpen(true));

  useEffect(() => {
    fetch("/api/reports/canned")
      .then(async (res) => {
        const body = (await res.json()) as
          | { success: true; data: { items: CannedSummary[] } }
          | { success: false };
        if (body.success) setCanned(body.data.items);
      })
      .catch(() => {});
  }, []);

  const fallback = defaultRange();
  const from = searchParams.get("from") || fallback.fromIso;
  const to = searchParams.get("to") || fallback.toIso;
  const ownerId = searchParams.get("ownerId") || "";

  const reportIdMatch = pathname.match(/^\/reports\/([^/]+)$/);
  const currentReportId =
    reportIdMatch &&
    !["overview", "library", "builder"].includes(reportIdMatch[1] ?? "")
      ? reportIdMatch[1]
      : undefined;

  const navigate = useCallback((href: string) => router.push(href), [router]);

  const actions = useMemo(
    () =>
      buildReportsCommandActions({
        onClose: () => setCmdOpen(false),
        navigate,
        from,
        to,
        ownerId,
        pathname,
        cannedReports: canned,
        currentReportId,
      }),
    [navigate, from, to, ownerId, pathname, canned, currentReportId],
  );

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-crm-border bg-white px-3 py-1.5 text-xs font-medium text-crm-muted hover:border-accent-300 hover:text-accent-700"
        >
          <Command size={14} />
          <span>Command</span>
          <kbd className="rounded border border-crm-border bg-crm-panel px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {children}

      <LeadCommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        title="Command · Reports"
        actions={actions}
      />
    </>
  );
}
