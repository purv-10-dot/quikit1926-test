"use client";

/**
 * WorkOrderDrawer — right-side slide-over wrapper around the existing
 * `WorkOrderForm`. Used by the WO list page so the "+ New Work Order"
 * action stays consistent with the QuickCreateDrawer pattern used by
 * Indents / RFQs / POs / Hindrance, instead of full-page navigation.
 *
 * Edit flow still uses /projects/work-orders/[id]/edit (full page) —
 * this wrapper only handles create.
 */

import { X } from "lucide-react";
import {
  RIGHT_DRAWER_BACKDROP,
  RIGHT_DRAWER_FRAME,
  RIGHT_DRAWER_PANEL,
} from "@/components/FormDrawer";
import { WorkOrderForm } from "./WorkOrderForm";

export function WorkOrderDrawer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save so the parent can refetch + close. */
  onSaved: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} max-w-3xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 sm:px-8">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              New Work Order
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Define contractor scope, rates, and terms.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkOrderForm embedded onSaved={onSaved} />
        </div>
        </div>
      </div>
    </>
  );
}
