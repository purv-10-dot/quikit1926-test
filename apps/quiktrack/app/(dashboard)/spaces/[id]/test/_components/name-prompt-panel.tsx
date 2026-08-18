"use client";

import { useEffect, useState } from "react";
import {
  Field,
  Input,
  RightPanel,
  RightPanelCancelButton,
  RightPanelFooter,
  RightPanelSubmitButton,
  Textarea,
} from "@quikit/ui";

/**
 * Small create/rename panel for suites and folders.
 *
 * Replaces the `window.prompt` scaffolding the repository shipped with: a native
 * prompt can't show validation, can't be styled, and is blocked outright by some
 * browsers. Covers modals #2 and #3 in QUIKTEST_MODALS.md.
 */

export interface NamePromptConfig {
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  /** Show a second, optional description field (suites have one). */
  withDescription?: boolean;
  initialName?: string;
  submitLabel?: string;
}

export function NamePromptPanel({
  open,
  config,
  onClose,
  onSubmit,
}: {
  open: boolean;
  config: NamePromptConfig | null;
  onClose: () => void;
  onSubmit: (values: { name: string; description?: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(config?.initialName ?? "");
    setDescription("");
    setError(null);
  }, [open, config]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`${config?.label ?? "Name"} is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // The caller returns an error string, or null on success — so validation
      // failures from the API surface inline rather than as a silent no-op.
      const failure = await onSubmit({
        name: trimmed,
        description: description.trim() || undefined,
      });
      if (failure) {
        setError(failure);
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!config) return null;

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      title={config.title}
      subtitle={config.subtitle}
      footer={
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={submit}
            disabled={saving}
            label={saving ? "Saving…" : (config.submitLabel ?? "Create")}
          />
        </RightPanelFooter>
      }
    >
      <div className="space-y-4">
        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <Field label={config.label} required>
          <Input
            autoFocus
            value={name}
            placeholder={config.placeholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </Field>

        {config.withDescription && (
          <Field label="Description">
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        )}
      </div>
    </RightPanel>
  );
}
