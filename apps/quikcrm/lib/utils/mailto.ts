export type MailtoOptions = {
  to: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
};

/** Build a RFC-style mailto URL (query params encoded via URLSearchParams). */
export function buildMailtoUrl(opts: MailtoOptions): string {
  const to = opts.to.trim();
  if (!to) {
    throw new Error("Recipient email is required");
  }
  const params = new URLSearchParams();
  if (opts.subject?.trim()) params.set("subject", opts.subject.trim());
  if (opts.body?.trim()) params.set("body", opts.body.trim());
  if (opts.cc?.trim()) params.set("cc", opts.cc.trim());
  if (opts.bcc?.trim()) params.set("bcc", opts.bcc.trim());
  const qs = params.toString();
  return qs ? `mailto:${to}?${qs}` : `mailto:${to}`;
}

/**
 * Open the user's default mail client. Uses a transient <a> click — reliable in
 * SPAs (unlike window.open, which returns null for mailto and breaks detection).
 */
export function openMailtoCompose(opts: MailtoOptions): void {
  const url = buildMailtoUrl(opts);
  if (typeof document === "undefined") return;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** Opens Gmail compose in a new tab (works when no desktop mail client is configured). */
export function buildGmailComposeUrl(opts: MailtoOptions): string {
  const to = opts.to.trim();
  if (!to) throw new Error("Recipient email is required");
  const params = new URLSearchParams({ view: "cm", fs: "1", to });
  if (opts.subject?.trim()) params.set("su", opts.subject.trim());
  if (opts.body?.trim()) params.set("body", opts.body.trim());
  return `https://mail.google.com/mail/?${params.toString()}`;
}
