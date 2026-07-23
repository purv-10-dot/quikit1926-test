"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { TemplateBody } from "./idea-template-body";
import { DESCRIPTION_TEMPLATES, type DescriptionTemplate } from "./idea-description-templates";

/**
 * "Description templates" drawer (JPD "start from a template" flow). Rendered
 * INSIDE the idea detail panel (absolute-positioned to its right edge) so it
 * never floats over the board / a second drawer. Hovering a row shows a live
 * preview popover to its left; clicking a row inserts the blueprint.
 */
export function IdeaTemplatesPanel({
  onSelect,
  onClose,
}: {
  onSelect: (tpl: DescriptionTemplate) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<{ tpl: DescriptionTemplate; top: number; left: number } | null>(null);

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-[380px] flex-col border-l border-gray-200 bg-white shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.25)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">Description templates</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable library */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Templates library</p>
        <ul>
          {DESCRIPTION_TEMPLATES.map((tpl) => (
            <li key={tpl.key}>
              <button
                type="button"
                onClick={() => onSelect(tpl)}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setPreview({ tpl, top: r.top, left: r.left });
                }}
                onMouseLeave={() => setPreview((p) => (p?.tpl.key === tpl.key ? null : p))}
                className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-gray-50"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-gray-100 text-lg">{tpl.emoji}</div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{tpl.name}</p>
                  <p className="line-clamp-2 text-xs leading-snug text-gray-500">{tpl.blurb}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Hover preview — fixed, placed to the LEFT of the hovered row. */}
      {preview && (
        <div
          className="pointer-events-none fixed z-[70] w-[460px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
          style={{
            top: clampTop(preview.top),
            left: Math.max(16, preview.left - 476),
            maxHeight: "70vh",
          }}
        >
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
            <span className="text-lg">{preview.tpl.emoji}</span>
            <span className="text-base font-semibold text-gray-900">{preview.tpl.name}</span>
          </div>
          <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: "calc(70vh - 52px)" }}>
            <TemplateBody html={preview.tpl.body} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Keep the preview within the viewport vertically. */
function clampTop(top: number) {
  if (typeof window === "undefined") return top;
  const max = window.innerHeight - 480;
  return Math.max(16, Math.min(top, Math.max(16, max)));
}
