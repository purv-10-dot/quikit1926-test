"use client";

/**
 * "Select Activity from BOQ" modal used by the New Work Order page.
 *
 * Reuses the BOQCascadingPicker for the drill-down. Once a leaf row is
 * picked, shows a Selected Item Details card (BOQ No, Unit, Scope Qty,
 * Balance Qty) so the user can verify what they're about to add to the
 * work order.
 *
 * Balance Qty = tender_qty − done_qty − already-assigned-to-this-WO.
 * For demo purposes we use (tender_qty − done_qty) and trust the
 * parent page to track any duplicates.
 */

import { useEffect, useState } from "react";
import { X, Plus, Loader2, AlertTriangle } from "lucide-react";
import { BOQCascadingPicker, type BoqRow } from "@/components/BOQCascadingPicker";
import type { BoqTreeRow } from "@/lib/boq/tree-row";
import { useBOQ } from "@/hooks/use-projects";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Set of boq item ids already added, to block duplicates. */
  alreadyAddedIds?: Set<string>;
  /** Called with the picked BOQ row on confirm. */
  onAdd: (row: BoqRow & { scopeQty: number; balanceQty: number }) => void;
  /** Confirm button label. Defaults to "Add to Work Order". */
  confirmLabel?: string;
  /** Duplicate warning sentence. Defaults to work-order wording. */
  duplicateMessage?: string;
}

export function BOQActivityPickerModal({
  open,
  onClose,
  projectId,
  alreadyAddedIds,
  onAdd,
  confirmLabel = "Add to Work Order",
  duplicateMessage = "This BOQ item is already on the work order — pick a different BOQ row.",
}: Props) {
  const { data: boqData, isLoading } = useBOQ(open && projectId ? projectId : null);
  const [selectedLeaf, setSelectedLeaf] = useState<BoqRow | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedLeaf(null);
      setError("");
    }
  }, [open]);

  if (!open) return null;

  // Flatten the raw BOQ response into the BoqRow shape the picker expects
  const rawItems = boqData?.items ?? boqData?.data ?? [];
  const items: BoqRow[] = rawItems.map((r) => ({
    id: r.id ?? "",
    boq_no: r.boq_no ?? r.boqNo ?? "",
    parent_boq_no: r.parent_boq_no ?? r.parentBoqNo ?? null,
    depth: r.depth ?? 0,
    is_group: r.is_group ?? r.isGroup ?? false,
    display_name: r.display_name ?? r.displayName ?? "",
    unit: r.unit ?? null,
    tender_qty:
      r.tender_qty != null
        ? Number(r.tender_qty)
        : r.tenderQty != null
        ? Number(r.tenderQty)
        : null,
    category: r.category,
    // keep the raw row so we can read done_qty/balance_qty for the details card
    ...(({ done_qty, balance_qty, sort_order, sortOrder }: BoqTreeRow) => ({
      done_qty,
      balance_qty,
      sort_order: sort_order ?? sortOrder ?? 0,
    }))(r),
  }));

  // Details shown once a leaf is picked
  const leafRaw = selectedLeaf
    ? rawItems.find((r) => r.id === selectedLeaf.id)
    : null;
  const scopeQty = leafRaw ? Number(leafRaw.tender_qty ?? 0) : 0;
  const doneQty = leafRaw ? Number(leafRaw.done_qty ?? 0) : 0;
  const balanceQty = leafRaw
    ? Number(leafRaw.balance_qty ?? scopeQty - doneQty)
    : 0;

  // Saved WO lines store the boqNo in place of the item UUID, so match on
  // either the id or the boqNo to catch duplicates in both create and edit.
  const duplicate =
    !!selectedLeaf &&
    (alreadyAddedIds?.has(selectedLeaf.id) ||
      (!!selectedLeaf.boq_no && alreadyAddedIds?.has(selectedLeaf.boq_no)));

  const handleAdd = () => {
    if (!selectedLeaf) {
      setError("Drill down and pick a leaf BOQ item first");
      return;
    }
    if (duplicate) {
      setError(duplicateMessage);
      return;
    }
    onAdd({
      ...selectedLeaf,
      scopeQty,
      balanceQty,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[680px] max-h-[92vh] flex flex-col">
        {/* Header — own rounded-top so the card can drop overflow-hidden
            (otherwise the SearchSelect popover gets clipped). */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0 rounded-t-2xl bg-white">
          <h2 className="text-base font-semibold text-gray-900">Select Activity from BOQ</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — overflow-visible so the cascading picker's absolute
            popover can escape the body rectangle when the list is tall. */}
        <div className="flex-1 px-6 py-5 space-y-4 overflow-visible min-h-0">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {!projectId ? (
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              No project selected on the parent form.
            </div>
          ) : isLoading ? (
            <div className="flex items-center text-sm text-gray-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading BOQ…
            </div>
          ) : items.length === 0 ? (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This project has no BOQ imported yet. Go to Projects → BOQ to import first.
            </div>
          ) : (
            <>
              <BOQCascadingPicker
                items={items}
                value={selectedLeaf?.id ?? null}
                onSelect={setSelectedLeaf}
                topPlaceholder="Select Group"
              />

              {/* Selected Item Details card — exactly matches the screenshot */}
              {selectedLeaf && (
                <div className="bg-gradient-to-br from-orange-50 to-sky-50 border border-orange-200 rounded-xl px-5 py-4 mt-3">
                  <div className="text-xs font-bold text-orange-900 uppercase tracking-wider mb-3">
                    Selected Item Details
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 text-sm">
                    <div>
                      <div className="text-[11px] text-orange-700 font-bold uppercase tracking-wider">BOQ No</div>
                      <div className="text-gray-900 font-semibold">
                        {selectedLeaf.boq_no}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-orange-700 font-bold uppercase tracking-wider">Unit</div>
                      <div className="text-gray-900 font-semibold uppercase">
                        {selectedLeaf.unit ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-orange-700 font-bold uppercase tracking-wider">Scope Qty</div>
                      <div className="text-gray-900 font-semibold">
                        {scopeQty.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-orange-700 font-bold uppercase tracking-wider">Balance Qty</div>
                      <div className="text-gray-900 font-semibold">
                        {balanceQty.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                  {duplicate && (
                    <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {duplicateMessage}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 rounded-b-2xl">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton
            onClick={handleAdd}
            disabled={!selectedLeaf || !!duplicate}
          >
            <Plus className="w-4 h-4" /> {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
