"use client";

/**
 * RichTextEditor — small contentEditable-based WYSIWYG box (bold,
 * italic, underline, bullet/numbered lists) with no external
 * dependency. Stores/emits its content as HTML.
 *
 * Uses `document.execCommand` — deprecated but still universally
 * supported in every browser this app targets, and the standard,
 * lightest-weight way to get basic formatting without pulling in a
 * full editor framework (Tiptap/Quill/Slate) for what's a single
 * Terms & Conditions box.
 *
 * The editable div stays uncontrolled (writing `value` on every
 * keystroke would clobber the caret, same reasoning as the cover-email
 * editor in `RfqSubmitPreviewModal`) — it's re-seeded only when `value`
 * changes from OUTSIDE (e.g. picking a different template), tracked via
 * `seededValue`.
 */

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Eraser } from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  minHeight = 220,
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const seededValue = useRef<string | null>(null);
  const [empty, setEmpty] = useState(!value?.trim());

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    if (seededValue.current === value) return;
    node.innerHTML = value ?? "";
    seededValue.current = value;
    setEmpty(!(value ?? "").trim());
  }, [value]);

  const emit = () => {
    const node = editorRef.current;
    if (!node) return;
    const html = node.innerHTML;
    seededValue.current = html;
    setEmpty(!node.textContent?.trim());
    onChange(html);
  };

  const exec = (command: string, arg?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  return (
    <div className="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-1 focus-within:ring-accent-400 focus-within:border-accent-400">
      <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
        <ToolbarButton title="Bold" onClick={() => exec("bold")} disabled={disabled}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Italic" onClick={() => exec("italic")} disabled={disabled}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Underline" onClick={() => exec("underline")} disabled={disabled}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-gray-200" />
        <ToolbarButton
          title="Bullet list"
          onClick={() => exec("insertUnorderedList")}
          disabled={disabled}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          onClick={() => exec("insertOrderedList")}
          disabled={disabled}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-gray-200" />
        <ToolbarButton
          title="Clear formatting"
          onClick={() => exec("removeFormat")}
          disabled={disabled}
        >
          <Eraser className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="relative">
        {empty && placeholder && (
          <div className="pointer-events-none absolute left-3 top-2 text-xs text-gray-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          style={{ minHeight }}
          className="px-3 py-2 text-xs leading-relaxed text-gray-800 outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      // Prevent the editable div from losing focus/selection before
      // the command runs — execCommand acts on the current selection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="rounded p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-800 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}