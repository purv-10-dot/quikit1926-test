"use client";

import { Fragment } from "react";
import { FileText, Plus, Layers, ImageIcon, Trash2 } from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { groupWorkItemsByBoq } from "@/lib/projects/boq-work-groups";
import { Section } from "../components/Section";
import { PhotoGalleryModal } from "../components/PhotoGalleryModal";
import { BOQActivityPickerModal } from "../../work-orders/new/BOQActivityPickerModal";
import type { WorkItem, BoqPickerRow } from "../lib/types";

export function WorkDone({
  rows,
  grouped,
  projectWorkOrders,
  onOpenBoqModal,
  onUpdate,
  onRemove,
  onAddImages,
  onOpenGallery,
  projectId,
  boqModalOpen,
  onCloseBoqModal,
  alreadyAddedBoqIds,
  onAddFromBoq,
  galleryIdx,
  onCloseGallery,
  onRemoveImage,
}: {
  rows: WorkItem[];
  grouped: ReturnType<typeof groupWorkItemsByBoq<WorkItem>>;
  projectWorkOrders: Array<{ id: string; woNumber?: string; contractorName?: string }>;
  onOpenBoqModal: () => void;
  onUpdate: (idx: number, field: keyof WorkItem, value: string) => void;
  onRemove: (idx: number) => void;
  onAddImages: (idx: number, files: FileList | null) => void;
  onOpenGallery: (idx: number) => void;
  projectId: string;
  boqModalOpen: boolean;
  onCloseBoqModal: () => void;
  alreadyAddedBoqIds: Set<string>;
  onAddFromBoq: (row: BoqPickerRow) => void;
  galleryIdx: number | null;
  onCloseGallery: () => void;
  onRemoveImage: (idx: number, imgIdx: number) => void;
}) {
  return (
    <>

    <Section
      id="dpr-work"
      icon={<FileText className="w-4 h-4" />}
      title="WORK DONE"
      count={rows.length}
      action={
        <button
          type="button"
          onClick={onOpenBoqModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-200 hover:border-accent-300 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Activity from BOQ
        </button>
      }
    >
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={onOpenBoqModal}
          className="w-full border-2 border-dashed border-accent-200 rounded-xl px-5 py-6 text-left hover:border-accent-400 hover:bg-accent-50 transition-colors flex items-center gap-4 group"
        >
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-accent-100 text-accent-600 ring-4 ring-accent-100 shrink-0 group-hover:scale-105 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800">
              Click to add activities from BOQ
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select items from the Bill of Quantities to report progress
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-50 text-accent-700 text-[11px] font-bold border border-accent-200">
            <Plus className="w-3 h-3" /> Add Activity
          </span>
        </button>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[1340px]">
            <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left w-[80px]">BOQ Ref</th>
                <th className="px-3 py-2 text-left min-w-[220px]">Description</th>
                <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                <th className="px-3 py-2 text-right w-[110px]">Total Target</th>
                <th className="px-3 py-2 text-left w-[140px]">Contractor / WO</th>
                <th className="px-3 py-2 text-right w-[100px]">Prev. Qty</th>
                <th className="px-3 py-2 text-right w-[110px]">Today&apos;s Qty</th>
                <th className="px-3 py-2 text-right w-[110px]">Total Till Date</th>
                <th className="px-3 py-2 text-left w-[140px]">% Completed</th>
                <th className="px-3 py-2 text-left w-[140px]">Location / Chainage</th>
                <th className="px-3 py-2 text-left w-[140px]">Remarks</th>
                <th className="px-3 py-2 text-center w-[140px]">Images</th>
                <th className="px-3 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grouped.map((group) => (
                <Fragment key={group.key}>
                  {group.topNo && (
                    <tr className="bg-accent-50">
                      <td
                        colSpan={13}
                        className="px-3 py-2 border-t border-accent-100"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers className="w-3.5 h-3.5 text-accent-500 shrink-0" />
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-accent-800 bg-accent-100 shrink-0">
                            {group.topNo}
                          </span>
                          {group.topName && (
                            <span
                              className="text-[11px] font-semibold text-slate-600 truncate min-w-0"
                              title={group.topName}
                            >
                              {group.topName}
                            </span>
                          )}
                          <span className="ml-auto pl-3 text-[10px] font-semibold text-accent-700 tabular-nums whitespace-nowrap shrink-0">
                            {group.leafCount} item
                            {group.leafCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {group.rendered.map((entry) => {
                if (entry.kind === "subgroup") {
                  return (
                    <tr
                      key={`sub-${entry.no}`}
                      className="bg-accent-50"
                    >
                      <td
                        colSpan={13}
                        className="py-1.5 border-t border-accent-100"
                        style={{
                          paddingLeft: `${entry.depth * 16 + 12}px`,
                          paddingRight: "12px",
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-accent-300 shrink-0">└</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-accent-700 bg-accent-100 shrink-0">
                            {entry.no}
                          </span>
                          {entry.name && (
                            <span
                              className="text-[11px] font-medium text-slate-500 truncate min-w-0"
                              title={entry.name}
                            >
                              {entry.name}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
                const { w, idx, depth } = entry;
                const todayNum = parseFloat(w.todayQty) || 0;
                const totalTillDate = w.prevQty + todayNum;
                const pct =
                  w.totalTarget > 0
                    ? Math.min(100, (totalTillDate / w.totalTarget) * 100)
                    : 0;
                return (
                  <tr key={`${w.boqItemId}-${idx}`}>
                    <td
                      className={`px-3 py-2 text-xs text-accent-700 font-bold ${
                        depth > 0 ? "border-l-2 border-accent-200" : ""
                      }`}
                      style={
                        depth > 0
                          ? { paddingLeft: `${depth * 16 + 12}px` }
                          : undefined
                      }
                    >
                      {w.boqNo}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-900">
                      <div className="truncate max-w-[260px]" title={w.description}>
                        {w.description}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 uppercase">
                      {w.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-700 tabular-nums">
                      {w.totalTarget.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <SelectInput
                        value={w.contractorWO}
                        onChange={(v) => onUpdate(idx, "contractorWO", v)}
                        size="sm"
                        options={[
                          { value: "", label: "Self Work", hint: "Own workforce — no contractor" },
                          ...projectWorkOrders.map((wo) => ({
                            value: wo.id,
                            label: wo.woNumber ?? wo.id,
                            hint: wo.contractorName || "Unassigned contractor",
                          })),
                        ]}
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">
                      {w.prevQty.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        max={w.balanceQty}
                        value={w.todayQty}
                        // Block e / E / + / - so letters + exponents
                        // can't leak into the qty field.
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-"].includes(e.key))
                            e.preventDefault();
                        }}
                        onChange={(e) =>
                          onUpdate(idx, "todayQty", e.target.value)
                        }
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-accent-700 tabular-nums">
                      {totalTillDate.toLocaleString("en-IN", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-gray-600 tabular-nums w-9 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={w.location}
                        onChange={(e) =>
                          onUpdate(idx, "location", e.target.value)
                        }
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                        placeholder="e.g. CH 100-200"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={w.remarks}
                        onChange={(e) =>
                          onUpdate(idx, "remarks", e.target.value)
                        }
                        className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-300 focus:border-accent-400"
                        placeholder="Optional notes"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {w.images.length > 0 ? (
                          // Show only the first photo as a thumbnail; if there
                          // are more, overlay a "+N" badge that opens the full
                          // gallery in a modal.
                          <button
                            type="button"
                            onClick={() => onOpenGallery(idx)}
                            className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:ring-2 hover:ring-accent-300 transition-shadow"
                            title={`View ${w.images.length} photo${w.images.length === 1 ? "" : "s"}`}
                          >
                            <img
                              src={w.images[0]}
                              alt="Photo 1"
                              className="w-full h-full object-cover"
                            />
                            {w.images.length > 1 && (
                              <span className="absolute inset-0 bg-black/55 text-white text-[11px] font-bold flex items-center justify-center">
                                +{w.images.length - 1}
                              </span>
                            )}
                          </button>
                        ) : null}
                        <label
                          className="inline-flex flex-col items-center justify-center w-12 h-12 rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50 cursor-pointer transition-colors shrink-0"
                          title="Upload photo (click or drag image here)"
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.add(
                              "border-accent-400",
                              "text-accent-600",
                              "bg-accent-50",
                            );
                          }}
                          onDragLeave={(e) => {
                            e.currentTarget.classList.remove(
                              "border-accent-400",
                              "text-accent-600",
                              "bg-accent-50",
                            );
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.currentTarget.classList.remove(
                              "border-accent-400",
                              "text-accent-600",
                              "bg-accent-50",
                            );
                            if (e.dataTransfer.files?.length) {
                              onAddImages(idx, e.dataTransfer.files);
                            }
                          }}
                        >
                          <ImageIcon className="w-4 h-4" />
                          <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5">Add</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              onAddImages(idx, e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(idx)}
                        className="text-gray-400 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>

      {/* BOQ picker modal — reused from the Work Order flow */}
      <BOQActivityPickerModal
        open={boqModalOpen}
        onClose={onCloseBoqModal}
        projectId={projectId}
        alreadyAddedIds={alreadyAddedBoqIds}
        onAdd={onAddFromBoq}
        confirmLabel="Add to DPR"
        duplicateMessage="This BOQ item is already in today's DPR — pick a different BOQ row."
      />

      {/* Photo gallery modal — opened from the Images cell when a row has
          one or more photos. Lets the user preview, click through to full
          size, remove individual images, and add more. */}
      {galleryIdx !== null && rows[galleryIdx] && (
        <PhotoGalleryModal
          item={rows[galleryIdx]}
          onClose={onCloseGallery}
          onRemove={(j) => {
            onRemoveImage(galleryIdx, j);
            // If the user removed the last photo, close the modal.
            if (rows[galleryIdx].images.length <= 1) onCloseGallery();
          }}
          onAdd={(files) => onAddImages(galleryIdx, files)}
        />
      )}
    </>
  );
}