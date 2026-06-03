import type { CSSProperties } from "react";
import { toast } from "sonner";
import { humanizeApiError, type HumanizeOptions } from "./humanizeError";

/**
 * Unified toast API for QuikScale.
 *
 * Every module imports `notify` from here instead of calling `sonner`'s `toast`
 * directly. This gives us:
 *   - One place to tune look & behavior (the `<Toaster>` lives in the dashboard layout).
 *   - Consistent, friendly error wording — `notify.error` routes everything through
 *     `humanizeApiError`, so callers never hand-format error strings.
 *   - Optional per-team/per-action tint (e.g. `Team.color`) via a left accent bar.
 *
 * Colors stay semantic: success = green, error = red, warning = amber (driven by the
 * Toaster's `richColors`). Only neutral default/info/loading toasts and the optional
 * `tint` are branded with the company accent — see `globals.css` (`.qs-toast*`).
 */

export interface NotifyOptions {
  /** Secondary line shown under the main message. */
  description?: string;
  /** Hex color (e.g. a team's `color`) — tints the toast's left accent bar. */
  tint?: string | null;
  /** Override the auto-dismiss duration (ms). */
  duration?: number;
}

type ToastId = string | number;

/** Build the inline style + className that drive the optional tint bar. */
function tintProps(tint?: string | null): { style?: CSSProperties; className?: string } {
  if (!tint) return {};
  return {
    style: { "--toast-tint": tint } as CSSProperties,
    className: "qs-toast-tinted",
  };
}

export const notify = {
  /** Green success toast. */
  success(message: string, opts: NotifyOptions = {}): ToastId {
    return toast.success(message, {
      description: opts.description,
      duration: opts.duration,
      ...tintProps(opts.tint),
    });
  },

  /**
   * Red error toast with a user-friendly message.
   *
   * Pass the raw thrown value / Response / Error — it's humanized automatically.
   * `context` (a short noun like "KPI") sharpens the wording.
   */
  error(err: unknown, opts: NotifyOptions & HumanizeOptions = {}): ToastId {
    const { description, tint, duration, ...humanizeOpts } = opts;
    return toast.error(humanizeApiError(err, humanizeOpts), {
      description,
      duration,
      ...tintProps(tint),
    });
  },

  /** Amber warning toast. */
  warning(message: string, opts: NotifyOptions = {}): ToastId {
    return toast.warning(message, {
      description: opts.description,
      duration: opts.duration,
      ...tintProps(opts.tint),
    });
  },

  /** Neutral informational toast (accent-themed chrome). */
  info(message: string, opts: NotifyOptions = {}): ToastId {
    return toast.info(message, {
      description: opts.description,
      duration: opts.duration,
      ...tintProps(opts.tint),
    });
  },

  /** Persistent loading toast — dismiss/replace it via the returned id. */
  loading(message: string, opts: Pick<NotifyOptions, "description"> = {}): ToastId {
    return toast.loading(message, { description: opts.description });
  },

  /** Dismiss a specific toast (by id) or all toasts. */
  dismiss(id?: ToastId): void {
    toast.dismiss(id);
  },

  /**
   * Drive an async action: shows a loading toast, then resolves to success or a
   * humanized error toast. `success` may be a string or a fn of the resolved value.
   */
  promise<T>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string | ((value: T) => string);
      /** Short noun for humanizing the failure (e.g. "KPI"). */
      errorContext?: string;
    },
  ): Promise<T> {
    toast.promise(promise, {
      loading: msgs.loading,
      success: msgs.success,
      error: (err) => humanizeApiError(err, { context: msgs.errorContext }),
    });
    return promise;
  },

  /** Shorthand for the common "<Entity> created/updated/deleted/restored" success line. */
  saved(
    entity: string,
    verb: "created" | "updated" | "deleted" | "restored" | "saved" = "saved",
    opts: NotifyOptions = {},
  ): ToastId {
    return notify.success(`${entity} ${verb}`, opts);
  },
};

export type Notify = typeof notify;
