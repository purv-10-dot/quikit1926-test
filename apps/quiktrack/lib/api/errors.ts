export function toErrorMessage(error: unknown, fallback = "Operation failed"): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

