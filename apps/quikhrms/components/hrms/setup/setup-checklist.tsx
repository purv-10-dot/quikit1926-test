"use client";

import Link from "next/link";
import { clsx } from "clsx";
import {
  Building2,
  MapPin,
  Workflow,
  Wallet,
  Check,
  ArrowRight,
  Rocket,
  ShieldCheck,
  Palmtree,
  CalendarDays,
  ClipboardList,
  Users,
} from "lucide-react";
import type {
  HrmsSetupItem,
  HrmsSetupItemKey,
} from "@/lib/services/hrms-setup";

const ITEM_ICON: Record<HrmsSetupItemKey, React.ReactNode> = {
  departments: <Building2 size={18} />,
  locations: <MapPin size={18} />,
  approvalChains: <Workflow size={18} />,
  payroll: <Wallet size={18} />,
  roles: <ShieldCheck size={18} />,
  leaveTypes: <Palmtree size={18} />,
  leaveGroups: <Users size={18} />,
  holidays: <CalendarDays size={18} />,
  onboardingTemplate: <ClipboardList size={18} />,
  coreApprovalChains: <Workflow size={18} />,
};

interface SetupChecklistProps {
  items: HrmsSetupItem[];
  completedCount: number;
  totalCount: number;
  /** Called when a "Set up" link is clicked — lets the gate close the overlay. */
  onNavigate?: () => void;
}

/**
 * Presentational first-run setup checklist card. Rendered inside the blocking
 * overlay (see SetupGate). One primary action per pending row; completed rows
 * are visually settled with a check. Themed via accent-* + semantic colors,
 * with dark-mode parity.
 */
export function SetupChecklist({
  items,
  completedCount,
  totalCount,
  onNavigate,
}: SetupChecklistProps) {
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
          <Rocket size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Finish setting up QuikHRMS
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Complete these steps to unlock HRMS for your organisation.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
          <span className="text-gray-500 dark:text-gray-400">Setup progress</span>
          <span className="text-gray-700 dark:text-gray-200 tabular-nums">
            {completedCount} of {totalCount} done
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10"
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-accent-600 transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <ul className="mt-5 space-y-2.5">
        {items.map((item) => (
          <li
            key={item.key}
            className={clsx(
              "flex items-center gap-3 rounded-xl border p-3 transition-colors",
              item.completed
                ? "border-green-200 bg-green-50/60 dark:border-green-500/20 dark:bg-green-500/10"
                : "border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.03]",
            )}
          >
            {/* Status / type icon */}
            <div
              className={clsx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                item.completed
                  ? "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
                  : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300",
              )}
            >
              {item.completed ? <Check size={18} strokeWidth={2.5} /> : ITEM_ICON[item.key]}
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p
                className={clsx(
                  "truncate text-sm font-medium",
                  item.completed
                    ? "text-gray-500 line-through decoration-gray-300 dark:text-gray-400"
                    : "text-gray-900 dark:text-white",
                )}
              >
                {item.title}
              </p>
              {!item.completed && (
                <>
                  <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                    <span className={clsx("font-semibold", item.blocking ? "text-red-500" : "text-gray-400")}>
                      {item.blocking ? "Required" : "Recommended"}
                    </span>
                    {" · "}{item.description}
                  </p>
                  {item.progress && item.progress.total > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                        <div
                          className="h-full rounded-full bg-accent-500 transition-[width] duration-300"
                          style={{ width: `${Math.round((item.progress.done / item.progress.total) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-medium text-gray-500 tabular-nums dark:text-gray-400">
                        {item.progress.done}/{item.progress.total}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action */}
            {item.completed ? (
              <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 dark:bg-green-500/20 dark:text-green-300">
                Done
              </span>
            ) : (
              <Link
                href={item.href}
                onClick={onNavigate}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0b1220]"
              >
                Set up
                <ArrowRight size={15} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
