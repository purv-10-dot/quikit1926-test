export interface ActiveCallInfo {
  callId: string;
  channelId: string;
  channelName: string;
  type: "audio" | "video";
  participantCount: number;
  startedAt: string;
}

/**
 * Check if the current user has an active call (for rejoin after page refresh).
 * Returns null if no active call or on error.
 */
export async function fetchActiveCall(): Promise<ActiveCallInfo | null> {
  try {
    const res = await fetch("/api/calls/active", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { call: ActiveCallInfo | null };
    return data.call ?? null;
  } catch {
    return null;
  }
}
