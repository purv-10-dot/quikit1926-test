"use client";

/** AssetTransferDrawer — slide-over wrapper around `AssetTransferForm`. */

import { X } from "lucide-react";
import {
  RIGHT_DRAWER_BACKDROP,
  RIGHT_DRAWER_FRAME,
  RIGHT_DRAWER_PANEL,
} from "@/components/FormDrawer";
import { AssetTransferForm } from "./AssetTransferForm";

export function AssetTransferDrawer({
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
        <div className={`${RIGHT_DRAWER_PANEL} max-w-3xl`}>
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 sm:px-8">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                New Asset Transfer
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Generates a gate pass; destination acknowledges to relocate the asset
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
          <div className="min-h-0 flex-1">
            <AssetTransferForm embedded onSaved={onSaved} onCancel={onClose} />
          </div>
        </div>
      </div>
    </>
  );
}
