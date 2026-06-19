"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

type ShareMode = "view" | "edit";

/**
 * Popover for managing a doc's public share link. Creating a link calls
 * POST /api/docs/[id]/share (returns a short base62 code); the link is
 * `${origin}/share/<code>`. Revoking calls DELETE. Only rendered for a saved
 * doc (an id must exist).
 */
export function ShareDialog({
  docId,
  token,
  mode,
  onChange,
  onClose,
}: {
  docId: string;
  token: string | null;
  mode: ShareMode | null;
  onChange: (token: string | null, mode: ShareMode | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftMode, setDraftMode] = useState<ShareMode>(mode ?? "edit");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const link =
    token && typeof window !== "undefined" ? `${window.location.origin}/share/${token}` : "";

  async function setShare(nextMode: ShareMode) {
    setBusy(true);
    setError(null);
    try {
      const j = await fetch(`/api/docs/${docId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      }).then((r) => r.json());
      if (j?.success) onChange(j.data.token, j.data.mode);
      else setError(j?.error ?? "Couldn't create link.");
    } catch {
      setError("Couldn't create link.");
    } finally {
      setBusy(false);
    }
  }

  async function stopSharing() {
    setBusy(true);
    setError(null);
    try {
      const j = await fetch(`/api/docs/${docId}/share`, { method: "DELETE" }).then((r) => r.json());
      if (j?.success) onChange(null, null);
      else setError(j?.error ?? "Couldn't stop sharing.");
    } catch {
      setError("Couldn't stop sharing.");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Link2 className="w-4 h-4 text-gray-500" />
        Share this doc
      </h3>

      {!token ? (
        <>
          <p className="mt-1 text-xs text-gray-500">
            Anyone with the link can open it — no sign-in needed.
          </p>
          <div className="mt-3 flex items-center rounded-md border border-gray-300 overflow-hidden text-xs">
            {(["view", "edit"] as ShareMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDraftMode(m)}
                className={`flex-1 px-3 py-1.5 capitalize ${
                  draftMode === m
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Can {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShare(draftMode)}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            Create link
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1.5">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 h-8 px-2 text-xs border border-gray-300 rounded bg-gray-50 text-gray-700"
            />
            <button
              type="button"
              onClick={copy}
              className="h-8 px-2 inline-flex items-center gap-1 rounded border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="mt-3 flex items-center rounded-md border border-gray-300 overflow-hidden text-xs">
            {(["view", "edit"] as ShareMode[]).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => setShare(m)}
                className={`flex-1 px-3 py-1.5 capitalize disabled:opacity-50 ${
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                Can {m}
              </button>
            ))}
          </div>

          {mode === "edit" && (
            <p className="mt-2 text-[11px] text-amber-600">
              Anyone with this link can edit the doc.
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={stopSharing}
            className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Stop sharing
          </button>
        </>
      )}

      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
