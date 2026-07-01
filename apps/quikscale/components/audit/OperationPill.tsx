"use client";

import "./audit-log-tokens.css";
import { OPERATION_TOKENS, operationForAction, type Operation } from "./auditLogTokens";

/**
 * The ONLY component allowed to render an audit operation pill (AC-1.45).
 * Pass a stored `action` (mapped to its display operation) or an explicit
 * `operation`. Colours come from the canonical token map.
 */
export function OperationPill({
  action,
  operation,
  className = "",
}: {
  action?: string;
  operation?: Operation;
  className?: string;
}) {
  const op = operation ?? operationForAction(action ?? "");
  const token = OPERATION_TOKENS[op];
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${className}`}
      style={{ color: token.fg, backgroundColor: token.bg }}
    >
      {token.label}
    </span>
  );
}
