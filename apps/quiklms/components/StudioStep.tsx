'use client';

/**
 * One collapsible step in the Course Studio editor.
 *
 * The sub-module editor used to be a single tall card holding the title, the
 * resource manager, the quiz and the advanced settings all at once, which meant
 * scrolling past three things to reach the fourth. Splitting it into small
 * steps keeps one job on screen at a time and lets an author jump straight to
 * the part they came for — no Next/Back, nothing hidden behind navigation.
 *
 * `collapsible={false}` renders the children with NO wrapper at all. That is
 * how the super-admin master-course builder keeps its existing single-card
 * layout byte-for-byte while the tenant route gets the stepped one, without
 * duplicating the whole editor for each variant.
 */

import { ChevronDown } from 'lucide-react';

interface Props {
  /** 1-based position, shown in the leading marker. */
  index: number;
  title: string;
  /** Right-aligned state, e.g. "3 resources" or "Not set". Collapsed only. */
  summary?: string;
  /** Marks a step the author can skip entirely. */
  optional?: boolean;
  /** Ticks the marker — the step already has content. */
  complete?: boolean;
  open: boolean;
  onToggle: () => void;
  /** false → passthrough, no chrome (super-admin builder). */
  collapsible?: boolean;
  children: React.ReactNode;
}

const StudioStep = ({
  index,
  title,
  summary,
  optional = false,
  complete = false,
  open,
  onToggle,
  collapsible = true,
  children,
}: Props) => {
  if (!collapsible) return <>{children}</>;

  return (
    <div className="rounded-lg border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted transition-colors"
      >
        <span
          aria-hidden="true"
          className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${
            complete
              ? 'bg-brand-primary text-white'
              : 'border border-line-strong text-fg-muted'
          }`}
        >
          {complete ? '✓' : index}
        </span>

        <span className="text-sm font-medium text-fg">{title}</span>
        {optional && <span className="text-xs text-fg-subtle">optional</span>}

        {/* Shown open or closed. Closed, it says what is inside so the author
            can find where they left off without opening each step; open, it is
            a live count of what they are building. */}
        {summary && (
          <span className="ml-auto text-xs text-fg-muted truncate max-w-[45%]">{summary}</span>
        )}

        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 shrink-0 text-fg-muted transition-transform ${open ? 'rotate-180' : ''} ${summary ? 'ml-2' : 'ml-auto'}`}
        />
      </button>

      {open && <div className="px-4 pb-4 pt-1 border-t border-line">{children}</div>}
    </div>
  );
};

export default StudioStep;
