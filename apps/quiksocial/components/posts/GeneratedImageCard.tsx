"use client";

import { useState, useRef } from "react";
import {
  Pencil,
  Download,
  Expand,
  X,
  ArrowRight,
  Image as ImageIcon,
  Type,
} from "lucide-react";

interface GeneratedImageCardProps {
  imageUrl: string;
  caption: string;
  hashtags: string[];
  onCaptionChange: (caption: string) => void;
  onRegenerate: (prompt: string) => Promise<void>;
  isRegenerating: boolean;
  /** Live progress message streamed from the regenerate WebSocket. */
  regenerateMsg?: string;
}

const QUICK_EDITS = [
  "Different color mood",
  "Change composition",
  "More brand-focused",
];

export default function GeneratedImageCard({
  imageUrl,
  caption,
  hashtags,
  onCaptionChange,
  onRegenerate,
  isRegenerating,
  regenerateMsg,
}: GeneratedImageCardProps) {
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);
  const [editMode, setEditMode] = useState<"image" | "caption" | null>(null);
  const [regenPrompt, setRegenPrompt] = useState("");
  const [captionDraft, setCaptionDraft] = useState(caption);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const regenInputRef = useRef<HTMLInputElement>(null);

  const handleEditSelect = (mode: "image" | "caption") => {
    setEditMode(mode);
    setEditDropdownOpen(false);
    if (mode === "image") {
      setTimeout(() => regenInputRef.current?.focus(), 50);
    }
  };

  const handleRegenSubmit = async () => {
    if (!regenPrompt.trim() || isRegenerating) return;
    await onRegenerate(regenPrompt.trim());
    setRegenPrompt("");
    setEditMode(null);
  };

  const handleCaptionSave = () => {
    onCaptionChange(captionDraft);
    setEditMode(null);
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `post-${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, maxWidth: 380, width: "100%" }}>
        {/* Image card */}
        <div
          style={{
            position: "relative",
            aspectRatio: "4/5",
            borderRadius: "14px 14px 0 0",
            overflow: "hidden",
            background: "#111",
          }}
          onMouseEnter={() => setToolbarVisible(true)}
          onMouseLeave={() => {
            setToolbarVisible(true); // always visible once hovered
            if (!editDropdownOpen) setToolbarVisible(true);
          }}
        >
          {/* Image */}
          <img
            src={imageUrl}
            alt="Generated post"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          {/* Regenerating overlay */}
          {isRegenerating && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  border: "3px solid rgba(255,255,255,0.20)",
                  borderTop: "3px solid #ffffff",
                  borderRadius: "50%",
                  animation: "qs-spin 0.8s linear infinite",
                }}
              />
              <p style={{ color: "#ffffff", fontSize: 13 }}>
                {regenerateMsg || "Regenerating image…"}
              </p>
            </div>
          )}

          {/* Toolbar — top right */}
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "flex",
              gap: 6,
              opacity: toolbarVisible ? 1 : 0,
              transition: "opacity 0.15s",
              pointerEvents: toolbarVisible ? "auto" : "none",
            }}
          >
            {/* Edit button + dropdown */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setEditDropdownOpen((v) => !v)}
                style={toolbarBtnStyle}
                title="Edit"
              >
                <Pencil size={13} />
              </button>

              {editDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    width: 130,
                    background: "rgba(33, 33, 33, 0.14)",
                    border: "1px solid rgba(255, 255, 255, 0.10)",
                    borderRadius: 10,
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                    zIndex: 20,
                  }}
                >
                  {[
                    { key: "image" as const, icon: <ImageIcon size={12} />, label: "Image" },
                    { key: "caption" as const, icon: <Type size={12} />, label: "Caption" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleEditSelect(item.key)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "9px 12px",
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.80)",
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLElement).style.background =
                          "rgba(255,255,255,0.08)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLElement).style.background = "transparent")
                      }
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button type="button" onClick={handleDownload} style={toolbarBtnStyle} title="Download">
              <Download size={13} />
            </button>

            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              style={toolbarBtnStyle}
              title="Expand"
            >
              <Expand size={13} />
            </button>
          </div>

          {/* Inline regenerate overlay — bottom of image */}
          {editMode === "image" && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(33, 33, 33, 0.14)",
                borderTop: "1px solid rgba(255, 255, 255, 0.10)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                padding: "12px 12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {/* Quick edit pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {QUICK_EDITS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setRegenPrompt(q)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 9999,
                      border: "1px solid rgba(255,255,255,0.22)",
                      background:
                        regenPrompt === q
                          ? "rgba(255,255,255,0.18)"
                          : "rgba(255,255,255,0.07)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 11,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Text input row */}
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  ref={regenInputRef}
                  value={regenPrompt}
                  onChange={(e) => setRegenPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRegenSubmit()}
                  placeholder="Describe your changes…"
                  style={{
                    flex: 1,
                    height: 34,
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: 8,
                    color: "#ffffff",
                    fontSize: 12,
                    padding: "0 10px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => { setEditMode(null); setRegenPrompt(""); }}
                  style={{ ...iconBtnStyle, color: "rgba(255,255,255,0.45)" }}
                >
                  <X size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleRegenSubmit}
                  disabled={!regenPrompt.trim() || isRegenerating}
                  style={{
                    ...iconBtnStyle,
                    background: regenPrompt.trim() ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.15)",
                    color: regenPrompt.trim() ? "#0a0a0a" : "rgba(255,255,255,0.40)",
                  }}
                >
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Caption + hashtags */}
        <div
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.11)",
            borderTop: "none",
            borderRadius: "0 0 14px 14px",
            padding: "14px 14px 16px",
          }}
        >
          {editMode === "caption" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                rows={4}
                autoFocus
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.20)",
                  borderRadius: 8,
                  color: "#ffffff",
                  fontSize: 13,
                  padding: "8px 10px",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  lineHeight: 1.55,
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => { setCaptionDraft(caption); setEditMode(null); }}
                  style={{
                    flex: 1, height: 30, borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.18)", background: "transparent",
                    color: "rgba(255,255,255,0.65)", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCaptionSave}
                  style={{
                    flex: 1, height: 30, borderRadius: 8, border: "none",
                    background: "#ffffff", color: "#0a0a0a", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.80)",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {caption}
              </p>
              {hashtags.length > 0 && (
                <p
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.40)",
                    marginTop: 8,
                    lineHeight: 1.5,
                  }}
                >
                  {hashtags.join(" ")}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreenOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setFullscreenOpen(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreenOpen(false)}
            style={{
              position: "absolute", top: 20, right: 20,
              background: "rgba(255,255,255,0.12)", border: "none",
              borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
              color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
          <img
            src={imageUrl}
            alt=""
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <style>{`
        @keyframes qs-spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  // Floating action chip over the generated image — keeps a darker
  // backing for legibility against bright AI imagery, but the blur
  // amount is normalised to the Primary glass token (24px) so it sits
  // visually with the rest of the app's glass surfaces.
  background: "rgba(0, 0, 0, 0.55)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  color: "#ffffff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
};

const iconBtnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: "rgba(255,255,255,0.10)",
  border: "none",
  color: "#ffffff",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
