"use client";

import { History, MoreVertical, Phone, RotateCcw, Trash2, X } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import type { LeadRow } from "@/components/leads/lead-table";

/**
 * Per-row three-dot (⋮) actions menu for the Leads grid. Active rows offer
 * Audit Log / Call / Delete; trashed rows offer Restore / Permanently delete
 * (admin only). Replaces the former standalone Log and Call columns.
 *
 * Call + Log open table-level modals (the menu unmounts on item click), so the
 * parent passes `onCall` / `onLogActivity` callbacks that flip that state.
 */
export function LeadRowActions({
  lead,
  viewTrash,
  isAdmin,
  onLogActivity,
  onCall,
  onLeadDelete,
  onLeadRestore,
  onLeadPermanentDelete,
}: {
  lead: LeadRow;
  viewTrash: boolean;
  isAdmin: boolean;
  onLogActivity: () => void;
  onCall: () => void;
  onLeadDelete?: (lead: LeadRow) => void;
  onLeadRestore?: (lead: LeadRow) => void;
  onLeadPermanentDelete?: (lead: LeadRow) => void;
}) {
  // No-op menus would be confusing — hide the trigger when nothing is offered.
  const hasActions = viewTrash
    ? Boolean(onLeadRestore) || (isAdmin && Boolean(onLeadPermanentDelete))
    : true;
  if (!hasActions) return null;

  const callDisabled = !lead.phone;
  const callTitle = callDisabled
    ? lead.phone === null
      ? "Phone hidden by your role"
      : "No phone number"
    : `Call ${lead.phone}`;

  return (
    <Dropdown
      align="right"
      trigger={
        <button
          type="button"
          aria-label={`Actions for ${lead.name}`}
          title="Actions"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-crm-muted transition hover:bg-crm-panel hover:text-crm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
        >
          <MoreVertical size={16} />
        </button>
      }
    >
      {viewTrash ? (
        <>
          {onLeadRestore && (
            <DropdownItem onSelect={() => onLeadRestore(lead)}>
              <span className="flex items-center gap-2">
                <RotateCcw size={14} /> Restore
              </span>
            </DropdownItem>
          )}
          {isAdmin && onLeadPermanentDelete && (
            <DropdownItem danger onSelect={() => onLeadPermanentDelete(lead)}>
              <span className="flex items-center gap-2">
                <X size={14} /> Permanently delete
              </span>
            </DropdownItem>
          )}
        </>
      ) : (
        <>
          <DropdownItem onSelect={onLogActivity}>
            <span className="flex items-center gap-2">
              <History size={14} /> Audit Log
            </span>
          </DropdownItem>
          <DropdownItem onSelect={onCall} disabled={callDisabled}>
            <span className="flex items-center gap-2" title={callTitle}>
              <Phone size={14} /> Call
            </span>
          </DropdownItem>
          {onLeadDelete && (
            <DropdownItem danger onSelect={() => onLeadDelete(lead)}>
              <span className="flex items-center gap-2">
                <Trash2 size={14} /> Delete
              </span>
            </DropdownItem>
          )}
        </>
      )}
    </Dropdown>
  );
}
