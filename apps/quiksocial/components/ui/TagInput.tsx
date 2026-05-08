"use client";

import { useState, KeyboardEvent } from "react";
import { X } from "lucide-react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

export default function TagInput({
  tags,
  onChange,
  placeholder = "Add tag…",
  maxTags = 20,
}: Props) {
  const [input, setInput] = useState("");

  function addTag(raw: string) {
    const val = raw.trim();
    if (!val || tags.includes(val) || tags.length >= maxTags) return;
    onChange([...tags, val]);
    setInput("");
  }

  function removeTag(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 10,
        padding: "8px 10px",
        minHeight: 42,
        cursor: "text",
      }}
      onClick={() => {
        (document.activeElement as HTMLElement)?.blur?.();
        document.querySelector<HTMLInputElement>(".tag-input-field")?.focus();
      }}
    >
      {tags.map((tag, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 10px",
            borderRadius: 20,
            background: "linear-gradient(135deg, #F472B6, #FB923C)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {tag}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "rgba(255,255,255,0.75)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        className="tag-input-field"
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ""}
        style={{
          flex: 1,
          minWidth: 80,
          background: "none",
          border: "none",
          outline: "none",
          color: "#fff",
          fontSize: 13,
          padding: "2px 0",
        }}
      />
    </div>
  );
}
