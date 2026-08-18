"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";

/**
 * In-editor display of an image node with a hover "remove" button, so an
 * image attached while composing a description/comment can be discarded
 * before saving. parseHTML/renderHTML on the base Image extension are
 * unchanged — this NodeView only controls how it looks while editing.
 */
export function ImageWithDeleteView({ node, deleteNode, editor }: NodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = (node.attrs.alt as string | null) ?? "";

  return (
    <NodeViewWrapper className="qt-image-nodeview relative inline-block group" contentEditable={false}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-w-full h-auto rounded-md cursor-pointer image-element" />
      {editor.isEditable && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          aria-label="Remove image"
          title="Remove image"
          className="absolute right-1 top-1 z-10 rounded-full bg-black/60 hover:bg-black/80 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </NodeViewWrapper>
  );
}
