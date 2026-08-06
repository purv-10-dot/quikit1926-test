"use client";

import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { MentionRefInput } from "@/lib/shared";
import {
  AlertCircle,
  AudioLines,
  Bold,
  Check,
  Code,
  FileText,
  IconButton,
  Italic,
  Mic,
  Paperclip,
  Popover,
  Send,
  Smile,
  Strikethrough,
  Type,
  useToast,
  X,
} from "@/components/ui";
import { clearDraft, getDraft, saveDraft } from "@/lib/composer-drafts";
import { formatVoiceDuration } from "@/lib/format";
import { computeMentions, findMentionQuery, type MentionMember } from "@/lib/mentions";
import { serializeToMarkdown } from "@/lib/tiptap-markdown";
import {
  useVoiceRecorder,
  voiceFileExtension,
  type VoiceRecording,
} from "@/lib/use-voice-recorder";
import {
  getSpeechLang,
  setSpeechLang,
  SPEECH_LANG_LABEL,
  SPEECH_LANG_NAME,
  useSpeechToText,
  type SpeechLang,
} from "@/lib/use-speech-to-text";

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
  /** Current user — namespaces the per-channel draft so a shared machine never mixes drafts. */
  currentUserId: string;
  /** Channel id — required for the attach/upload flow AND for draft persistence. */
  channelId?: string;
  /** Send a Media message after a successful upload (with a local preview URL). */
  onSendMedia?: (media: MediaMeta, caption: string, localUrl: string) => void;
  /** Invoke the AI assistant (triggered by a `/ai` or `/ask` slash-command). */
  onAssist?: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The one thing a parent is allowed to trigger on a Composer it doesn't
 * otherwise control — pending/uploading/recording stay private. Used by
 * ConversationView's pane-wide drop zone, which owns the drag listeners but
 * has no business knowing the attachment state machine.
 */
export interface ComposerHandle {
  stageExternalFiles: (files: FileList | File[]) => void;
}

/** Detect a `/ai …` or `/ask …` slash-command; returns the stripped prompt. */
export function parseAssistCommand(text: string): string | null {
  const m = /^\/(?:ai|ask)\s+([\s\S]+)$/i.exec(text.trim());
  return m ? m[1]!.trim() : null;
}

/** Debounce window for typing notifications — never emit more than once per 3s. */
const TYPING_THROTTLE_MS = 3_000;

/** Debounce window for the draft-save backstop — covers a hard reload/crash,
 *  which the unmount-time save (the channel-switch case) can't. */
const DRAFT_SAVE_DEBOUNCE_MS = 500;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    members,
    onSend,
    onTyping,
    currentUserId,
    channelId,
    onSendMedia,
    onAssist,
    disabled,
    placeholder,
  },
  ref,
) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  // Staged attachment (Teams/Slack-style attach→preview→send). Picking a file
  // stages it with a local preview; the upload + send happen on Send (caption =
  // the typed text). Single file, matching the prior scope.
  // A finished voice recording stages here TOO — same shape, plus `voice`, which
  // both flags the chip's rendering and carries the recorder's measured duration
  // through to `MediaMeta.durationSec` on send.
  //
  // `failed` survives a failed upload: the file stays staged so Send retries it.
  // A boolean, not the error message — the message is operator-facing ("Upload
  // failed (413)") and belongs in the toast, and a string field would go falsy on
  // a non-Error throw, rendering a failed chip as if nothing had happened.
  const [pending, setPending] = useState<{
    file: File;
    localUrl: string;
    voice?: { durationSec: number };
    failed?: boolean;
  } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [emojiData, setEmojiData] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);
  // Debounced draft-save timer — the hard-reload/crash backstop (see
  // scheduleDraftSave). Cleared on unmount and on every successful send so a
  // stale timer can't fire after the content it captured is gone (it would be
  // harmless anyway — persistDraft reads live editor state, not a snapshot —
  // but there's no reason to let a pointless write happen).
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Voice notes. `onAutoStop` is what keeps the 5-minute cap from silently
  // discarding a recording — it stages the result exactly like a manual stop.
  const voice = useVoiceRecorder({ onAutoStop: (rec) => stageRecording(rec) });
  const recording = voice.state === "recording";
  // Read by the editor's once-created handlePaste/handleDrop closures.
  const recordingRef = useRef(false);
  recordingRef.current = recording;

  /**
   * Turn a finished recording into a staged `pending` File. From here on it is an
   * ordinary attachment: Send → `sendPending()` → `uploadFile` → `onSendMedia`.
   * No parallel send path.
   */
  function stageRecording(rec: VoiceRecording) {
    const ext = voiceFileExtension(rec.mimeType);
    const file = new File([rec.blob], `voice-message-${Date.now()}.${ext}`, {
      type: rec.mimeType,
    });
    // Same client gate a picked file passes — catches an exotic browser codec
    // before we bother signing an upload that the server would reject.
    const err = validateFile(file);
    if (err) {
      toast.error({ title: "Can't send that recording", body: err });
      return;
    }
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.localUrl);
      return {
        file,
        localUrl: URL.createObjectURL(file),
        voice: { durationSec: rec.durationSec },
        // Explicit, though this is a fresh literal: a later refactor to
        // `{...prev, file}` must not let a new recording inherit a stale failure.
        failed: false,
      };
    });
  }

  async function startRecording() {
    // Mutual exclusion: never record over a staged/uploading attachment.
    if (!canAttach || uploading || pending) return;
    await voice.start();
  }

  async function stopRecording() {
    const rec = await voice.stop();
    if (rec) stageRecording(rec);
  }

  // Surface a recorder failure (permission denied, no device, mic busy) once.
  const reportedErrorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (voice.state !== "error" || !voice.error) return;
    if (reportedErrorRef.current === voice.error) return;
    reportedErrorRef.current = voice.error;
    toast.error({ title: "Can't record", body: voice.error });
  }, [voice.state, voice.error, toast]);
  useEffect(() => {
    if (voice.state !== "error") reportedErrorRef.current = undefined;
  }, [voice.state]);

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
        // Mutual exclusion: swallow a file/image paste while recording so it can
        // never become a competing attachment. (No paste-to-upload path exists
        // today — this is a forward-guard so wiring one later inherits the rule.)
        if (recordingRef.current && event.clipboardData?.files?.length) return true;
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
      handleDrop: (_view, event) => {
        // A file drop anywhere over the conversation (including directly on
        // the editable) routes through ConversationView's pane-wide drop
        // zone → stageExternalFiles, never through ProseMirror's own
        // content-insertion. Swallow unconditionally so PM never parses a
        // dropped file into text/link content; a text-selection drag carries
        // no `files` and falls through to PM's default untouched.
        return !!(event as DragEvent).dataTransfer?.files?.length;
      },
    },
    onUpdate: ({ editor }) => {
      if (editor.getText().trim()) notifyTyping();
      refreshMentionQuery(editor);
      scheduleDraftSave(editor);
    },
    onSelectionUpdate: ({ editor }) => refreshMentionQuery(editor),
    immediatelyRender: false, // Next SSR guard
  });

  // Keep the editor's editable state in sync with `disabled`.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  /** Save now if there's real content, else clear a leftover draft. Reads
   *  live editor state at call time — never a stale snapshot from when a
   *  debounce/unmount timer was armed. */
  function persistDraft(ed: Editor) {
    if (!channelId) return;
    if (ed.getText().trim()) saveDraft(currentUserId, channelId, ed.getJSON());
    else clearDraft(currentUserId, channelId);
  }

  /** The hard-reload/crash backstop: unmount (below) covers a clean channel
   *  switch, but nothing runs React's unmount lifecycle on a tab close or
   *  crash, so this keeps the persisted draft within 500ms of what's typed. */
  function scheduleDraftSave(ed: Editor) {
    if (!channelId) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => persistDraft(ed), DRAFT_SAVE_DEBOUNCE_MS);
  }

  /** Every successful-send path clears the editor through here instead of a
   *  bare `clearContent()`, so a sent draft can never resurface. Cancelling
   *  the pending debounce timer is a courtesy, not a correctness fix —
   *  `persistDraft` reads live (now-empty) editor state even if a stale timer
   *  fired anyway, so it would just re-clear the same key. */
  function clearComposerAndDraft(ed: Editor) {
    if (draftSaveTimer.current) {
      clearTimeout(draftSaveTimer.current);
      draftSaveTimer.current = null;
    }
    ed.commands.clearContent();
    if (channelId) clearDraft(currentUserId, channelId);
  }

  // Restore a saved draft once, after the editor exists. Deliberately a
  // post-mount `setContent` rather than Tiptap's constructor-time `content`
  // option: a stored doc whose shape no longer matches the current
  // extensions (e.g. a future StarterKit config change) must not crash the
  // whole render — `setContent` defaults `emitUpdate` to false, so this can't
  // fire `onUpdate`/notifyTyping either. On a shape mismatch, self-heal by
  // clearing the bad entry so the next mount doesn't retry it.
  useEffect(() => {
    if (!editor || !channelId) return;
    const doc = getDraft(currentUserId, channelId);
    if (doc == null) return;
    try {
      editor.commands.setContent(doc);
    } catch {
      clearDraft(currentUserId, channelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, channelId, currentUserId]);

  // Save on unmount — the channel-switch case. Declared AFTER `useEditor()`
  // so its cleanup runs BEFORE Tiptap's own internal `editor.destroy()`
  // cleanup (React unwinds one component's effect cleanups in reverse
  // declaration order), meaning the editor is still alive and `.getJSON()`
  // still reflects the last keystroke when this fires.
  useEffect(() => {
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
      if (editor && channelId) persistDraft(editor);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, channelId, currentUserId]);

  // ---- Voice typing (dictation) ----
  // Chosen locale is read after mount (localStorage is unavailable during SSR).
  const [speechLang, setSpeechLangState] = useState<SpeechLang>("en-IN");
  useEffect(() => {
    setSpeechLangState(getSpeechLang());
  }, []);
  // The live interim span's document range. A ref, not state: recognition
  // callbacks outlive the render that created them.
  const interimRangeRef = useRef<{ from: number; to: number } | null>(null);
  const speech = useSpeechToText({ onResult: applyDictation });
  const listening = speech.state === "listening";

  /**
   * Put a dictation result into the document.
   *
   * Interim results REPLACE the previous interim span rather than appending:
   * `insertContentAt` with a *range* is a replace, and that is the whole
   * anti-duplication mechanism. A final result replaces the span one last time,
   * appends a separating space, and forgets the range — so the words become
   * ordinary content and the next utterance opens a fresh span.
   */
  function applyDictation(text: string, isFinal: boolean) {
    if (!editor) return;
    const content = isFinal ? `${text} ` : text;
    const prev = interimRangeRef.current;
    // A stale range (the user typed or moved the caret mid-utterance, or the
    // editor was cleared) must never replace unrelated text — fall back to
    // inserting at the caret.
    const usable =
      !!prev && prev.from <= prev.to && prev.to <= editor.state.doc.content.size;
    const from = usable ? prev!.from : editor.state.selection.from;
    if (usable) {
      editor.chain().focus().insertContentAt({ from: prev!.from, to: prev!.to }, content).run();
    } else {
      editor.chain().focus().insertContent(content).run();
    }
    interimRangeRef.current = isFinal ? null : { from, to: from + content.length };
  }

  function startDictation() {
    // Mutual exclusion, reusing the existing guards. Note this does NOT require
    // `canAttach`: dictation produces text, so it needs no channel or upload
    // capability — unlike the voice-note button beside it.
    if (disabled || uploading || recording || pending) return;
    interimRangeRef.current = null;
    speech.start(speechLang);
  }

  /** Graceful: a final result still in flight lands before the session ends. */
  function stopDictation() {
    speech.stop();
  }

  // Session over (idle or error) → the tracked span is meaningless. Runs AFTER
  // any final result, which clears the ref itself, so this is just the backstop.
  useEffect(() => {
    if (speech.state !== "listening") interimRangeRef.current = null;
  }, [speech.state]);

  function toggleSpeechLang() {
    const next: SpeechLang = speechLang === "en-IN" ? "hi-IN" : "en-IN";
    setSpeechLangState(next);
    setSpeechLang(next);
  }

  // Surface a dictation failure once, mirroring the recorder's pattern above.
  const reportedSpeechErrorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (speech.state !== "error" || !speech.error) return;
    if (reportedSpeechErrorRef.current === speech.error) return;
    reportedSpeechErrorRef.current = speech.error;
    toast.error({ title: "Voice typing stopped", body: speech.error });
  }, [speech.state, speech.error, toast]);
  useEffect(() => {
    if (speech.state !== "error") reportedSpeechErrorRef.current = undefined;
  }, [speech.state]);

  // Load the emoji dataset the first time the picker opens (keeps it off the
  // initial bundle).
  useEffect(() => {
    if (emojiOpen && !emojiData) {
      void import("@emoji-mart/data").then((m) => setEmojiData(m.default));
    }
  }, [emojiOpen, emojiData]);

  /**
   * Stage (do NOT upload/send yet), replacing any prior staged file. The
   * single funnel both the paperclip (`onFilePicked`) and a drag-and-drop
   * (`stageExternalFiles`) go through, so there is exactly one staging path.
   */
  function stageFile(file: File) {
    const err = validateFile(file);
    if (err) {
      toast.error({ title: "Can't attach that", body: err });
      return;
    }
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.localUrl);
      // `failed: false` for the same reason as stageRecording — a newly picked
      // file never shows the previous one's failure.
      return { file, localUrl: URL.createObjectURL(file), failed: false };
    });
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file || !channelId || !onSendMedia) return;
    // Mutual exclusion (the other direction): the single funnel every file entry
    // passes through, so nothing can stage a file mid-recording.
    if (recording) return;
    stageFile(file);
  }

  /**
   * ConversationView's pane-wide drop zone hands off here. Unlike the
   * paperclip/mic buttons, a drop has no `disabled` affordance to lean on, so
   * every mutual-exclusion guard those buttons normally encode has to be
   * checked explicitly. Silently no-ops when blocked, same as the editor's
   * own recording-guard in `handleDrop` below — a drop mid-recording isn't an
   * error, it's just not a valid time to attach anything.
   */
  function stageExternalFiles(files: FileList | File[]) {
    if (!canAttach || uploading || pending || recording || listening) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    if (list.length > 1) {
      toast.error({ title: "Can't attach that", body: "Drop one file at a time." });
      return;
    }
    stageFile(list[0]!);
  }

  useImperativeHandle(ref, () => ({ stageExternalFiles }));

  function removePending() {
    setPending((prev) => {
      if (prev) URL.revokeObjectURL(prev.localUrl);
      return null;
    });
  }

  /**
   * Upload the staged file then post it as a Media message (caption = text).
   *
   * Also the retry path: on failure the staged file, its preview and the caption
   * all survive, so clicking Send again re-runs this against the same `pending`.
   */
  async function sendPending() {
    if (!pending || !channelId || !onSendMedia || uploading) return;
    const { file, localUrl, voice: staged } = pending;
    setUploading(true);
    setProgress(0);
    // Clear the flag at the START of the attempt, not just on success: a second
    // failure must re-render the failed state rather than sit on a stale one.
    setPending((prev) => (prev?.failed ? { ...prev, failed: false } : prev));
    try {
      // A voice note carries its measured duration onto MediaMeta → the message
      // `data` (persisted, so it survives a reload). Plain files pass nothing.
      const media = await uploadFile(file, channelId, setProgress, {
        durationSec: staged?.durationSec,
      });
      // Keep localUrl alive — handleSendMedia uses it for the optimistic preview
      // until the realtime echo reconciles with the server URL.
      onSendMedia(media, serializeToMarkdown(editor?.getJSON()).trim(), localUrl);
      if (editor) clearComposerAndDraft(editor);
      setPending(null);
      lastTypingAt.current = 0;
    } catch (uploadErr) {
      // Keep the attachment staged — do NOT revoke `localUrl` and do NOT clear
      // `pending`. Re-picking a file (or re-recording a voice note) from scratch
      // just to retry is the bug; the caption was never cleared here either, so
      // losing only the file made it worse, not gentler. `prev &&` so a chip the
      // user discarded mid-flight is never resurrected.
      setPending((prev) => (prev ? { ...prev, failed: true } : prev));
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
    // `recording` blocks Enter-to-send too: stop or cancel the recording first.
    if (disabled || uploading || recording || !editor) return;
    // Dictation does NOT block Send — the dictated text IS the message, unlike a
    // voice note, which is a competing payload. `cancel()` (not `stop()`) on
    // purpose: a final result arriving after `clearContent()` would drop stray
    // words into the now-empty composer. What you see is what gets sent.
    if (listening) {
      speech.cancel();
      interimRangeRef.current = null;
    }
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
      clearComposerAndDraft(editor);
      lastTypingAt.current = 0;
      return;
    }
    const mentions = computeMentions(content, members);
    onSend(content, mentions);
    clearComposerAndDraft(editor);
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
      {recording ? (
        <div
          className="qc-voice-bar"
          data-testid="voice-recording-bar"
          role="status"
          aria-live="off"
        >
          <span className="qc-voice-bar__dot" aria-hidden />
          <span className="qc-voice-bar__label">Recording</span>
          <span className="qc-voice-bar__time" data-testid="voice-elapsed">
            {formatVoiceDuration(voice.elapsedSec)}
          </span>
          <span className="qc-voice-bar__spacer" />
          <IconButton label="Cancel recording" onClick={voice.cancel}>
            <X size={14} />
          </IconButton>
          <IconButton label="Stop recording" onClick={() => void stopRecording()}>
            <Check size={16} />
          </IconButton>
        </div>
      ) : null}
      {listening ? (
        /* Same presentational shape as the recording bar above — live dot,
           label, trailing action — so the two "something is capturing" states
           read identically. */
        <div className="qc-voice-bar" data-testid="dictation-bar" role="status" aria-live="off">
          <span className="qc-voice-bar__dot" aria-hidden />
          <span className="qc-voice-bar__label">
            Listening · {SPEECH_LANG_NAME[speechLang]} only
          </span>
          {/* Deliberately in the UI, not just the code: the browser streams this
              audio to its vendor's speech service. */}
          <span className="qc-speech-note qc-truncate">
            Audio goes to your browser&apos;s speech service
          </span>
          <span className="qc-voice-bar__spacer" />
          <IconButton label="Stop voice typing" onClick={stopDictation}>
            <Check size={16} />
          </IconButton>
        </div>
      ) : null}
      {pending ? (
        <div
          className="qc-attach-chip"
          data-testid="attach-preview"
          data-failed={pending.failed || undefined}
        >
          {/* A voice note gets a mic pill + its recorded length, never a file
              thumbnail — the filename is machine-generated and meaningless here. */}
          {pending.voice ? (
            <>
              <span className="qc-attach-chip__icon" aria-hidden>
                <Mic size={16} />
              </span>
              <span className="qc-attach-chip__name qc-truncate">
                Voice message · {formatVoiceDuration(pending.voice.durationSec)}
              </span>
            </>
          ) : (
            <>
              {pending.file.type.startsWith("image/") ? (
                <img className="qc-attach-chip__thumb" src={pending.localUrl} alt="" />
              ) : (
                <span className="qc-attach-chip__icon" aria-hidden>
                  <FileText size={16} />
                </span>
              )}
              <span className="qc-attach-chip__name qc-truncate">{pending.file.name}</span>
            </>
          )}
          {/* Persistent failure indicator. The toast that also fires is gone in
              ~3s while the file can sit staged indefinitely, so the chip has to
              carry the state itself — and say what to do about it. */}
          {pending.failed ? (
            <span className="qc-attach-chip__error" data-testid="attach-failed" role="status">
              <AlertCircle size={13} aria-hidden />
              Upload failed — tap Send to retry
            </span>
          ) : null}
          <IconButton
            label={pending.voice ? "Discard voice message" : "Remove attachment"}
            onClick={removePending}
            disabled={uploading}
          >
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
          disabled={!canAttach || uploading || !!pending || recording || listening}
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip size={18} />
        </IconButton>
        {/* Hidden outright when MediaRecorder is unavailable (incl. SSR) rather
            than shown as a control that can only fail. */}
        {voice.supported ? (
          <IconButton
            label="Record voice message"
            disabled={!canAttach || uploading || !!pending || listening}
            onClick={() => void startRecording()}
          >
            <Mic size={18} />
          </IconButton>
        ) : null}
        {/* Same hide-don't-disable rule as the mic button: Firefox and Opera
            expose no SpeechRecognition at all. Unlike the mic button this needs
            no `canAttach` — dictation yields text, not an attachment. */}
        {speech.supported ? (
          <>
            {/* A toggle, so the accessible NAME stays put and `aria-pressed`
                carries the on/off state. Renaming it to "Stop voice typing"
                while active would both collide with the listening bar's button
                (two controls, one name) and make the state a naming quirk
                instead of something assistive tech can query. */}
            <IconButton
              label={`Voice typing (${SPEECH_LANG_NAME[speechLang]})`}
              aria-pressed={listening}
              data-active={listening}
              disabled={disabled || uploading || !!pending || recording}
              onClick={() => (listening ? stopDictation() : startDictation())}
            >
              <AudioLines size={18} />
            </IconButton>
            {/* Two-state locale pill. Text, not an icon: an icon can't show
                WHICH language is armed, and SpeechRecognition takes exactly one
                locale per session — there is no mixed mode to represent. Locked
                while listening because the locale can't change mid-session. */}
            <button
              type="button"
              className="qc-speech-lang"
              data-testid="speech-lang-toggle"
              aria-label={`Dictation language: ${SPEECH_LANG_NAME[speechLang]}. Switch to ${
                SPEECH_LANG_NAME[speechLang === "en-IN" ? "hi-IN" : "en-IN"]
              }`}
              disabled={disabled || listening}
              onClick={toggleSpeechLang}
            >
              {SPEECH_LANG_LABEL[speechLang]}
            </button>
          </>
        ) : null}
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
          disabled={disabled || uploading || recording || (!editor?.getText().trim() && !pending)}
        >
          <Send size={18} />
        </IconButton>
      </div>
    </div>
  );
});
