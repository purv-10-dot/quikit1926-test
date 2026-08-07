"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssistSource,
  ChannelList,
  ChannelListItem,
  MentionRefInput,
  MessageDto,
} from "@/lib/shared";
import { Avatar, Pin, Segmented, Spinner, useToast } from "@/components/ui";
import {
  addMember,
  deleteMessageApi,
  editMessageApi,
  fetchChannelDetail,
  fetchChannelLastSeen,
  ingestDocument,
  fetchMembers,
  fetchPinned,
  forwardMessageApi,
  pinChannel,
  removeMember,
  setMemberRole,
  updateChannel,
  deleteChannel,
  leaveChannel,
  setMessagePinApi,
  toggleReactionApi,
} from "@/lib/api";
import {
  applyDeleteOptimistic,
  applyEditOptimistic,
  applyPinOptimistic,
  toggleReactionOptimistic,
  updateInList,
} from "@/lib/message-actions";
import { whoIsTyping, type TypingState } from "@/lib/typing-store";
import type { MediaMeta } from "@/lib/server/storage/types";
import { useProfile } from "@/components/profile/ProfileProvider";
import { Composer, type ComposerHandle } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { ForwardModal } from "./ForwardModal";
import { InfoDrawer } from "./InfoDrawer";
import { MediaLightbox, type LightboxItem } from "./MediaLightbox";
import { MessageList } from "./MessageList";
import { type MessageRowActions } from "./MessageRow";
import { ReplyBar } from "./ReplyBar";
import { SchedulingModal } from "./SchedulingModal";
import { TypingIndicator, type TypingUser } from "./TypingIndicator";
import type { EffectiveStatus } from "@/lib/presence-store";
import { mentionableMembers } from "@/lib/mentions";

export interface ConversationViewProps {
  channel: ChannelListItem;
  currentUserId: string;
  messages: MessageDto[] | undefined;
  loadingMessages: boolean;
  /**
   * True while `messages` is being (re)fetched, INCLUDING a background
   * refetch of already-cached data — i.e. `messagesQuery.isFetching`, not
   * `.isLoading`. `loadingMessages` alone can't gate the unread divider's
   * resolution: it's false the instant any cached page exists, even a stale
   * one from a previous visit, which is exactly when `messages` can be
   * incomplete relative to `openedUnreadCount`. Threaded straight through to
   * MessageList.
   */
  messagesFetching?: boolean;
  channels: ChannelList | undefined;
  /**
   * This user's unread count for `channel`, captured the instant it was
   * opened (before the read-PATCH zeroes it) — see ChatWorkspace's
   * pickChannel/selectChannel. Threaded straight through to MessageList,
   * which resolves it to a stable divider position once per mount.
   */
  openedUnreadCount?: number;
  /** User ids currently online (shared-channel presence). */
  online?: ReadonlySet<string>;
  /** Effective presence status accessor (rich status dot). Falls back to online-only. */
  statusOf?: (userId: string) => EffectiveStatus;
  /** Typing state across channels (this view reads its own channel). */
  typing?: TypingState;
  onSend: (content: string, mentions: MentionRefInput[], parentMessageId?: string) => void;
  /** Notify the gateway that the current user is typing in this channel. */
  onTyping?: (channelId: string) => void;
  /** Send a Media message after an upload (optimistic, reconciled by the echo). */
  onSendMedia?: (media: MediaMeta, caption: string, localUrl: string) => void;
  /** Invoke the AI assistant (slash-command). */
  onAssist?: (prompt: string) => void;
  /** Live assistant stream text for THIS channel (null when idle). */
  assistStreaming?: string | null;
  /** Stop the in-flight assistant stream (client-side). */
  onStopAssist?: () => void;
  /** Assistant failure message for THIS channel (null when none). */
  assistError?: string | null;
  /** Retry the failed assistant request. */
  onRetryAssist?: () => void;
  /** Dismiss the assistant error bubble. */
  onDismissAssistError?: () => void;
  /** Start a call in the current channel. */
  onCall?: () => void;
  /** Start a call linked to a meeting card. */
  onStartMeetingCall?: (meetingId: string, channelId: string) => void;
  /**
   * Stage 3 retrieval (AI chat only). Ephemeral citations for the live turn,
   * keyed by the bot message's clientMessageId — rendered as source chips.
   */
  liveSources?: Record<string, AssistSource[]>;
  /** Called after a successful "Add to KB" so the workspace appends the new
   * sourceFileId to this conversation's retrieval scope (Option-B auto-scope). */
  onKbIngested?: (sourceFileId: string) => void;
  /** Whole-KB widen toggle state ("search my docs") for AI chat. */
  kbWiden?: boolean;
  /** Toggle the whole-KB widen for the next turns. */
  onToggleKbWiden?: () => void;
  /** How many docs are in this conversation's auto-scope (drives the hint). */
  kbDocCount?: number;
  /**
   * Reuses ChatWorkspace's `onChannelDeleted` teardown (removes the channel
   * from the list cache, clears `activeId` if it was open) — leaving publishes
   * no realtime event for the actor's own client, unlike delete-for-everyone,
   * so this view calls it directly after a successful leave instead of
   * waiting for a socket echo that will never arrive.
   */
  onChannelLeft?: (p: { channelId: string }) => void;
}

export function PinnedBanner({ count, onOpen }: { count: number; onOpen?: () => void }) {
  if (count <= 0) return null;
  return (
    <button type="button" className="qc-pinned-banner" onClick={onOpen} data-testid="pinned-banner">
      <Pin size={14} aria-hidden /> {count} pinned {count === 1 ? "message" : "messages"}
    </button>
  );
}

export function ConversationView({
  channel,
  currentUserId,
  messages,
  loadingMessages,
  messagesFetching,
  channels,
  openedUnreadCount,
  online,
  statusOf,
  typing,
  onSend,
  onTyping,
  onSendMedia,
  onAssist,
  assistStreaming,
  onStopAssist,
  assistError,
  onRetryAssist,
  onDismissAssistError,
  onCall,
  onStartMeetingCall,
  liveSources,
  onKbIngested,
  kbWiden,
  onToggleKbWiden,
  kbDocCount,
  onChannelLeft,
}: ConversationViewProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { registerScheduleWith } = useProfile();
  const channelId = channel.channelId;
  // AI chat = a 1:1 with the assistant bot; calls and meetings don't apply.
  const isAiChat = channel.type === "ai";
  // A group is a place you speak IN; a DM / AI chat is someone you speak TO.
  const composerPlaceholder =
    channel.type === "group"
      ? `Message in ${channel.name ?? ""}`.trim()
      : `Message ${channel.name ?? ""}`.trim();
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageDto | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageDto | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Scheduling modal (S15a). Seeded with channel members (header button) or one
  // user (profile card "Schedule meeting"), which registers the opener below.
  const [scheduleSeed, setScheduleSeed] = useState<string[] | null>(null);

  // Pane-wide file drop (Slack/Teams/WhatsApp accept a drop anywhere over the
  // conversation, not just the composer). This view owns the drag listeners
  // and the overlay; Composer owns the actual staging via one narrow ref
  // entry point (ComposerHandle.stageExternalFiles) so pending/uploading/
  // recording stay private to it.
  const composerRef = useRef<ComposerHandle>(null);
  const [dropActive, setDropActive] = useState(false);
  // dragenter/dragleave fire per element as the pointer crosses children
  // inside the pane (header, message list, composer…) — a depth counter is
  // the standard way to avoid the overlay flickering off between them.
  const dropDepthRef = useRef(0);

  /** Only react to a drag that's actually carrying files — `dataTransfer.files`
   *  itself isn't reliably populated until `drop`, but `types` always is. */
  function isFileDrag(e: React.DragEvent): boolean {
    return !!e.dataTransfer?.types?.includes("Files");
  }

  function handlePaneDragEnter(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dropDepthRef.current += 1;
    setDropActive(true);
  }
  function handlePaneDragOver(e: React.DragEvent) {
    // Required on every dragover for the element to remain a valid drop
    // target — without it the browser rejects the eventual `drop`.
    if (isFileDrag(e)) e.preventDefault();
  }
  function handlePaneDragLeave(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
    if (dropDepthRef.current === 0) setDropActive(false);
  }
  function handlePaneDrop(e: React.DragEvent) {
    dropDepthRef.current = 0;
    setDropActive(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return; // a text-selection drag — leave it alone
    e.preventDefault();
    composerRef.current?.stageExternalFiles(files);
  }

  // Register THIS (active) channel's scheduler so the profile card's "Schedule
  // meeting" opens here seeded with that user; clear it on unmount/switch.
  useEffect(() => {
    registerScheduleWith((userId: string) => setScheduleSeed([userId]));
    return () => registerScheduleWith(null);
  }, [registerScheduleWith, channelId]);

  // Previewable attachments (image/video + PDF) in the loaded thread → the
  // lightbox gallery. PDFs render in an iframe; the rest as media.
  const gallery = useMemo<LightboxItem[]>(() => {
    const out: LightboxItem[] = [];
    for (const m of messages ?? []) {
      if (m.type !== "Media" || !m.data) continue;
      const data = m.data as { mediaUrl?: string; mediaType?: string; originalName?: string };
      if (!data.mediaUrl || !data.mediaType) continue;
      if (
        data.mediaType.startsWith("image/") ||
        data.mediaType.startsWith("video/") ||
        data.mediaType === "application/pdf"
      ) {
        out.push({
          url: data.mediaUrl,
          mediaType: data.mediaType,
          originalName: data.originalName,
        });
      }
    }
    return out;
  }, [messages]);

  const refetchMembers = () => qc.invalidateQueries({ queryKey: ["members", channelId] });

  // QC_010 pin/unpin. Per-user state with no fanout event, so the actor just
  // refetches: ["channels"] moves the row between the Pinned + All sections, and
  // ["channel-detail"] refreshes the drawer's own copy (it renders detail ?? channel).
  const togglePin = async () => {
    const next = !channel.isPriority;
    try {
      await pinChannel(channelId, next);
      void qc.invalidateQueries({ queryKey: ["channels"] });
      void qc.invalidateQueries({ queryKey: ["channel-detail", channelId] });
    } catch {
      toast.error({ title: next ? "Couldn't pin this chat" : "Couldn't unpin this chat" });
    }
  };

  const pinnedQuery = useQuery({
    queryKey: ["pinned", channelId],
    queryFn: () => fetchPinned(channelId),
  });
  const membersQuery = useQuery({
    queryKey: ["members", channelId],
    queryFn: () => fetchMembers(channelId),
    enabled: infoOpen,
  });

  // DM last-seen (header sub-line). Fetched ONLY for a real DM whose peer is
  // currently offline: an online peer reads "Active now" regardless, and groups /
  // AI chats have no single peer. The query re-enables on its own when presence
  // flips the peer offline. Privacy is resolved server-side — this is just a
  // string or null.
  //
  // NO `staleTime`: the default 0 is load-bearing here, not an oversight. This
  // query's subscriber switches off and on with presence, and the answer is
  // privacy-gated — the peer can revoke `shareLastSeen` with NO event reaching us,
  // because a privacy-only PUT deliberately skips the presence fan-out. Any
  // non-zero window let a re-subscribing observer be served a cached answer that
  // privacy had since changed, which is how a 60s cache became an indefinite leak
  // (nothing refetches on staleness alone). It also makes the fix in
  // ChatWorkspace's presence handlers order-independent: an invalidation that
  // lands while this query is still disabled only marks it stale, and stale is
  // enough to force the refetch when presence re-enables it a render later.
  const dmPeerId =
    channel.type === "dm"
      ? channel.members.find((m) => m.id !== currentUserId)?.id
      : undefined;
  const dmPeerOnline = dmPeerId ? !!online?.has(dmPeerId) : false;
  const lastSeenQuery = useQuery({
    queryKey: ["last-seen", channelId],
    queryFn: () => fetchChannelLastSeen(channelId),
    enabled: !!dmPeerId && !dmPeerOnline,
  });
  const detailQuery = useQuery({
    queryKey: ["channel-detail", channelId],
    queryFn: () => fetchChannelDetail(channelId),
    enabled: infoOpen,
  });

  const patchMessage = (id: string, fn: (m: MessageDto) => MessageDto) =>
    qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
      updateInList(old ?? [], id, fn),
    );

  const actions: MessageRowActions = {
    meId: currentUserId,
    members: channel.members,
    onToggleReaction: (id, emoji) => {
      patchMessage(id, (m) => toggleReactionOptimistic(m, emoji, currentUserId));
      void toggleReactionApi(id, emoji).catch(() => undefined);
    },
    onEdit: (id, content, mentions) => {
      patchMessage(id, (m) =>
        applyEditOptimistic(m, content, mapMentions(mentions, channel), now()),
      );
      void editMessageApi(id, { content, mentions }).catch(() => undefined);
    },
    onDelete: (id) => {
      patchMessage(id, applyDeleteOptimistic);
      void deleteMessageApi(id).catch(() => undefined);
    },
    onTogglePin: (m) => {
      patchMessage(m.id, (msg) => applyPinOptimistic(msg, !m.isPinned));
      void setMessagePinApi(m.id, !m.isPinned)
        .then(() => qc.invalidateQueries({ queryKey: ["pinned", channelId] }))
        .catch(() => undefined);
    },
    onReply: (m) => setReplyTarget(m),
    onForward: (m) => setForwardTarget(m),
    onJumpToParent: (id) => {
      const el = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      // No-op when the parent isn't rendered (it's in an older, not-yet-loaded
      // page). Paging-history-to-parent is out of scope for this fix.
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Brief highlight so it's visible WHERE you landed. Remove → force reflow →
      // add so a repeat jump to the same row re-triggers the animation.
      el.classList.remove("qc-row--flash");
      void el.offsetWidth;
      el.classList.add("qc-row--flash");
      window.setTimeout(() => el.classList.remove("qc-row--flash"), 1500);
    },
    onOpenMedia: (media) => {
      const idx = gallery.findIndex((g) => g.url === media.url);
      setLightboxIndex(idx >= 0 ? idx : 0);
    },
    onStartCall: onStartMeetingCall,
    // Stage 3 "Add to KB" — only in an AI chat. The Media row carries the durable
    // storageKey (data.objectPath) + filename; the relay authorizes it + mints
    // sourceFileId. Toast the (already user-facing) reason on failure; rethrow so
    // the card resets to idle for a retry.
    onAddToKb: isAiChat
      ? async (message, visibility) => {
          const data = (message.data ?? {}) as { objectPath?: string; originalName?: string };
          try {
            const result = await ingestDocument(channelId, {
              storageKey: data.objectPath ?? "",
              filename: data.originalName ?? "document",
              visibility,
              // Pass the message id so the server persists the KB marker on this
              // row by primary key (Option-B auto-scope).
              messageId: message.id,
            });
            // Append to this conversation's retrieval scope so follow-up Q&A
            // "just works" without a reload (server marker covers reload).
            onKbIngested?.(result.sourceFileId);
            return result;
          } catch (e) {
            toast.error({
              title: "Couldn't add to knowledge base",
              body: e instanceof Error ? e.message : undefined,
            });
            throw e;
          }
        }
      : undefined,
    liveSourcesById: liveSources,
  };

  const typingUsers: TypingUser[] = (typing ? whoIsTyping(typing, channelId, Date.now()) : [])
    .filter((id) => id !== currentUserId)
    .map((id) => {
      const m = channel.members.find((mm) => mm.id === id);
      return { id, displayName: m?.displayName ?? "Someone", avatarUrl: m?.avatarUrl };
    });

  return (
    <>
      <section
        className="qc-pane-convo"
        onDragEnter={handlePaneDragEnter}
        onDragOver={handlePaneDragOver}
        onDragLeave={handlePaneDragLeave}
        onDrop={handlePaneDrop}
      >
        {dropActive ? (
          <div className="qc-drop-overlay" aria-hidden="true">
            <span className="qc-drop-overlay__label">Drop file to attach</span>
          </div>
        ) : null}
        <ConversationHeader
          channel={channel}
          online={online}
          statusOf={statusOf}
          currentUserId={currentUserId}
          lastSeen={lastSeenQuery.data?.lastSeen ?? null}
          onToggleInfo={() => setInfoOpen((v) => !v)}
          onSchedule={isAiChat ? undefined : () => setScheduleSeed(channel.members.map((m) => m.id))}
          onCall={isAiChat ? undefined : onCall}
          onTogglePin={() => void togglePin()}
        />
        <PinnedBanner count={pinnedQuery.data?.length ?? 0} onOpen={() => setInfoOpen(true)} />
        {loadingMessages && !messages ? (
          <div className="qc-center-fill">
            <Spinner />
          </div>
        ) : (
          <MessageList
            // Prefixed so this can't collide with Composer's key below — React's
            // key uniqueness spans ALL siblings of one parent, across component
            // types. Still channel-scoped, so the remount-per-switch stands.
            key={`ml-${channelId}`}
            messages={messages ?? []}
            currentUserId={currentUserId}
            members={channel.members}
            memberReadAt={channel.memberReadAt}
            memberDeliveredAt={channel.memberDeliveredAt}
            loading={loadingMessages}
            actions={actions}
            openedUnreadCount={openedUnreadCount}
            messagesFetching={messagesFetching}
          />
        )}
        {replyTarget ? (
          <ReplyBar
            target={replyTarget}
            members={channel.members}
            currentUserId={currentUserId}
            onCancel={() => setReplyTarget(null)}
          />
        ) : null}
        {assistStreaming != null ? (
          <div
            className="qc-assist-stream"
            role="status"
            aria-live="polite"
            data-testid="assist-stream"
          >
            <Avatar name="Assistant" id="quikchat-assistant-bot" size={28} />
            <div className="qc-assist-stream__body">
              <div className="qc-assist-stream__head">
                <span className="qc-assist-stream__name">Assistant</span>
                <span className="qc-ai-badge">AI</span>
              </div>
              <div className="qc-assist-stream__text">
                {assistStreaming || "Thinking…"}
                <span className="qc-assist-stream__caret" aria-hidden />
              </div>
            </div>
            <button type="button" className="qc-btn qc-assist-stream__stop" onClick={onStopAssist}>
              Stop
            </button>
          </div>
        ) : null}
        {assistError != null ? (
          <div className="qc-assist-error" role="alert" data-testid="assist-error">
            <Avatar name="Assistant" id="quikchat-assistant-bot" size={28} />
            <div className="qc-assist-error__body">
              <div className="qc-assist-error__head">
                <span className="qc-assist-error__name">Assistant</span>
                <span className="qc-ai-badge">AI</span>
              </div>
              <div className="qc-assist-error__text">
                Couldn&apos;t get a response. {assistError}
              </div>
              <div className="qc-assist-error__actions">
                <button type="button" className="qc-btn" onClick={onRetryAssist}>
                  Retry
                </button>
                <button
                  type="button"
                  className="qc-btn qc-btn--ghost"
                  onClick={onDismissAssistError}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <TypingIndicator users={typingUsers} />
        {isAiChat ? (
          <div className="qc-kb-scope" data-testid="kb-scope">
            <Segmented
              label="Knowledge base scope"
              options={[
                { label: "This chat", value: "chat" },
                { label: "All my docs", value: "all" },
              ]}
              value={kbWiden ? "all" : "chat"}
              onChange={(v) => {
                // Parent exposes a flip, not a setter — only toggle on a real change.
                const widen = v === "all";
                if (widen !== !!kbWiden) onToggleKbWiden?.();
              }}
            />
            <span className="qc-kb-scope__hint">
              {kbWiden
                ? "Searching your whole knowledge base."
                : kbDocCount
                  ? `${kbDocCount} doc${kbDocCount === 1 ? "" : "s"} in this chat`
                  : "Attach a document and add it to the knowledge base to ask about it."}
            </span>
          </div>
        ) : null}
        <Composer
          // Remount per channel, same as MessageList above. TipTap's useEditor
          // builds the editor (and `Placeholder.configure`) once per mount and
          // never re-reads the prop, so without this the placeholder — and any
          // half-typed text — stays frozen on whichever channel was open first.
          // Prefixed to stay distinct from MessageList's key (same parent).
          key={`composer-${channelId}`}
          ref={composerRef}
          currentUserId={currentUserId}
          members={mentionableMembers(
            channel.members.map((m) => ({ id: m.id, displayName: m.displayName })),
            currentUserId,
          )}
          onSend={(content, mentions) => {
            onSend(content, mentions, replyTarget?.id);
            setReplyTarget(null);
          }}
          onTyping={onTyping ? () => onTyping(channelId) : undefined}
          channelId={channelId}
          onSendMedia={onSendMedia}
          onAssist={onAssist}
          placeholder={composerPlaceholder}
        />
      </section>

      {lightboxIndex !== null && gallery.length > 0 ? (
        <MediaLightbox
          items={gallery}
          index={Math.min(lightboxIndex, gallery.length - 1)}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}

      {infoOpen ? (
        <InfoDrawer
          channel={detailQuery.data ?? channel}
          members={membersQuery.data ?? []}
          pinned={pinnedQuery.data ?? []}
          currentUserId={currentUserId}
          onlineIds={online}
          statusOf={statusOf}
          roleError={roleError}
          onCall={isAiChat ? undefined : onCall}
          onTogglePin={() => void togglePin()}
          onBack={() => setInfoOpen(false)}
          onAddMembers={async (userIds) => {
            setRoleError(null);
            for (const id of userIds) await addMember(channelId, id).catch(() => undefined);
            void refetchMembers();
            void qc.invalidateQueries({ queryKey: ["channels"] });
          }}
          onRemoveMember={async (userId) => {
            setRoleError(null);
            await removeMember(channelId, userId).catch(() => undefined);
            void refetchMembers();
          }}
          onSetRole={async (userId, role) => {
            setRoleError(null);
            try {
              await setMemberRole(channelId, userId, role);
              void refetchMembers();
            } catch (e) {
              setRoleError(e instanceof Error ? e.message : "Could not change role");
            }
          }}
          onUpdateDetails={async (patch) => {
            setRoleError(null);
            try {
              await updateChannel(channelId, patch);
              // Actor's own refresh; other members update live via `channel_updated`.
              void qc.invalidateQueries({ queryKey: ["channel-detail", channelId] });
              void qc.invalidateQueries({ queryKey: ["channels"] });
            } catch (e) {
              setRoleError(e instanceof Error ? e.message : "Could not update group");
            }
          }}
          onDeleteGroup={async () => {
            setRoleError(null);
            try {
              await deleteChannel(channelId);
              // Close the drawer now; the `channel_deleted` echo (the actor is in
              // the channel room too) removes it from the list + clears the view.
              setInfoOpen(false);
              void qc.invalidateQueries({ queryKey: ["channels"] });
            } catch (e) {
              setRoleError(e instanceof Error ? e.message : "Could not delete group");
            }
          }}
          onLeaveChannel={async () => {
            setRoleError(null);
            try {
              await leaveChannel(channelId);
              // `leave` publishes no realtime event for the actor's own client
              // (unlike delete-for-everyone), so drive the same teardown directly.
              setInfoOpen(false);
              onChannelLeft?.({ channelId });
            } catch (e) {
              setRoleError(e instanceof Error ? e.message : "Could not leave");
            }
          }}
        />
      ) : null}

      {scheduleSeed ? (
        <SchedulingModal
          channelId={channelId}
          currentUserId={currentUserId}
          members={channel.members}
          seedAttendeeIds={scheduleSeed}
          onClose={() => setScheduleSeed(null)}
          onCreated={() => toast.success({ title: "Meeting scheduled" })}
        />
      ) : null}

      <ForwardModal
        open={!!forwardTarget}
        message={forwardTarget}
        channels={channels}
        onClose={() => setForwardTarget(null)}
        onForward={async (id, channelIds, note) => {
          const { delivered } = await forwardMessageApi(id, {
            channelIds,
            note: note || undefined,
          });
          const n = delivered.length;
          toast.success({
            title: `Forwarded to ${n} ${n === 1 ? "conversation" : "conversations"}`,
          });
        }}
      />
    </>
  );
}

function now(): string {
  return new Date().toISOString();
}

function mapMentions(refs: MentionRefInput[], channel: ChannelListItem) {
  const nameById = new Map(channel.members.map((m) => [m.id, m.displayName]));
  return refs.map((r) => ({
    userId: r.userId,
    displayName: r.userId === "everyone" ? "everyone" : (nameById.get(r.userId) ?? "unknown"),
    offsetStart: r.offsetStart,
    offsetEnd: r.offsetEnd,
  }));
}
