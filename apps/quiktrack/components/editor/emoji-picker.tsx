"use client";

import { useEffect, useRef } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Anchor coordinates (page-relative) — picker positions itself just below. */
  anchor: { left: number; top: number } | null;
}

interface PickedEmoji {
  native?: string;
  shortcodes?: string;
}

export function EmojiPicker({ onSelect, onClose, anchor }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  if (!anchor) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[80] shadow-xl rounded-lg overflow-hidden"
      style={{ left: anchor.left, top: anchor.top }}
    >
      <Picker
        data={data}
        onEmojiSelect={(e: PickedEmoji) => {
          if (e.native) onSelect(e.native);
          onClose();
        }}
        theme="light"
        previewPosition="none"
        skinTonePosition="search"
      />
    </div>
  );
}
