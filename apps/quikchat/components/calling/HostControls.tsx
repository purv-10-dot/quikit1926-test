"use client";

import { useCallback } from "react";
import { Mic, X } from "@/components/ui";

export interface HostControlsProps {
  isAdmin: boolean;
  onMuteAll: () => void;
}

export function HostControls({ isAdmin, onMuteAll }: HostControlsProps) {
  const handleMuteAll = useCallback(() => {
    onMuteAll();
  }, [onMuteAll]);

  if (!isAdmin) return null;

  return (
    <div className="qc-host-controls" data-testid="host-controls">
      <button
        type="button"
        className="qc-host-controls__mute-all"
        onClick={handleMuteAll}
        aria-label="Mute all participants"
        data-testid="mute-all-button"
      >
        <Mic size={16} aria-hidden />
        <span>Mute All</span>
        <X size={12} aria-hidden />
      </button>
    </div>
  );
}
