"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  buildSettingsHref,
  markPendingSettingsReturn,
  saveLeadFormDraft,
  type LeadFormDraftScope,
  type LeadFormDraftValues,
} from "@/lib/leads/lead-form-draft";

interface Props {
  settingsPath: string;
  returnTo: string | null;
  draftScope?: LeadFormDraftScope;
  getDraft?: () => LeadFormDraftValues;
  children: ReactNode;
}

/** Leave Add/Edit lead form for settings; restore draft only when returning via returnTo. */
export function LeadFormSettingsLink({
  settingsPath,
  returnTo,
  draftScope,
  getDraft,
  children,
}: Props) {
  const router = useRouter();
  const href = buildSettingsHref(settingsPath, returnTo);

  function onNavigate() {
    if (draftScope && getDraft) {
      saveLeadFormDraft(draftScope, getDraft());
      markPendingSettingsReturn(draftScope);
    }
  }

  if (!returnTo) {
    return (
      <button
        type="button"
        className="text-xs text-crm-blue hover:underline"
        onClick={() => router.push(settingsPath)}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-crm-blue hover:underline"
      onClick={() => {
        onNavigate();
        router.push(href);
      }}
    >
      {children}
    </button>
  );
}
