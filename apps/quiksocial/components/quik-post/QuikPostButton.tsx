"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import QuikPostDrawer from "./QuikPostDrawer";

interface QuikPostButtonProps {
  activeBrand: { name: string; id: string } | null;
}

export default function QuikPostButton({ activeBrand }: QuikPostButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Action Button */}
      <button
        type="button"
        aria-label="Quick Post"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[60] flex items-center justify-center transition-transform duration-150 hover:scale-105 active:scale-95"
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "#ffffff",
          border: "none",
          cursor: "pointer",
          boxShadow:
            "0 4px 16px rgba(255,255,255,0.22), 0 8px 32px rgba(0,0,0,0.40)",
        }}
      >
        <Zap size={22} style={{ color: "#0a0a0a" }} fill="#0a0a0a" />
      </button>

      <QuikPostDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        activeBrand={activeBrand}
      />
    </>
  );
}
