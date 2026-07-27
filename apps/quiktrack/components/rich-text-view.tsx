"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import { useEffect } from "react";
import { FileAttachment } from "@/components/editor/file-attachment";

/**
 * Read-only renderer for issue/description rich text. Uses the SAME TipTap
 * extensions as the editor — crucially the FileAttachment node + its NodeView —
 * so file attachments render as the exact same cards inline, making read mode
 * identical to edit mode (Jira-style). No toolbar, not editable.
 *
 * Replaces `dangerouslySetInnerHTML` for descriptions so the file cards render
 * in place instead of being stripped/shown separately.
 */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      LinkExt.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "text-blue-600 underline hover:text-blue-800",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      ImageExt.configure({
        HTMLAttributes: { class: "max-w-full h-auto rounded-md image-element" },
      }),
      FileAttachment,
    ],
    content: html || "",
    immediatelyRender: false,
  });

  // Keep the rendered content in sync if the source html changes.
  useEffect(() => {
    if (editor && html !== editor.getHTML()) {
      editor.commands.setContent(html || "", false);
    }
  }, [editor, html]);

  if (!editor) return null;
  return <EditorContent editor={editor} className={className} />;
}
