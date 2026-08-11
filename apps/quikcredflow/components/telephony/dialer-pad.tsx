// apps/quikcredflow/components/telephony/dialer-pad.tsx
"use client";

import { Phone, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

interface Props {
  value: string;
  onChange: (next: string) => void;
  onCall: () => void;
  disabled?: boolean;
  callButtonLabel?: string;
  /** Optional second input for the agent's leg (Party A). */
  agentValue?: string;
  onAgentChange?: (next: string) => void;
  agentPlaceholder?: string;
}

/**
 * Pure presentation keypad. Controlled — call-orchestration logic lives in
 * the parent (CallModal), which supplies value + onCall.
 */
export function DialerPad({
  value,
  onChange,
  onCall,
  disabled = false,
  callButtonLabel = "Call",
  agentValue,
  onAgentChange,
  agentPlaceholder = "Agent number (Party A)",
}: Props) {
  function press(key: string) {
    onChange((value + key).slice(0, 20));
  }

  return (
    <div className="mx-auto max-w-xs rounded-2xl border border-crm-border bg-white p-5 shadow-crm-card">
      <div className="mb-4 rounded-lg bg-crm-panel px-3 py-3 text-center text-2xl font-mono tracking-wider text-crm-text">
        {value || <span className="text-crm-muted">Enter number</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            disabled={disabled}
            className="rounded-lg border border-crm-border bg-white py-3 text-lg font-semibold text-crm-text hover:bg-crm-panel disabled:opacity-50"
          >
            {k}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <Input
          placeholder="Or paste a customer number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
      {onAgentChange && (
        <div className="mt-3">
          <Input
            placeholder={agentPlaceholder}
            value={agentValue ?? ""}
            onChange={(e) => onAgentChange(e.target.value)}
            disabled={disabled}
          />
          <p className="mt-1 text-[11px] text-crm-muted">
            Leave blank to use the configured default agent number.
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          onClick={() => onChange(value.slice(0, -1))}
          className="crm-btn-ghost"
          aria-label="Delete"
          disabled={disabled}
        >
          <Delete size={18} />
        </button>
        <Button onClick={onCall} disabled={disabled}>
          <Phone size={16} /> {callButtonLabel}
        </Button>
      </div>
    </div>
  );
}
