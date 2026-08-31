"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-time prompt shown when a page is displaying sample data because the
 * workspace has no integrations yet.
 *
 * WHY A DIALOG AND NOT JUST THE BANNER. The banner explains a page; this
 * explains the whole app state on first arrival, and carries the single action
 * that changes it. It appears once per browser session — dismissing it must not
 * mean "never tell me again", because the numbers underneath stay fictional
 * until a source is connected and the inline banner alone is easy to scroll
 * past. Once anything is connected the prompt never renders at all.
 */
const SESSION_KEY = "qi:connect-prompt-seen";

export default function ConnectSourcePrompt({ open }: { open: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    // sessionStorage, not localStorage: a new session should re-surface it,
    // since nothing has changed about the workspace being un-configured.
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // Private mode / storage disabled — show it rather than swallow it.
    }
    if (!seen) setVisible(true);
  }, [open]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* storage unavailable — dismissal just won't persist */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-source-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="modal-box">
        <p className="modal-title" id="connect-source-title">
          Connect your data source
        </p>
        <p className="modal-sub">
          You&apos;re viewing <b>sample data</b> so you can see how QuikInsight works. Connect
          Google Analytics, Meta, LinkedIn, Google Ads or an email tool and this dashboard
          switches to your real numbers automatically.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={dismiss}>
            Explore with sample data
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              dismiss();
              router.push("/integrations");
            }}
          >
            Connect a source
          </button>
        </div>
      </div>
    </div>
  );
}
