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
  /** Register the call-start opener used by the "Call" action. */
  registerStartCall: (fn: (userId: string) => void) => void;
  /**
   * The active ConversationView registers the meeting scheduler (S15a) so the
   * profile card's "Schedule meeting" opens the current channel's modal seeded
   * with that user. `null` when no conversation is open (action hidden).
   */
  registerScheduleWith: (fn: ((userId: string) => void) | null) => void;
}

const defaultValue: ProfileContextValue = {
  openProfile: () => undefined,
  registerStartDm: () => undefined,
  registerStartCall: () => undefined,
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
  const startCallRef = useRef<((userId: string) => void) | null>(null);
  const scheduleRef = useRef<((userId: string) => void) | null>(null);
  // Mirrors scheduleRef in render state so the card can show/hide the action.
  const [canSchedule, setCanSchedule] = useState(false);

  const openProfile = useCallback((t: ProfileTarget) => setTarget(t), []);
  const registerStartDm = useCallback((fn: (userId: string) => void) => {
    startDmRef.current = fn;
  }, []);
  const registerStartCall = useCallback((fn: (userId: string) => void) => {
    startCallRef.current = fn;
  }, []);
  const registerScheduleWith = useCallback((fn: ((userId: string) => void) | null) => {
    scheduleRef.current = fn;
    setCanSchedule(!!fn);
  }, []);

  const value = useMemo(
    () => ({ openProfile, registerStartDm, registerStartCall, registerScheduleWith }),
    [openProfile, registerStartDm, registerStartCall, registerScheduleWith],
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
