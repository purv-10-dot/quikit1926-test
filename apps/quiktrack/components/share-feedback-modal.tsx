"use client";

import { useEffect, useRef, useState } from "react";
import { X, ChevronDown, ExternalLink, Check } from "lucide-react";

const FEEDBACK_KINDS = [
  { value: "question", label: "Ask a question", prompt: "What would you like to know?" },
  { value: "comment", label: "Leave a comment", prompt: "Let us know what's on your mind" },
  { value: "bug", label: "Report a bug", prompt: "Tell us about the bug" },
  { value: "improvement", label: "Suggest an improvement", prompt: "What could be better?" },
] as const;

type Kind = (typeof FEEDBACK_KINDS)[number]["value"];

export function ShareFeedbackModal({
  projectId,
  onClose,
}: {
  projectId?: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind | "">("");
  const [text, setText] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [researchOk, setResearchOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = FEEDBACK_KINDS.find((k) => k.value === kind);
  const prompt = selected?.prompt ?? "What would you like to know?";

  async function submit() {
    if (!kind || !text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: kind,
          content: text.trim(),
          projectId,
          contactOk,
          researchOk,
          url: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error ?? "Failed to send feedback");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 flex items-start justify-center pt-20 px-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Share your thoughts</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-gray-800 font-medium">Thanks for the feedback!</p>
            <p className="mt-1 text-xs text-gray-500">
              We&apos;ve received your message and will look into it.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 h-9 px-4 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Required fields are marked with an asterisk <span className="text-red-600">*</span>
              </p>

              <Field label="Select feedback" required>
                <FeedbackKindDropdown value={kind} onChange={setKind} />
              </Field>

              {kind && (
                <>
                  <Field label={prompt} required>
                    <textarea
                      autoFocus
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={5}
                      maxLength={4000}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                    />
                  </Field>

                  <label className="flex items-start gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={contactOk}
                      onChange={(e) => setContactOk(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Yes, the QuikTrack team can contact me to learn about my experiences to improve
                      the product. I acknowledge the{" "}
                      <a
                        href="#"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
                      >
                        Privacy Policy
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      .
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={researchOk}
                      onChange={(e) => setResearchOk(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>I&apos;d like to participate in product research</span>
                  </label>
                </>
              )}
            </div>

            {error && (
              <div className="px-6 pb-2 text-xs text-red-600">{error}</div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-sm text-gray-700 dark:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!kind || !text.trim() || submitting}
                className="h-9 px-4 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
              >
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-800 block mb-1.5">
        {label}
        {required && <span className="text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function FeedbackKindDropdown({
  value,
  onChange,
}: {
  value: Kind | "";
  onChange: (k: Kind) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = FEEDBACK_KINDS.find((k) => k.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full h-10 pl-3 pr-9 inline-flex items-center text-sm rounded text-left bg-white dark:bg-gray-900 dark:text-gray-100 border ${
          open
            ? "border-blue-500 ring-2 ring-blue-500/30"
            : "border-gray-300 dark:border-gray-600 dark:bg-gray-900 hover:border-gray-400"
        }`}
      >
        {selected ? (
          <span className="text-gray-900">{selected.label}</span>
        ) : (
          <span className="text-gray-400">Choose one</span>
        )}
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1">
          {FEEDBACK_KINDS.map((k) => {
            const active = k.value === value;
            return (
              <button
                key={k.value}
                type="button"
                onClick={() => {
                  onChange(k.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-800"
                }`}
              >
                <span>{k.label}</span>
                {active && <Check className="h-4 w-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
