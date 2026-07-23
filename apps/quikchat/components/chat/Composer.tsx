"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { MentionRefInput } from "@/lib/shared";
import {
  Bold,
  Code,
  FileText,
  IconButton,
  Italic,
  Paperclip,
  Popover,
  Send,
  Smile,
  Strikethrough,
  Type,
  useToast,
  X,
} from "@/components/ui";
import { computeMentions, findMentionQuery, type MentionMember } from "@/lib/mentions";
import { serializeToMarkdown } from "@/lib/tiptap-markdown";

// Full emoji picker (search + categories + skin tones), lazy-loaded so the heavy
// emoji dataset only ships when the user actually opens the picker.
const EmojiMartPicker = lazy(() => import("@emoji-mart/react"));
import type { MediaMeta } from "@/lib/server/storage/types";
import { uploadFile, validateFile } from "@/lib/upload";

export interface ComposerProps {
  members: MentionMember[];
  onSend: (content: string, mentions: MentionRefInput[]) => void;
  /** Fired (debounced to ≤ once/3s) while the user is actively typing. */
  onTyping?: () => void;
  /** Channel id — required for the attach/upload flow. */
  channelId?: string;
  /** Send a Media message after a successful upload (with a local preview URL). */
  onSendMedia?: (media: MediaMeta, caption: string, localUrl: string) => void;
  /** Invoke the AI assistant (triggered by a `/ai` or `/ask` slash-command). */
  onAssist?: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/** Detect a `/ai …` or `/ask …` slash-command; returns the stripped prompt. */
export function parseAssistCommand(text: string): string | null {
  const m = /^\/(?:ai|ask)\s+([\s\S]+)$/i.exec(text.trim());
  return m ? m[1]!.trim() : null;
}

/** Debounce window for typing notifications — never emit more than once per 3s. */
const TYPING_THROTTLE_MS = 3_000;

export function Composer({
  members,
  onSend,
  onTyping,
  channelId,
  onSendMedia,
  onAssist,
  disabled,
  placeholder,
}: ComposerProps) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Staged attachment (Teams/Slack-style attach→preview→send). Picking a file
  // stages it with a local preview; the upload + send happen on Send (caption =
  // the typed text). Single file, matching the prior scope.
  const [pending, setPending] = useState<{ file: File; localUrl: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [emojiData, setEmojiData] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);
  // Always points at the latest submit() so the editor's once-created
  // handleKeyDown closure calls the current version.
  const submitRef = useRef<() => void>(() => {});
  const [mentionQuery, setMentionQuery] = useState<{
    from: number;
    to: number;
    query: string;
  } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  // Read by the editor's once-created handleKeyDown; refreshed each render.
  const mentionNavRef = useRef<{
    open: boolean;
    move: (d: number) => void;
    pick: () => void;
    close: () => void;
  }>({
    open: false,
    move: () => {},
    pick: () => {},
    close: () => {},
  });

  const canAttach = !!channelId && !!onSendMedia && !disabled;

  // Detect the active @query under the caret via ProseMirror positions. Hoisted
  // so the once-created editor callbacks can call it; closes over only stable
  // setters + the findMentionQuery import, so it never goes stale.
  function refreshMentionQuery(ed: Editor) {
    const sel = ed.state.selection;
    if (!sel.empty) return setMentionQuery(null);
    const $from = sel.$from;
    // Block text up to the caret; leaf nodes (hard breaks) count as one char
    // via the leafText marker so string offsets line up with doc positions.
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\ufffc");
    const active = findMentionQuery(before, before.length);
    if (!active) return setMentionQuery(null);
    setMentionQuery({ from: $from.start() + active.start, to: $from.pos, query: active.query });
    setActiveIdx(0);
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Message" }),
    ],
    editorProps: {
      attributes: { class: "qc-composer__editor", "aria-label": "Message" },
      handleKeyDown: (_view, event) => {
        // Mention popup navigation takes precedence while it's open, so Enter
        // selects a mention when open and sends otherwise.
        const nav = mentionNavRef.current;
        if (nav.open) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            nav.move(1);
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            nav.move(-1);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            nav.pick();
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            nav.close();
            return true;
          }
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        if (!text) return false; // no plain text (e.g. an image) → let default handle it
        // Force plain text: strip any rich clipboard HTML so pasted content can't
        // inject unsupported marks/nodes. Newlines → hard breaks.
        const { schema } = view.state;
        const hardBreak = schema.nodes.hardBreak;
        const nodes: PMNode[] = [];
        text.split(/\r?\n/).forEach((line, i) => {
          if (i > 0 && hardBreak) nodes.push(hardBreak.create());
          if (line) nodes.push(schema.text(line)); // schema.text throws on "" — guard it
        });
        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0))
            .scrollIntoView(),
        );
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (editor.getText().trim()) notifyTyping();
      refreshMentionQuery(editor);
    },
    onSelectionUpdate: ({ editor }) => refreshMentionQuery(editor),
    immediatelyRender: false, // Next SSR guard
  });

  // Keep the editor's editable state in sync with `disabled`.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  // Load the emoji dataset the first time the picker opens (keeps it off the
  // initial bundle).
  useEffect(() => {
    if (emojiOpen && !emojiData) {
      void import("@emoji-mart/data").then((m) => setEmojiData(m.default));
    }
  }, [emojiOpen, emojiData]);

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file || !channelId || !onSendMedia) return;
    const err = validateFile(file);
    if (err) {
      toast.error({ title: "Can't attach that", body: err });
      return;
    }
    // Stage (do NOT upload/send yet). Replace any prior staged file.
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.localUrl);
      return { file, localUrl: URL.createObjectURL(file) };
    });
  }

  function removePending() {
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.localUrl);
      return null;
    });
  }

  /** Upload the staged file then post it as a Media message (caption = text). */
  async function sendPending() {
    if (!pending || !channelId || !onSendMedia || uploading) return;
    const { file, localUrl } = pending;
    setUploading(true);
    setProgress(0);
    try {
      const media = await uploadFile(file, channelId, setProgress);
      // Keep localUrl alive — handleSendMedia uses it for the optimistic preview
      // until the realtime echo reconciles with the server URL.
      onSendMedia(media, serializeToMarkdown(editor?.getJSON()).trim(), localUrl);
      editor?.commands.clearContent();
      setPending(null);
      lastTypingAt.current = 0;
    } catch (uploadErr) {
      URL.revokeObjectURL(localUrl);
      setPending(null);
      toast.error({
        title: "Upload failed",
        body: uploadErr instanceof Error ? uploadErr.message : undefined,
      });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  /** Insert an emoji at the caret via the editor, then close the picker. */
  function insertEmoji(emoji: string) {
    editor?.chain().focus().insertContent(emoji).run();
    setEmojiOpen(false);
  }

  function notifyTyping() {
    if (!onTyping) return;
    const now = Date.now();
    if (now - lastTypingAt.current < TYPING_THROTTLE_MS) return;
    lastTypingAt.current = now;
    onTyping();
  }

  function submit() {
    if (disabled || uploading || !editor) return;
    // A staged attachment sends as a Media message (with the typed caption).
    if (pending) {
      void sendPending();
      return;
    }
    const content = serializeToMarkdown(editor.getJSON());
    if (!content.trim()) return;
    // Slash-command → invoke the assistant instead of posting a message.
    const askPrompt = onAssist ? parseAssistCommand(content) : null;
    if (askPrompt) {
      onAssist!(askPrompt);
      editor.commands.clearContent();
      lastTypingAt.current = 0;
      return;
    }
    const mentions = computeMentions(content, members);
    onSend(content, mentions);
    editor.commands.clearContent();
    // Reset so the next keystroke after sending re-notifies immediately.
    lastTypingAt.current = 0;
  }

  const suggestions = mentionQuery
    ? members
        .filter((m) => m.displayName.toLowerCase().includes(mentionQuery.query.toLowerCase()))
        .slice(0, 6)
    : [];

  function pickMention(member: MentionMember) {
    if (!editor || !mentionQuery) return;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: mentionQuery.from, to: mentionQuery.to }, `@${member.displayName} `)
      .run();
    setMentionQuery(null);
  }

  // The editor's handleKeyDown closure is created once; keep these refs current.
  submitRef.current = submit;
  mentionNavRef.current = {
    open: !!mentionQuery && suggestions.length > 0,
    move: (d) => setActiveIdx((i) => (i + d + suggestions.length) % suggestions.length),
    pick: () => {
      const m = suggestions[activeIdx];
      if (m) pickMention(m);
    },
    close: () => setMentionQuery(null),
  };

  return (
    <div className="qc-composer">
      {mentionQuery && suggestions.length > 0 ? (
        <div className="qc-mention-pop" role="listbox" aria-label="Mention a member">
          {suggestions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className="qc-mention-opt"
              data-active={i === activeIdx}
              onClick={() => pickMention(m)}
            >
              @{m.displayName}
            </button>
          ))}
        </div>
      ) : null}
      {uploading ? (
        <div className="qc-upload-progress" role="progressbar" aria-label="Uploading">
          <div
            className="qc-upload-progress__bar"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
      {pending ? (
        <div className="qc-attach-chip" data-testid="attach-preview">
          {pending.file.type.startsWith("image/") ? (
            <img className="qc-attach-chip__thumb" src={pending.localUrl} alt="" />
          ) : (
            <span className="qc-attach-chip__icon" aria-hidden>
              <FileText size={16} />
            </span>
          )}
          <span className="qc-attach-chip__name qc-truncate">{pending.file.name}</span>
          <IconButton label="Remove attachment" onClick={removePending} disabled={uploading}>
            <X size={14} />
          </IconButton>
        </div>
      ) : null}
      {formatOpen ? (
        <div className="qc-format-bar" role="toolbar" aria-label="Formatting">
          <IconButton
            label="Bold (Ctrl+B)"
            disabled={disabled}
            data-active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={15} />
          </IconButton>
          <IconButton
            label="Italic (Ctrl+I)"
            disabled={disabled}
            data-active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={15} />
          </IconButton>
          <IconButton
            label="Strikethrough"
            disabled={disabled}
            data-active={editor?.isActive("strike")}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={15} />
          </IconButton>
          <IconButton
            label="Inline code (Ctrl+E)"
            disabled={disabled}
            data-active={editor?.isActive("code")}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code size={15} />
          </IconButton>
          <span className="qc-format-bar__hint">Markdown supported</span>
        </div>
      ) : null}
      <div className="qc-composer__box">
        <input
          ref={fileRef}
          type="file"
          className="qc-visually-hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onFilePicked}
        />
        <IconButton
          label="Attach file"
          disabled={!canAttach || uploading || !!pending}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={18} />
        </IconButton>
        <EditorContent editor={editor} />
        <IconButton
          label={formatOpen ? "Hide formatting" : "Formatting"}
          disabled={disabled}
          onClick={() => setFormatOpen((open) => !open)}
        >
          <Type size={18} />
        </IconButton>
        <Popover
          open={emojiOpen}
          onOpenChange={setEmojiOpen}
          placement="top"
          label="Insert emoji"
          trigger={
            <IconButton label="Emoji" disabled={disabled}>
              <Smile size={18} />
            </IconButton>
          }
        >
          <div className="qc-emoji-mart">
            {emojiData ? (
              <Suspense fallback={<div className="qc-emoji-mart__loading">Loading…</div>}>
                <EmojiMartPicker
                  data={emojiData}
                  onEmojiSelect={(e: { native?: string }) => {
                    if (e.native) insertEmoji(e.native);
                  }}
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                />
              </Suspense>
            ) : (
              <div className="qc-emoji-mart__loading">Loading…</div>
            )}
          </div>
        </Popover>
        <IconButton
          label="Send"
          onClick={submit}
          disabled={disabled || uploading || (!editor?.getText().trim() && !pending)}
        >
          <Send size={18} />
        </IconButton>
      </div>
    </div>
  );
}
