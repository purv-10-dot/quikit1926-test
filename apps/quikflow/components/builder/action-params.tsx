"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Braces, Mail } from "lucide-react";
import { findAction, type ConditionField } from "@/lib/catalog";
import { apiGet } from "@/lib/client/fetcher";
import { cn } from "@/lib/utils";
import type { ConnectionDTO } from "@/types";

const INPUT_CLS = "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

/** Actions that send from a connected mailbox → show the "From account" picker. */
const MAIL_SEND_ACTIONS: Record<string, "gmail" | "outlook" | null> = {
  "notify.email.send": null,
  "email.send": null,
  "gmail.send": "gmail",
  "outlook.send": "outlook",
};
const MAIL_PROVIDERS = new Set(["gmail", "outlook"]);

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
  const isMailSend = actionId != null && actionId in MAIL_SEND_ACTIONS;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parameters</p>
      {isMailSend ? (
        <MailAccountPicker
          pinned={MAIL_SEND_ACTIONS[actionId!]}
          value={params.from_connection ?? ""}
          onChange={(v) => setParam("from_connection", v)}
        />
      ) : null}
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

/**
 * "From account" picker — the Zapier/n8n-style connected-account selector for
 * mail-send actions. Lists the org's connected Gmail/Outlook mailboxes (pinned
 * to one provider for gmail.send/outlook.send). Empty ⇒ the engine auto-picks
 * the oldest connected mailbox. No connection ⇒ a prompt to connect one.
 */
function MailAccountPicker({
  pinned,
  value,
  onChange,
}: {
  pinned: "gmail" | "outlook" | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: () => apiGet<ConnectionDTO[]>("/api/connections"),
  });
  const accounts = (data ?? []).filter(
    (c) => MAIL_PROVIDERS.has(c.provider) && c.status === "connected" && (!pinned || c.provider === pinned),
  );

  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
        <Mail className="h-3.5 w-3.5 text-gray-400" />
        From account
      </span>
      {isLoading ? (
        <div className={cn(INPUT_CLS, "text-gray-400")}>Loading accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No {pinned ?? "mail"} account connected.{" "}
          <Link href="/connections" className="font-medium underline">
            Connect one →
          </Link>
        </div>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS}>
          <option value="">Auto — first connected {pinned ?? "mailbox"}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} · {a.provider}
            </option>
          ))}
        </select>
      )}
    </label>
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
