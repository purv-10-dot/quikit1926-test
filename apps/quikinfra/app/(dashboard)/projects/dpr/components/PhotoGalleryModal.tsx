"use client";

import { X, Plus } from "lucide-react";
import type { WorkItem } from "../lib/types";

export function PhotoGalleryModal({
  item,
  onClose,
  onRemove,
  onAdd,
}: {
  item: WorkItem;
  onClose: () => void;
  onRemove: (j: number) => void;
  onAdd: (files: FileList | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-600">
              Site Photos
            </div>
            <div className="text-sm font-semibold text-gray-900 truncate">
              {item.boqNo} — {item.description}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {item.images.length} photo{item.images.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {item.images.map((src, j) => (
              <div
                key={j}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 group"
              >
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full h-full"
                  title="Open full size"
                >
                  <img
                    src={src}
                    alt={`Photo ${j + 1}`}
                    className="w-full h-full object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => onRemove(j)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center shadow ring-2 ring-white transition-opacity"
                  title="Remove photo"
                >
                  <X className="w-3 h-3" strokeWidth={3} />
                </button>
                <div className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded">
                  {j + 1}
                </div>
              </div>
            ))}

            <label
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-accent-400 hover:text-accent-600 hover:bg-accent-50 cursor-pointer transition-colors flex flex-col items-center justify-center gap-1"
              title="Upload more photos (click or drag images here)"
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
                  onAdd(e.dataTransfer.files);
                }
              }}
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Add Photo
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onAdd(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}