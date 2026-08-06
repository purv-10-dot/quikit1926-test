"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { DemoDataClearModal } from "@/components/dashboard/demo-data-clear-modal";

/**
 * Global "you're looking at sample data" banner — appears on every dashboard
 * page while the org has seeded demo data. Only admins can clear it;
 * everyone else just sees the notice.
 *
 * Seeding itself does NOT happen here — it runs blocking, server-side, in
 * the dashboard layout (before this component or any page even mounts).
 * That's deliberate: an earlier version fired the seed request from this
 * component's mount effect, in parallel with every page's own data fetch,
 * which raced — pages would query before seeding finished and cache an
 * empty result until a manual refresh. Seeding server-side up front makes
 * that race impossible. This component only ever reads status.
 */
export function DemoDataBanner() {
  const { isAdmin } = useMyPermissions();
  const queryClient = useQueryClient();
  const [hasDemoData, setHasDemoData] = useState(false);
  const [checked, setChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/demo-data/status");
        if (!res.ok) return;
        const json = await res.json();
        if (!mounted) return;
        setHasDemoData(!!json?.data?.hasDemoData);
      } catch {
        // silent — banner is non-critical
      } finally {
        if (mounted) setChecked(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!checked || !hasDemoData) return null;

  return (
    <>
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 p-1.5 rounded-lg bg-amber-50">
              <Sparkles className="h-4 w-4 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-800 leading-tight">
                You&apos;re viewing sample data
              </p>
              <p className="text-[11px] text-amber-600 leading-tight mt-0.5">
                None of this is real — it&apos;s here so you can explore every module before entering your own data.
              </p>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors bg-amber-600 hover:bg-amber-700 text-white flex-shrink-0"
            >
              Clear All Demo Data
            </button>
          )}
        </div>
      </div>
      <DemoDataClearModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCleared={() => {
          setModalOpen(false);
          setHasDemoData(false);
          // Clear All wipes rows across every module — KPI, Priority, WWW,
          // Teams, Client Meetings, OPSP, Habits, SWT, Goals, FACe/PACe,
          // Quarter Settings, Category Master. Whatever's currently mounted
          // (or gets navigated to next) already has the pre-clear data
          // cached by React Query; without busting it, those pages keep
          // showing deleted rows until a manual refresh. Given the blast
          // radius is genuinely "every module," invalidating the whole
          // cache is the correct scope here, not a handful of query keys.
          queryClient.invalidateQueries();
        }}
      />
    </>
  );
}
