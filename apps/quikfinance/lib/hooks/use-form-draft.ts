"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Persists in-progress form state to localStorage so it survives a navigation
 * round-trip — e.g. clicking a Combobox "+ New" to add a customer/item and
 * coming back. Restores once on mount; writes synchronously thereafter (no
 * debounce, so a quick "+ New" click can't race it); clears via clearDraft()
 * after a successful save or cancel.
 *
 * Scope to create mode only (pass enabled: !isEdit). Edit forms hydrate from
 * the server, which would race with — and overwrite — a restored draft.
 *
 * Autosave is gated on the first genuine user interaction (key press or
 * pointer down). Until then the baseline tracks the live snapshot, so async
 * defaults the form fills in on its own (e.g. an auto-selected A/R account)
 * are absorbed and never mistaken for edits — an untouched form leaves no
 * draft behind, and revisiting a fresh form won't resurrect stale defaults.
 */
export function useFormDraft<T>(
  key: string,
  snapshot: T,
  restore: (draft: T) => void,
  options?: { enabled?: boolean }
): { clearDraft: () => void } {
  const enabled = options?.enabled ?? true;
  const hydrated = useRef(false);
  const interacted = useRef(false);
  const baseline = useRef<string | null>(null);
  // Set once clearDraft() runs; stops the autosave effect from rewriting the
  // draft on the re-renders that follow a save (e.g. setSubmitting(false)).
  const cleared = useRef(false);
  // Latest restore callback, without retriggering the mount effect.
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once on mount; flag the first real interaction.
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!hydrated.current) {
      hydrated.current = true;
      const raw = window.localStorage.getItem(key);
      if (raw) {
        try {
          restoreRef.current(JSON.parse(raw) as T);
          toast.message("Draft restored");
        } catch {
          window.localStorage.removeItem(key);
        }
      }
    }
    const onInteract = () => { interacted.current = true; };
    window.addEventListener("keydown", onInteract, { capture: true });
    window.addEventListener("pointerdown", onInteract, { capture: true });
    return () => {
      window.removeEventListener("keydown", onInteract, { capture: true });
      window.removeEventListener("pointerdown", onInteract, { capture: true });
    };
  }, [key, enabled]);

  // Autosave on change. Before the first interaction, keep re-baselining so
  // programmatic defaults are folded into the baseline rather than persisted.
  useEffect(() => {
    if (!enabled || !hydrated.current || cleared.current || typeof window === "undefined") return;
    const current = JSON.stringify(snapshot);
    if (!interacted.current || baseline.current === null) {
      baseline.current = current;
      return;
    }
    if (current === baseline.current) return;
    try {
      window.localStorage.setItem(key, current);
    } catch {
      /* quota / serialization errors are non-fatal */
    }
  }, [key, enabled, snapshot]);

  const clearDraft = () => {
    cleared.current = true;
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  };

  return { clearDraft };
}
