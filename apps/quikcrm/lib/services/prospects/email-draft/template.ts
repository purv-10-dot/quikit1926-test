/**
 * Deterministic, non-AI draft.
 *
 * @quikit/ai-sdk makes a working non-AI path mandatory ("No AI feature ships
 * without a working fallback"), and this is QuikCRM's. It runs whenever the AI
 * runtime is unconfigured, down, over budget, or returns something malformed —
 * so "Draft Email" always produces an editable starting point rather than an
 * error toast.
 *
 * It is intentionally plain. A template cannot personalise the way a model can,
 * so instead of faking warmth it assembles only facts already in the record and
 * leaves the pitch to the human. Every sentence is dropped when the field
 * behind it is missing; the result is short rather than full of blanks.
 */
import type { EmailDraft, ProspectDraftContext } from "./types";

/** Escapes text for insertion into the HTML body. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTemplateDraft(ctx: ProspectDraftContext): EmailDraft {
  const { prospect, company, sender, conversation } = ctx;
  const companyName = company.name ?? prospect.company;

  const subject = companyName
    ? `${sender.companyName ?? "Quick question"} × ${companyName}`
    : `Following up, ${prospect.firstName}`;

  const lines: string[] = [];
  lines.push(`Hi ${prospect.firstName},`);

  // A prior LinkedIn thread changes the opener entirely: "I came across your
  // profile" reads as amnesia to someone you have already messaged.
  if (conversation.length > 0) {
    lines.push("Following up on our LinkedIn conversation.");
  } else if (prospect.title && companyName) {
    lines.push(`I came across your profile — ${prospect.title} at ${companyName}.`);
  } else if (companyName) {
    lines.push(`I came across your profile at ${companyName}.`);
  } else {
    lines.push("I came across your LinkedIn profile.");
  }

  if (company.industry) {
    lines.push(`We work with teams in ${company.industry}, and I thought it was worth reaching out.`);
  }

  lines.push("[Add the specific reason you are reaching out.]");
  lines.push("Would you be open to a short call this week?");

  lines.push("Best regards,");
  lines.push(
    [sender.name, sender.companyName].filter(Boolean).join("\n") || sender.name,
  );

  const bodyHtml = lines
    .map((l) => esc(l).replace(/\n/g, "<br/>"))
    .join("<br/><br/>");

  return { subject, bodyHtml, source: "template" };
}
