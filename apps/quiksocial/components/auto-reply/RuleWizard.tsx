"use client";

import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { useSocialAccounts } from "@/lib/auto-reply/use-social-accounts";
import { unwrap } from "@/lib/utils/api-fetch";
import type {
  RuleRow,
  TriggerType,
  ReplyMode,
  KeywordMatch,
} from "@/lib/auto-reply/client-types";

import { WizardStepAccount } from "./WizardStepAccount";
import { WizardStepTrigger } from "./WizardStepTrigger";
import { WizardStepResponse } from "./WizardStepResponse";
import { WizardStepReview } from "./WizardStepReview";
import { ErrorBanner } from "./primitives/ErrorBanner";

type WizardForm = {
  socialAccountId: string;
  name: string;
  triggerType: TriggerType;
  keywords: string[];
  keywordMatch: KeywordMatch;
  caseSensitive: boolean;
  replyMode: ReplyMode;
  templateBody: string;
  toneGuidance: string;
  cooldownMinutes: number;
  maxRepliesPerDay: number;
};

function initialForm(editing: RuleRow | null): WizardForm {
  if (editing) {
    return {
      socialAccountId: editing.socialAccountId,
      name: editing.name,
      triggerType: editing.triggerType,
      keywords: editing.keywords ?? [],
      keywordMatch: editing.keywordMatch,
      caseSensitive: editing.caseSensitive,
      replyMode: editing.replyMode,
      templateBody: editing.templateBody ?? "",
      toneGuidance: editing.toneGuidance ?? "",
      cooldownMinutes: editing.cooldownMinutes,
      maxRepliesPerDay: editing.maxRepliesPerDay,
    };
  }
  return {
    socialAccountId: "",
    name: "",
    triggerType: "KEYWORD_MATCH",
    keywords: [],
    keywordMatch: "ANY",
    caseSensitive: false,
    replyMode: "TEMPLATE",
    templateBody: "",
    toneGuidance: "",
    cooldownMinutes: 60,
    maxRepliesPerDay: 50,
  };
}

const STEPS = ["Account", "Trigger", "Response", "Review"] as const;

export function RuleWizard({
  brandId,
  editing,
  onCancel,
  onSuccess,
}: {
  brandId: string;
  editing: RuleRow | null;
  onCancel: () => void;
  onSuccess: (savedRule: RuleRow, isEdit: boolean) => void;
}) {
  const isEdit = editing !== null;
  const accountsHook = useSocialAccounts(brandId);
  const accounts = accountsHook.data ?? [];

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [form, setForm] = useState<WizardForm>(() => initialForm(editing));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedAccount =
    accounts.find((a) => a.id === form.socialAccountId) ?? null;

  const stepValid: boolean[] = [
    accounts.length > 0 &&
      form.socialAccountId !== "" &&
      form.name.trim() !== "",
    form.triggerType === "ANY_COMMENT" || form.keywords.length > 0,
    form.replyMode === "TEMPLATE"
      ? form.templateBody.trim() !== ""
      : form.toneGuidance.trim() !== "",
    true,
  ];

  const handleNext = async () => {
    if (step < 3) {
      setStep((s) => (s + 1) as 0 | 1 | 2 | 3);
      return;
    }
    await handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const body = {
        brandId,
        socialAccountId: form.socialAccountId,
        name: form.name.trim(),
        triggerType: form.triggerType,
        replyMode: form.replyMode,
        isActive: true,
        priority: editing?.priority ?? 0,
        templateBody:
          form.replyMode === "TEMPLATE" ? form.templateBody.trim() : null,
        keywords:
          form.triggerType === "KEYWORD_MATCH" ? form.keywords : [],
        keywordMatch: form.keywordMatch,
        caseSensitive: form.caseSensitive,
        toneGuidance:
          form.replyMode === "AI" ? form.toneGuidance.trim() : null,
        cooldownMinutes: form.cooldownMinutes,
        maxRepliesPerDay: form.maxRepliesPerDay,
      };

      const url = isEdit
        ? `/api/auto-reply/rules/${editing!.id}`
        : `/api/auto-reply/rules`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const data = unwrap<{ rule: RuleRow }>(await res.json());
      onSuccess(data.rule, isEdit);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setSubmitError(`Couldn't save the rule: ${msg}`);
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onCancel();
    } else {
      setStep((s) => (s - 1) as 0 | 1 | 2 | 3);
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel and return to rules"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 10,
              cursor: "pointer",
              color: "rgba(255, 255, 255, 0.85)",
              padding: 6,
              display: "inline-flex",
            }}
          >
            <ArrowLeft size={18} />
          </button>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 600,
              margin: 0,
              color: "#FFFFFF",
            }}
          >
            {isEdit ? "Edit rule" : "Create rule"}
          </h3>
        </div>
        <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.65)" }}>
          Step {step + 1} of {STEPS.length}
        </span>
      </div>

      {/* Step progress */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
        {STEPS.map((label, i) => (
          <div
            key={label}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 4,
                borderRadius: 2,
                background:
                  i <= step ? "#FFFFFF" : "rgba(255, 255, 255, 0.12)",
                transition: "background 0.3s",
              }}
            />
            <span
              style={{
                fontSize: 11,
                color:
                  i <= step
                    ? "rgba(255, 255, 255, 0.92)"
                    : "rgba(255, 255, 255, 0.40)",
                fontWeight: i === step ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {submitError && (
        <ErrorBanner message={submitError} onRetry={handleSubmit} />
      )}

      {/* Step content — primary glass card */}
      <div
        style={{
          background: "rgba(33, 33, 33, 0.14)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          padding: 24,
          minHeight: 300,
        }}
      >
        {step === 0 && (
          <WizardStepAccount
            accounts={accounts}
            accountsLoading={accountsHook.loading}
            selectedAccountId={form.socialAccountId}
            ruleName={form.name}
            isEdit={isEdit}
            onSelectAccount={(id) => setForm({ ...form, socialAccountId: id })}
            onChangeName={(name) => setForm({ ...form, name })}
          />
        )}
        {step === 1 && (
          <WizardStepTrigger
            triggerType={form.triggerType}
            keywords={form.keywords}
            keywordMatch={form.keywordMatch}
            caseSensitive={form.caseSensitive}
            onChangeTrigger={(t) => setForm({ ...form, triggerType: t })}
            onChangeKeywords={(ks) => setForm({ ...form, keywords: ks })}
            onChangeKeywordMatch={(m) => setForm({ ...form, keywordMatch: m })}
            onChangeCaseSensitive={(v) => setForm({ ...form, caseSensitive: v })}
          />
        )}
        {step === 2 && (
          <WizardStepResponse
            replyMode={form.replyMode}
            templateBody={form.templateBody}
            toneGuidance={form.toneGuidance}
            cooldownMinutes={form.cooldownMinutes}
            maxRepliesPerDay={form.maxRepliesPerDay}
            onChangeReplyMode={(m) => setForm({ ...form, replyMode: m })}
            onChangeTemplateBody={(s) => setForm({ ...form, templateBody: s })}
            onChangeToneGuidance={(s) => setForm({ ...form, toneGuidance: s })}
            onChangeCooldown={(n) => setForm({ ...form, cooldownMinutes: n })}
            onChangeMaxPerDay={(n) => setForm({ ...form, maxRepliesPerDay: n })}
          />
        )}
        {step === 3 && (
          <WizardStepReview
            account={selectedAccount}
            triggerType={form.triggerType}
            keywords={form.keywords}
            keywordMatch={form.keywordMatch}
            caseSensitive={form.caseSensitive}
            replyMode={form.replyMode}
            templateBody={form.templateBody}
            cooldownMinutes={form.cooldownMinutes}
            maxRepliesPerDay={form.maxRepliesPerDay}
          />
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 16,
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid rgba(255, 255, 255, 0.10)",
            background: "rgba(255, 255, 255, 0.10)",
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
            color: "#FFFFFF",
          }}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!stepValid[step] || submitting}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "none",
            background: "#FFFFFF",
            color: "#0A0A0A",
            fontSize: 13,
            cursor: !stepValid[step] || submitting ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: !stepValid[step] || submitting ? 0.45 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {step === 3 ? (
            <>
              <Check size={14} />
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Activate rule"}
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}
