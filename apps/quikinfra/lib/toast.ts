/**
 * App-wide toast notifications.
 *
 * The Toaster component subscribes to this module's emitter and renders
 * notifications. Use `toast.success(msg)`, `toast.error(msg)`, etc.
 * anywhere in client code. The QueryClient also wires its `MutationCache`
 * to this module so every create/update/delete fires a toast by default.
 */

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastInput = {
  variant?: ToastVariant;
  title?: string;
  message: string;
  duration?: number;
};

export type ToastRecord = ToastInput & {
  id: string;
  variant: ToastVariant;
  duration: number;
};

type Listener = (toasts: ToastRecord[]) => void;

const DEFAULT_DURATION = 5000;

const listeners = new Set<Listener>();
let toasts: ToastRecord[] = [];

function emit() {
  listeners.forEach((l) => l(toasts));
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts() {
  toasts = [];
  emit();
}

function push(input: ToastInput): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: ToastRecord = {
    id,
    variant: input.variant ?? "info",
    title: input.title,
    message: input.message,
    duration: input.duration ?? DEFAULT_DURATION,
  };
  toasts = [...toasts, record];
  emit();
  return id;
}

export const toast = {
  success(message: string, opts?: Omit<ToastInput, "message" | "variant">) {
    return push({ ...opts, message, variant: "success" });
  },
  error(message: string, opts?: Omit<ToastInput, "message" | "variant">) {
    return push({ ...opts, message, variant: "error" });
  },
  info(message: string, opts?: Omit<ToastInput, "message" | "variant">) {
    return push({ ...opts, message, variant: "info" });
  },
  warning(message: string, opts?: Omit<ToastInput, "message" | "variant">) {
    return push({ ...opts, message, variant: "warning" });
  },
  show(input: ToastInput) {
    return push(input);
  },
  dismiss: dismissToast,
  clear: clearToasts,
};

/**
 * Optional metadata you can attach to a `useMutation` so the global
 * MutationCache handler renders a meaningful toast.
 *
 *   useMutation({
 *     mutationFn: ...,
 *     meta: { successMessage: "Vendor created", errorMessage: "Failed to create vendor" },
 *   })
 *
 * `silent: true` suppresses the auto-toast entirely (use for background
 * polling or when the caller renders its own UI feedback).
 */
export type MutationToastMeta = {
  successMessage?: string;
  errorMessage?: string;
  silent?: boolean;
};

export function resolveSuccessMessage(meta: unknown): string {
  const m = meta as MutationToastMeta | undefined;
  return m?.successMessage ?? "Saved successfully";
}

export function resolveErrorMessage(meta: unknown, error: unknown): string {
  const m = meta as MutationToastMeta | undefined;
  if (m?.errorMessage) return m.errorMessage;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Action failed";
}

export function isSilentMutation(meta: unknown): boolean {
  return Boolean((meta as MutationToastMeta | undefined)?.silent);
}

/**
 * Convenience factory for entity CRUD mutations. Usage:
 *
 *   useMutation({ mutationFn: ..., meta: entityMeta("create", "Vendor") });
 *
 * Produces "Vendor created" / "Failed to create vendor".
 */
export function entityMeta(
  action: "create" | "update" | "delete" | "submit",
  entity: string,
): MutationToastMeta {
  const verbMap: Record<typeof action, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
    submit: "submitted",
  };
  return {
    successMessage: `${entity} ${verbMap[action]}`,
    errorMessage: `Failed to ${action} ${entity.toLowerCase()}`,
  };
}
