"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { CallModal } from "@/components/telephony/call-modal";

interface Props {
  to?: string | null;
  leadId?: string;
  leadName?: string;
  /** Visual variant. `pill` is the green pill from the summary card; `icon` is a row-friendly icon button. */
  variant?: "pill" | "icon" | "button";
  className?: string;
  disabledReason?: string;
}

/**
 * Reusable call trigger. Opens the dialer modal and (when `leadId` is given) the
 * disposition wizard automatically after the call is placed.
 *
 * Used in: LeadTable rows, LeadSummaryCard, LeadActionBar, contact rows, etc.
 */
export function CallButton({ to, leadId, leadName, variant = "icon", className = "", disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const disabled = !to;
  const title = disabled ? disabledReason ?? "No phone number" : `Call ${to}`;

  function trigger(e: React.MouseEvent) {
    e.stopPropagation(); // don't trigger the row link
    e.preventDefault();
    if (disabled) return;
    setOpen(true);
  }

  if (variant === "pill") {
    return (
      <>
        <button
          onClick={trigger}
          disabled={disabled}
          title={title}
          className={
            "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 " +
            className
          }
        >
          <Phone size={11} /> Call
        </button>
        <CallModal open={open} onClose={() => setOpen(false)} to={to} leadId={leadId} leadName={leadName} />
      </>
    );
  }
  if (variant === "button") {
    return (
      <>
        <button onClick={trigger} disabled={disabled} title={title} className={"crm-btn-secondary " + className}>
          <Phone size={14} /> Call
        </button>
        <CallModal open={open} onClose={() => setOpen(false)} to={to} leadId={leadId} leadName={leadName} />
      </>
    );
  }
  // icon
  return (
    <>
      <button
        onClick={trigger}
        disabled={disabled}
        title={title}
        className={
          "inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-crm-muted disabled:hover:bg-transparent " +
          className
        }
        aria-label="Call"
      >
        <Phone size={14} />
      </button>
      <CallModal open={open} onClose={() => setOpen(false)} to={to} leadId={leadId} leadName={leadName} />
    </>
  );
}
