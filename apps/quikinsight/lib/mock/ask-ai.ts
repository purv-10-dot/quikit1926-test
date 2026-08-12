import type { ChatMessage } from "@/types";

// Keyed canned responses. Replace matchResponse's logic in lib/api/ask-ai.ts
// with a real call to your backend/LLM — this is a placeholder so the UI is
// fully clickable before that's wired up.
export const cannedResponses: Record<string, Omit<ChatMessage, "id" | "role">> = {
  cac: {
    text: "Paid search CAC rose from $340 to $412 (+21%) over the last 3 weeks. The driver is bid inflation on 4 branded and competitor keywords, not a conversion problem — conversion rate is flat at 3.2%. CPC on those 4 keywords rose 34% while volume stayed flat, suggesting a competitor entered the auction.",
    chart: { labels: ["Wk1", "Wk2", "Wk3", "Wk4"], data: [2.10, 2.31, 2.58, 2.82], label: "CPC on affected keywords ($)" },
    suggestions: ["Show me the 4 keywords", "Draft a Slack update to the team"],
  },
  social: {
    text: "Paid social spend is up 9% month over month while pipeline generated stayed essentially flat at $890K. Efficiency (pipeline per dollar) has dropped from 3.1x to 2.9x — mostly concentrated in the prospecting campaigns rather than retargeting, which is still performing at 4.2x.",
    chart: { labels: ["Apr", "May", "Jun", "Jul"], data: [3.4, 3.2, 3.1, 2.9], label: "Pipeline efficiency (x)" },
    suggestions: ["Model a reallocation to content", "Compare prospecting vs retargeting"],
  },
  content: {
    text: "Content and SEO pipeline efficiency improved 22% after the March content refresh. Three pieces are driving most of the lift: the pricing comparison guide, the ROI calculator page, and the refreshed integrations hub — together responsible for about 61% of content-sourced pipeline this quarter.",
    chart: { labels: ["Feb", "Mar", "Apr", "May", "Jun", "Jul"], data: [3.1, 3.3, 3.7, 4.0, 4.3, 4.6], label: "Pipeline per content dollar (x)" },
    suggestions: ["Show me the pricing guide performance", "What should we publish next?"],
  },
  budget: {
    text: "Reallocating $80K from paid social to content/SEO — based on each channel's trailing 90-day pipeline-per-dollar rate — would be projected to add roughly $260K in incremental pipeline this quarter, with no change to total spend.",
    chart: { labels: ["Current mix", "Proposed mix"], data: [4820, 5080], label: "Projected pipeline ($K)" },
    suggestions: ["Show the assumptions behind this", "Draft this as a recommendation for Vijay"],
  },
  repurpose: {
    text: "\"Q3 Content refresh\" is returning 7.4x ROAS, well above your 3.8x blended average. It's a strong candidate to repurpose into a LinkedIn carousel and a short email sequence.",
    chart: { labels: ["Original", "w/ LinkedIn", "w/ LinkedIn + Email"], data: [310, 410, 470], label: "Projected pipeline ($K)" },
    suggestions: ["Draft the LinkedIn carousel outline", "Draft the email sequence outline"],
  },
  default: {
    text: "Here's what I can see from your connected sources this period: pipeline is up 14%, revenue is up 6%, and the biggest single change was CAC drifting upward in paid search. Ask me about a specific channel, campaign, or metric and I'll pull the exact numbers behind it.",
    chart: { labels: ["May", "Jun", "Jul"], data: [4.1, 4.5, 4.82], label: "Pipeline ($M)" },
    suggestions: ["Why is CAC rising?", "What is working well this month?"],
  },
};

export function matchResponse(question: string): Omit<ChatMessage, "id" | "role"> {
  const s = question.toLowerCase();
  if (s.includes("repurpose") || s.includes("carousel") || s.includes("email sequence")) return cannedResponses.repurpose!;
  if (s.includes("cac") || s.includes("search")) return cannedResponses.cac!;
  if (s.includes("social")) return cannedResponses.social!;
  if (s.includes("content") || s.includes("seo") || s.includes("working well")) return cannedResponses.content!;
  if (s.includes("budget") || s.includes("model") || s.includes("realloc")) return cannedResponses.budget!;
  return cannedResponses.default!;
}
