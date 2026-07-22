"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, X } from "@/components/ui";

export interface RemovedFromCallToastProps {
  channelName: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function RemovedFromCallToast({
  channelName,
  onDismiss,
  autoDismissMs = 5000,
}: RemovedFromCallToastProps) {
  const [visible, setVisible] = useState(true);

  const dismiss = useCallback(() => {
    setVisible(false);
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(dismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible, autoDismissMs, dismiss]);

  if (!visible) return null;

  return (
    <div className="qc-removed-toast" role="alert" data-testid="removed-from-call-toast">
      <AlertCircle size={16} aria-hidden className="qc-removed-toast__icon" />
      <span className="qc-removed-toast__message">
        You were removed from the call in #{channelName}
      </span>
      <button
        type="button"
        className="qc-removed-toast__close"
        onClick={dismiss}
        aria-label="Dismiss"
        data-testid="removed-toast-dismiss"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
