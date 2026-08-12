"use client";

import { useEditor, EditorContent, Editor, ReactNodeViewRenderer } from "@tiptap/react";
import { showToast } from "@/lib/ui/toast";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
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
import { createSlashMenuExtension } from "@/components/editor/slash-menu";
import { createMentionExtension, type MentionItem } from "@/components/editor/mention";
import { EmojiPicker } from "@/components/editor/emoji-picker";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Type,
  Table as TableIcon,
  Plus,
  Minus,
  MoreHorizontal,
  Link as LinkIcon,
  Image as ImageIcon,
  Indent,
  Outdent,
  X,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ChevronDown,
  Code,
  Undo2,
  Redo2,
  Pencil,
  CheckSquare,
  Highlighter,
  Check,
  Smile,
  Paperclip,
  Loader2,
} from "lucide-react";
import { useEffect, useCallback, useState, useRef } from "react";
import { FileAttachment } from "@/components/editor/file-attachment";
import { ImageWithDeleteView } from "@/components/editor/image-with-delete-view";

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When true, drops the bordered outer chrome and toolbar background so the
   *  editor renders as a flat strip on top of its parent (used in the docs
   *  popup, where the popup itself is the visual frame). */
  chromeless?: boolean;
  /** Optional content rendered between the toolbar and the editor's content
   *  area — e.g. the page title input on the docs editor. */
  slotBetween?: React.ReactNode;
  /** Optional async uploader. When set, the image-insert button and
   *  drag/paste handlers call this with the chosen File and use the
   *  returned URL as the image src. When unset, the editor falls back to
   *  embedding the file as a data URL (legacy behavior). */
  uploadImage?: (file: File) => Promise<string>;
  /** Optional async uploader for non-image files. When set, an "Attach file"
   *  toolbar button uploads the chosen file and inserts a download chip. */
  uploadFile?: (file: File) => Promise<{ url: string; fileName: string; mimeType: string; size: number }>;
  /** When provided, enables `@`-mention autocomplete over these people. The
   *  saved HTML carries `data-mention-id` chips so the server can notify them. */
  mentions?: MentionItem[];
}

const cn = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Type @ to mention a teammate and notify them about this issue.",
  disabled = false,
  className,
  chromeless = false,
  slotBetween,
  uploadImage,
  uploadFile,
  mentions,
}: RichTextEditorProps) {
  // Keep the latest people list in a ref so the (init-once) editor's mention
  // popup always sees current members, even though they load asynchronously.
  const mentionsRef = useRef<MentionItem[]>(mentions ?? []);
  useEffect(() => {
    mentionsRef.current = mentions ?? [];
  }, [mentions]);
  const [imageUploading, setImageUploading] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [emojiAnchor, setEmojiAnchor] = useState<{ left: number; top: number } | null>(null);
  const handleImageUploadRef = useRef<() => void>(() => {});
  const openEmojiAtCursorRef = useRef<() => void>(() => {});
  const [mediaViewer, setMediaViewer] = useState<{ show: boolean; type: "image" | "video"; src: string }>({
    show: false,
    type: "image",
    src: "",
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      LinkExt.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-blue-600 underline cursor-pointer hover:text-blue-800",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      ImageExt.extend({
        addNodeView() {
          return ReactNodeViewRenderer(ImageWithDeleteView);
        },
      }).configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md cursor-pointer image-element",
        },
      }),
      FileAttachment,
      createSlashMenuExtension({
        onPickImage: () => handleImageUploadRef.current(),
        onPickEmoji: () => openEmojiAtCursorRef.current(),
      }),
      ...(mentions !== undefined
        ? [createMentionExtension(() => mentionsRef.current)]
        : []),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    parseOptions: { preserveWhitespace: "full" },
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
  }, [editor, value]);

  // Image preview + link navigation on click.
  //
  // TipTap's built-in link clickHandler bails when the editor is read-only
  // (`if (!view.editable) return false`), so links never open in the doc
  // *viewer*; and we keep `openOnClick: false` so it doesn't hijack the caret
  // while editing. This DOM-level handler covers both: a left-click on a link
  // opens it in a new tab regardless of editable state.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "IMG" && t.classList.contains("image-element")) {
        e.preventDefault();
        setMediaViewer({ show: true, type: "image", src: (t as HTMLImageElement).src });
        return;
      }
      const anchor = t.closest("a");
      const href = anchor?.getAttribute("href");
      if (e.button === 0 && anchor && href) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    }
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  const insertImageFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (uploadImage) {
        // Optimistic preview: insert the image from a local blob URL so it
        // shows at the cursor INSTANTLY (no network wait), then swap to the
        // uploaded URL in the background. Without this the user stares at a
        // blank gap while the upload + first proxy fetch complete and can't
        // tell whether an image is there at all.
        const localUrl = URL.createObjectURL(file);
        editor.chain().focus().setImage({ src: localUrl }).run();
        setImageUploading(true);

        // Find the placeholder node we just inserted (by its blob src).
        const findImagePos = (src: string): number | null => {
          let pos: number | null = null;
          editor.state.doc.descendants((node, p) => {
            if (pos !== null) return false;
            if (node.type.name === "image" && node.attrs.src === src) {
              pos = p;
              return false;
            }
            return true;
          });
          return pos;
        };

        try {
          const url = await uploadImage(file);
          // Preload the stored (proxied) URL into the browser cache BEFORE
          // swapping, so the swap paints instantly instead of flashing blank
          // while the proxy signs its first S3 GET.
          await new Promise<void>((resolve) => {
            const probe = new window.Image();
            probe.onload = () => resolve();
            probe.onerror = () => resolve();
            probe.src = url;
          });
          const pos = findImagePos(localUrl);
          if (pos !== null) {
            const node = editor.state.doc.nodeAt(pos);
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, src: url }),
            );
          }
        } catch (err) {
          // Remove the placeholder so we never leave a dead blob URL (or, as
          // before, a multi-MB base64 blob) behind, then tell the user.
          const pos = findImagePos(localUrl);
          if (pos !== null) {
            const node = editor.state.doc.nodeAt(pos);
            if (node) editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
          }
          console.error("[rich-text-editor] image upload failed:", err);
          showToast(err instanceof Error ? err.message : "Image upload failed", "error");
        } finally {
          URL.revokeObjectURL(localUrl);
          setImageUploading(false);
        }
        return;
      }
      // Legacy fallback: data URL (used outside the docs editor).
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        if (dataUrl) editor.chain().focus().setImage({ src: dataUrl }).run();
      };
      reader.readAsDataURL(file);
    },
    [editor, uploadImage],
  );

  const handleImageUpload = useCallback(() => {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void insertImageFile(file);
    };
    input.click();
  }, [editor, insertImageFile]);

  // Attach a non-image file: upload, then insert a download chip. Surfaces the
  // server's error (unsupported type / too large) as a toast.
  const [fileUploading, setFileUploading] = useState(false);
  // Progress for the inline "Uploading…" banner (current index / total).
  const [fileProgress, setFileProgress] = useState<{ done: number; total: number } | null>(null);
  // Upload + insert one or more files. Uploaded sequentially so insertion order
  // matches selection order and we don't fire many parallel GCS requests; each
  // file's own error surfaces as a toast without aborting the rest.
  const insertFiles = useCallback(
    async (files: File[]) => {
      if (!editor || !uploadFile || files.length === 0) return;
      setFileUploading(true);
      setFileProgress({ done: 0, total: files.length });
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]!;
          try {
            const { url, fileName, mimeType, size } = await uploadFile(file);
            editor.chain().focus().setFileAttachment({ href: url, fileName, mimeType, size }).run();
          } catch (err: unknown) {
            showToast(
              err instanceof Error ? err.message : `Couldn't upload ${file.name}`,
              "error",
            );
          }
          setFileProgress({ done: i + 1, total: files.length });
        }
      } finally {
        setFileUploading(false);
        setFileProgress(null);
      }
    },
    [editor, uploadFile],
  );

  const handleFileUpload = useCallback(() => {
    if (!editor || !uploadFile) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept =
      ".pdf,.csv,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*,application/pdf,text/csv,text/plain,application/zip";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length) void insertFiles(files);
    };
    input.click();
  }, [editor, uploadFile, insertFiles]);

  const openEmojiPicker = useCallback(
    (anchorEl?: HTMLElement | null) => {
      if (!editor) return;
      let rect: DOMRect | null = null;
      if (anchorEl) {
        rect = anchorEl.getBoundingClientRect();
      } else {
        try {
          const { from } = editor.state.selection;
          rect = editor.view.coordsAtPos(from) as unknown as DOMRect;
        } catch {
          rect = null;
        }
      }
      const left = rect ? (rect.left ?? 0) : 100;
      const top = rect ? (rect.bottom ?? rect.top ?? 0) + 4 : 100;
      setEmojiAnchor({ left, top });
    },
    [editor],
  );

  // Keep refs current so the slash-menu extension (registered once at editor
  // boot) can reach the latest handlers without re-creating the editor.
  useEffect(() => {
    handleImageUploadRef.current = handleImageUpload;
  }, [handleImageUpload]);
  useEffect(() => {
    openEmojiAtCursorRef.current = () => openEmojiPicker(null);
  }, [openEmojiPicker]);

  // Drag-and-drop + paste image support — only when an uploader is wired
  // (data-URL embedding is fine for the toolbar button, but we don't want
  // to silently inflate doc HTML on every paste).
  useEffect(() => {
    if (!editor || !uploadImage) return;
    const dom = editor.view.dom as HTMLElement;
    function onDrop(e: DragEvent) {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      e.preventDefault();
      files.forEach((f) => void insertImageFile(f));
    }
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const fileItems = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
      if (fileItems.length === 0) return;
      e.preventDefault();
      fileItems.forEach((it) => {
        const f = it.getAsFile();
        if (f) void insertImageFile(f);
      });
    }
    dom.addEventListener("drop", onDrop);
    dom.addEventListener("paste", onPaste);
    return () => {
      dom.removeEventListener("drop", onDrop);
      dom.removeEventListener("paste", onPaste);
    };
  }, [editor, uploadImage, insertImageFile]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setLinkText(editor.state.doc.textBetween(from, to, ""));
    const prev = editor.getAttributes("link").href as string | undefined;
    setLinkUrl(prev ?? "");
    setShowLinkDialog(true);
  }, [editor]);

  const insertLink = useCallback(() => {
    if (!editor) return;
    if (!linkUrl) {
      setShowLinkDialog(false);
      return;
    }
    if (linkText) {
      editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    }
    setShowLinkDialog(false);
    setLinkUrl("");
    setLinkText("");
  }, [editor, linkUrl, linkText]);

  if (!editor) {
    return (
      <div className="border border-gray-300 rounded">
        <div className="h-9 border-b border-gray-200 bg-gray-50" />
        <div className="min-h-[120px] px-3 py-2 text-sm text-gray-400">{placeholder}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full bg-white",
        chromeless ? "" : "rounded-md border border-gray-300",
        chromeless ? "" : "focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {/* Toolbar */}
      <div className={cn(
        "py-1.5 flex flex-wrap items-center gap-0.5",
        chromeless ? "px-10 bg-transparent" : "px-1.5 border-b border-gray-200 bg-gray-50 rounded-t-md",
      )}>
        <FormatDropdown editor={editor} disabled={disabled} />
        <Divider />
        <TextStyleDropdown editor={editor} disabled={disabled} />
        <Divider />
        <TbBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
        >
          <Quote className="h-4 w-4" />
        </TbBtn>
        <Divider />
        <AlignDropdown editor={editor} disabled={disabled} />
        <Divider />
        <ListMenu editor={editor} />
        <ColorMenu editor={editor} />
        <Divider />
        <TableMenu editor={editor} />
        <Divider />
        <TbBtn onClick={openLinkDialog} active={editor.isActive("link")} title="Insert link">
          <LinkIcon className="h-4 w-4" />
        </TbBtn>
        <TbBtn
          onClick={handleImageUpload}
          title={imageUploading ? "Uploading…" : "Insert image"}
          disabled={imageUploading}
        >
          <ImageIcon className={cn("h-4 w-4", imageUploading && "opacity-50 animate-pulse")} />
        </TbBtn>
        {uploadFile && (
          <TbBtn
            onClick={handleFileUpload}
            title={fileUploading ? "Uploading…" : "Attach file"}
            disabled={fileUploading}
          >
            <Paperclip className={cn("h-4 w-4", fileUploading && "opacity-50 animate-pulse")} />
          </TbBtn>
        )}
        <TbBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code block"
        >
          <Code className="h-4 w-4" />
        </TbBtn>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => openEmojiPicker(e.currentTarget)}
          title="Insert emoji"
          className="inline-flex items-center justify-center h-7 w-7 rounded text-gray-600 hover:bg-gray-200"
        >
          <Smile className="h-4 w-4" />
        </button>
        <Divider />
        <TbBtn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo2 className="h-4 w-4" />
        </TbBtn>
        <TbBtn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo2 className="h-4 w-4" />
        </TbBtn>

      </div>

      {/* Optional slot between the toolbar and the editor (used by the docs
          popup to insert the page title between toolbar and body). */}
      {slotBetween}

      {/* Editor content */}
      <EditorContent
        editor={editor}
        className={cn(
          "prose max-w-none py-2 rounded-b-md",
          chromeless ? "prose-base px-10" : "prose-sm px-3",
          chromeless
            ? "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:text-[15px] [&_.ProseMirror]:leading-7"
            : "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[120px] [&_.ProseMirror]:text-sm",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          chromeless
            ? "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-500"
            : "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
          // Tables
          "[&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:table-fixed [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:my-3 [&_.ProseMirror_table]:border [&_.ProseMirror_table]:border-gray-400",
          "[&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-gray-300 [&_.ProseMirror_td]:p-2 [&_.ProseMirror_td]:relative [&_.ProseMirror_td]:min-w-[80px]",
          "[&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-gray-300 [&_.ProseMirror_th]:p-2 [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_th]:bg-gray-50",
          // Lists
          "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:my-2",
          "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:my-2",
          "[&_.ProseMirror_li]:my-1",
          // Headings
          "[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-3",
          "[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-3",
          "[&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:my-2",
          // Blockquote
          "[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-blue-300 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:py-1 [&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-gray-600",
          // Code
          "[&_.ProseMirror_pre]:bg-gray-900 [&_.ProseMirror_pre]:text-gray-100 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:rounded [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:text-xs [&_.ProseMirror_pre]:overflow-x-auto",
          "[&_.ProseMirror_code]:bg-gray-100 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-xs",
          // Reset inline-code styling when nested inside a code block <pre>.
          "[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:px-0 [&_.ProseMirror_pre_code]:text-inherit [&_.ProseMirror_pre_code]:rounded-none",
          // Image
          "[&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:rounded-md [&_.ProseMirror_img]:my-2",
        )}
      />

      {/* Upload progress banner — visible while files (or an image) upload, so
          it's clear something is happening (esp. for multi-file selections). */}
      {(fileUploading || imageUploading) && (
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded px-3 py-1.5 mb-2",
            chromeless ? "mx-10" : "mx-3",
          )}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          {fileProgress
            ? `Uploading ${fileProgress.done}/${fileProgress.total} file${fileProgress.total === 1 ? "" : "s"}…`
            : "Uploading…"}
        </div>
      )}

      {/* Link dialog */}
      {showLinkDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white border border-gray-300 rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-semibold mb-4">Insert link</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link text (optional)</label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Link text"
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowLinkDialog(false)}
                className="h-8 px-3 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={insertLink}
                disabled={!linkUrl}
                className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
              >
                Insert link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emoji picker */}
      <EmojiPicker
        anchor={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        onSelect={(emoji) => editor.chain().focus().insertContent(emoji).run()}
      />

      {/* Media viewer */}
      {mediaViewer.show && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4"
          onClick={() => setMediaViewer({ show: false, type: "image", src: "" })}
        >
          <button
            type="button"
            onClick={() => setMediaViewer({ show: false, type: "image", src: "" })}
            className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={mediaViewer.src}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ────────── Toolbar building blocks ────────── */

function TbBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center h-7 w-7 rounded text-gray-600 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-blue-600 text-white hover:bg-blue-700",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-300" />;
}

function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onClose]);
  return ref;
}

function FormatDropdown({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const current = (() => {
    for (const l of [1, 2, 3, 4, 5, 6] as const) {
      if (editor.isActive("heading", { level: l })) {
        const Icon = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6][l - 1];
        return { Icon, label: `Heading ${l}` };
      }
    }
    if (editor.isActive("blockquote")) return { Icon: Quote, label: "Quote" };
    return { Icon: Type, label: "Normal text" };
  })();

  const items: { Icon: React.ElementType; label: string; onClick: () => void; active: boolean }[] = [
    {
      Icon: Type,
      label: "Normal text",
      onClick: () => editor.chain().focus().setParagraph().run(),
      active: !editor.isActive("heading") && !editor.isActive("blockquote"),
    },
    ...([1, 2, 3, 4, 5, 6] as const).map((l) => ({
      Icon: [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6][l - 1]!,
      label: `Heading ${l}`,
      onClick: () => editor.chain().focus().toggleHeading({ level: l }).run(),
      active: editor.isActive("heading", { level: l }),
    })),
    {
      Icon: Quote,
      label: "Quote",
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive("blockquote"),
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center justify-between h-7 px-2 min-w-[140px] text-xs text-gray-700 hover:bg-gray-200 rounded"
      >
        <span className="inline-flex items-center gap-1.5">
          <current.Icon className="h-3.5 w-3.5" />
          {current.label}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[180px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                it.onClick();
                setOpen(false);
              }}
              className={cn(
                "flex items-center w-full gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50",
                it.active && "bg-blue-50 text-blue-700",
              )}
            >
              <it.Icon className="h-3.5 w-3.5" />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextStyleDropdown({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const anyActive =
    editor.isActive("bold") ||
    editor.isActive("italic") ||
    editor.isActive("underline") ||
    editor.isActive("strike");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2 rounded text-gray-600 hover:bg-gray-200",
          anyActive && "bg-blue-600 text-white hover:bg-blue-700",
        )}
      >
        <Bold className="h-3.5 w-3.5" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
          <DDItem
            Icon={Bold}
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => {
              editor.chain().focus().toggleBold().run();
              setOpen(false);
            }}
          />
          <DDItem
            Icon={Italic}
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => {
              editor.chain().focus().toggleItalic().run();
              setOpen(false);
            }}
          />
          <DDItem
            Icon={UnderlineIcon}
            label="Underline"
            active={editor.isActive("underline")}
            onClick={() => {
              editor.chain().focus().toggleUnderline().run();
              setOpen(false);
            }}
          />
          <DDItem
            Icon={Strikethrough}
            label="Strikethrough"
            active={editor.isActive("strike")}
            onClick={() => {
              editor.chain().focus().toggleStrike().run();
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function AlignDropdown({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));

  const Curr = editor.isActive({ textAlign: "center" })
    ? AlignCenter
    : editor.isActive({ textAlign: "right" })
      ? AlignRight
      : editor.isActive({ textAlign: "justify" })
        ? AlignJustify
        : AlignLeft;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1 h-7 px-2 rounded text-gray-600 hover:bg-gray-200"
        title="Text alignment"
      >
        <Curr className="h-3.5 w-3.5" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[140px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1">
          {(
            [
              { Icon: AlignLeft, label: "Left", value: "left" },
              { Icon: AlignCenter, label: "Center", value: "center" },
              { Icon: AlignRight, label: "Right", value: "right" },
              { Icon: AlignJustify, label: "Justify", value: "justify" },
            ] as const
          ).map((a) => (
            <DDItem
              key={a.value}
              Icon={a.Icon}
              label={a.label}
              active={editor.isActive({ textAlign: a.value })}
              onClick={() => {
                editor.chain().focus().setTextAlign(a.value).run();
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DDItem({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex items-center w-full gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50",
        active && "bg-blue-50 text-blue-700",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const inTable = editor.isActive("table");
  function run(fn: () => void) {
    fn();
    setOpen(false);
  }
  return (
    <div className="relative" ref={ref}>
      <TbBtn onClick={() => setOpen((v) => !v)} active={inTable} title="Table">
        <TableIcon className="h-4 w-4" />
      </TbBtn>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-[210px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1 text-sm">
          <DDRow
            onClick={() =>
              run(() =>
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
              )
            }
          >
            <TableIcon className="h-3.5 w-3.5" /> Insert table
          </DDRow>
          {inTable && (
            <>
              <DDRow onClick={() => run(() => editor.chain().focus().fixTables().run())}>
                <Pencil className="h-3.5 w-3.5" /> Edit table
              </DDRow>
              <Sep />
              <DDRow onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}>
                <Plus className="h-3.5 w-3.5" /> Insert column before
              </DDRow>
              <DDRow onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>
                <Plus className="h-3.5 w-3.5" /> Insert column after
              </DDRow>
              <DDRow
                onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
                danger
              >
                <Minus className="h-3.5 w-3.5" /> Delete column
              </DDRow>
              <Sep />
              <DDRow onClick={() => run(() => editor.chain().focus().addRowBefore().run())}>
                <Plus className="h-3.5 w-3.5" /> Insert row before
              </DDRow>
              <DDRow onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>
                <Plus className="h-3.5 w-3.5" /> Insert row after
              </DDRow>
              <DDRow onClick={() => run(() => editor.chain().focus().deleteRow().run())} danger>
                <Minus className="h-3.5 w-3.5" /> Delete row
              </DDRow>
              <Sep />
              <DDRow onClick={() => run(() => editor.chain().focus().mergeCells().run())}>
                <Plus className="h-3.5 w-3.5" /> Merge cells
              </DDRow>
              <DDRow onClick={() => run(() => editor.chain().focus().splitCell().run())}>
                <Minus className="h-3.5 w-3.5" /> Split cell
              </DDRow>
              <Sep />
              <DDRow
                onClick={() => run(() => editor.chain().focus().deleteTable().run())}
                danger
              >
                <Minus className="h-3.5 w-3.5" /> Delete table
              </DDRow>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ListMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  const isAny =
    editor.isActive("bulletList") || editor.isActive("orderedList");
  function run(fn: () => void) {
    fn();
    setOpen(false);
  }
  return (
    <div className="relative" ref={ref}>
      <TbBtn onClick={() => setOpen((v) => !v)} active={isAny} title="Lists">
        <List className="h-4 w-4" />
      </TbBtn>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded shadow-lg z-50 py-1 text-sm">
          <DDRow
            onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}
            shortcut="Ctrl+Shift+8"
          >
            <List className="h-3.5 w-3.5" /> Bulleted list
          </DDRow>
          <DDRow
            onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}
            shortcut="Ctrl+Shift+7"
          >
            <ListOrdered className="h-3.5 w-3.5" /> Numbered list
          </DDRow>
          <DDRow
            onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}
            shortcut="Ctrl+Shift+6"
          >
            <CheckSquare className="h-3.5 w-3.5" /> Task list
          </DDRow>
          <Sep />
          <DDRow
            onClick={() => run(() => editor.chain().focus().liftListItem("listItem").run())}
            shortcut="Shift+Tab"
          >
            <Outdent className="h-3.5 w-3.5" /> Outdent
          </DDRow>
          <DDRow
            onClick={() => run(() => editor.chain().focus().sinkListItem("listItem").run())}
            shortcut="Tab"
          >
            <Indent className="h-3.5 w-3.5" /> Indent
          </DDRow>
        </div>
      )}
    </div>
  );
}

function DDRow({
  children,
  onClick,
  danger,
  shortcut,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-gray-50",
        danger ? "text-red-600 hover:bg-red-50" : "text-gray-800",
      )}
    >
      <span className="inline-flex items-center gap-2">{children}</span>
      {shortcut && <span className="text-[10px] text-gray-400 ml-2">{shortcut}</span>}
    </button>
  );
}

function Sep() {
  return <div className="my-1 h-px bg-gray-100" />;
}

const TEXT_COLORS = [
  "#000000", "#1d4ed8", "#0f766e", "#dc2626", "#6b7280", "#2563eb",
  "#06b6d4", "#10b981", "#f59e0b", "#b91c1c", "#ffffff", "#a5f3fc",
  "#bae6fd", "#a7f3d0", "#fde68a", "#fca5a5", "#bae6fd",
];

const HIGHLIGHT_COLORS = [
  "#f3f4f6", "#ede9fe", "#fef3c7", "#dcfce7", "#dbeafe", "#3b82f6", "#a7f3d0",
];

function ColorMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <TbBtn onClick={() => setOpen((v) => !v)} title="Text color">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gray-300 text-[10px] font-semibold">
          A
        </span>
      </TbBtn>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded-md shadow-lg z-50 p-3">
          <div className="text-xs font-semibold text-gray-900 mb-2">Text color</div>
          <div className="grid grid-cols-6 gap-2 mb-3">
            {TEXT_COLORS.map((c) => {
              const active = editor.getAttributes("textStyle")?.color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setOpen(false);
                  }}
                  className="h-7 w-7 rounded border border-gray-200 flex items-center justify-center"
                  style={{ background: c }}
                  aria-label={`Text color ${c}`}
                >
                  {active && (
                    <Check
                      className="h-3.5 w-3.5"
                      style={{ color: c === "#ffffff" ? "#111" : "#fff" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-900 mb-2">
            <Highlighter className="h-3.5 w-3.5" />
            Highlight color
          </div>
          <div className="grid grid-cols-7 gap-2 mb-3">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().toggleHighlight({ color: c }).run();
                  setOpen(false);
                }}
                className="h-7 w-7 rounded border border-gray-200 flex items-center justify-center"
                style={{ background: c }}
                aria-label={`Highlight color ${c}`}
              >
                <Highlighter className="h-3 w-3 text-gray-700/60" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().unsetColor().unsetHighlight().run();
              setOpen(false);
            }}
            className="w-full h-8 text-xs text-gray-700 bg-gray-50 hover:bg-gray-100 rounded"
          >
            Remove color
          </button>
        </div>
      )}
    </div>
  );
}
