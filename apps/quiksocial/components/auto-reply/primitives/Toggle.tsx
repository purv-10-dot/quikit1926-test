"use client";

/**
 * Pill switch — ported from docs/AutoReplyPrototype.jsx Toggle().
 * `disabled` greys it out and blocks the click (used while a toggle
 * round-trip is in flight if the parent wants to lock it).
 */
export function Toggle({
  checked,
  onChange,
  size = "md",
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const w = size === "sm" ? 32 : 40;
  const h = size === "sm" ? 18 : 22;
  const d = size === "sm" ? 14 : 18;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled) onChange();
      }}
      disabled={disabled}
      style={{
        width: w,
        height: h,
        borderRadius: h,
        background: checked ? "#1D9E75" : "#B4B2A9",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span
        aria-hidden
        style={{
          width: d,
          height: d,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: (h - d) / 2,
          left: checked ? w - d - 2 : 2,
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}
