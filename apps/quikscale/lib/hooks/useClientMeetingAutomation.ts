"use client";

/**
 * Whether an ACTIVE QuikFlow "Client Master → calendar" automation exists for
 * this org. Drives the Client Master form's Teams-meeting scheduling model: the
 * form only surfaces it when `calendarAutomation` is true. Always resolves to a
 * boolean (never throws) so the form degrades to its normal behavior when
 * QuikFlow is off/unreachable.
 */
import { useQuery } from "@tanstack/react-query";

interface AutomationStatus {
  calendarConnected: boolean;
  calendarAutomation: boolean;
}
interface AutomationStatusResponse {
  success?: boolean;
  data?: Partial<AutomationStatus>;
}

const DISABLED: AutomationStatus = { calendarConnected: false, calendarAutomation: false };

export function useClientMeetingAutomation(): AutomationStatus & { isLoading: boolean } {
  const q = useQuery({
    queryKey: ["client-meetings", "automation-status"],
    queryFn: async (): Promise<AutomationStatus> => {
      try {
        const res = await fetch("/api/client-meetings/automation-status", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as AutomationStatusResponse | null;
        if (!res.ok || !json?.success) return DISABLED;
        return {
          calendarConnected: Boolean(json.data?.calendarConnected),
          calendarAutomation: Boolean(json.data?.calendarAutomation),
        };
      } catch {
        return DISABLED;
      }
    },
    staleTime: 60_000,
  });
  return { ...(q.data ?? DISABLED), isLoading: q.isLoading };
}
