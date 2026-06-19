/**
 * Term-sheet template renderer.
 *
 * Substitutes {{variable}} placeholders in a template body with values from
 * the deal record. Variables are dot-pathed:
 *   {{startup.name}}
 *   {{deal.fundingAskLakhs}}
 *   {{deal.loanType}}
 *   {{deal.tenureMonths}}
 *   {{fund.name}}
 *
 * Unknown variables become "[unknown]" — never silently drop, so authors
 * spot typos.
 */

export interface TermSheetVars {
  "startup.name": string;
  "startup.contactName": string;
  "startup.contactEmail": string;
  "deal.fundingAskLakhs": string;
  "deal.fundingAskFormatted": string;
  "deal.loanType": string;
  "deal.tenureMonths": string;
  "deal.purpose": string;
  "fund.name": string;
  "today": string;
}

export function renderTermSheet(template: string, vars: Partial<TermSheetVars>): string {
  return template.replace(/\{\{([a-zA-Z][a-zA-Z0-9._-]*)\}\}/g, (match, key) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value != null ? String(value) : `<span style="background:#fee;color:#900;padding:0 2px">[${key} unknown]</span>`;
  });
}

export const DEFAULT_TEMPLATE_HTML = `<h1>Term Sheet</h1>
<p><strong>Date:</strong> {{today}}</p>
<p><strong>Startup:</strong> {{startup.name}}</p>
<p><strong>Fund:</strong> {{fund.name}}</p>

<h2>1. Investment</h2>
<p>The Fund proposes to invest <strong>₹{{deal.fundingAskLakhs}} lakh</strong> in
{{startup.name}} via <strong>{{deal.loanType}}</strong> over a tenure of
<strong>{{deal.tenureMonths}} months</strong>.</p>

<h2>2. Use of Funds</h2>
<p>{{deal.purpose}}</p>

<h2>3. Conditions Precedent</h2>
<ul>
  <li>Satisfactory completion of legal, financial, and tax due diligence</li>
  <li>Execution of definitive transaction documents</li>
  <li>Receipt of all required regulatory and corporate approvals</li>
</ul>

<h2>4. Reporting</h2>
<p>The Company shall provide quarterly financial statements and a monthly
operating report to the Fund.</p>

<h2>5. Confidentiality</h2>
<p>This term sheet is confidential and binding only with respect to its
confidentiality and exclusivity provisions. All other terms are non-binding
and subject to definitive agreements.</p>

<p style="margin-top: 32px"><em>This is a draft. Edit the template at
/admin/term-sheet-template before final delivery.</em></p>`;
