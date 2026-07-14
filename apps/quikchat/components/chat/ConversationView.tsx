"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChannelList, ChannelListItem, MentionRefInput, MessageDto } from "@/lib/shared";
import { Avatar, Pin, Spinner, useToast } from "@/components/ui";
import {
  addMember,
  deleteMessageApi,
  editMessageApi,
  fetchChannelDetail,
  fetchMembers,
  fetchPinned,
  forwardMessageApi,
  removeMember,
  setMemberRole,
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
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { ForwardModal } from "./ForwardModal";
import { InfoDrawer } from "./InfoDrawer";
import { MediaLightbox, type LightboxItem } from "./MediaLightbox";
import { MessageList } from "./MessageList";
import { type MessageRowActions } from "./MessageRow";
import { ReplyBar } from "./ReplyBar";
import { SchedulingModal } from "./SchedulingModal";
import { TypingIndicator, type TypingUser } from "./TypingIndicator";

export interface ConversationViewProps {
  channel: ChannelListItem;
  currentUserId: string;
  messages: MessageDto[] | undefined;
  loadingMessages: boolean;
  channels: ChannelList | undefined;
  /** User ids currently online (shared-channel presence). */
  online?: ReadonlySet<string>;
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
  channels,
  online,
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
}: ConversationViewProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { registerScheduleWith } = useProfile();
  const channelId = channel.channelId;
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageDto | null>(null);
  const [forwardTarget, setForwardTarget] = useState<MessageDto | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Scheduling modal (S15a). Seeded with channel members (header button) or one
  // user (profile card "Schedule meeting"), which registers the opener below.
  const [scheduleSeed, setScheduleSeed] = useState<string[] | null>(null);

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

  const pinnedQuery = useQuery({
    queryKey: ["pinned", channelId],
    queryFn: () => fetchPinned(channelId),
  });
  const membersQuery = useQuery({
    queryKey: ["members", channelId],
    queryFn: () => fetchMembers(channelId),
    enabled: infoOpen,
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
    onJumpToParent: (id) =>
      document.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ behavior: "smooth" }),
    onOpenMedia: (media) => {
      const idx = gallery.findIndex((g) => g.url === media.url);
      setLightboxIndex(idx >= 0 ? idx : 0);
    },
    onStartCall: onStartMeetingCall,
  };

  const typingUsers: TypingUser[] = (typing ? whoIsTyping(typing, channelId, Date.now()) : [])
    .filter((id) => id !== currentUserId)
    .map((id) => {
      const m = channel.members.find((mm) => mm.id === id);
      return { id, displayName: m?.displayName ?? "Someone", avatarUrl: m?.avatarUrl };
    });

  return (
    <>
      <section className="qc-pane-convo">
        <ConversationHeader
          channel={channel}
          online={online}
          currentUserId={currentUserId}
          onToggleInfo={() => setInfoOpen((v) => !v)}
          onSchedule={() => setScheduleSeed(channel.members.map((m) => m.id))}
          onCall={onCall}
        />
        <PinnedBanner count={pinnedQuery.data?.length ?? 0} onOpen={() => setInfoOpen(true)} />
        {loadingMessages && !messages ? (
          <div className="qc-center-fill">
            <Spinner />
          </div>
        ) : (
          <MessageList
            key={channelId}
            messages={messages ?? []}
            currentUserId={currentUserId}
            members={channel.members}
            memberReadAt={channel.memberReadAt}
            memberDeliveredAt={channel.memberDeliveredAt}
            loading={loadingMessages}
            actions={actions}
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
        <Composer
          members={channel.members.map((m) => ({ id: m.id, displayName: m.displayName }))}
          onSend={(content, mentions) => {
            onSend(content, mentions, replyTarget?.id);
            setReplyTarget(null);
          }}
          onTyping={onTyping ? () => onTyping(channelId) : undefined}
          channelId={channelId}
          onSendMedia={onSendMedia}
          onAssist={onAssist}
          placeholder={`Message ${channel.name ?? ""}`.trim()}
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
          roleError={roleError}
          onCall={onCall}
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
