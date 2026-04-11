"use client";

/**
 * AddButton — shared "Add / New" button used across QuikScale modules.
 *
 * Introduced in R7 to replace 6 copy-pasted inline buttons that had drifted
 * across Individual KPI, Team KPI, Priority, WWW, Category Management, and
 * Teams (org setup). Every call site owns its own open-modal state; this
 * component is purely presentational — it takes an `onClick` and a label
 * string (as children) and renders the canonical accent-themed button.
 *
 * Usage:
 *   <AddButton onClick={() => setShowAddModal(true)}>Add KPI</AddButton>
 *   <AddButton onClick={openAdd} className="ml-auto">Add KPI</AddButton>
 */

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function AddButton({
  onClick,
  children,
  className,
  disabled,
}: AddButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}
