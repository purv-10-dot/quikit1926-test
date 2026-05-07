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
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col z-50 overflow-hidden">
        {/* Drawer header — supplies the title + close that the embedded
            WorkOrderForm hides in `embedded` mode. */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              New Work Order
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Define contractor scope, rates, and terms.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form body — `embedded` swaps the form's own header for the
            drawer chrome above and renders its Save button as a sticky
            footer below. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WorkOrderForm embedded onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
