"use client";

import { useCallback, useEffect, useState } from "react";
import { Phone, PhoneOff } from "@/components/ui";
import type { ActiveCallInfo } from "@/lib/call-state";

export interface RejoinBannerProps {
  activeCall: ActiveCallInfo;
  onRejoin: (callId: string) => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 30_000;

export function RejoinBanner({ activeCall, onRejoin, onDismiss }: RejoinBannerProps) {
  const [remaining, setRemaining] = useState(Math.ceil(AUTO_DISMISS_MS / 1000));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDismiss]);

  const handleRejoin = useCallback(() => {
    onRejoin(activeCall.callId);
  }, [activeCall.callId, onRejoin]);

  return (
    <div className="qc-rejoin-banner" role="alert" data-testid="rejoin-banner">
      <div className="qc-rejoin-banner__info">
        <Phone size={16} aria-hidden />
        <span>
          You have an active {activeCall.type === "video" ? "video" : "audio"} call in #
          {activeCall.channelName} ({activeCall.participantCount} participants).
        </span>
      </div>
      <div className="qc-rejoin-banner__actions">
        <span className="qc-rejoin-banner__timer" aria-live="polite">
          {remaining}s
        </span>
        <button
          type="button"
          className="qc-rejoin-banner__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <PhoneOff size={14} aria-hidden />
        </button>
        <button type="button" className="qc-rejoin-banner__rejoin" onClick={handleRejoin}>
          Rejoin
        </button>
      </div>
    </div>
  );
}
