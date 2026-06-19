/**
 * Imperative toast — a drop-in replacement for `alert()`. Call `showToast(msg)`
 * from anywhere; a single `<ToastHost/>` (mounted in the dashboard layout)
 * listens for the event and renders the toast. No context/prop threading.
 *
 *   showToast("Saved");
 *   showToast("Delete failed", "error");
 */
export type ToastKind = "success" | "error" | "info";

export interface ToastDetail {
  message: string;
  kind: ToastKind;
}

export const QT_TOAST_EVENT = "qt:toast";

export function showToast(message: string, kind: ToastKind = "info"): void {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(
    new CustomEvent<ToastDetail>(QT_TOAST_EVENT, { detail: { message, kind } }),
  );
}
