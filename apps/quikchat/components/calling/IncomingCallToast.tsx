"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video } from "@/components/ui";

export interface IncomingCallToastProps {
  callerName: string;
  callType: "audio" | "video";
  callId: string;
  onAccept: (callId: string) => void;
  onDecline: (callId: string) => void;
}

const TIMEOUT_MS = 30_000;

export function IncomingCallToast({
  callerName,
  callType,
  callId,
  onAccept,
  onDecline,
}: IncomingCallToastProps) {
  const [remaining, setRemaining] = useState(Math.ceil(TIMEOUT_MS / 1000));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          onDecline(callId);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callId, onDecline]);

  const handleAccept = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onAccept(callId);
  }, [callId, onAccept]);

  const handleDecline = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    onDecline(callId);
  }, [callId, onDecline]);

  return (
    <div className="qc-incoming-call" role="alert" data-testid="incoming-call-toast">
      <div className="qc-incoming-call__info">
        {callType === "video" ? <Video size={20} aria-hidden /> : <Phone size={20} aria-hidden />}
        <div>
          <div className="qc-incoming-call__caller">{callerName}</div>
          <div className="qc-incoming-call__type">
            {callType === "video" ? "Video call" : "Audio call"}
          </div>
        </div>
      </div>
      <div className="qc-incoming-call__timer" aria-live="polite">
        {remaining}s
      </div>
      <div className="qc-incoming-call__actions">
        <button
          type="button"
          className="qc-incoming-call__decline"
          onClick={handleDecline}
          aria-label="Decline call"
        >
          <PhoneOff size={18} aria-hidden />
        </button>
        <button
          type="button"
          className="qc-incoming-call__accept"
          onClick={handleAccept}
          aria-label="Accept call"
        >
          <Phone size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
