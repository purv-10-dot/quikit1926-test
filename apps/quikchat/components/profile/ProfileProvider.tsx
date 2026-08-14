"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PublicUser } from "@/lib/shared";
import { ProfileCard } from "./ProfileCard";

export interface ProfileTarget {
  user: PublicUser;
  /** Role in the current channel context (admin/member), if known. */
  roleInChannel?: string;
  /** Presence at open time (online/offline), if known. */
  online?: boolean;
}

interface ProfileContextValue {
  /** Open the read-only profile card for a user (from any avatar). */
  openProfile: (target: ProfileTarget) => void;
  /** ChatWorkspace registers the DM-start opener used by the "Message" action. */
  registerStartDm: (fn: (userId: string) => void) => void;
  /**
   * Register the call-start opener used by the "Call" action.
   *
   * `type` is optional on purpose: existing registrants (CallHandler) accept a
   * userId alone and existing callers pass nothing, so both keep today's
   * behaviour. It exists so a caller that genuinely distinguishes audio from
   * video — CallsModule's separate "Call" and "Video call" buttons — can say
   * which it means. `createCall` has taken `"audio" | "video"` all along; the
   * only gap was this signature.
   */
  registerStartCall: (fn: (userId: string, type?: CallType) => void) => void;
  /**
   * Start a call with a user directly, without opening the profile card first.
   * No-op until something registers an opener — same contract as the rest of
   * this provider.
   */
  startCallWith: (userId: string, type?: CallType) => void;
  /**
   * The active ConversationView registers the meeting scheduler (S15a) so the
   * profile card's "Schedule meeting" opens the current channel's modal seeded
   * with that user. `null` when no conversation is open (action hidden).
   */
  registerScheduleWith: (fn: ((userId: string) => void) | null) => void;
}

/** Audio-only vs video. Mirrors `CreateCallInput["type"]` in calling.service. */
export type CallType = "audio" | "video";

const defaultValue: ProfileContextValue = {
  openProfile: () => undefined,
  registerStartDm: () => undefined,
  registerStartCall: () => undefined,
  startCallWith: () => undefined,
  registerScheduleWith: () => undefined,
};
const ProfileContext = createContext<ProfileContextValue>(defaultValue);

export function useProfile(): ProfileContextValue {
  return useContext(ProfileContext);
}

/**
 * Hosts the read-only profile card (S14b). Any avatar calls `openProfile`; the
 * "Message" action calls the DM opener ChatWorkspace registers (reusing the S06
 * DM-create + selectChannel). Own profile hides "Message".
 */
export function ProfileProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<ProfileTarget | null>(null);
  const startDmRef = useRef<((userId: string) => void) | null>(null);
  const startCallRef = useRef<((userId: string, type?: CallType) => void) | null>(null);
  const scheduleRef = useRef<((userId: string) => void) | null>(null);
  // Mirrors scheduleRef in render state so the card can show/hide the action.
  const [canSchedule, setCanSchedule] = useState(false);

  const openProfile = useCallback((t: ProfileTarget) => setTarget(t), []);
  const registerStartDm = useCallback((fn: (userId: string) => void) => {
    startDmRef.current = fn;
  }, []);
  const registerStartCall = useCallback((fn: (userId: string, type?: CallType) => void) => {
    startCallRef.current = fn;
  }, []);
  const startCallWith = useCallback((userId: string, type?: CallType) => {
    startCallRef.current?.(userId, type);
  }, []);
  const registerScheduleWith = useCallback((fn: ((userId: string) => void) | null) => {
    scheduleRef.current = fn;
    setCanSchedule(!!fn);
  }, []);

  const value = useMemo(
    () => ({
      openProfile,
      registerStartDm,
      registerStartCall,
      startCallWith,
      registerScheduleWith,
    }),
    [openProfile, registerStartDm, registerStartCall, startCallWith, registerScheduleWith],
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
      {target ? (
        <ProfileCard
          target={target}
          isSelf={target.user.id === currentUserId}
          canSchedule={canSchedule}
          onMessage={() => {
            startDmRef.current?.(target.user.id);
            setTarget(null);
          }}
          onCall={() => {
            startCallRef.current?.(target.user.id);
            setTarget(null);
          }}
          onSchedule={() => {
            scheduleRef.current?.(target.user.id);
            setTarget(null);
          }}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </ProfileContext.Provider>
  );
}
