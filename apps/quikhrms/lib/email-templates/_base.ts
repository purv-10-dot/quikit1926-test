export interface BaseLayoutInput {
  title: string;
  subtitle?: string;
  greeting: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  companyName: string;
  accent?: string;
}

export function baseLayout({
  title, subtitle, greeting, body, ctaLabel, ctaUrl, companyName, accent = "#3b82f6",
}: BaseLayoutInput): string {
  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:24px 0;">
         <a href="${ctaUrl}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">${ctaLabel}</a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f5f7fa;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="background:linear-gradient(135deg,${accent},${darken(accent)});padding:24px;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;font-weight:700;">${title}</h1>
        ${subtitle ? `<p style="margin:4px 0 0;font-size:13px;opacity:0.9;">${subtitle}</p>` : ""}
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:14px;">${greeting}</p>
        ${body}
        ${cta}
        <p style="margin:20px 0 0;font-size:14px;">
          Best regards,<br/>
          <strong>${companyName} HR Team</strong>
        </p>
      </div>
      <div style="background:#f9fafb;padding:16px 24px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
        Automated mail from ${companyName} HRMS.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function darken(hex: string): string {
  const map: Record<string, string> = {
    "#3b82f6": "#2563eb",
    "#10b981": "#059669",
    "#f59e0b": "#d97706",
    "#ef4444": "#dc2626",
  };
  return map[hex] ?? hex;
}

export function infoTable(rows: Array<[string, string]>): string {
  return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:4px 16px;margin:16px 0;">
    ${rows.map(([k, v], i) => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;${i > 0 ? "border-top:1px solid #f3f4f6;" : ""}">
        <span style="color:#6b7280;">${k}</span>
        <span style="font-weight:600;text-align:right;">${v}</span>
      </div>
    `).join("")}
  </div>`;
}
