"use client";

/**
 * "How reports work" help modal — mirrors the lead-scoring help modal so the
 * Reports module explains itself the same way the rest of the app does.
 * Pure presentational; the parent owns the open/close state.
 */
import { Modal } from "@/components/ui/modal";

export function ReportsHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="How Reports Work" width="max-w-xl">
      <div className="space-y-3 text-sm text-crm-muted">
        <p>
          Reports turn your CRM data into standard, ready-to-read views. Pick a
          category, set a date range and (optionally) an agent, then open a report
          to see its chart, table, and headline total.
        </p>

        <div className="rounded-lg bg-crm-panel p-3">
          <p className="font-medium text-crm-text">The three surfaces</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-crm-text">Overview:</span> executive
              KPIs and headline charts, scoped to your filters.
            </li>
            <li>
              <span className="font-medium text-crm-text">Report library:</span> the
              standard catalog, grouped by Pipeline, Leads, Activities, Telephony,
              and Team.
            </li>
            <li>
              <span className="font-medium text-crm-text">Report builder:</span> roll
              your own — pick an object, group-by, and metric, then run.
            </li>
          </ul>
        </div>

        <div className="rounded-lg bg-crm-panel p-3">
          <p className="font-medium text-crm-text">Filters apply to what you run</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-crm-text">Date range:</span> presets
              (Today / 7d / 30d / This month / This quarter) or a custom from–to.
              Every report runs against the range you pick.
            </li>
            <li>
              <span className="font-medium text-crm-text">Agent:</span> narrow a report
              to a single owner, or leave it on “All agents”.
            </li>
            <li>
              The active filter is always shown above each report so you know exactly
              what window the numbers cover.
            </li>
          </ul>
        </div>

        <div className="rounded-lg bg-crm-panel p-3">
          <p className="font-medium text-crm-text">Reading and acting on a report</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-crm-text">Quick view</span> opens a
              report in a side drawer; <span className="font-medium text-crm-text">Full page</span>{" "}
              opens it on its own URL you can share.
            </li>
            <li>
              <span className="font-medium text-crm-text">Drill down:</span> click a
              row’s first cell to jump into the matching leads, deals, or call logs.
            </li>
            <li>
              <span className="font-medium text-crm-text">Favorites (★):</span> star a
              report to pin it to the top of the library.
            </li>
            <li>
              <span className="font-medium text-crm-text">Export:</span> download the
              current view as CSV or Excel. Requires the{" "}
              <span className="font-medium text-crm-text">reports.export</span> permission.
            </li>
          </ul>
        </div>

        <p className="text-xs">
          Tip: use <span className="font-medium text-crm-text">Recommended</span> for a
          curated starting set, or the <span className="font-medium text-crm-text">Ctrl+K</span>{" "}
          command palette to jump straight to any report.
        </p>
      </div>
    </Modal>
  );
}
