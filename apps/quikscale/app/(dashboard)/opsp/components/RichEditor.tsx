"use client";

/**
 * OPSP shared form primitives — extracted from the 2225-line `page.tsx`
 * monolith as part of the §7 decomposition sweep.
 *
 * Exports:
 *   - `FInput` / `FTextarea` — thin Tailwind-styled input/textarea wrappers
 *   - `TBtn` / `Sep`         — editor toolbar button + separator
 *   - `RichToolbar`          — contentEditable toolbar (bold/italic/…)
 *   - `RichEditor`           — contentEditable wrapper combining toolbar + editor
 *
 * These components have zero dependency on OPSP form state — they are
 * pure presentational primitives driven by props, safe to extract.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";

/* ── Basic inputs ── */

export function FInput({
  value,
  onChange,
  placeholder = "Input text",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white",
        className,
      )}
    />
  );
}

export function FTextarea({
  value,
  onChange,
  placeholder = "Input text",
  rows = 4,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "w-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none bg-white",
        className,
      )}
    />
  );
}

/* ── Toolbar button ── */

export function TBtn({
  icon,
  onMouseDown,
  active = false,
  title,
}: {
  icon: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent) => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        "h-6 w-6 flex items-center justify-center rounded transition-colors",
        active ? "bg-accent-100 text-accent-700" : "text-gray-600 hover:bg-gray-100",
      )}
      onMouseDown={onMouseDown}
    >
      {icon}
    </button>
  );
}

export function Sep() {
  return <span className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0" />;
}

const ALIGN_OPTIONS: {
  label: string;
  cmd: string;
  Icon: React.FC<{ className?: string }>;
}[] = [
  { label: "Left", cmd: "justifyLeft", Icon: AlignLeft },
  { label: "Center", cmd: "justifyCenter", Icon: AlignCenter },
  { label: "Right", cmd: "justifyRight", Icon: AlignRight },
  { label: "Justify", cmd: "justifyFull", Icon: AlignJustify },
];

/* ── Rich Toolbar ── */

export function RichToolbar({
  editorRef,
}: {
  editorRef: React.RefObject<HTMLDivElement>;
}) {
  const [states, setStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    insertUnorderedList: false,
    insertOrderedList: false,
    justifyLeft: true,
    justifyCenter: false,
    justifyRight: false,
    justifyFull: false,
  });
  const [alignOpen, setAlignOpen] = useState(false);

  // Poll active formatting states whenever selection changes
  const syncStates = useCallback(() => {
    try {
      setStates({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
        justifyFull: document.queryCommandState("justifyFull"),
      });
    } catch {
      /* ignore in SSR/unsupported */
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", syncStates);
    return () => document.removeEventListener("selectionchange", syncStates);
  }, [syncStates]);

  const exec = useCallback(
    (cmd: string, val?: string) => {
      if (editorRef.current) editorRef.current.focus();
      document.execCommand(cmd, false, val ?? undefined);
      requestAnimationFrame(syncStates);
    },
    [editorRef, syncStates],
  );

  const currentAlignIcon =
    ALIGN_OPTIONS.find((a) => states[a.cmd as keyof typeof states])?.Icon ??
    AlignLeft;
  const CurrentAlignIcon = currentAlignIcon;

  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 pb-1.5 mb-2 overflow-x-auto flex-nowrap scrollbar-none">
      <TBtn
        title="Undo (Ctrl+Z)"
        icon={<Undo2 className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("undo");
        }}
      />
      <TBtn
        title="Redo (Ctrl+Y)"
        icon={<Redo2 className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("redo");
        }}
      />
      <Sep />

      {/* Alignment dropdown */}
      <div className="relative">
        <button
          type="button"
          title="Text alignment"
          className="flex items-center gap-0.5 h-6 px-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
          onMouseDown={(e) => {
            e.preventDefault();
            setAlignOpen((o) => !o);
          }}
        >
          <CurrentAlignIcon className="h-3 w-3" />
          <ChevronDown className="h-3 w-3" />
        </button>
        {alignOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onMouseDown={() => setAlignOpen(false)}
            />
            <div className="absolute top-full left-0 z-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[110px]">
              {ALIGN_OPTIONS.map(({ label, cmd, Icon }) => (
                <button
                  key={cmd}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50",
                    states[cmd as keyof typeof states]
                      ? "text-accent-600 font-semibold"
                      : "text-gray-700",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec(cmd);
                    setAlignOpen(false);
                  }}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <Sep />

      <TBtn
        title="Bold (Ctrl+B)"
        active={states.bold}
        icon={<Bold className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("bold");
        }}
      />
      <TBtn
        title="Italic (Ctrl+I)"
        active={states.italic}
        icon={<Italic className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("italic");
        }}
      />
      <TBtn
        title="Underline (Ctrl+U)"
        active={states.underline}
        icon={<Underline className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("underline");
        }}
      />
      <TBtn
        title="Strikethrough"
        active={states.strikeThrough}
        icon={<Strikethrough className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("strikeThrough");
        }}
      />
      <Sep />

      <TBtn
        title="Bullet list"
        active={states.insertUnorderedList}
        icon={<List className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("insertUnorderedList");
        }}
      />
      <TBtn
        title="Numbered list"
        active={states.insertOrderedList}
        icon={<ListOrdered className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          exec("insertOrderedList");
        }}
      />
      <Sep />

      <TBtn
        title="Block quote"
        icon={<Quote className="h-3.5 w-3.5" />}
        onMouseDown={(e) => {
          e.preventDefault();
          const current = document
            .queryCommandValue("formatBlock")
            .toLowerCase();
          exec("formatBlock", current === "blockquote" ? "p" : "blockquote");
        }}
      />
    </div>
  );
}

/* ── Rich Editor (contentEditable) ── */

export function RichEditor({
  value,
  onChange,
  placeholder = "Input text",
  className,
  resetKey,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  resetKey?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(
    !value || value === "" || value === "<br>",
  );

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || "";
      setIsEmpty(!value || value === "" || value === "<br>");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    onChange(html);
    setIsEmpty(!html || html === "<br>" || html === "<div><br></div>");
  };

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <RichToolbar editorRef={editorRef} />
      <div className="relative flex-1 min-h-[80px]">
        {isEmpty && (
          <span className="absolute inset-0 px-3 py-2 text-sm text-gray-400 pointer-events-none select-none">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          style={{ minHeight: "inherit" }}
          className="rich-editor w-full h-full border border-gray-200 rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white overflow-y-auto"
        />
      </div>
    </div>
  );
}
