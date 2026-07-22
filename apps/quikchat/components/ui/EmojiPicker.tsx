import * as React from "react";

export interface EmojiPickerProps {
  emojis: readonly string[];
  /** Maps an emoji to its accessible label (e.g. "Thumbs up"). */
  nameOf: (emoji: string) => string;
  onSelect: (emoji: string) => void;
}

/** Small fixed quick-reaction palette (no heavy emoji library). */
export function EmojiPicker({ emojis, nameOf, onSelect }: EmojiPickerProps) {
  return (
    <div className="qc-emoji-grid" role="menu" aria-label="Add reaction">
      {emojis.map((e) => (
        <button
          key={e}
          type="button"
          role="menuitem"
          className="qc-emoji-btn"
          aria-label={nameOf(e)}
          title={nameOf(e)}
          onClick={() => onSelect(e)}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
