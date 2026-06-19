"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

interface PostIdea {
  title: string;
  description: string;
}

interface PostIdeaCardProps {
  idea: PostIdea;
  index: number;
  selected: boolean;
  onClick: () => void;
}

export default function PostIdeaCard({ idea, index, selected, onClick }: PostIdeaCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // Primary glass card tokens — design-tokens.md §1. Default sits on
      // the canonical dark-tinted glass; selected/hover lift toward the
      // brand-row layered emphasis (still glass, brighter inner surface).
      style={{
        flex: 1,
        minWidth: 0,
        background: selected
          ? "rgba(255, 255, 255, 0.18)"
          : hovered
          ? "rgba(255, 255, 255, 0.10)"
          : "rgba(33, 33, 33, 0.14)",
        border: selected
          ? "1.5px solid rgba(255, 255, 255, 0.85)"
          : hovered
          ? "1px solid rgba(255, 255, 255, 0.30)"
          : "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        padding: "18px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Option label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: selected ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.10)",
            color: selected ? "#ffffff" : "rgba(255,255,255,0.60)",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: selected ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.40)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Option {index + 1}
        </span>
        {selected && (
          <Sparkles
            size={12}
            style={{ color: "rgba(255,255,255,0.70)", marginLeft: "auto" }}
          />
        )}
      </div>

      {/* Title */}
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#ffffff",
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {idea.title}
      </p>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.60)",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {idea.description}
      </p>
    </button>
  );
}
