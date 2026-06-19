"use client";

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor";

/**
 * Lazy boundary around {@link RichTextEditor}.
 *
 * The editor pulls in ~17 tiptap packages plus the slash-menu, mention, and
 * emoji-picker extensions — collectively the single largest chunk in the app.
 * Importing it directly forced that weight into the initial bundle of every
 * route that renders an editor surface (board, backlog, list, work item, docs).
 *
 * Import the editor from here instead of `./rich-text-editor` so the heavy
 * chunk is code-split and only fetched when an editor actually mounts. The
 * editor is client-only anyway (tiptap's `useEditor` has no meaningful SSR), so
 * `ssr: false` costs nothing beyond a brief mount-time placeholder.
 */
export const RichTextEditor = dynamic<RichTextEditorProps>(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false },
);
