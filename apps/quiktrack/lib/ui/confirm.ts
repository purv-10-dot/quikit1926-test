/**
 * Imperative confirm dialog — a Promise-based replacement for `window.confirm`.
 * Resolves `true` on confirm, `false` on cancel/dismiss. A single
 * `<ConfirmHost/>` (mounted in the dashboard layout) renders the modal.
 *
 *   if (!(await confirmDialog({ message: "Delete this?" }))) return;
 */
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as a destructive (red) action. */
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export const QT_CONFIRM_EVENT = "qt:confirm";

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(
      new CustomEvent<ConfirmRequest>(QT_CONFIRM_EVENT, {
        detail: { ...opts, resolve },
      }),
    );
  });
}
