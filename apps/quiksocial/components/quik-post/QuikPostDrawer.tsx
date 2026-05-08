"use client";

import { useEffect, useRef, useState } from "react";
import { X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

const OBJECTIVES = [
  { value: "promotional", label: "Promotional" },
  { value: "engagement", label: "Engagement" },
  { value: "announcement", label: "Announcement" },
  { value: "brand_awareness", label: "Brand Awareness" },
] as const;

type ObjectiveValue = (typeof OBJECTIVES)[number]["value"];

interface QuikPostDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeBrand: { name: string; id: string } | null;
}

export default function QuikPostDrawer({
  isOpen,
  onClose,
  activeBrand,
}: QuikPostDrawerProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState<ObjectiveValue>("engagement");
  const [includeLogo, setIncludeLogo] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => textareaRef.current?.focus(), 300);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    const params = new URLSearchParams({
      prompt: prompt.trim(),
      objective,
      includeLogo: String(includeLogo),
      quikPost: "true",
    });
    onClose();
    router.push(`/dashboard/posts/create?${params.toString()}`);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[65] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-[70] flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          width: "420px",
          maxWidth: "100vw",
          background: "rgba(33, 33, 33, 0.14)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.10)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Post"
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.10)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Zap size={15} className="text-white" fill="currentColor" />
            </div>
            <h2 className="text-white font-semibold" style={{ fontSize: 17 }}>
              Quik Post
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ color: "rgba(255,255,255,0.55)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.10)";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "rgba(255,255,255,0.55)";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Brand context pill */}
          {activeBrand ? (
            <div>
              <p
                className="text-xs font-medium mb-2"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Brand context
              </p>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
                style={{
                  background: "rgba(255,255,255,0.09)",
                  border: "1px solid rgba(255,255,255,0.16)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{
                    background: `hsl(${
                      (activeBrand.name.charCodeAt(0) * 137.5) % 360
                    }, 45%, 50%)`,
                  }}
                />
                <span className="text-white">{activeBrand.name}</span>
                <span
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.40)" }}
                >
                  Auto-applied
                </span>
              </div>
            </div>
          ) : (
            <div
              className="px-3 py-2 rounded-lg text-sm"
              style={{
                background: "rgba(255,165,0,0.10)",
                border: "1px solid rgba(255,165,0,0.20)",
                color: "rgba(255,200,100,0.85)",
              }}
            >
              No active brand — brand context will not be applied.
            </div>
          )}

          {/* Prompt textarea */}
          <div>
            <label
              htmlFor="quikpost-prompt"
              className="block text-sm font-medium mb-2"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              What do you want to post about?
            </label>
            <textarea
              id="quikpost-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your post idea… e.g. 'Announcing our new summer collection with a bold lifestyle shot'"
              rows={5}
              className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#ffffff",
                lineHeight: 1.65,
                caretColor: "#ffffff",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.28)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
              }}
            />
          </div>

          {/* Post Objective */}
          <div>
            <p
              className="text-sm font-medium mb-2.5"
              style={{ color: "rgba(255,255,255,0.75)" }}
            >
              Post Objective
            </p>
            <div className="flex flex-wrap gap-2">
              {OBJECTIVES.map((obj) => {
                const active = objective === obj.value;
                return (
                  <button
                    key={obj.value}
                    type="button"
                    onClick={() => setObjective(obj.value)}
                    className="px-3.5 py-1.5 rounded-full text-sm transition-all duration-150"
                    style={
                      active
                        ? {
                            background: "rgba(255,255,255,0.90)",
                            color: "#0a0a0a",
                            border: "1px solid rgba(255,255,255,0.90)",
                            fontWeight: 500,
                          }
                        : {
                            background: "rgba(255,255,255,0.07)",
                            color: "rgba(255,255,255,0.75)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            fontWeight: 400,
                          }
                    }
                  >
                    {obj.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Include Logo toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white">Include Logo</p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "rgba(255,255,255,0.40)" }}
              >
                Add brand logo to generated image
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={includeLogo}
              onClick={() => setIncludeLogo((v) => !v)}
              className="relative flex-shrink-0 rounded-full transition-colors duration-200"
              style={{
                width: 44,
                height: 24,
                background: includeLogo
                  ? "rgba(255,255,255,0.85)"
                  : "rgba(255,255,255,0.18)",
              }}
            >
              <span
                className="absolute top-0.5 rounded-full shadow-sm transition-transform duration-200"
                style={{
                  width: 20,
                  height: 20,
                  left: 2,
                  background: includeLogo ? "#0a0a0a" : "#ffffff",
                  transform: includeLogo ? "translateX(20px)" : "translateX(0)",
                }}
              />
            </button>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="flex-shrink-0 px-6 py-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}
        >
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!prompt.trim()}
            className="w-full h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all duration-150"
            style={{
              background: prompt.trim()
                ? "#ffffff"
                : "rgba(255,255,255,0.20)",
              color: prompt.trim() ? "#0a0a0a" : "rgba(255,255,255,0.35)",
              cursor: prompt.trim() ? "pointer" : "not-allowed",
            }}
          >
            Generate Post ✨
          </button>
          <p
            className="text-center text-xs mt-3"
            style={{ color: "rgba(255,255,255,0.30)" }}
          >
            Uses your brand context automatically
          </p>
        </div>
      </div>
    </>
  );
}
