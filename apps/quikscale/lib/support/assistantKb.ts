/**
 * Scripted assistant knowledge base for the in-app support Copilot.
 *
 * Ported from the reference widget's `KB` + `replyTo`, with the content
 * rewritten for QuikScale: the original answered "pricing / free trial / book a
 * demo" questions aimed at a logged-out website visitor, which is useless to a
 * signed-in user already inside the product.
 *
 * No backend — matching the reference. To wire this to a real assistant, swap
 * the body of `replyTo` for a fetch to your LLM endpoint and keep the signature;
 * the chat UI needs no changes.
 */

export interface KbEntry {
  /** Lowercase substrings matched against the user's message. */
  keywords: string[];
  answer: string;
}

export const KB: KbEntry[] = [
  {
    keywords: ["hi", "hello", "hey", "yo", "good morning", "good afternoon"],
    answer:
      "Hey! 👋 I'm the QuikScale assistant. Ask me about KPIs, Priorities, WWW, OPSP or your meeting rhythm — or raise a request and our team will pick it up.",
  },
  {
    keywords: ["kpi", "metric", "measure", "target", "weekly value", "traffic light"],
    answer:
      "KPIs live under Execution → KPI. Each KPI has a quarterly goal and weekly values; the cell colour shows performance — blue is exceeded (≥120%), green achieved (≥100%), yellow near (≥80%) and red below target. Use the Team tab for team-level KPIs.",
  },
  {
    keywords: ["priority", "priorities", "rock"],
    answer:
      "Priorities are your quarterly rocks, under Execution → Priority. Give each a start and end week and an owner, then update the status weekly — Completed, On Track, Behind Schedule or Not Yet Started.",
  },
  {
    keywords: ["www", "who what when", "action item", "todo", "to-do"],
    answer:
      "WWW (Who / What / When) tracks short-term action items from your meetings, under Execution → WWW. Each row has an owner, a due date and a status, so nothing agreed in a meeting gets lost.",
  },
  {
    keywords: ["opsp", "one page", "strategic plan", "strategy"],
    answer:
      "The OPSP (One Page Strategic Plan) is under Strategy → OPSP. It holds your long-term goals, this year's targets and the quarterly plan in one view. Sections can be assigned to owners and reviewed each quarter.",
  },
  {
    keywords: ["meeting", "huddle", "rhythm", "weekly meeting", "l10"],
    answer:
      "Meeting Rhythm covers your daily huddles and weekly meetings. Attendance, scores and notes are recorded per meeting, and anything actionable can be captured straight into WWW.",
  },
  {
    keywords: ["quarter", "fiscal", "financial year", "q1", "q2", "q3", "q4"],
    answer:
      "Quarters follow your organisation's fiscal year. An admin sets the fiscal year start and quarter configuration under Settings → Configurations — if you're seeing a 'quarters not set up' warning, that's where to fix it.",
  },
  {
    keywords: ["team", "member", "invite", "user", "role", "permission", "access"],
    answer:
      "Team members and roles are managed under Org Setup. Roles control what each person can view and edit. If you need access to something you can't see, ask an admin in your organisation — or raise a request here and we'll help.",
  },
  {
    keywords: ["theme", "colour", "color", "accent", "brand", "logo", "dark mode"],
    answer:
      "You can change your accent colour and theme under Settings → Profile Details, and org-wide branding under Settings → Company Setting.",
  },
  {
    keywords: ["ticket", "status", "raised", "my request", "track"],
    answer:
      "Every request you raise here is tracked under Settings → Support Status, with its current status and the latest response from our team.",
  },
  {
    keywords: ["bug", "broken", "error", "not working", "crash", "500", "fail"],
    answer:
      "Sorry that's happening. Go back and choose \"Raise a request\", pick Bug, and include what you were doing plus what you expected — that goes straight to the QuikIT team with your org and account details attached.",
  },
  {
    keywords: ["support", "help", "contact", "human", "talk", "email", "reach"],
    answer:
      "Our team is here to help — go back and choose \"Raise a request\", or email inquiry@quikit.ai. You can track everything you've raised under Settings → Support Status.",
  },
];

export const ASSISTANT_GREETING =
  "Hi there 👋 I'm the QuikScale assistant. Ask me about KPIs, Priorities, WWW or OPSP — or raise a request to reach our team.";

export const ASSISTANT_FALLBACK =
  "Thanks for your message! I don't have an answer for that one. Go back and choose \"Raise a request\" to reach the QuikIT team — they'll follow up and you can track it under Settings → Support Status.";

/** First KB entry whose keywords appear in the message, else the fallback. */
export function replyTo(text: string): string {
  const t = text.toLowerCase();
  for (const entry of KB) {
    if (entry.keywords.some((k) => t.includes(k))) return entry.answer;
  }
  return ASSISTANT_FALLBACK;
}
