"use client";

import { useState } from "react";
import type {
  AssistSource,
  IngestResult,
  MeetingDto,
  MentionRefInput,
  MessageDto,
  ParentPreview,
  PublicUser,
} from "@/lib/shared";
import {
  Avatar,
  Check,
  CheckCheck,
  Copy,
  Download,
  EmojiPicker,
  FileText,
  Forward,
  IconButton,
  ImageIcon,
  Info,
  Menu,
  MenuItem,
  Mic,
  Modal,
  MoreHorizontal,
  Pencil,
  Phone,
  PhoneMissed,
  PhoneOff,
  Pin,
  PinOff,
  Popover,
  Reply,
  Sparkles,
  SmilePlus,
  Spinner,
  Trash2,
  Users,
  Video,
  VideoOff,
} from "@/components/ui";
import { useProfile } from "@/components/profile/ProfileProvider";
import { MeetingCard } from "./MeetingCard";
import { formatMessageTime } from "@/lib/format";
import { computeMentions } from "@/lib/mentions";
import { relativeTime } from "@/lib/notif-format";
import { emojiName, QUICK_REACTIONS, reactorSummary } from "@/lib/reactions";
import { RichText } from "@/lib/richtext";
import { partitionMessageAudience, tickState, type TickState } from "@/lib/ticks";

interface MediaData {
  mediaUrl?: string;
  mediaType?: string;
  originalName?: string;
  size?: number;
  forwardedFrom?: {
    channelId: string;
    senderId: string | null;
    senderName: string;
    sourceChannelName?: string | null;
  };
}

export interface MessageRowActions {
  meId: string;
  members: PublicUser[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: MessageDto) => void;
  onForward: (message: MessageDto) => void;
  onTogglePin: (message: MessageDto) => void;
  onEdit: (messageId: string, content: string, mentions: MentionRefInput[]) => void;
  onDelete: (messageId: string) => void;
  onJumpToParent?: (parentId: string) => void;
  /** Open an image/video attachment in the lightbox. */
  onOpenMedia?: (media: { url: string; mediaType: string; originalName?: string }) => void;
  onStartCall?: (meetingId: string, channelId: string) => void;
  /**
   * Stage 3 "Add to KB" — present ONLY in an AI chat (ConversationView supplies
   * it when channel.type === "ai"). Resolves with the ingest result so the row
   * can confirm how many sections were indexed; rejects on failure (caller toasts).
   */
  onAddToKb?: (
    message: MessageDto,
    visibility: "PRIVATE" | "ORG",
  ) => Promise<IngestResult>;
  /**
   * Stage 3 retrieval — ephemeral citations for the live turn, keyed by the bot
   * message's `clientMessageId` (`assist-<agentRunId>`). Populated only for the
   * turn just streamed this session; never persisted, so reloaded/historical
   * bot messages render no chips (decision 3).
   */
  liveSourcesById?: Record<string, AssistSource[]>;
}

function formatBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MediaContent({ media, onOpen }: { media: MediaData; onOpen?: () => void }) {
  const url = media.mediaUrl;
  if (!url) return null;
  if (media.mediaType?.startsWith("image/")) {
    return (
      <button type="button" className="qc-media-open" onClick={onOpen} aria-label="Open image">
        <img className="qc-media-img" src={url} alt={media.originalName ?? "image"} />
      </button>
    );
  }
  if (media.mediaType?.startsWith("video/")) {
    return (
      <button type="button" className="qc-media-open" onClick={onOpen} aria-label="Open video">
        <video className="qc-media-img" src={url} muted preload="metadata" />
      </button>
    );
  }
  if (media.mediaType?.startsWith("audio/")) {
    return <audio src={url} controls />;
  }
  // PDFs preview in-app (the lightbox renders them in an iframe) — clicking the
  // chip opens the preview rather than downloading. `onOpen` is wired by the
  // parent for previewable types (image/video/pdf).
  if (media.mediaType === "application/pdf") {
    return (
      <button
        type="button"
        className="qc-media-file qc-media-file--btn"
        onClick={onOpen}
        aria-label={`Preview ${media.originalName ?? "PDF"}`}
      >
        <FileText size={18} aria-hidden />
        <span>
          <span className="qc-media-file__name">{media.originalName ?? "PDF"}</span>
          <span className="qc-media-file__meta">{formatBytes(media.size)}</span>
        </span>
      </button>
    );
  }
  // Other types (docx, xlsx, zip, …) can't preview in-browser: show an explicit
  // Download control so the filename click is never a surprise download.
  const Icon = media.mediaType?.startsWith("video/")
    ? Video
    : media.mediaType?.startsWith("audio/")
      ? Mic
      : media.mediaType?.startsWith("image/")
        ? ImageIcon
        : FileText;
  return (
    <div className="qc-media-file">
      <Icon size={18} aria-hidden />
      <span>
        <span className="qc-media-file__name">{media.originalName ?? "File"}</span>
        <span className="qc-media-file__meta">{formatBytes(media.size)}</span>
      </span>
      <a
        className="qc-media-file__dl"
        href={url}
        download={media.originalName}
        target="_blank"
        rel="noreferrer"
        aria-label={`Download ${media.originalName ?? "file"}`}
      >
        <Download size={16} aria-hidden />
      </a>
    </div>
  );
}

/**
 * Stage 3 "Add to knowledge base" affordance, rendered under a Media message in
 * an AI chat (only when `onAddToKb` is supplied). A quiet ghost button opens a
 * Popover menu with the visibility choice (Only me / Share with org); on success
 * it collapses to a compact chip confirming the scope + indexed section count.
 * Failures are toasted by the caller; the control resets to idle for a retry.
 */
function AddToKbCard({
  message,
  onAddToKb,
}: {
  message: MessageDto;
  onAddToKb: (message: MessageDto, visibility: "PRIVATE" | "ORG") => Promise<IngestResult>;
}) {
  const [state, setState] = useState<"idle" | "adding" | "added">("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  // Remember the chosen visibility so the added chip can name it (Private/Org).
  const [chosen, setChosen] = useState<"PRIVATE" | "ORG">("PRIVATE");
  const [chunks, setChunks] = useState(0);

  const add = async (visibility: "PRIVATE" | "ORG") => {
    setMenuOpen(false);
    setChosen(visibility);
    setState("adding");
    try {
      const result = await onAddToKb(message, visibility);
      setChunks(result.chunksStored);
      setState("added");
    } catch {
      setState("idle"); // caller toasts the reason; allow a retry
    }
  };

  if (state === "added") {
    return (
      <div className="qc-kb-add" data-state="added" data-testid="add-to-kb">
        <span className="qc-chip qc-kb-added">
          <Check size={13} aria-hidden />
          In knowledge base · {chosen === "ORG" ? "Org" : "Private"} · {chunks} section
          {chunks === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  if (state === "adding") {
    return (
      <div className="qc-kb-add" data-testid="add-to-kb">
        <button type="button" className="qc-btn qc-btn--ghost qc-kb-add__btn" disabled>
          <Spinner /> Adding…
        </button>
      </div>
    );
  }

  return (
    <div className="qc-kb-add" data-testid="add-to-kb">
      <Popover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        placement="top"
        label="Add to knowledge base"
        trigger={
          <button type="button" className="qc-btn qc-btn--ghost qc-kb-add__btn">
            <Sparkles size={14} aria-hidden /> Add to knowledge base
          </button>
        }
      >
        <Menu label="Knowledge base visibility">
          <MenuItem onSelect={() => void add("PRIVATE")}>Only me · private</MenuItem>
          <MenuItem onSelect={() => void add("ORG")} icon={<Users size={15} aria-hidden />}>
            Share with org
          </MenuItem>
        </Menu>
      </Popover>
    </div>
  );
}

/** Message body: markdown + clickable links + mention pills (see lib/richtext). */
export function MentionText({ message }: { message: MessageDto }) {
  return <RichText content={message.content} mentions={message.mentions} />;
}

/**
 * Ephemeral retrieval-citation chips (Stage 3), rendered under a bot reply on
 * the live turn only. Each chip surfaces the cited document (its filename tail)
 * and the excerpt as a tooltip. Not persisted — absent on reload (decision 3).
 */
function SourceChips({ sources }: { sources: AssistSource[] }) {
  if (!sources.length) return null;
  // sourceFileId === storageKey (quikchat/<org>/<channel>/<uuid>-<name>); show
  // the human tail, fall back to the whole id.
  const label = (id: string) => id.split("/").pop() || id;
  return (
    <div className="qc-source-chips" data-testid="source-chips">
      <span className="qc-source-chips__label">Sources</span>
      {sources.map((s, i) => (
        <span
          key={`${s.sourceFileId}-${s.chunkIndex}-${i}`}
          className="qc-source-chip"
          title={s.snippet}
        >
          <FileText size={12} aria-hidden /> {label(s.sourceFileId)}
        </span>
      ))}
    </div>
  );
}

function ParentQuote({
  parent,
  author,
  onJump,
}: {
  parent: ParentPreview;
  author: string;
  onJump?: (id: string) => void;
}) {
  const text =
    parent.type === "Delete"
      ? "This message was deleted"
      : parent.type === "Media"
        ? "📎 Attachment"
        : parent.content;
  return (
    <button
      type="button"
      className="qc-quote"
      onClick={() => onJump?.(parent.id)}
      data-testid="parent-quote"
    >
      <div className="qc-quote__author">{author}</div>
      <div className="qc-quote__text">{text}</div>
    </button>
  );
}

function ReactionPills({ message, actions }: { message: MessageDto; actions: MessageRowActions }) {
  const nameById = new Map(actions.members.map((m) => [m.id, m.displayName]));
  return (
    <div className="qc-reactions">
      {message.reactions.map((r) => {
        const mine = r.userIds.includes(actions.meId);
        const summary = reactorSummary(r.userIds, nameById, actions.meId);
        return (
          <span key={r.emoji} className="qc-reactor-wrap">
            <button
              type="button"
              className="qc-reaction"
              data-mine={mine}
              aria-label={`${emojiName(r.emoji)} from ${summary}. Toggle your reaction.`}
              onClick={() => actions.onToggleReaction(message.id, r.emoji)}
            >
              {r.emoji} {r.count}
            </button>
            <Popover
              placement="top"
              label={`${emojiName(r.emoji)} reactions`}
              trigger={
                <button type="button" className="qc-reactor-summary" title="Who reacted">
                  {summary}
                </button>
              }
            >
              <div className="qc-reactor-card">
                <div className="qc-reactor-card__title">{emojiName(r.emoji)}</div>
                {[...r.userIds]
                  .sort((a, b) => Number(b === actions.meId) - Number(a === actions.meId))
                  .map((id) => {
                    const m = actions.members.find((x) => x.id === id);
                    const label = id === actions.meId ? "You" : (m?.displayName ?? "Unknown");
                    return (
                      <div key={id} className="qc-reactor-card__row">
                        <Avatar name={label} id={id} avatarUrl={m?.avatarUrl} size={24} />
                        <span>{label}</span>
                      </div>
                    );
                  })}
              </div>
            </Popover>
          </span>
        );
      })}
    </div>
  );
}

function MessageToolbar({
  message,
  isOwn,
  actions,
  onStartEdit,
  onMessageInfo,
}: {
  message: MessageDto;
  isOwn: boolean;
  actions: MessageRowActions;
  onStartEdit: () => void;
  onMessageInfo: () => void;
}) {
  const canEdit = isOwn && message.type === "Text";
  return (
    <div className="qc-msg-toolbar" data-own={isOwn} role="toolbar" aria-label="Message actions">
      <Popover
        placement="top"
        label="Add reaction"
        trigger={
          <IconButton label="Add reaction">
            <SmilePlus size={15} />
          </IconButton>
        }
      >
        <EmojiPicker
          emojis={QUICK_REACTIONS}
          nameOf={emojiName}
          onSelect={(e) => actions.onToggleReaction(message.id, e)}
        />
      </Popover>
      <IconButton label="Reply" onClick={() => actions.onReply(message)}>
        <Reply size={15} />
      </IconButton>
      <IconButton label="Forward" onClick={() => actions.onForward(message)}>
        <Forward size={15} />
      </IconButton>
      <IconButton
        label={message.isPinned ? "Unpin" : "Pin"}
        onClick={() => actions.onTogglePin(message)}
      >
        {message.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
      </IconButton>
      {canEdit ? (
        <IconButton label="Edit" onClick={onStartEdit}>
          <Pencil size={15} />
        </IconButton>
      ) : null}
      <Popover
        placement="top"
        label="More actions"
        trigger={
          <IconButton label="More actions">
            <MoreHorizontal size={15} />
          </IconButton>
        }
      >
        <Menu label="More actions">
          <MenuItem
            icon={<Copy size={14} />}
            onSelect={() => void navigator.clipboard?.writeText(message.content)}
          >
            Copy text
          </MenuItem>
          {isOwn ? (
            <MenuItem icon={<Info size={14} />} onSelect={onMessageInfo}>
              Message info
            </MenuItem>
          ) : null}
          {isOwn ? (
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onSelect={() => actions.onDelete(message.id)}
            >
              Delete
            </MenuItem>
          ) : null}
        </Menu>
      </Popover>
    </div>
  );
}

function EditArea({
  message,
  actions,
  onClose,
}: {
  message: MessageDto;
  actions: MessageRowActions;
  onClose: () => void;
}) {
  const [value, setValue] = useState(message.content);

  function save() {
    const content = value.trim();
    if (!content || content === message.content) {
      onClose();
      return;
    }
    const mentions = computeMentions(content, actions.members);
    actions.onEdit(message.id, content, mentions);
    onClose();
  }

  return (
    <textarea
      className="qc-edit-area"
      aria-label="Edit message"
      rows={2}
      value={value}
      autoFocus
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          save();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    />
  );
}

/** Tokenised three-state tick for own messages (S14a). */
function TickGlyph({ state }: { state: TickState }) {
  if (state === "sending") {
    return (
      <span className="qc-tick" data-state="sending" data-testid="tick" aria-label="Sending" />
    );
  }
  const label = state === "read" ? "Read" : state === "delivered" ? "Delivered" : "Sent";
  return (
    <span
      className={`qc-tick${state === "read" ? " qc-tick--read" : ""}`}
      data-state={state}
      data-testid="tick"
      title={label}
      aria-label={label}
    >
      {state === "sent" ? <Check size={13} aria-hidden /> : <CheckCheck size={13} aria-hidden />}
    </span>
  );
}

export interface MessageRowProps {
  message: MessageDto;
  showAuthor: boolean;
  currentUserId: string;
  sender?: PublicUser;
  members?: PublicUser[];
  memberReadAt?: Record<string, string | null>;
  memberDeliveredAt?: Record<string, string | null>;
  actions?: MessageRowActions;
}

function callGlyph(callType: "audio" | "video" | undefined, status: string) {
  const video = callType === "video";
  if (status === "missed" || status === "no_answer") {
    return {
      Icon: video ? VideoOff : PhoneMissed,
      label: video ? "Missed video call" : "Missed audio call",
      tone: "missed" as const,
    };
  }
  if (status === "cancelled" || status === "declined") {
    return {
      Icon: video ? VideoOff : PhoneOff,
      label: video ? "Cancelled video call" : "Cancelled audio call",
      tone: "cancelled" as const,
    };
  }
  return {
    Icon: video ? Video : Phone,
    label: video ? "Video call" : "Audio call",
    tone: "ended" as const,
  };
}

export function MessageRow({
  message,
  showAuthor,
  currentUserId,
  sender,
  members,
  memberReadAt,
  memberDeliveredAt,
  actions,
}: MessageRowProps) {
  const [editing, setEditing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { openProfile } = useProfile();

  if (message.type === "SystemActivity") {
    return (
      <div className="qc-system" data-testid="system-row">
        <span>{message.content}</span>
      </div>
    );
  }

  // Meeting card (S15a): the serialized projection rides in data.meeting. Render
  // a standalone card; fall through to text only if the projection is missing.
  const meeting = (message.data as { meeting?: MeetingDto } | null)?.meeting;
  if (message.type === "Meeting" && meeting) {
    return (
      <div className="qc-row qc-row--meeting" data-message-id={message.id}>
        <MeetingCard
          meeting={meeting}
          currentUserId={currentUserId}
          onStartCall={
            actions?.onStartCall
              ? () => actions.onStartCall!(meeting.id, meeting.channelId)
              : undefined
          }
        />
      </div>
    );
  }

  // Call summary card (CALL-1): rendered for a `Call` message showing call status
  // and duration.
  if (message.type === "Call") {
    const data = (message.data ?? {}) as {
      callId?: string;
      status?: string;
      duration?: number;
      callType?: "audio" | "video";
    };
    const duration = data.duration;
    const minutes = duration ? Math.floor(duration / 60) : 0;
    const seconds = duration ? duration % 60 : 0;
    const durationText = duration ? `${minutes}:${seconds.toString().padStart(2, "0")}` : "";
    const status = data.status ?? "ended";
    const { Icon, label, tone } = callGlyph(data.callType, status);
    return (
      <div className="qc-row qc-row--call" data-message-id={message.id}>
        <div className="qc-call-card" data-tone={tone}>
          <span className="qc-call-card__icon">
            <Icon size={16} aria-hidden />
          </span>
          <span className="qc-call-card__label">{label}</span>
          {durationText ? <span className="qc-call-card__meta">· {durationText}</span> : null}
        </div>
      </div>
    );
  }

  const isOwn = message.senderId === currentUserId;
  const name = sender?.displayName ?? "Unknown";
  const media = (message.data ?? {}) as MediaData;
  const isDeleted = message.type === "Delete";
  const showToolbar = !!actions && !isDeleted;
  const tick =
    isOwn && !isDeleted
      ? tickState(message, members ?? [], memberReadAt ?? {}, memberDeliveredAt ?? {})
      : null;

  return (
    <div
      className="qc-row"
      data-own={isOwn}
      data-grouped={!showAuthor}
      data-message-id={message.id}
    >
      {!isOwn ? (
        <span className="qc-row__gutter">
          {showAuthor ? (
            <button
              type="button"
              className="qc-avatar-btn"
              aria-label={`View ${name}'s profile`}
              onClick={() =>
                openProfile({
                  user: {
                    id: message.senderId ?? name,
                    displayName: name,
                    avatarUrl: sender?.avatarUrl ?? null,
                  },
                })
              }
            >
              <Avatar
                name={name}
                id={message.senderId ?? name}
                avatarUrl={sender?.avatarUrl}
                size={32}
              />
            </button>
          ) : null}
        </span>
      ) : null}
      <div className="qc-row__main">
        {showAuthor && !isOwn ? (
          <div className="qc-row__head">
            <span className="qc-row__author">{name}</span>
            {message.actorType === "ai_agent" ? <span className="qc-ai-badge">AI</span> : null}
            <span className="qc-row__time">{formatMessageTime(message.createdAt)}</span>
          </div>
        ) : null}

        <div className="qc-bubble">
          {message.parentPreview ? (
            <ParentQuote
              parent={message.parentPreview}
              author={
                actions?.members.find((m) => m.id === message.parentPreview!.senderId)
                  ?.displayName ?? "Someone"
              }
              onJump={actions?.onJumpToParent}
            />
          ) : null}

          {isDeleted ? (
            <span className="qc-deleted">This message was deleted</span>
          ) : editing && actions ? (
            <EditArea message={message} actions={actions} onClose={() => setEditing(false)} />
          ) : (
            <>
              {media.forwardedFrom ? (
                <div className="qc-forwarded">
                  Forwarded from {media.forwardedFrom.senderName}
                  {media.forwardedFrom.sourceChannelName
                    ? ` in #${media.forwardedFrom.sourceChannelName}`
                    : ""}
                </div>
              ) : null}
              {message.type === "Media" ? (
                <MediaContent
                  media={media}
                  onOpen={
                    media.mediaUrl &&
                    (media.mediaType?.startsWith("image/") ||
                      media.mediaType?.startsWith("video/") ||
                      media.mediaType === "application/pdf")
                      ? () =>
                          actions?.onOpenMedia?.({
                            url: media.mediaUrl!,
                            mediaType: media.mediaType!,
                            originalName: media.originalName,
                          })
                      : undefined
                  }
                />
              ) : null}
              {message.content ? <MentionText message={message} /> : null}
              {message.editedAt ? <span className="qc-edited">(edited)</span> : null}
              {message.actorType === "ai_agent" &&
              message.clientMessageId &&
              actions?.liveSourcesById?.[message.clientMessageId]?.length ? (
                <SourceChips sources={actions.liveSourcesById[message.clientMessageId]} />
              ) : null}
              {message.type === "Media" && actions?.onAddToKb ? (
                <AddToKbCard message={message} onAddToKb={actions.onAddToKb} />
              ) : null}
            </>
          )}
        </div>

        {!isDeleted && message.reactions.length > 0 && actions ? (
          <ReactionPills message={message} actions={actions} />
        ) : !isDeleted && message.reactions.length > 0 ? (
          <div className="qc-reactions">
            {message.reactions.map((r) => (
              <span key={r.emoji} className="qc-reaction">
                {r.emoji} {r.count}
              </span>
            ))}
          </div>
        ) : null}

        {isOwn && !isDeleted ? (
          <div className="qc-bubble__meta">
            <span className="qc-row__time">{formatMessageTime(message.createdAt)}</span>
            {tick ? <TickGlyph state={tick} /> : null}
          </div>
        ) : null}

        {showToolbar && !editing ? (
          <MessageToolbar
            onMessageInfo={() => setInfoOpen(true)}
            message={message}
            isOwn={isOwn}
            actions={actions!}
            onStartEdit={() => setEditing(true)}
          />
        ) : null}
      </div>

      {infoOpen ? (
        <MessageInfoPanel
          message={message}
          members={members ?? actions?.members ?? []}
          memberReadAt={memberReadAt ?? {}}
          memberDeliveredAt={memberDeliveredAt ?? {}}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** "Message info": per-member read / delivered / pending breakdown (Step 4). */
function MessageInfoPanel({
  message,
  members,
  memberReadAt,
  memberDeliveredAt,
  onClose,
}: {
  message: MessageDto;
  members: PublicUser[];
  memberReadAt: Record<string, string | null>;
  memberDeliveredAt: Record<string, string | null>;
  onClose: () => void;
}) {
  const audience = partitionMessageAudience(message, members, memberReadAt, memberDeliveredAt);
  const section = (title: string, entries: { user: PublicUser; at: string | null }[]) =>
    entries.length > 0 ? (
      <div className="qc-msginfo__group" key={title}>
        <div className="qc-label">
          {title} · {entries.length}
        </div>
        {entries.map(({ user, at }) => (
          <div key={user.id} className="qc-msginfo__row">
            <Avatar name={user.displayName} id={user.id} avatarUrl={user.avatarUrl} size={24} />
            <span className="qc-msginfo__name">{user.displayName}</span>
            {at ? <span className="qc-row__time">{relativeTime(at)}</span> : null}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <Modal open onClose={onClose} title="Message info">
      <div data-testid="message-info">
        {section("Read by", audience.read)}
        {section("Delivered to", audience.delivered)}
        {section("Pending", audience.pending)}
        {audience.read.length + audience.delivered.length + audience.pending.length === 0 ? (
          <div className="qc-row__time">No other members.</div>
        ) : null}
      </div>
    </Modal>
  );
}
