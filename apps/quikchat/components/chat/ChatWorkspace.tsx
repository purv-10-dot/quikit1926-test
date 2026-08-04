"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ChannelList,
  ChannelListItem,
  MentionRefInput,
  Mention,
  MessageDto,
} from "@/lib/shared";
import { EmptyState, MessageSquare, useToast, WifiOff } from "@/components/ui";
import {
  createChannel,
  fetchChannels,
  fetchKbDocs,
  fetchMessages,
  markChannelDeliveredApi,
  markChannelReadApi,
  openAiChat,
  sendMessage,
} from "@/lib/api";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { useProfile } from "@/components/profile/ProfileProvider";
import {
  createRealtimeClient,
  fetchRealtimeToken,
  type RealtimeClient,
} from "@/lib/realtime-client";
import {
  applyChannelUpdated,
  applyDeliveredEvent,
  applyReadEvent,
  bumpChannelList,
  makeTempId,
  markChannelRead,
  mergeMessageEvent,
  patchMessageEvent,
  removeChannelFromList,
  seedFromApiPage,
  shouldApplyDelivered,
  shouldApplyRead,
} from "@/lib/realtime-cache";
import {
  applyPresence,
  applySnapshot,
  applyStatus,
  emptyPresence,
  nextExpiry,
  statusOf,
  type EffectiveStatus,
  type PresenceEvent,
  type PresenceSnapshot,
  type PresenceState,
  type PresenceStatusEvent,
} from "@/lib/presence-store";
import { applyTyping, emptyTyping, pruneTyping, type TypingState } from "@/lib/typing-store";
import { streamAssist } from "@/lib/assist-client";
import type { AssistSource } from "@/lib/shared";
import { useMyPermissions } from "@/lib/authz/useMyPermissions";
import type { MediaMeta } from "@/lib/server/storage/types";
import { CallHandler } from "../calling/CallHandler";
import { RejoinBanner } from "../calling/RejoinBanner";
import { fetchActiveCall, type ActiveCallInfo } from "@/lib/call-state";
import { ChannelList as ChannelListView } from "./ChannelList";
import { ConversationView } from "./ConversationView";
import { DiscoverModal } from "./DiscoverModal";
import { NewChatModal } from "./NewChatModal";
import { NewGroupModal } from "./NewGroupModal";

// Mirror of `ASSISTANT_BOT_USER_ID` in @quikit/shared. Defined locally (not
// value-imported) so this client module never pulls the shared barrel's
// server-only deps (ioredis/sentry) into the browser bundle. Kept in sync with
// the other client mirrors in ticks.ts / SchedulingModal.tsx.
const ASSISTANT_BOT_USER_ID = "quikchat-assistant-bot";

export interface ChatWorkspaceProps {
  currentUserId: string;
  currentUserName: string;
  workspaceName: string;
  realtimeUrl: string;
  /** Deep-link target (e.g. after accepting an invite at /?channel=...). */
  initialChannelId?: string;
}

function insertChannel(list: ChannelList, channel: ChannelListItem): ChannelList {
  const exists = [...list.priority, ...list.recent].some((c) => c.channelId === channel.channelId);
  if (exists) return list;
  return { ...list, recent: [channel, ...list.recent] };
}

function lastMessageOf(dto: MessageDto) {
  return {
    id: dto.id,
    type: dto.type,
    content: dto.content,
    senderId: dto.senderId,
    createdAt: dto.createdAt,
  };
}

export function ChatWorkspace({
  currentUserId,
  currentUserName,
  workspaceName,
  realtimeUrl,
  initialChannelId,
}: ChatWorkspaceProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const notifications = useNotifications();
  // RBAC v2 client gate (Phase 2, cosmetic — server enforces). Currently drives
  // the public-channel option (DECISION 2). Server 403s any ungranted action.
  const perms = useMyPermissions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceState>(emptyPresence);
  const [typing, setTyping] = useState<TypingState>(emptyTyping);
  const [assist, setAssist] = useState<{ channelId: string; text: string } | null>(null);
  const [assistError, setAssistError] = useState<{
    channelId: string;
    prompt: string;
    message: string;
  } | null>(null);
  const [rejoinCall, setRejoinCall] = useState<ActiveCallInfo | null>(null);
  const assistAbort = useRef<AbortController | null>(null);
  // Stage 3 retrieval (AI chat): the conversation's KB scope (sourceFileIds),
  // seeded from the server marker on mount + appended on each "Add to KB"; a
  // whole-KB widen toggle ("search my docs"); and ephemeral citation chips keyed
  // by the bot message's clientMessageId (never persisted — decision 3).
  const [kbSourceIds, setKbSourceIds] = useState<string[]>([]);
  const [kbWiden, setKbWiden] = useState(false);
  const [liveSources, setLiveSources] = useState<Record<string, AssistSource[]>>({});
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const clientRef = useRef<RealtimeClient | null>(null);

  // Check for active calls on mount (rejoin after refresh)
  useEffect(() => {
    void fetchActiveCall().then((call) => {
      if (call) setRejoinCall(call);
    });
  }, []);

  const channelsQuery = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    // The API returns newest-first; the canonical cache is always ascending
    // (oldest→newest) so optimistic appends + date dividers read top→bottom.
    queryFn: async () => seedFromApiPage(await fetchMessages(activeId!)),
    enabled: !!activeId,
  });

  const activeChannel: ChannelListItem | undefined = useMemo(() => {
    const data = channelsQuery.data;
    if (!data || !activeId) return undefined;
    return [...data.priority, ...data.recent].find((c) => c.channelId === activeId);
  }, [channelsQuery.data, activeId]);

  const isAiChat = activeChannel?.type === "ai";

  // Seed this conversation's KB retrieval scope from the server marker on
  // activation (Option-B: scope survives reload). Reset widen + scope when
  // switching channels; non-AI channels carry no scope.
  useEffect(() => {
    setKbWiden(false);
    if (!activeId || !isAiChat) {
      setKbSourceIds([]);
      return;
    }
    let cancelled = false;
    void fetchKbDocs(activeId)
      .then((ids) => {
        if (!cancelled) setKbSourceIds(ids);
      })
      .catch(() => {
        if (!cancelled) setKbSourceIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, isAiChat]);

  const appendKbSource = useCallback((sourceFileId: string) => {
    setKbSourceIds((prev) => (prev.includes(sourceFileId) ? prev : [...prev, sourceFileId]));
  }, []);

  // Build the per-turn knowledgeBase field (decision 2): widen → whole KB (no
  // ids); ≥1 doc in scope → scoped; zero docs → omit entirely (plain turn).
  const buildKnowledgeBase = useCallback(():
    | { enabled: boolean; sourceFileIds?: string[] }
    | undefined => {
    if (!isAiChat) return undefined;
    if (kbWiden) return { enabled: true };
    if (kbSourceIds.length) return { enabled: true, sourceFileIds: kbSourceIds };
    return undefined;
  }, [isAiChat, kbWiden, kbSourceIds]);

  // Debounced per-channel delivery advance: when our client receives a message
  // for ANY channel (delivery ≠ viewing), tell the server we got it so senders
  // see ✓✓. Coalesced so a burst of inbound messages is one PATCH per channel.
  const deliveredTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const advanceDelivered = useCallback((channelId: string) => {
    const timers = deliveredTimers.current;
    if (timers.has(channelId)) return; // already scheduled
    timers.set(
      channelId,
      setTimeout(() => {
        timers.delete(channelId);
        void markChannelDeliveredApi(channelId).catch(() => undefined);
      }, 400),
    );
  }, []);

  // --- realtime cache merge ---
  const onMessage = useCallback(
    (dto: MessageDto) => {
      qc.setQueryData<MessageDto[]>(["messages", dto.channelId], (old) =>
        mergeMessageEvent(old ?? [], dto, currentUserId),
      );
      const list = qc.getQueryData<ChannelList>(["channels"]);
      const known =
        !!list && [...list.priority, ...list.recent].some((c) => c.channelId === dto.channelId);
      if (list && !known) {
        // First message for a channel we don't have in our list yet — e.g. a
        // group someone just created us into. The gateway socket-joined us to the
        // room (so the message arrived), but there's no list row for
        // bumpChannelList to surface, so the channel would stay invisible until a
        // refresh. Refetch the list so it appears live. (No client-facing
        // `channel_created` event exists — the gateway consumes it server-side via
        // socketsJoin — so the first inbound message is the signal.)
        void qc.invalidateQueries({ queryKey: ["channels"] });
      } else {
        qc.setQueryData<ChannelList>(["channels"], (old) =>
          old
            ? bumpChannelList(old, dto.channelId, lastMessageOf(dto), {
                active: dto.channelId === activeIdRef.current,
                fromSelf: dto.senderId === currentUserId,
              })
            : old,
        );
      }
      // Our client received someone else's message → mark it delivered.
      if (dto.senderId && dto.senderId !== currentUserId) advanceDelivered(dto.channelId);
    },
    [qc, currentUserId, advanceDelivered],
  );

  const onPatch = useCallback(
    (dto: MessageDto) => {
      qc.setQueryData<MessageDto[]>(["messages", dto.channelId], (old) =>
        patchMessageEvent(old ?? [], dto),
      );
    },
    [qc],
  );

  // Live read receipts: merge other members' `read` into memberReadAt. Ignore
  // our own (self is excluded from "read by others").
  const onRead = useCallback(
    (p: { channelId: string; userId: string; readAt: string }) => {
      if (!shouldApplyRead(p.userId, currentUserId)) return;
      qc.setQueryData<ChannelList>(["channels"], (old) =>
        old ? applyReadEvent(old, p.channelId, p.userId, p.readAt) : old,
      );
    },
    [qc, currentUserId],
  );

  // Live delivery receipts: merge other members' `delivered` into memberDeliveredAt.
  const onDelivered = useCallback(
    (p: { channelId: string; userId: string; deliveredAt: string }) => {
      if (!shouldApplyDelivered(p.userId, currentUserId)) return;
      qc.setQueryData<ChannelList>(["channels"], (old) =>
        old ? applyDeliveredEvent(old, p.channelId, p.userId, p.deliveredAt) : old,
      );
    },
    [qc, currentUserId],
  );

  // Live group edit: merge name/description/avatar in place (QC_008). Also
  // refresh the open drawer's detail so its fields reflect the change.
  const onChannelUpdated = useCallback(
    (p: { channelId: string; name?: string; description?: string | null; avatarUrl?: string }) => {
      qc.setQueryData<ChannelList>(["channels"], (old) =>
        old ? applyChannelUpdated(old, p) : old,
      );
      void qc.invalidateQueries({ queryKey: ["channel-detail", p.channelId] });
    },
    [qc],
  );

  // Live group delete-for-everyone: remove it from the list; if it's the active
  // channel, clear the view (QC_008).
  const onChannelDeleted = useCallback(
    (p: { channelId: string }) => {
      qc.setQueryData<ChannelList>(["channels"], (old) =>
        old ? removeChannelFromList(old, p.channelId) : old,
      );
      if (p.channelId === activeIdRef.current) setActiveId(null);
    },
    [qc],
  );

  // Opens (or focuses) the call popup for an SFU/group call. The token is
  // fetched by the call page itself from POST /api/calls/:id/token — this URL
  // only ever carries non-secret routing hints (CALL-3 hardening).
  const openGroupCallWindow = useCallback(
    (callId: string, name: string, type: "audio" | "video") => {
      const params = new URLSearchParams({
        callId,
        name,
        myUserId: currentUserId,
        type,
        group: "1",
      });
      window.open(
        `/call/${callId}?${params.toString()}`,
        "quikchat-group-call",
        "width=1000,height=700,popup=yes,menubar=no,toolbar=no,location=no,status=no",
      );
    },
    [currentUserId],
  );

  // A channel member other than us started a group call (CALL-3 §3). We
  // already open our own window when WE start one, so skip that case. This is
  // a live-only nudge for members with the app open; a member who's offline or
  // catches up later still finds the call via the rejoin banner (fetchActiveCall
  // on mount) since they're already a QcCallParticipant from call creation.
  const onGroupCallStarted = useCallback(
    (p: { callId: string; channelId: string; initiatorId: string; type: "audio" | "video" }) => {
      if (p.initiatorId === currentUserId) return;
      const list = qc.getQueryData<ChannelList>(["channels"]);
      const channel = list && [...list.priority, ...list.recent].find(
        (c) => c.channelId === p.channelId,
      );
      const name = channel?.name ?? "a channel";
      toast.info({
        title: `Group call started in #${name}`,
        body: "Click to join",
        durationMs: 20_000,
        onClick: () => openGroupCallWindow(p.callId, channel?.name ?? "Group call", p.type),
      });
    },
    [qc, currentUserId, toast, openGroupCallWindow],
  );

  // Latest event handlers + notifications, read through a ref by the socket's
  // stable wrappers. This keeps the socket effect's deps at `[realtimeUrl]` so
  // the socket is created ONCE per session: previously `notifications` (a
  // context value that re-memoizes on every notification-state change — every
  // new notification, unread-count tick, or read-mark) was in the deps, so the
  // effect re-ran and tore down + recreated the socket constantly, dropping the
  // very `read`/`delivered` events the ticks depend on.
  const handlersRef = useRef({
    onMessage,
    onPatch,
    onRead,
    onDelivered,
    onChannelUpdated,
    onChannelDeleted,
    onGroupCallStarted,
    notifications,
  });
  handlersRef.current = {
    onMessage,
    onPatch,
    onRead,
    onDelivered,
    onChannelUpdated,
    onChannelDeleted,
    onGroupCallStarted,
    notifications,
  };

  useEffect(() => {
    const client = createRealtimeClient({
      url: realtimeUrl || window.location.origin,
      getToken: fetchRealtimeToken,
    });
    clientRef.current = client;
    client.on("message", (d) => handlersRef.current.onMessage(d as MessageDto));
    client.on("system", (d) => handlersRef.current.onMessage(d as MessageDto));
    client.on("message_update", (d) => handlersRef.current.onPatch(d as MessageDto));
    client.on("reaction", (d) => handlersRef.current.onPatch(d as MessageDto));
    client.on("read", (d) =>
      handlersRef.current.onRead(d as { channelId: string; userId: string; readAt: string }),
    );
    client.on("delivered", (d) =>
      handlersRef.current.onDelivered(
        d as { channelId: string; userId: string; deliveredAt: string },
      ),
    );
    client.on("channel_updated", (d) =>
      handlersRef.current.onChannelUpdated(
        d as { channelId: string; name?: string; description?: string | null; avatarUrl?: string },
      ),
    );
    client.on("channel_deleted", (d) =>
      handlersRef.current.onChannelDeleted(d as { channelId: string }),
    );
    client.on("call_group_started", (d) =>
      handlersRef.current.onGroupCallStarted(
        d as { callId: string; channelId: string; initiatorId: string; type: "audio" | "video" },
      ),
    );
    client.on("presence", (d) => setPresence((s) => applyPresence(s, d as PresenceEvent)));
    client.on("presence_status", (d) =>
      setPresence((s) => applyStatus(s, d as PresenceStatusEvent)),
    );
    client.on("presence_snapshot", (d) =>
      setPresence((s) => applySnapshot(s, d as PresenceSnapshot)),
    );
    client.on("typing", (d) =>
      setTyping((s) => applyTyping(s, d as { channelId: string; userId: string }, Date.now())),
    );
    client.socket.on("connect", () => setConnected(true));
    client.socket.on("disconnect", () => setConnected(false));
    client.socket.on("connect_error", () => setConnected(false));
    // Hand the same client to the notifications layer so the bell + toasts +
    // OS notifications ride the existing per-user `notification` event.
    handlersRef.current.notifications.attachClient(client);
    return () => {
      clientRef.current = null;
      client.disconnect();
    };
  }, [realtimeUrl]);

  // Expire stale typing indicators (no explicit "stop" is ever sent).
  useEffect(() => {
    const t = setInterval(() => setTyping((s) => pruneTyping(s, Date.now())), 1_000);
    return () => clearInterval(t);
  }, []);

  const emitTyping = useCallback((channelId: string) => {
    clientRef.current?.typing(channelId);
  }, []);

  // Effective presence status accessor — the store reconciles the ephemeral
  // (online/offline/on_call) and durable (set-status) streams via precedence.
  const statusOfUser = useCallback(
    (userId: string): EffectiveStatus => statusOf(presence, userId),
    [presence],
  );

  // Timed-status re-resolve (cosmetic; server read-expiry is authoritative). When
  // the nearest set-status expiry passes, nudge presence to a new ref so statusOf
  // recomputes and the now-expired status falls through to online — no interaction
  // needed. Self-heals on any reconnect/refetch regardless.
  useEffect(() => {
    const next = nextExpiry(presence);
    if (next == null) return;
    const t = setTimeout(() => setPresence((s) => ({ ...s })), Math.max(0, next - Date.now()) + 250);
    return () => clearTimeout(t);
  }, [presence]);

  const pickChannel = useCallback(
    (id: string) => {
      setActiveId(id);
      qc.setQueryData<ChannelList>(["channels"], (old) => (old ? markChannelRead(old, id) : old));
      void markChannelReadApi(id);
      // Opening a channel silences its bell too (server already fires
      // read-by-channel; this keeps the notification badge in sync locally).
      void notifications.markChannelRead(id);
    },
    [qc, notifications],
  );

  /**
   * Land on a channel that may not be in the list yet (create / join / accept):
   * refetch the list, ensure the realtime room is joined (auto-join also fires
   * via `channel_created`, but join() is belt-and-suspenders for the actor),
   * select it, and clear its unread.
   */
  const selectChannel = useCallback(
    (id: string) => {
      setActiveId(id);
      void clientRef.current?.join(id);
      void qc.invalidateQueries({ queryKey: ["channels"] });
      qc.setQueryData<ChannelList>(["channels"], (old) => (old ? markChannelRead(old, id) : old));
      void markChannelReadApi(id);
      void notifications.markChannelRead(id);
    },
    [qc, notifications],
  );

  // Let the notification bell / toasts / OS clicks jump to a channel.
  useEffect(() => {
    notifications.registerChannelOpener((channelId) => selectChannel(channelId));
  }, [notifications, selectChannel]);

  const onChannelReady = useCallback(
    (channel: ChannelListItem) => {
      qc.setQueryData<ChannelList>(["channels"], (old) =>
        old ? insertChannel(old, channel) : old,
      );
      selectChannel(channel.channelId);
    },
    [qc, selectChannel],
  );

  // "Message" from a profile card (S14b): start/open a DM with that user, then
  // land on it (reuses the S06 DM-create + selectChannel via onChannelReady).
  const { registerStartDm, registerStartCall } = useProfile();
  useEffect(() => {
    registerStartDm((userId: string) => {
      void createChannel({ type: "dm", visibility: "private", memberIds: [userId] })
        .then(onChannelReady)
        .catch(() => toast.error({ title: "Couldn't start that conversation" }));
    });
  }, [registerStartDm, onChannelReady, toast]);

  // "Call" from a profile card: initiate a call with that user.
  const [callTargetUserId, setCallTargetUserId] = useState<string | null>(null);
  useEffect(() => {
    registerStartCall((userId) => {
      setCallTargetUserId(userId);
    });
  }, [registerStartCall]);

  // Deep-link (e.g. /?channel=… after accepting an invite). Run once.
  const didDeepLink = useRef(false);
  useEffect(() => {
    if (initialChannelId && !didDeepLink.current) {
      didDeepLink.current = true;
      selectChannel(initialChannelId);
    }
  }, [initialChannelId, selectChannel]);

  const handleSend = useCallback(
    (content: string, mentionRefs: MentionRefInput[], parentMessageId?: string) => {
      if (!activeChannel) return;
      const channelId = activeChannel.channelId;
      const nameById = new Map(activeChannel.members.map((m) => [m.id, m.displayName]));
      const mentions: Mention[] = mentionRefs.map((r) => ({
        userId: r.userId,
        displayName: r.userId === "everyone" ? "everyone" : (nameById.get(r.userId) ?? "unknown"),
        offsetStart: r.offsetStart,
        offsetEnd: r.offsetEnd,
      }));
      const parent = parentMessageId
        ? (qc.getQueryData<MessageDto[]>(["messages", channelId]) ?? []).find(
            (m) => m.id === parentMessageId,
          )
        : undefined;
      // Idempotency key: stamped on the optimistic row and sent to the server so
      // a retry returns the same row and the echo reconciles exactly by id.
      const clientMessageId = crypto.randomUUID();
      const optimistic: MessageDto = {
        id: makeTempId(),
        channelId,
        senderId: currentUserId,
        actorType: "human",
        type: "Text",
        content,
        data: null,
        parentMessageId: parentMessageId ?? null,
        parentPreview: parent
          ? { id: parent.id, senderId: parent.senderId, type: parent.type, content: parent.content }
          : null,
        isPinned: false,
        reactions: [],
        mentions,
        clientMessageId,
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      qc.setQueryData<MessageDto[]>(["messages", channelId], (old) => [...(old ?? []), optimistic]);

      sendMessage(channelId, { content, mentions: mentionRefs, parentMessageId, clientMessageId })
        .then((server) => {
          // Reconcile the temp row even if the realtime echo never arrives.
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            mergeMessageEvent(old ?? [], server, currentUserId),
          );
          qc.setQueryData<ChannelList>(["channels"], (old) =>
            old
              ? bumpChannelList(old, channelId, lastMessageOf(server), {
                  active: true,
                  fromSelf: true,
                })
              : old,
          );
        })
        .catch(() => {
          // Drop the optimistic row on failure.
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            (old ?? []).filter((m) => m.id !== optimistic.id),
          );
          toast.error({
            title: "Couldn't send",
            body: "Your message wasn't delivered — try again.",
          });
        });
    },
    [activeChannel, currentUserId, qc, toast],
  );

  // Media send: bytes are already uploaded (Composer did sign → PUT). Post a
  // `Media` message referencing objectPath; the optimistic row shows a local
  // preview URL until the echo reconciles it (by clientMessageId) with a fresh
  // server-minted signed URL.
  const handleSendMedia = useCallback(
    (media: MediaMeta, caption: string, localUrl: string) => {
      if (!activeChannel) return;
      const channelId = activeChannel.channelId;
      const clientMessageId = crypto.randomUUID();
      const optimistic: MessageDto = {
        id: makeTempId(),
        channelId,
        senderId: currentUserId,
        actorType: "human",
        type: "Media",
        content: caption,
        data: { ...media, mediaUrl: localUrl },
        parentMessageId: null,
        parentPreview: null,
        isPinned: false,
        reactions: [],
        mentions: [],
        clientMessageId,
        createdAt: new Date().toISOString(),
        editedAt: null,
      };
      qc.setQueryData<MessageDto[]>(["messages", channelId], (old) => [...(old ?? []), optimistic]);

      sendMessage(channelId, {
        content: caption,
        type: "Media",
        data: { ...media },
        clientMessageId,
      })
        .then((server) => {
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            mergeMessageEvent(old ?? [], server, currentUserId),
          );
          qc.setQueryData<ChannelList>(["channels"], (old) =>
            old
              ? bumpChannelList(old, channelId, lastMessageOf(server), {
                  active: true,
                  fromSelf: true,
                })
              : old,
          );
        })
        .catch(() => {
          qc.setQueryData<MessageDto[]>(["messages", channelId], (old) =>
            (old ?? []).filter((m) => m.id !== optimistic.id),
          );
          toast.error({ title: "Couldn't send attachment", body: "Please try again." });
        });
    },
    [activeChannel, currentUserId, qc, toast],
  );

  // AI assistant: open the SSE relay, accumulate deltas into a transient
  // streaming bubble. On `done` we reconcile the answer into the message list
  // ourselves and clear the bubble in the same commit; the posted ai_agent
  // message arriving later via realtime de-dupes in place by clientMessageId.
  // On error we surface the error card and clear. Stop aborts the client stream.
  const handleAssist = useCallback(
    (
      prompt: string,
      document?: { storageKey: string; filename: string; contentType?: string },
      knowledgeBase?: { enabled: boolean; sourceFileIds?: string[] },
    ) => {
      if (!activeChannel) return;
      const channelId = activeChannel.channelId;
      assistAbort.current?.abort();
      const controller = new AbortController();
      assistAbort.current = controller;
      setAssist({ channelId, text: "" });
      setAssistError((e) => (e && e.channelId === channelId ? null : e));
      const clearIfCurrent = () => setAssist((s) => (s && s.channelId === channelId ? null : s));
      // A superseded turn (aborted at the top of this callback) can still have a
      // callback in flight. It carries the SAME channelId as the turn that
      // replaced it, so clearIfCurrent/setAssistError would happily clobber the
      // live turn's loader. Gate every handler on this turn's own signal.
      const live = () => !controller.signal.aborted;
      void streamAssist(
        channelId,
        { prompt, document, knowledgeBase },
        {
          onDelta: (t) => {
            if (!live()) return;
            setAssist((s) => (s && s.channelId === channelId ? { ...s, text: s.text + t } : s));
          },
          onDone: (payload) => {
            if (!live()) return;
            // Ephemeral citations for THIS turn only, keyed by the bot message's
            // clientMessageId so the chip renders on the merged realtime message.
            if (payload.sources?.length) {
              setLiveSources((m) => ({ ...m, [payload.clientMessageId]: payload.sources! }));
            }
            // Hand the streamed answer to the message list BEFORE dropping the
            // bubble. The persisted ai_agent message reaches us over the realtime
            // socket — a second, unordered transport — so clearing on `done`
            // alone leaves a gap (no loader, no answer) until the echo lands, and
            // leaves nothing at all if the socket is down. Same reconcile the
            // human send path does ("even if the realtime echo never arrives").
            // Both state writes sit in this one handler, so React batches them
            // into a single commit: bubble → message with no frame in between.
            qc.setQueryData<MessageDto[]>(["messages", channelId], (old) => {
              const list = old ?? [];
              // Echo won the race → the server row is already here and is
              // authoritative (real id, server timestamp). Don't clobber it.
              if (list.some((m) => m.clientMessageId === payload.clientMessageId)) return list;
              // Otherwise insert ours; mergeMessageEvent keys on clientMessageId,
              // so the echo replaces this row in place whenever it arrives.
              return mergeMessageEvent(
                list,
                {
                  id: makeTempId(),
                  channelId,
                  senderId: ASSISTANT_BOT_USER_ID,
                  actorType: "ai_agent",
                  type: "Text",
                  content: payload.text,
                  data: null,
                  parentMessageId: null,
                  parentPreview: null,
                  isPinned: false,
                  reactions: [],
                  mentions: [],
                  clientMessageId: payload.clientMessageId,
                  createdAt: new Date().toISOString(),
                  editedAt: null,
                },
                currentUserId,
              );
            });
            clearIfCurrent();
          },
          onError: (message) => {
            if (!live()) return;
            clearIfCurrent();
            setAssistError({ channelId, prompt, message });
          },
        },
        controller.signal,
      );
    },
    [activeChannel, currentUserId, qc],
  );

  const stopAssist = useCallback(() => {
    assistAbort.current?.abort();
    setAssist(null);
  }, []);

  const retryAssist = useCallback(() => {
    if (!assistError) return;
    const p = assistError.prompt;
    setAssistError(null);
    handleAssist(p, undefined, buildKnowledgeBase());
  }, [assistError, handleAssist, buildKnowledgeBase]);
  const dismissAssistError = useCallback(() => setAssistError(null), []);

  // Entry point: open (find-or-create) the caller's AI-chat singleton, then land
  // on it. Idempotent server-side, so reopening reuses the same conversation.
  const handleOpenAiChat = useCallback(() => {
    void openAiChat()
      .then(onChannelReady)
      .catch(() => toast.error({ title: "Couldn't open AI Chat" }));
  }, [onChannelReady, toast]);

  // AI-chat per-turn routing: unlike a normal channel (where only `/ai` invokes
  // the assistant), EVERY message in an `type:"ai"` channel invokes it. Persist
  // + render the user's turn normally (so history + reload work), then stream the
  // assist reply. The relay de-dupes the just-persisted turn against the prompt.
  const handleAiChatSend = useCallback(
    (content: string, mentionRefs: MentionRefInput[], parentMessageId?: string) => {
      handleSend(content, mentionRefs, parentMessageId);
      // Attach the conversation's retrieval scope (or widen / omit) per decision 2.
      handleAssist(content, undefined, buildKnowledgeBase());
    },
    [handleSend, handleAssist, buildKnowledgeBase],
  );

  const toggleKbWiden = useCallback(() => setKbWiden((v) => !v), []);

  // AI-chat attachment turn (Stage 2): persist + render the Media message as
  // usual (so history + reload work), THEN invoke the assistant with a document
  // ref. The client passes the storageKey (objectPath) it owns; the relay
  // authorizes it and mints the presigned URL the runtime fetches. Without this,
  // an attachment in the AI chat would post but never reach the assistant.
  const handleAiChatSendMedia = useCallback(
    (media: MediaMeta, caption: string, localUrl: string) => {
      handleSendMedia(media, caption, localUrl);
      handleAssist(caption, {
        storageKey: media.objectPath,
        filename: media.originalName,
        contentType: media.mediaType,
      });
    },
    [handleSendMedia, handleAssist],
  );

  // Call handler: triggers 1:1 call for DMs, group call with SFU for groups
  const handleGroupCall = useCallback(async () => {
    if (!activeChannel) return;
    if (activeChannel.type === "dm") {
      const otherMember = activeChannel.members.find(
        (m) => m.id !== currentUserId && m.id !== ASSISTANT_BOT_USER_ID,
      );
      if (otherMember) {
        setCallTargetUserId(otherMember.id);
      }
    } else {
      // Group channel: create the call. Each participant (including us) mints
      // its own LiveKit token from inside the call window — the token never
      // travels through this response or the popup's URL (CALL-3 hardening).
      try {
        const res = await fetch("/api/calls/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channelId: activeChannel.channelId,
            type: "audio",
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Failed" }))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Failed to start group call");
        }
        const data = (await res.json()) as { call: { id: string } };
        openGroupCallWindow(data.call.id, activeChannel.name ?? "Group call", "audio");
        toast.success({ title: `Starting group call in #${activeChannel.name ?? "channel"}` });
      } catch (e) {
        toast.error({
          title: "Couldn't start group call",
          body: e instanceof Error ? e.message : "Please try again.",
        });
      }
    }
  }, [activeChannel, currentUserId, openGroupCallWindow, toast]);

  const handleStartMeetingCall = useCallback(
    async (meetingId: string, channelId: string) => {
      try {
        const res = await fetch("/api/calls/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId, type: "video", meetingId }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Failed" }))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Failed to start group call");
        }
        const data = (await res.json()) as { call: { id: string } };
        openGroupCallWindow(data.call.id, "Group call", "video");
        toast.success({ title: "Starting group call..." });
      } catch (e) {
        toast.error({
          title: "Couldn't start group call",
          body: e instanceof Error ? e.message : "Please try again.",
        });
      }
    },
    [openGroupCallWindow, toast],
  );

  useEffect(() => {
    const timers = deliveredTimers.current;
    return () => {
      assistAbort.current?.abort();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return (
    <div className="qc-card">
      <div className="qc-panes" data-view={activeId ? "convo" : "list"}>
        <ChannelListView
          data={channelsQuery.data}
          loading={channelsQuery.isLoading}
          workspaceName={workspaceName}
          activeChannelId={activeId}
          currentUserId={currentUserId}
          onlineUserIds={presence.online}
          statusOf={statusOfUser}
          chromeless
          onPick={pickChannel}
          onNewChat={() => setNewChatOpen(true)}
          onNewGroup={() => setNewGroupOpen(true)}
          onDiscover={() => setDiscoverOpen(true)}
          onOpenAiChat={handleOpenAiChat}
        />
        {activeChannel ? (
          <ConversationView
            channel={activeChannel}
            currentUserId={currentUserId}
            messages={messagesQuery.data}
            loadingMessages={messagesQuery.isLoading}
            channels={channelsQuery.data}
            online={presence.online}
            statusOf={statusOfUser}
            typing={typing}
            onSend={activeChannel.type === "ai" ? handleAiChatSend : handleSend}
            onTyping={emitTyping}
            onSendMedia={activeChannel.type === "ai" ? handleAiChatSendMedia : handleSendMedia}
            onAssist={activeChannel.type === "ai" ? undefined : handleAssist}
            onCall={handleGroupCall}
            onStartMeetingCall={handleStartMeetingCall}
            assistStreaming={
              assist && assist.channelId === activeChannel.channelId ? assist.text : null
            }
            onStopAssist={stopAssist}
            assistError={
              assistError && assistError.channelId === activeChannel.channelId
                ? assistError.message
                : null
            }
            onRetryAssist={retryAssist}
            onDismissAssistError={dismissAssistError}
            liveSources={liveSources}
            onKbIngested={appendKbSource}
            kbWiden={kbWiden}
            onToggleKbWiden={toggleKbWiden}
            kbDocCount={kbSourceIds.length}
          />
        ) : (
          <section className="qc-pane-convo">
            <EmptyState
              title="Pick a conversation"
              hint="Choose a channel or DM from the left to start chatting."
              icon={<MessageSquare size={28} />}
            />
          </section>
        )}
        {!connected ? (
          <div className="qc-reconnect qc-reconnect-float" role="status">
            <WifiOff size={13} /> Reconnecting…
          </div>
        ) : null}

        <NewChatModal
          open={newChatOpen}
          onClose={() => setNewChatOpen(false)}
          onCreated={(ch) => {
            onChannelReady(ch);
            toast.success({ title: `Chat with ${ch.name ?? "your contact"} started` });
          }}
        />
        <NewGroupModal
          open={newGroupOpen}
          onClose={() => setNewGroupOpen(false)}
          canCreatePublic={perms.has("Channel.Public", "create")}
          onCreated={(ch) => {
            onChannelReady(ch);
            toast.success({ title: `Created ${ch.name ? `#${ch.name}` : "the group"}` });
          }}
        />
        <DiscoverModal
          open={discoverOpen}
          onClose={() => setDiscoverOpen(false)}
          onJoined={(ch) => {
            onChannelReady(ch);
            toast.success({ title: `Joined ${ch.name ? `#${ch.name}` : "the channel"}` });
          }}
        />

        {rejoinCall ? (
          <RejoinBanner
            activeCall={rejoinCall}
            onRejoin={() => {
              setRejoinCall(null);
              // A 1:1 mesh call (participantCount === 2) has no clean rejoin path
              // yet — we'd need the other participant's id/name, which this
              // summary doesn't carry. Group/SFU calls rejoin cleanly: the call
              // page mints its own token from the callId alone.
              if (rejoinCall.participantCount !== 2) {
                openGroupCallWindow(rejoinCall.callId, rejoinCall.channelName, rejoinCall.type);
                toast.success({ title: "Reconnecting to call..." });
              } else {
                toast.info({
                  title: "Open the channel to rejoin",
                  body: "1:1 call rejoin isn't available from here yet.",
                });
              }
            }}
            onDismiss={() => setRejoinCall(null)}
          />
        ) : null}

        <CallHandler
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          socket={clientRef.current?.socket ?? null}
          callTargetUserId={callTargetUserId}
          callType="audio"
          onCallStarted={() => setCallTargetUserId(null)}
          getUserName={(userId) => {
            const member = activeChannel?.members.find((m) => m.id === userId);
            return member?.displayName ?? "User";
          }}
        />
      </div>
    </div>
  );
}
