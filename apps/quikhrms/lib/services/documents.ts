// (fillTemplate + extractPlaceholders removed with the Document Templates feature — 2026-06-04.)

export function daysUntilExpiry(expiryDate: Date | string | null): number | null {
  if (!expiryDate) return null;
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
