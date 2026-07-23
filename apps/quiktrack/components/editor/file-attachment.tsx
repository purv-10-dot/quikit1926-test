"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FileAttachmentView } from "./file-attachment-view";

export interface FileAttachmentAttrs {
  href: string;
  fileName: string;
  mimeType?: string | null;
  /** Size in bytes. */
  size?: number | null;
  /** ISO timestamp when the file was attached. */
  uploadedAt?: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileAttachment: {
      /** Insert a downloadable file-attachment chip at the cursor. */
      setFileAttachment: (attrs: FileAttachmentAttrs) => ReturnType;
    };
  }
}

function humanSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Inline, atomic file-attachment node. Serializes to a single
 * `<a download data-file-*>` so it survives `sanitizeRichText` (the `download`
 * and `data-file-*` attributes are allow-listed there). Styled as a chip via
 * the `.qt-file-chip` class in globals.css; on read-only render the same anchor
 * is a clickable download link.
 */
export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: "",
        parseHTML: (el) => el.getAttribute("href") ?? "",
        renderHTML: (attrs) => (attrs.href ? { href: attrs.href } : {}),
      },
      fileName: {
        default: "file",
        parseHTML: (el) => {
          const attr = el.getAttribute("data-file-name");
          if (attr) return attr;
          // Older chips: text label is "name · size" — take the name part.
          const label = (el.textContent ?? "").trim();
          if (label.includes(" · ")) return label.slice(0, label.lastIndexOf(" · ")).trim();
          return label || "file";
        },
        renderHTML: (attrs) => ({ "data-file-name": attrs.fileName ?? "file" }),
      },
      mimeType: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-mime"),
        renderHTML: (attrs) => (attrs.mimeType ? { "data-file-mime": attrs.mimeType } : {}),
      },
      size: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-file-size");
          const n = raw ? Number(raw) : NaN;
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) =>
          typeof attrs.size === "number" ? { "data-file-size": String(attrs.size) } : {},
      },
      uploadedAt: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-file-uploaded"),
        renderHTML: (attrs) =>
          attrs.uploadedAt ? { "data-file-uploaded": String(attrs.uploadedAt) } : {},
      },
    };
  },

  parseHTML() {
    // Match the newer `data-file-name` chips AND older `class="qt-file-chip"`
    // chips (which have only href + a "name · size" text label).
    return [{ tag: "a[data-file-name]" }, { tag: "a.qt-file-chip" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const name = String(node.attrs.fileName ?? "file");
    const size = humanSize(node.attrs.size as number | null);
    const label = size ? `${name} · ${size}` : name;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "qt-file-chip",
        download: name,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
        // Full filename on hover — the card face truncates long names.
        title: name,
      }),
      label,
    ];
  },

  renderText({ node }) {
    return `[${node.attrs.fileName ?? "file"}]`;
  },

  addCommands() {
    return {
      setFileAttachment:
        (attrs: FileAttachmentAttrs) =>
        ({ chain }) =>
          chain()
            .focus()
            .insertContent({
              type: this.name,
              attrs: {
                href: attrs.href,
                fileName: attrs.fileName,
                mimeType: attrs.mimeType ?? null,
                size: attrs.size ?? null,
                // Stamp the attach time so cards can show "uploaded at".
                uploadedAt: attrs.uploadedAt ?? new Date().toISOString(),
              },
            })
            // Trailing space so the cursor lands after the chip, not inside it.
            .insertContent(" ")
            .run(),
    };
  },

  /**
   * In-editor display only. parseHTML/renderHTML above are untouched, so the
   * node still loads from the stored `<a data-file-*>` and serializes back to
   * it — the NodeView just controls how it LOOKS while editing (a card matching
   * the read-only AttachmentCard).
   */
  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentView);
  },
});
