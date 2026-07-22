"use client";

/**
 * DPRDrawer — right-side slide-over wrapper around `DPRForm`. Used by
 * the DPR list page so the "+ New DPR" action stays consistent with
 * the QuickCreateDrawer pattern used by Indents / RFQs / POs /
 * Hindrance, instead of full-page navigation.
 *
 * Edit flow still uses /projects/dpr/[id]/edit (full page) — this
 * wrapper only handles create. The drawer width (`max-w-3xl`) keeps
 * the surface comfortable for empty / lightly-filled state; the
 * row-rich tables (Work Done / Materials / Manpower / Staff /
 * Machinery) overflow-x-scroll within their own containers when
 * populated, so they don't drive the drawer wider than it needs.
 *
 * Scroll model: only the bottom action bar (Save Draft / Submit Report)
 * is fixed. Everything else — brand accent, drawer title, date/project
 * strip, section nav, and the form sections — scrolls together. The
 * close (X) button floats top-right via absolute positioning so it stays
 * reachable at any scroll position without needing its own fixed bar.
 */

import { ClipboardList, X } from "lucide-react";
import {
  RIGHT_DRAWER_BACKDROP,
  RIGHT_DRAWER_FRAME,
  RIGHT_DRAWER_PANEL,
} from "@/components/FormDrawer";
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
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} max-w-[min(96vw,72rem)]`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-30 rounded-lg bg-white/90 p-2 text-slate-400 shadow-sm ring-1 ring-slate-200/60 backdrop-blur-sm transition-colors hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* The whole drawer body scrolls — including the brand accent
            strip and the title row. The form's sticky footer (Save
            Draft / Submit Report) is the only thing that stays pinned
            to the bottom; sticky positioning binds to this overflow-y-
            auto container. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Brand accent strip */}
          <div
            aria-hidden
            className="h-1 w-full bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600"
          />

          {/* Drawer title row — now part of the scroll flow. The X
              close button is rendered separately above and floats
              over this row. */}
          <div className="flex items-center gap-3 px-6 py-4 pr-14 border-b border-slate-200 bg-white">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-accent-50 text-accent-600 ring-1 ring-accent-200 shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                New Daily Progress Report
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                Capture today&apos;s site activities, material usage, and
                deployed manpower.
              </p>
            </div>
          </div>

          {/* Form body — `embedded` swaps the form's full-page chrome
              (back button + title) for the drawer chrome above. */}
          <DPRForm embedded onSaved={onSaved} />
        </div>
        </div>
      </div>
    </>
  );
}
