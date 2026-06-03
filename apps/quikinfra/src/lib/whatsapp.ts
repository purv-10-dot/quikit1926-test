/**
 * Build click-to-chat WhatsApp URLs (free — no Business API).
 * Normalizes Indian 10-digit mobiles to country code 91.
 */

export function normalizePhoneForWhatsApp(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) return digits;
  if (digits.length === 11 && digits.startsWith("0")) {
    const ten = digits.slice(1);
    if (/^[6-9]\d{9}$/.test(ten)) return `91${ten}`;
  }
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** PO row vendor phone: API field first, then masters lookup by vendorId. */
export function resolveVendorPhone(
  row: { vendorPhone?: string | null; vendorId?: string | null },
  vendorById?: Map<string, { phone?: string | null; mobile?: string | null }>,
): string {
  const direct = String(row.vendorPhone ?? "").trim();
  if (direct) return direct;
  if (!row.vendorId || !vendorById) return "";
  const v = vendorById.get(row.vendorId);
  if (!v) return "";
  return String(v.phone ?? v.mobile ?? "").trim();
}

export function whatsappUrl(phone: string, message?: string): string | null {
  const e164 = normalizePhoneForWhatsApp(phone);
  if (!e164) return null;
  const base = `https://wa.me/${e164}`;
  const text = message?.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}
