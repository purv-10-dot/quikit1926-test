"use client";

import { useState, type ReactNode } from "react";

/**
 * Small hover tooltip. Hover-only by design — matches the prototype's
 * inline tooltip on the Cooldown / Max replies/day fields. Not portal-
 * rendered (kept inside flow so it inherits the parent's positioning
 * context); the parent must have `position: relative`.
 */
export function Tooltip({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a1a1a",
            color: "#fff",
            fontSize: 11,
            padding: "8px 12px",
            borderRadius: 8,
            width: 220,
            lineHeight: 1.5,
            fontWeight: 400,
            zIndex: 10,
            textAlign: "left",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {text}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              borderWidth: 5,
              borderStyle: "solid",
              borderColor: "#1a1a1a transparent transparent transparent",
            }}
          />
        </span>
      )}
    </span>
  );
}
