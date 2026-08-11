"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useToast } from "@/components/ui";
import { LiveKitOneToOneCall } from "@/components/calling/LiveKitOneToOneCall";
import { LiveKitGroupCall } from "@/components/calling/LiveKitGroupCall";
import { createCallSoundController } from "@/lib/call-sound-controller";
import { fetchNotificationSettings } from "@/lib/api";

interface TokenData {
  roomId: string;
  token: string;
  livekitUrl: string;
  isGroup: boolean;
  isHost: boolean;
}

function CallPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const callId = (params.callId as string) ?? "";
  const remoteName = searchParams.get("name") ?? "User";
  const remoteUserId = searchParams.get("userId") ?? "";
  const myUserId = searchParams.get("myUserId") ?? "";
  const localUserName = searchParams.get("userName") ?? "You";
  const callType = (searchParams.get("type") ?? "video") as "audio" | "video";
  const role = searchParams.get("role") ?? "caller";
  // Early routing hint (not secret, just UI routing) — set by ChatWorkspace for
  // group calls only. Decides whether to open the lifecycle socket below
  // BEFORE the token fetch (which authoritatively reports `isGroup`) resolves.
  // Group calls have no ring/cancel/timeout phase, so they skip the socket
  // entirely and rely on LiveKit's own terminalDisconnect signal instead.
  const isGroupHint = searchParams.get("group") === "1";
  const toast = useToast();

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  // Set by a 1:1 lifecycle event that ends the call before/without ever
  // connecting to LiveKit (rejected, cancelled, timed out, unavailable) or
  // after (ended) — replaces the CallWindow they'd otherwise render.
  const [callEndedMessage, setCallEndedMessage] = useState<string | null>(null);

  // Ringback / connected / ended audio. Owns its own enabled flag and stop
  // handle; starts disabled (silent) until the settings fetch below says
  // otherwise.
  const soundsRef = useRef(createCallSoundController());
  const socketRef = useRef<{
    emit: (event: string, ...args: unknown[]) => void;
    disconnect: () => void;
  } | null>(null);
  const cancelledRef = useRef(false);

  // This popup is its own document, so it reads the user's callSoundsEnabled
  // itself (same-origin, cookies included).
  useEffect(() => {
    const sounds = soundsRef.current;
    void fetchNotificationSettings()
      .then((s) => sounds.setEnabled(s.callSoundsEnabled))
      .catch(() => undefined);
    return () => sounds.stopAll();
  }, []);

  // Fetch our OWN LiveKit token — every call now goes through this seam, 1:1
  // or group. Verified server-side against QcCallParticipant membership; never
  // exposes another participant's token (CALL-3 hardening).
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    void fetch(`/api/calls/${callId}/token`, { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const err = (await res.json().catch(() => ({ error: "Failed" }))) as {
            error?: string;
          };
          throw new Error(err.error ?? "Could not join call");
        }
        return res.json() as Promise<{
          roomId: string;
          token: string;
          livekitUrl: string | null;
          isGroup: boolean;
          isHost: boolean;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.livekitUrl) throw new Error("LiveKit is not configured");
        setTokenData({
          roomId: data.roomId,
          token: data.token,
          livekitUrl: data.livekitUrl,
          isGroup: data.isGroup,
          isHost: data.isHost,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not join call";
        setTokenError(message);
        toast.error({ title: "Couldn't join call", body: message });
      });
    return () => {
      cancelled = true;
    };
  }, [callId, toast]);

  // Pre-connect lifecycle signaling — 1:1 only. Group calls have no
  // ring/cancel/timeout phase; they detect "the other party ended it" via
  // LiveKit's own terminalDisconnect (the room is deleted server-side on end).
  useEffect(() => {
    if (!callId || isGroupHint) return;
    cancelledRef.current = false;

    const init = async () => {
      const { io } = await import("socket.io-client");
      const realtimeUrl = process.env.NEXT_PUBLIC_REALTIME_WS_URL || window.location.origin;
      const socket = io(realtimeUrl, {
        // WebSocket-only — see lib/realtime-client.ts for why.
        transports: ["websocket"],
        auth: async (cb: (auth: { token: string }) => void) => {
          try {
            const res = await fetch("/api/realtime/token", { credentials: "include" });
            if (!res.ok) throw new Error("token fetch failed");
            const { token } = (await res.json()) as { token: string };
            cb({ token });
          } catch {
            cb({ token: "" });
          }
        },
      });

      socketRef.current = {
        emit: socket.emit.bind(socket),
        disconnect: socket.disconnect.bind(socket),
      };

      socket.on("call:ended", () => {
        if (cancelledRef.current) return;
        soundsRef.current.ended();
        setCallEndedMessage("The other participant ended the call.");
        toast.info({ title: "Call ended", body: "The other participant ended the call." });
      });

      socket.on("call:rejected", () => {
        if (cancelledRef.current) return;
        soundsRef.current.stopAll();
        setCallEndedMessage("The call was declined.");
        toast.info({ title: "Call rejected", body: "The call was declined." });
      });

      socket.on("call:cancelled", () => {
        if (cancelledRef.current) return;
        soundsRef.current.stopAll();
        setCallEndedMessage("Call cancelled.");
      });

      socket.on("call:timed_out", () => {
        if (cancelledRef.current) return;
        soundsRef.current.stopAll();
        setCallEndedMessage("No one answered after 30 seconds.");
        toast.error({ title: "Call timed out", body: "No one answered after 30 seconds." });
        void fetch(`/api/calls/${callId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "timeout" }),
        }).catch(() => undefined);
      });

      socket.on("call:unavailable", () => {
        if (cancelledRef.current) return;
        soundsRef.current.stopAll();
        setCallEndedMessage("The person you called is not reachable right now.");
        toast.error({
          title: "User unavailable",
          body: "The person you called is not reachable right now.",
        });
      });

      // Caller-only ringing cue, from here until the callee joins the LiveKit
      // room (onRemoteJoined below) or the call dies. Gated on
      // callSoundsEnabled alone — never DND/snooze: the caller initiated, so
      // they want to hear it ring.
      if (role === "caller") soundsRef.current.startRingback();
    };

    void init();

    return () => {
      cancelledRef.current = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [callId, isGroupHint, role, toast]);

  // The callee's tracks appeared (or, for the callee, the caller's) — the call
  // is really up. Replaces the mesh's pc.ontrack / call:answer connect cue.
  const handleRemoteJoined = useCallback(() => {
    soundsRef.current.connected();
  }, []);

  const handleEndCall = useCallback(async () => {
    // Note: this window closes a moment later, so the tone is usually cut off
    // for whoever hangs up. Wired for symmetry and for the case where close()
    // is blocked; the remote side hears theirs on call:ended.
    soundsRef.current.ended();
    // Group calls never set up the lifecycle socket — this is a no-op then.
    socketRef.current?.emit("call:end", { callId });
    // Persist the end status via API. Use keepalive so the PATCH survives the
    // popup closing; await it so it has a chance to complete before unload.
    try {
      await fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
        keepalive: true,
      });
    } catch {
      // Best-effort: if the fetch still fails, the heartbeat sweep will reap it.
    }
    window.close();
  }, [callId]);

  // Send a synchronous unload-safe end request when the window closes via the
  // OS/browser X. keepalive lets the PATCH outlive the document.
  const handleUnloadEnd = useCallback(() => {
    if (!callId) return;
    try {
      fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Ignore; sweep is the safety net.
    }
  }, [callId]);

  // Heartbeat while the call window is open. The server ignores beats sent
  // before the call is active, and the sweep reaps active calls that stop beating.
  useEffect(() => {
    if (!callId) return;

    const sendHeartbeat = () => {
      fetch(`/api/calls/${callId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat" }),
        keepalive: true,
      }).catch(() => undefined);
    };

    sendHeartbeat();
    const heartbeatInterval = setInterval(sendHeartbeat, 15_000);

    return () => clearInterval(heartbeatInterval);
  }, [callId]);

  // Unload handler: end the call if the window closes without using the
  // hang-up button. Prefer pagehide where available; fall back to beforeunload.
  useEffect(() => {
    window.addEventListener("pagehide", handleUnloadEnd);
    window.addEventListener("beforeunload", handleUnloadEnd);
    return () => {
      window.removeEventListener("pagehide", handleUnloadEnd);
      window.removeEventListener("beforeunload", handleUnloadEnd);
    };
  }, [handleUnloadEnd]);

  if (!callId) {
    return <div style={{ padding: 24, textAlign: "center" }}>Missing call ID</div>;
  }

  if (callEndedMessage) {
    return <div style={{ padding: 24, textAlign: "center" }}>{callEndedMessage}</div>;
  }

  if (tokenError) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <h3>Couldn&apos;t join call</h3>
        <p>{tokenError}</p>
      </div>
    );
  }

  if (!tokenData) {
    return <div style={{ padding: 24, textAlign: "center" }}>Connecting…</div>;
  }

  if (tokenData.isGroup) {
    return (
      <LiveKitGroupCall
        token={tokenData.token}
        livekitUrl={tokenData.livekitUrl}
        callId={callId}
        localUserId={myUserId || "local"}
        callType={callType}
        isHost={tokenData.isHost}
        // `?name=` is the window title the opener passes (the channel name for
        // a group call) — reused so a removed participant is told WHICH call
        // they were removed from.
        channelName={remoteName}
        onEndCall={handleEndCall}
      />
    );
  }

  return (
    <LiveKitOneToOneCall
      callId={callId}
      token={tokenData.token}
      livekitUrl={tokenData.livekitUrl}
      localUserId={myUserId || "local"}
      remoteName={remoteName}
      remoteUserId={remoteUserId}
      callType={callType}
      localUserName={localUserName}
      onEndCall={handleEndCall}
      onRemoteJoined={handleRemoteJoined}
    />
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}>Loading...</div>}>
      <CallPageInner />
    </Suspense>
  );
}
