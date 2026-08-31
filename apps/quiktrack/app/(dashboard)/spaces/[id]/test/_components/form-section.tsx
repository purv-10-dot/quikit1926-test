"use client";

import type { ReactNode } from "react";

/**
 * A labelled group of form fields.
 *
 * The case editor has ~14 inputs. As one flat column they read as an
 * undifferentiated list, which is what made the form feel heavy — you had to read
 * every label to find the one you wanted. Grouping under a quiet heading gives the
 * eye somewhere to land without adding boxes or borders that would compete with
 * the fields themselves.
 */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2 border-b border-gray-100 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </h3>
        {hint && (
          <p className="min-w-0 flex-1 truncate text-[11px] text-gray-400" title={hint}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}
