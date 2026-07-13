"use client";

import { whatsappUrl } from "@/lib/whatsapp";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export interface WhatsAppLinkProps {
  phone: string;
  message?: string;
  className?: string;
  title?: string;
  /**
   * When true, still render the WhatsApp icon (greyed out, non-clickable)
   * if the phone can't be normalized — instead of rendering nothing. Use
   * where the icon should always be visible as an affordance regardless of
   * whether the record has a usable mobile number.
   */
  showDisabled?: boolean;
}

/**
 * Opens WhatsApp chat for the given phone (vendor master mobile, etc.).
 * Renders nothing when the number cannot be normalized to wa.me format,
 * unless `showDisabled` is set — then it renders a disabled icon.
 */
export function WhatsAppLink({ phone, message, className = "", title, showDisabled = false }: WhatsAppLinkProps) {
  const href = whatsappUrl(phone, message);
  if (!href) {
    if (!showDisabled) return null;
    return (
      <span
        title="No mobile number on this vendor"
        aria-label="No mobile number — WhatsApp unavailable"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 cursor-not-allowed"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
      </span>
    );
  }

  const label = title ?? "Chat on WhatsApp";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className={
        className ||
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm ring-1 ring-emerald-600/20 hover:bg-[#20bd5a] hover:shadow-md transition-all"
      }
    >
      <WhatsAppIcon className="h-3.5 w-3.5" />
    </a>
  );
}
