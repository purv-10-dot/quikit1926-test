"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// Glass-styled pagination control. Used by the Products and Services
// catalog pages; designed to match design-tokens.md (subtle glass
// surface, rgba whites at 0.06 / 0.10 / 0.16 for default / hover /
// active, 10px radius). Buttons are disabled at page boundaries —
// styling matches the rest of the catalog cards.

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 24,
        padding: "8px 0",
      }}
    >
      <NavButton
        disabled={!canPrev}
        onClick={() => canPrev && onPageChange(page - 1)}
        ariaLabel="Previous page"
      >
        <ChevronLeft size={14} />
        <span>Previous</span>
      </NavButton>

      <span
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,0.70)",
          fontWeight: 500,
          minWidth: 96,
          textAlign: "center",
        }}
      >
        Page {page} of {totalPages}
      </span>

      <NavButton
        disabled={!canNext}
        onClick={() => canNext && onPageChange(page + 1)}
        ariaLabel="Next page"
      >
        <span>Next</span>
        <ChevronRight size={14} />
      </NavButton>
    </div>
  );
}

function NavButton({
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 10,
        background: disabled
          ? "rgba(255,255,255,0.04)"
          : "rgba(255,255,255,0.08)",
        border: `1px solid ${
          disabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.14)"
        }`,
        color: disabled
          ? "rgba(255,255,255,0.30)"
          : "rgba(255,255,255,0.85)",
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(255,255,255,0.12)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(255,255,255,0.08)";
      }}
    >
      {children}
    </button>
  );
}
