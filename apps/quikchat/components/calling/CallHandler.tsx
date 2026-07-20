"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { IncomingCallToast } from "./IncomingCallToast";

const CALL_CHANNEL = "quikchat-call-channel";

export interface IncomingCall {
  callId: string;
  callerName: string;
  callerId: string;
  callType: "audio" | "video";
  channelId?: string | null;
}

export interface ActiveCall {
  callId: string;
  remoteName: string;
  remoteUserId: string;
  remoteAvatarUrl?: string | null;
  callType: "audio" | "video";
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export interface CallHandlerProps {
  currentUserId: string;
  currentUserName: string;
  socket: {
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
  } | null;
  callTargetUserId?: string | null;
  callType?: "audio" | "video";
  onCallStarted?: () => void;
  /** Lookup a user's display name by ID (from channel members). */
  getUserName?: (userId: string) => string;
}

export function CallHandler({
  currentUserId,
  currentUserName,
  socket,
  callTargetUserId,
  callType = "video",
  onCallStarted,
  getUserName,
}: CallHandlerProps) {
  const toast = useToast();
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const callWindowRef = useRef<Window | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  const openCallWindow = useCallback(
    (
      callId: string,
      name: string,
      userId: string,
      type: string,
      role?: string,
      userName?: string,
    ) => {
      const params = new URLSearchParams({ callId, name, userId, type });
      if (role) params.set("role", role);
      if (userName) params.set("userName", userName);
      const url = `/call/${callId}?${params.toString()}`;
      // Close existing window if any
      if (callWindowRef.current && !callWindowRef.current.closed) {
        callWindowRef.current.close();
      }
      callWindowRef.current = window.open(
        url,
        "quikchat-call",
        "width=800,height=600,popup=yes,menubar=no,toolbar=no,location=no,status=no",
      );
    },
    [],
  );

  // Cross-tab coordination: dismiss incoming call if another tab accepted it
  useEffect(() => {
    const channel = new BroadcastChannel(CALL_CHANNEL);
    broadcastRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const { type, callId } = event.data ?? {};
      if (type === "call:accepted_elsewhere" && callId) {
        setIncoming((prev) => (prev?.callId === callId ? null : prev));
      }
    };

    channel.addEventListener("message", handleMessage);
    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, []);

  // Listen for incoming calls and call lifecycle events
  useEffect(() => {
    if (!socket) return;

    const handleRinging = (data: unknown) => {
      const { callId, type, initiatorId, channelId } = data as {
        callId: string;
        type: string;
        initiatorId: string;
        channelId?: string | null;
      };
      // Don't show toast for our own calls
      if (initiatorId === currentUserId) return;
      setIncoming({
        callId,
        callerName: getUserName?.(initiatorId) ?? "User",
        callerId: initiatorId,
        callType: type as "audio" | "video",
        channelId,
      });
    };

    const handleCancelled = (data: unknown) => {
      const { callId } = data as { callId: string };
      setIncoming((prev) => (prev?.callId === callId ? null : prev));
    };

    const handleEnded = (data: unknown) => {
      const { callId } = data as { callId: string };
      if (callWindowRef.current && !callWindowRef.current.closed) {
        callWindowRef.current.close();
        callWindowRef.current = null;
      }
      setIncoming((prev) => (prev?.callId === callId ? null : prev));
    };

    const handleRejected = (data: unknown) => {
      const { callId } = data as { callId: string };
      if (callWindowRef.current && !callWindowRef.current.closed) {
        callWindowRef.current.close();
        callWindowRef.current = null;
      }
      setIncoming((prev) => (prev?.callId === callId ? null : prev));
    };

    const handleTimedOut = (data: unknown) => {
      const { callId } = data as { callId: string };
      if (callWindowRef.current && !callWindowRef.current.closed) {
        callWindowRef.current.close();
        callWindowRef.current = null;
      }
      setIncoming((prev) => (prev?.callId === callId ? null : prev));
    };

    const handleUnavailable = (data: unknown) => {
      const { callId, userId: _userId } = data as { callId: string; userId: string };
      // If this unavailable is for our current incoming call, dismiss it
      setIncoming((prev) => (prev?.callId === callId ? null : prev));
      // If we have a call window open for this call, close it
      if (callWindowRef.current && !callWindowRef.current.closed) {
        callWindowRef.current.close();
        callWindowRef.current = null;
      }
      // Notify via toast if we're the initiator
      toast.error({
        title: "User unavailable",
        body: `The person you called is not reachable right now.`,
      });
    };

    socket.on("call:ringing", handleRinging);
    socket.on("call:cancelled", handleCancelled);
    socket.on("call:ended", handleEnded);
    socket.on("call:rejected", handleRejected);
    socket.on("call:timed_out", handleTimedOut);
    socket.on("call:unavailable", handleUnavailable);

    return () => {
      socket.off("call:ringing", handleRinging);
      socket.off("call:cancelled", handleCancelled);
      socket.off("call:ended", handleEnded);
      socket.off("call:rejected", handleRejected);
      socket.off("call:timed_out", handleTimedOut);
      socket.off("call:unavailable", handleUnavailable);
    };
  }, [socket, currentUserId, toast, getUserName]);

  const handleAccept = useCallback(
    async (callId: string) => {
      setIncoming(null);
      // Notify other tabs to dismiss their incoming toast
      try {
        broadcastRef.current?.postMessage({ type: "call:accepted_elsewhere", callId });
      } catch {
        // BroadcastChannel not supported — best effort
      }
      // PATCH the call to mark it as accepted
      try {
        await fetch(`/api/calls/${callId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
      } catch {
        // Best effort — gateway will relay regardless
      }
      // Notify gateway to clear the ringing timeout
      socket?.emit("call:accepted", { callId });
      openCallWindow(
        callId,
        incoming?.callerName ?? "User",
        incoming?.callerId ?? "",
        incoming?.callType ?? "audio",
        "callee",
        currentUserName,
      );
    },
    [incoming, openCallWindow, currentUserName, socket],
  );

  const handleDecline = useCallback(
    async (callId: string) => {
      setIncoming(null);
      // PATCH the call to mark it as rejected
      try {
        await fetch(`/api/calls/${callId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject" }),
        });
      } catch {
        // Best effort
      }
      socket?.emit("call:reject", { callId });
    },
    [socket],
  );

  // Initiate outbound call when callTargetUserId is set
  useEffect(() => {
    if (!callTargetUserId || !socket) return;

    const initiateCall = async () => {
      try {
        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: callType,
            targetUserIds: [callTargetUserId],
          }),
        });
        if (!res.ok) return;
        const call = await res.json();

        const targetName = getUserName?.(callTargetUserId) ?? "User";
        openCallWindow(call.id, targetName, callTargetUserId, callType, "caller", currentUserName);

        // Emit invite via socket
        socket.emit("call:invite", { callId: call.id, targetUserId: callTargetUserId });
        onCallStarted?.();
      } catch {
        onCallStarted?.();
      }
    };

    void initiateCall();
  }, [
    callTargetUserId,
    callType,
    socket,
    onCallStarted,
    openCallWindow,
    getUserName,
    currentUserName,
  ]);

  return (
    <>
      {incoming ? (
        <IncomingCallToast
          callerName={incoming.callerName}
          callType={incoming.callType}
          callId={incoming.callId}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      ) : null}
    </>
  );
}
