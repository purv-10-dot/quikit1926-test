import { toast } from "sonner";

/**
 * Thin, unified toast API for QuikFlow — mirrors apps/quikscale's `notify`
 * helper (lib/utils/notify.ts) but scaled down to what this app needs so far.
 * Modules should import `notify` from here instead of calling sonner's
 * `toast` directly, so look/behavior stays in one place as this grows.
 */
export const notify = {
  success(message: string): void {
    toast.success(message);
  },
  /** Pass the raw thrown value/Error — falls back to a generic message. */
  error(err: unknown, fallback = "Something went wrong"): void {
    toast.error(err instanceof Error ? err.message : fallback);
  },
};
