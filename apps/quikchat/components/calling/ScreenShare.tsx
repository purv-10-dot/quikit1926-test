"use client";

import { useCallback, useState } from "react";
import { Monitor, X } from "@/components/ui";

export interface ScreenShareProps {
  isSharing: boolean;
  onToggle: (stream: MediaStream | null) => void;
  livekitMode?: boolean;
}

export function ScreenShare({ isSharing, onToggle, livekitMode }: ScreenShareProps) {
  const [error, setError] = useState<string | null>(null);

  const handleToggle = useCallback(async () => {
    if (isSharing) {
      onToggle(null);
      return;
    }

    if (livekitMode) {
      onToggle(null);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      // Listen for when user stops sharing via browser UI
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        onToggle(null);
      });

      onToggle(stream);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(null); // User cancelled — not an error
      } else {
        setError("Screen share failed");
      }
    }
  }, [isSharing, onToggle, livekitMode]);

  return (
    <div className="qc-screen-share">
      <button
        type="button"
        className={`qc-screen-share__btn ${isSharing ? "qc-screen-share__btn--active" : ""}`}
        onClick={handleToggle}
        aria-label={isSharing ? "Stop screen share" : "Share screen"}
        data-testid="screen-share-btn"
      >
        {isSharing ? <X size={18} /> : <Monitor size={18} />}
        <span>{isSharing ? "Stop Share" : "Share Screen"}</span>
      </button>
      {error ? (
        <span className="qc-screen-share__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
