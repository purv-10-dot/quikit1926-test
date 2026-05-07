"use client";

/**
 * DPRDrawer — right-side slide-over wrapper around `DPRForm`. Used by
 * the DPR list page so the "+ New DPR" action stays consistent with
 * the QuickCreateDrawer pattern used by Indents / RFQs / POs /
 * Hindrance, instead of full-page navigation.
 *
 * Edit flow still uses /projects/dpr/[id]/edit (full page) — this
 * wrapper only handles create. The drawer is intentionally wider
 * (`max-w-5xl`) than typical drawers because the DPR captures Work
 * Done / Materials / Manpower / Staff / Machinery in row-rich tables
 * that need horizontal real estate to stay readable.
 */

import { X } from "lucide-react";
import { DPRForm } from "./DPRForm";

export function DPRDrawer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-5xl bg-white shadow-2xl flex flex-col z-50 overflow-hidden">
        {/* Drawer header — supplies the title + close that the embedded
            DPRForm hides in `embedded` mode. The form's own header
            strip (with the date picker, project selector, Save Draft,
            and Submit Report buttons) still renders below this so the
            user retains those controls. */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              New Daily Progress Report
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Capture today&apos;s site activities, material usage, and
              deployed manpower.
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

        {/* Form body — `embedded` swaps the form's full-page chrome
            (back button + title) for the drawer chrome above. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DPRForm embedded onSaved={onSaved} />
        </div>
      </div>
    </div>
  );
}
