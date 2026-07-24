"use client";

import { useState } from "react";
import { Braces } from "lucide-react";
import { findAction, type ConditionField } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const INPUT_CLS = "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

/** "who[]" → "who", "fields{}" → "fields". */
function baseKey(raw: string): string {
  return raw.replace(/(\[\]|\{\})$/, "");
}
function humanize(key: string): string {
  return key
    .split(/[._]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Action parameter editor (Data-Level Design §7). Renders each of the action's
 * declared params as an input with a {{token}} menu, so params can pull values
 * from the triggering record — e.g. create_www with
 * what="Follow up {{trigger.kpi.name}}", owner="{{trigger.kpi.owner}}", when="+7d".
 */
export function ActionParams({
  actionId,
  tokenFields,
  params,
  onChange,
}: {
  actionId: string | undefined;
  tokenFields: ConditionField[];
  params: Record<string, string>;
  onChange: (params: Record<string, string>) => void;
}) {
  const action = findAction(actionId);
  if (!action) return null;

  const keys = Array.from(new Set([...action.requiredInputs, ...action.optionalInputs].map(baseKey)));
  if (keys.length === 0) {
    return <p className="text-xs text-gray-500">This action takes no parameters.</p>;
  }

  const setParam = (key: string, value: string) => onChange({ ...params, [key]: value });

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parameters</p>
      {keys.map((key) => (
        <ParamInput
          key={key}
          label={humanize(key)}
          value={params[key] ?? ""}
          tokenFields={tokenFields}
          required={action.requiredInputs.map(baseKey).includes(key)}
          onChange={(v) => setParam(key, v)}
        />
      ))}
      <p className="text-xs text-gray-500">
        Insert a token with the <Braces className="inline h-3 w-3" /> menu, or type a relative date like{" "}
        <code className="rounded bg-gray-100 px-1">+14d</code>.
      </p>
    </div>
  );
}

function ParamInput({
  label,
  value,
  tokenFields,
  required,
  onChange,
}: {
  label: string;
  value: string;
  tokenFields: ConditionField[];
  required: boolean;
  onChange: (value: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="relative flex items-center gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS} />
        <button
          type="button"
          aria-label="Insert token"
          onClick={() => setMenuOpen((o) => !o)}
          className="shrink-0 rounded-lg border border-[var(--color-border)] p-2 text-gray-500 hover:bg-[var(--color-bg-secondary)]"
        >
          <Braces className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-64 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg">
            {tokenFields.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-500">Pick a trigger event to get tokens.</p>
            ) : (
              tokenFields.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(`${value}{{${f.id}}}`);
                    setMenuOpen(false);
                  }}
                  className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-accent-50")}
                >
                  <span className="font-medium">{f.label}</span>
                  <span className="ml-1 text-xs text-gray-500">{`{{${f.id}}}`}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}
