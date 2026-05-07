"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  MoreHorizontal,
  Link2,
  ChevronDown,
  Plus,
} from "lucide-react";

type Role = "Administrator" | "Member" | "Viewer";

interface InvitedPerson {
  id: string;
  label: string;
  /** When `email`, treat as an external invite; when `member`, the chip is
   *  a tenant user we already know. The UI doesn't differentiate yet — kept
   *  here so the future API call can route correctly. */
  kind: "email" | "member";
}

/**
 * "Add people to <project>" invite modal — UI-only for now. Wires up:
 *  - typeahead input that converts emails / suggestions into pill chips
 *  - chip removal
 *  - role selector (Administrator / Member / Viewer)
 *  - external-source quick-add buttons (Google / Slack / Microsoft) — display only
 *  - Copy link footer action
 *  - Add submits the captured payload via `onSubmit` (parent decides what to do)
 */
export function AddPeopleModal({
  projectName,
  onClose,
  onSubmit,
}: {
  projectName: string;
  onClose: () => void;
  onSubmit?: (payload: { invitees: InvitedPerson[]; role: Role }) => void;
}) {
  const [input, setInput] = useState("");
  const [invitees, setInvitees] = useState<InvitedPerson[]>([]);
  const [role, setRole] = useState<Role>("Administrator");
  const [roleOpen, setRoleOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Outside-click closes the role popover; Escape closes the whole modal.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (roleOpen && roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setRoleOpen(false);
      }
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
  }, [roleOpen, onClose]);

  function commitInput() {
    const t = input.trim().replace(/[,;]\s*$/, "");
    if (!t) return;
    // Naive split on commas so pasting a list works.
    const parts = t
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setInvitees((cur) => {
      const next = [...cur];
      for (const p of parts) {
        const isEmail = /\S+@\S+\.\S+/.test(p);
        if (next.some((x) => x.label.toLowerCase() === p.toLowerCase())) continue;
        next.push({
          id: `${isEmail ? "e" : "n"}:${p}`,
          label: p,
          kind: isEmail ? "email" : "email",
        });
      }
      return next;
    });
    setInput("");
  }

  function copyLink() {
    if (typeof window === "undefined") return;
    void navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function submit() {
    onSubmit?.({ invitees, role });
    onClose();
  }

  const canSubmit = invitees.length > 0;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-md shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-4">
          <h3 className="text-base font-semibold text-gray-900 leading-snug">
            Add people to {projectName}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="More"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Names or emails */}
        <label className="block">
          <span className="text-xs font-semibold text-gray-700 block mb-1">
            Names or emails <span className="text-red-500">*</span>
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitInput();
              }
              if (e.key === "Backspace" && input === "" && invitees.length > 0) {
                setInvitees((cur) => cur.slice(0, -1));
              }
            }}
            onBlur={commitInput}
            placeholder="e.g., Maria, maria@company.com"
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </label>

        {invitees.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {invitees.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 h-6 pl-1 pr-1.5 text-xs bg-gray-100 rounded-full text-gray-800"
              >
                <span
                  className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                  style={{ background: avatarColor(p.label) }}
                >
                  {(p.label.charAt(0) || "?").toUpperCase()}
                </span>
                {p.label}
                <button
                  type="button"
                  onClick={() =>
                    setInvitees((cur) => cur.filter((x) => x.id !== p.id))
                  }
                  className="text-gray-400 hover:text-gray-600"
                  aria-label={`Remove ${p.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* External providers (visual only) */}
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">or add from</div>
          <div className="grid grid-cols-3 gap-2">
            <ProviderButton label="Google" />
            <ProviderButton label="Slack" />
            <ProviderButton label="Microsoft" />
          </div>
        </div>

        {/* Role */}
        <div className="mt-4" ref={roleRef}>
          <span className="text-xs font-semibold text-gray-700 block mb-1">
            Role <span className="text-red-500">*</span>
          </span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleOpen((v) => !v)}
              className="w-full inline-flex items-center justify-between h-9 px-3 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
            >
              <span>{role}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            </button>
            {roleOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-30 py-1">
                {(["Administrator", "Member", "Viewer"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRole(r);
                      setRoleOpen(false);
                    }}
                    className={`w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                      r === role ? "text-blue-700 bg-blue-50 font-medium" : "text-gray-700"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-[11px] text-gray-500 leading-snug">
          This site is protected by reCAPTCHA and the Google{" "}
          <a className="text-blue-600 hover:underline" href="#">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a className="text-blue-600 hover:underline" href="#">
            Terms of Service
          </a>{" "}
          apply.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            <Link2 className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-sm text-gray-700 rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 h-9 px-3 text-sm text-gray-800 border border-gray-300 rounded hover:bg-gray-50"
    >
      <span
        className="h-4 w-4 rounded-sm"
        style={{ background: providerColor(label) }}
      />
      {label}
    </button>
  );
}

function providerColor(label: string): string {
  if (label === "Google") return "#4285F4";
  if (label === "Slack") return "#611f69";
  if (label === "Microsoft") return "#00A4EF";
  return "#888";
}

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
