"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Copy, Check, X } from "lucide-react";
import { toast } from "@/lib/toast";
import type { InviteResult } from "../lib/types";

export function InviteResultDialog({
  result,
  onClose,
}: {
  result: InviteResult | null;
  onClose: () => void;
}) {
  // Brief "just copied" flag — drives the Copy → Check icon swap.
  // Cleared automatically after COPIED_FLASH_MS, and also reset every
  // time the dialog is reopened with a new result.
  const [copied, setCopied] = useState(false);
  const COPIED_FLASH_MS = 1500;

  // Esc-to-close + body scroll lock while open
  useEffect(() => {
    if (!result) return;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handler);
    };
  }, [result, onClose]);

  // Reset the copied flash whenever the dialog is opened for a new
  // invite result — stops a stale "Copied" tick from the previous open.
  useEffect(() => { setCopied(false); }, [result]);

  // Run the auto-revert timer only while the flag is set, so we don't
  // schedule a no-op timeout on every re-render.
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!result) return null;

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked — select and copy manually");
    }
  };

  const sent = result.mailSent;
  const headerIcon = sent
    ? <CheckCircle2 className="w-5 h-5" />
    : <AlertTriangle className="w-5 h-5" />;
  const headerTone = sent
    ? "bg-green-50 text-green-600"
    : "bg-amber-50 text-amber-600";
  const title = sent
    ? (result.mode === "resend" ? "Invite resent" : "Invite sent")
    : "Email could not be delivered";
  const subtitle = sent
    ? <>An invitation email has been sent to <span className="font-medium text-gray-800">{result.email}</span>.</>
    : <>The user record was created, but the email failed. Share the invite link below manually.</>;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-100">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${headerTone}`}>
            {headerIcon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <div className="text-sm text-gray-600 mt-1 leading-relaxed">{subtitle}</div>
            {!sent && result.mailError && (
              <div className="mt-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 break-all">
                {result.mailError}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Invite link
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 truncate text-gray-700">
                {result.url}
              </div>
              <button
                type="button"
                onClick={() => copy(result.url, "Invite link")}
                aria-label={copied ? "Invite link copied" : "Copy invite link"}
                className={
                  copied
                    ? "inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Expires in 72 hours. The user lands on the login page with their email pre-filled.
            </div>
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
