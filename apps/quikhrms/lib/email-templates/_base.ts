/**
 * Shared email design system (MoreYeahs HRMS).
 *
 * Email HTML is intentionally table-based with inline styles — flexbox/grid and
 * <style> blocks are unreliable across Outlook/Gmail. Every template composes
 * its body from the helpers here and wraps it in `emailShell()` so the branded
 * header, "Need Help?" card and footer stay consistent. Everything is data-in →
 * HTML-out (dynamic); no hardcoded record values live in this file.
 */

/* ── Brand tokens ─────────────────────────────────────────────────────── */
export const BRAND = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  green: "#16a34a",
  greenDark: "#15803d",
  amber: "#d97706",
  red: "#dc2626",
  ink: "#1f2937",
  soft: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  hairline: "#f1f5f9",
  bg: "#f4f6fb",
  card: "#ffffff",
  /** Legal footer line — override per tenant if you later store it. */
  legalName: "MoreYeahs IT Technologies Pvt. Ltd.",
  address: "4th Floor, B Zone, Business Spaces, Nipania Main Rd, Dewas Naka, Indore, Madhya Pradesh",
};

export type Accent = "blue" | "green" | "amber" | "red" | "violet";
const ACCENTS: Record<Accent, { base: string; dark: string; wash: string }> = {
  blue:   { base: "#2563eb", dark: "#1d4ed8", wash: "#eff4ff" },
  green:  { base: "#16a34a", dark: "#15803d", wash: "#ecfdf3" },
  amber:  { base: "#d97706", dark: "#b45309", wash: "#fffbeb" },
  red:    { base: "#dc2626", dark: "#b91c1c", wash: "#fef2f2" },
  violet: { base: "#7c3aed", dark: "#6d28d9", wash: "#f5f3ff" },
};
const A = (a: Accent) => ACCENTS[a];

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Outer shell: branded header + body + Need-Help + footer ──────────── */
export interface ShellInput {
  accent?: Accent;
  companyName: string;
  /** Small preheader text (inbox preview). */
  preheader?: string;
  /** The composed body HTML (hero + sections + CTAs). */
  body: string;
  /** "Need Help?" contact block. */
  helpName?: string | null;
  helpPhone?: string | null;
  helpEmail?: string | null;
  companyAddress?: string | null;
}

export function emailShell({
  accent = "blue", companyName, preheader, body,
  helpName, helpPhone, helpEmail, companyAddress,
}: ShellInput): string {
  const c = A(accent);
  const initial = esc((companyName || "M").trim().charAt(0).toUpperCase());
  const help = needHelp({ name: helpName, phone: helpPhone, email: helpEmail });
  const addr = esc(companyAddress || BRAND.address);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${BRAND.card};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px -20px rgba(16,24,40,.35);">
        <!-- Header -->
        <tr><td style="padding:18px 28px;border-bottom:1px solid ${BRAND.border};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="left" style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle;"><div style="width:26px;height:26px;border-radius:50%;background:${c.base};color:#fff;font-weight:800;font-size:14px;text-align:center;line-height:26px;">${initial}</div></td>
                <td style="vertical-align:middle;padding-left:9px;font-size:15px;font-weight:800;color:${BRAND.ink};letter-spacing:-.01em;">${esc(companyName)}</td>
              </tr></table>
            </td>
            <td align="right" style="vertical-align:middle;font-size:11px;font-weight:700;color:${BRAND.soft};letter-spacing:.03em;">HR Team</td>
          </tr></table>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:26px 28px 8px;">${body}</td></tr>
        <!-- Need help -->
        ${help ? `<tr><td style="padding:4px 28px 22px;">${help}</td></tr>` : ""}
        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#fafbfc;border-top:1px solid ${BRAND.border};">
          <div style="font-size:11px;font-weight:700;color:${BRAND.ink};">${esc(companyName)}</div>
          <div style="font-size:11px;color:${BRAND.faint};margin-top:2px;line-height:1.5;">${addr}</div>
          <div style="font-size:10.5px;color:${BRAND.faint};margin-top:8px;">Automated message · please do not share your credentials.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── Hero: colored title + optional subtitle + optional emoji glyph ───── */
export function hero({ title, subtitle, accent = "blue", emoji }: {
  title: string; subtitle?: string; accent?: Accent; emoji?: string;
}): string {
  const c = A(accent);
  return `<div style="margin:0 0 18px;">
    <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:800;color:${c.base};letter-spacing:-.02em;">${emoji ? `${emoji} ` : ""}${esc(title)}</h1>
    ${subtitle ? `<p style="margin:8px 0 0;font-size:14px;color:${BRAND.soft};line-height:1.5;">${subtitle}</p>` : ""}
  </div>`;
}

/* ── Detail block: optional heading + label/value rows ────────────────── */
export function detailBlock(rows: Array<[string, string]>, opts: { heading?: string; accent?: Accent } = {}): string {
  const c = A(opts.accent ?? "blue");
  const head = opts.heading
    ? `<div style="font-size:12px;font-weight:800;color:${c.base};text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px;">${esc(opts.heading)}</div>`
    : "";
  const body = rows.map(([k, v], i) => `
    <tr>
      <td style="padding:9px 0;font-size:13px;color:${BRAND.soft};${i ? `border-top:1px solid ${BRAND.hairline};` : ""}white-space:nowrap;vertical-align:top;">${esc(k)}</td>
      <td style="padding:9px 0 9px 16px;font-size:13px;font-weight:600;color:${BRAND.ink};text-align:right;${i ? `border-top:1px solid ${BRAND.hairline};` : ""}vertical-align:top;">${v}</td>
    </tr>`).join("");
  return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid ${BRAND.border};border-radius:12px;padding:2px 16px;margin:0 0 18px;">${body}</table>`;
}

/* ── Buttons ──────────────────────────────────────────────────────────── */
export function btnPrimary(label: string, url: string, accent: Accent = "blue"): string {
  const c = A(accent);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td align="center" bgcolor="${c.base}" style="border-radius:10px;">
    <a href="${url}" style="display:block;padding:13px 24px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr></table>`;
}
export function btnSecondary(label: string, url: string, accent: Accent = "blue"): string {
  const c = A(accent);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td align="center" style="border:1.5px solid ${c.base};border-radius:10px;">
    <a href="${url}" style="display:block;padding:12px 24px;font-size:14px;font-weight:700;color:${c.base};text-decoration:none;border-radius:10px;">${esc(label)}</a>
  </td></tr></table>`;
}
/* ── Alerts ───────────────────────────────────────────────────────────── */
export function alert(kind: "success" | "info" | "warning" | "danger", html: string, title?: string): string {
  const map = {
    success: { bg: "#ecfdf3", bd: "#abefc6", fg: "#15803d", icon: "✅" },
    info:    { bg: "#eff6ff", bd: "#bfdbfe", fg: "#1d4ed8", icon: "ℹ️" },
    warning: { bg: "#fffbeb", bd: "#fde68a", fg: "#b45309", icon: "⚠️" },
    danger:  { bg: "#fef2f2", bd: "#fecaca", fg: "#b91c1c", icon: "⚠️" },
  }[kind];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${map.bg};border:1px solid ${map.bd};border-radius:10px;margin:0 0 18px;"><tr>
    <td style="padding:12px 14px;font-size:13px;color:${BRAND.ink};line-height:1.5;">
      ${title ? `<div style="font-weight:700;color:${map.fg};margin-bottom:2px;">${map.icon} ${esc(title)}</div>` : `${map.icon} `}${html}
    </td></tr></table>`;
}

/* ── Checklist (required docs / documents to submit) ──────────────────── */
export function checklist(items: Array<{ text: string; sub?: string }>, opts: { heading?: string; accent?: Accent } = {}): string {
  const c = A(opts.accent ?? "blue");
  const head = opts.heading
    ? `<div style="font-size:12px;font-weight:800;color:${c.base};text-transform:uppercase;letter-spacing:.05em;margin:0 0 6px;">${esc(opts.heading)}</div>`
    : "";
  const rows = items.map((it) => `
    <tr><td style="padding:7px 0;vertical-align:top;width:22px;font-size:14px;color:${BRAND.green};">✓</td>
    <td style="padding:7px 0;font-size:13px;color:${BRAND.ink};">${esc(it.text)}${it.sub ? `<div style="font-size:11.5px;color:${BRAND.faint};margin-top:1px;">${esc(it.sub)}</div>` : ""}</td></tr>`).join("");
  return `${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid ${BRAND.border};border-radius:12px;padding:4px 16px;margin:0 0 18px;">${rows}</table>`;
}

/* ── Timeline: numbered horizontal steps ("What's Next?" / dates) ─────── */
export function timeline(steps: Array<{ label: string; sub?: string; done?: boolean }>, accent: Accent = "blue"): string {
  const c = A(accent);
  const cells = steps.map((s, i) => {
    const on = s.done !== false;
    return `<td align="center" valign="top" style="width:${Math.floor(100 / steps.length)}%;padding:0 2px;">
      <div style="width:24px;height:24px;line-height:24px;border-radius:50%;margin:0 auto;font-size:12px;font-weight:800;color:${on ? "#fff" : BRAND.soft};background:${on ? c.base : "#e5e7eb"};">${i + 1}</div>
      <div style="font-size:11px;font-weight:700;color:${BRAND.ink};margin-top:6px;line-height:1.3;">${esc(s.label)}</div>
      ${s.sub ? `<div style="font-size:10px;color:${BRAND.faint};margin-top:2px;">${esc(s.sub)}</div>` : ""}
    </td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 18px;"><tr>${cells}</tr></table>`;
}

/* ── Paragraph + Need-Help card ───────────────────────────────────────── */
export function para(html: string): string {
  return `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${BRAND.ink};">${html}</p>`;
}

function needHelp({ name, phone, email }: { name?: string | null; phone?: string | null; email?: string | null }): string {
  const bits: string[] = [];
  if (name) bits.push(esc(name));
  if (phone) bits.push(esc(phone));
  const contact = bits.join(" · ");
  const mailLine = email ? ` or email <a href="mailto:${esc(email)}" style="color:${BRAND.primary};text-decoration:none;">${esc(email)}</a>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;"><tr>
    <td style="padding:12px 14px;font-size:12.5px;color:${BRAND.soft};line-height:1.5;">
      <span style="font-weight:700;color:${BRAND.ink};">Need help?</span> Reply to this email${contact ? ` or contact ${contact}` : ""}${mailLine}.
    </td></tr></table>`;
}
