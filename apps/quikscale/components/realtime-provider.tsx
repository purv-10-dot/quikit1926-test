"use client";

/**
 * RealtimeProvider — subscribes to the Socket.io relay and turns incoming
 * change-signals into React Query cache invalidations. Because every list/detail
 * view reads through the same query keys, wiring this once makes the Dashboard,
 * Individual KPI, Team KPI, Priority, and WWW screens all update live.
 *
 * Must be mounted INSIDE QueryClientProvider and SessionProvider.
 *
 * Failure is non-fatal by design: if the relay is unreachable or REALTIME_URL is
 * unset, the app behaves exactly as before (manual refresh still works).
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { io, type Socket } from "socket.io-client";
import { REALTIME_EVENT, type RealtimeSignal } from "@quikit/realtime";
import { invalidateEntity } from "@/lib/hooks/dashboardInvalidation";

async function fetchHandshakeToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/token", { credentials: "include" });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { token?: string } };
    return json.data?.token ?? null;
  } catch {
    return null;
  }
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const socketRef = useRef<Socket | null>(null);

  const userId = session?.user?.id;
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;

  useEffect(() => {
    // Only connect once we have an authenticated session and a relay URL.
    if (status !== "authenticated" || !userId || !url) return;

    const socket = io(url, {
      // `auth` as a function is invoked before EVERY (re)connection attempt, so a
      // fresh, unexpired token is fetched automatically on reconnect.
      auth: (cb) => {
        void fetchHandshakeToken().then((token) => cb({ token: token ?? "" }));
      },
      transports: ["websocket"],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on(REALTIME_EVENT, (signal: RealtimeSignal) => {
      // Echo suppression: the editor already updated its own cache locally via
      // its mutation hook (which now invalidates the SAME keys — see
      // dashboardInvalidation.ts). So we only react to OTHER users' changes.
      if (signal.actorUserId === userId) return;

      // Same single source of truth the mutation hooks use → no drift. Passing
      // `id` also busts the row's detail/weekly caches for an open panel.
      invalidateEntity(queryClient, signal.entity, { id: signal.id });
    });

    // On (re)connect we may have missed events while offline — refetch active
    // queries once to resync. (`type: "active"` avoids touching unmounted views.)
    socket.on("connect", () => {
      void queryClient.invalidateQueries({ type: "active" });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, userId, url, queryClient]);

  return <>{children}</>;
}
