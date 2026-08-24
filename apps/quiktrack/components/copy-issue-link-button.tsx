"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";

interface Props {
  /** Work-item key, e.g. `QUIKTR-329`. */
  issueKey: string;
  /** Extra classes for the button (sizing/spacing tweaks per call site). */
  className?: string;
}

/**
 * Jira-parity "copy link" icon that sits next to the work-item key in the
 * breadcrumb (drawer + full page). Copies the canonical `/browse/<KEY>` URL —
 * the same shape the created-toast and notification emails use — so a pasted
 * link always resolves to the item regardless of which view it was copied from.
 */
export function CopyIssueLinkButton({ issueKey, className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function copy(e: React.MouseEvent) {
    // The breadcrumb key is a link and the whole row can be clickable — don't
    // let the copy navigate away or bubble into a parent row handler.
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/browse/${encodeURIComponent(issueKey)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // navigator.clipboard is undefined on non-HTTPS origins (QA over plain
      // http:// and LAN IPs), so fall back to the legacy selection copy.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={(e) => void copy(e)}
      title={copied ? "Copied!" : "Copy link"}
      aria-label={copied ? "Link copied" : "Copy link"}
      className={`inline-flex items-center justify-center h-5 w-5 rounded shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 ${className}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
    </button>
  );
}
