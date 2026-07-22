"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Info, Smile } from "lucide-react";
import { EmojiPicker } from "@/components/editor/emoji-picker";

/**
 * Per-option style editor (JPD): name (+ optional emoji), a color grid with
 * "Clear formatting", a "Highlight ideas with this color" toggle, and "Delete
 * option". Used from the field editor for Theme/Roadmap (color + icon) and for
 * color-only fields (icon input hidden). Fixed-position so it escapes the panel's
 * overflow; closes on outside click / scroll.
 */

/** JPD-style palette: 5 tints × 10 hues. Row 0 = lightest, row 4 = darkest. */
export const OPTION_COLORS: string[][] = [
  ["#f4f5f7", "#e9f2ff", "#e7f9f6", "#e3fcef", "#fffae6", "#fff7e6", "#ffece6", "#ffebf0", "#f3e9ff", "#eae6ff"],
  ["#dfe1e6", "#cce0ff", "#c1f0ea", "#abf5d1", "#fff0b3", "#ffe2b8", "#ffbdad", "#ffc2d6", "#e6d0ff", "#c0b6f2"],
  ["#a5adba", "#7ab2ff", "#57d1c3", "#57d9a3", "#ffd633", "#ffbb55", "#ff8f73", "#ff8ec0", "#c191ff", "#8f7ee7"],
  ["#6b778c", "#2f74ff", "#1ca89b", "#22a06b", "#e0a800", "#e08a00", "#e34935", "#d6409f", "#8b3dff", "#5b45c9"],
  ["#253858", "#0747a6", "#0c5f57", "#116644", "#8c6d00", "#8f5000", "#8b1a10", "#8a1c5f", "#4b1a8f", "#2b1d78"],
];

export function OptionStylePopover({
  anchor,
  label,
  color,
  icon,
  highlight,
  allowIcon,
  onName,
  onColor,
  onIcon,
  onHighlight,
  onDelete,
  onClose,
}: {
  anchor: DOMRect;
  label: string;
  color: string | null;
  icon: string | null;
  highlight: boolean;
  /** Theme/Roadmap allow an emoji; color-only fields hide the icon input. */
  allowIcon: boolean;
  onName: (v: string) => void;
  onColor: (hex: string | null) => void;
  onIcon: (emoji: string | null) => void;
  onHighlight: (on: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(label);
  const [iconDraft, setIconDraft] = useState(icon ?? "");
  // The emoji picker renders as a fixed sibling; while it's open we must NOT let
  // an outside-click on it close this popover.
  const [emojiAnchor, setEmojiAnchor] = useState<{ left: number; top: number } | null>(null);
  const emojiOpen = emojiAnchor !== null;

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (emojiOpen) return; // emoji picker manages its own outside-close
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    const close = () => { if (!emojiOpen) onClose(); };
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose, emojiOpen]);

  // Sit under the option row; clamp to the viewport.
  const width = 320;
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 380);

  return (
    <div
      ref={ref}
      className="fixed z-[70] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl"
      style={{ left, top, width }}
    >
      {/* Name (+ emoji) */}
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-400 px-2.5 py-2">
        {allowIcon ? (
          <button
            type="button"
            title="Set an emoji"
            aria-label="Set an emoji"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setEmojiAnchor({ left: r.left, top: r.bottom + 4 });
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-lg leading-none hover:bg-gray-100"
          >
            {iconDraft ? <span>{iconDraft}</span> : <Smile className="h-4 w-4 text-gray-400" />}
          </button>
        ) : null}
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onName(name.trim())}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        />
      </div>

      {/* Color grid */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">Color</span>
        <button type="button" onClick={() => onColor(null)} className="text-xs text-blue-600 hover:underline">
          Clear formatting
        </button>
      </div>
      <div className="space-y-1.5">
        {OPTION_COLORS.map((row, ri) => (
          <div key={ri} className="flex justify-between">
            {row.map((hex) => {
              const active = color?.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  onClick={() => onColor(hex)}
                  className={`grid h-6 w-6 place-items-center rounded ${active ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
                  style={{ backgroundColor: hex }}
                >
                  {active && <span className="text-[11px] font-bold text-gray-700">✓</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Highlight toggle */}
      <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          role="switch"
          aria-checked={highlight}
          onClick={() => onHighlight(!highlight)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${highlight ? "bg-blue-600" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${highlight ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
        <span className="flex-1 text-sm text-gray-700">Highlight ideas with this color</span>
        <Info className="h-4 w-4 text-blue-500" />
      </div>

      {/* Delete */}
      <div className="mt-2 border-t border-gray-100 pt-2">
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600">
          <Trash2 className="h-4 w-4" /> Delete option
        </button>
      </div>

      {emojiOpen && (
        <EmojiPicker
          anchor={emojiAnchor}
          perLine={8}
          emojiSize={18}
          emojiButtonSize={28}
          onSelect={(emoji) => { setIconDraft(emoji); onIcon(emoji); }}
          onClose={() => setEmojiAnchor(null)}
        />
      )}
    </div>
  );
}
