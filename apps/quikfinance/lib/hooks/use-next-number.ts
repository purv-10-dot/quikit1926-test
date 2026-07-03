"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

export type NextNumber = { auto_generate_number: boolean; prefix: string; number: string | null };

/**
 * Fetches the next document number for a module so a create form can prefill it
 * (Zoho-style). Returns the preview plus helpers:
 *   - prefill(setter): set the field to the preview if it's still empty
 *   - numberToSubmit(value): what to send on save — undefined when the value is
 *     unchanged from the preview (so the server stays the authoritative source
 *     and a stale preview can't collide), otherwise the user's override.
 *
 * `type` matches the document keys in /api/v1/documents/next-number.
 * Pass enabled = !isEdit (edit forms keep their saved number).
 */
export function useNextNumber(type: string, enabled: boolean) {
  const previewRef = useRef<string>("");
  const { data } = useQuery({
    queryKey: ["next-number", type],
    enabled,
    staleTime: 0,
    queryFn: async (): Promise<NextNumber | null> => {
      const r = await fetch(`/api/v1/documents/next-number?type=${type}`);
      return r.ok ? ((await r.json()).data as NextNumber) : null;
    }
  });
  useEffect(() => {
    // Capture the FIRST preview only. The form auto-fills the field with this same
    // value once; if the preview later advances on refetch (e.g. another document
    // was created) we must NOT move previewRef, otherwise the untouched field would
    // no longer equal previewRef and numberToSubmit() would mistake it for a manual
    // override — submitting a stale, now-taken number and hitting a unique-key
    // collision. Freezing it keeps an untouched field deferring to the server.
    if (data?.auto_generate_number && data.number && !previewRef.current) previewRef.current = data.number;
  }, [data]);

  return {
    data: data ?? null,
    autoGenerate: data?.auto_generate_number ?? true,
    preview: data?.auto_generate_number ? data.number : null,
    /** Prefill the field with the preview if the field is currently empty. */
    prefill(setValue: (updater: (current: string) => string) => void) {
      if (data?.auto_generate_number && data.number) setValue((cur) => cur || data.number || "");
    },
    /** Value to submit: undefined when unchanged from the preview (let server generate). */
    numberToSubmit(value: string): string | undefined {
      const v = value.trim();
      if (!v) return undefined;
      return v === previewRef.current ? undefined : v;
    }
  };
}
