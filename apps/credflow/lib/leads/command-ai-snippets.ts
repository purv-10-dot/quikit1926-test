import type { LeadInsights } from "@/lib/services/leads/lead-insights";

export type LeadAiSnippetInput = {
  name: string;
  company: string | null;
  stage: string;
  status: string;
  source: string | null;
  ownerName: string | null;
  score: number;
  insights: LeadInsights;
  activitiesCount: number;
  openTasks: number;
};

export function buildLeadSummarySnippet(lead: LeadAiSnippetInput): string {
  const lines = [
    `Lead: ${lead.name}`,
    lead.company ? `Company: ${lead.company}` : null,
    `Stage: ${lead.stage} · Status: ${lead.status}`,
    lead.source ? `Source: ${lead.source}` : null,
    lead.ownerName ? `Owner: ${lead.ownerName}` : null,
    `Score: ${lead.score}`,
    "",
    `Health ${lead.insights.healthScore}% · Engagement ${lead.insights.engagementScore}% · Conversion ${lead.insights.conversionProbability}%`,
    `Risk: ${lead.insights.riskLevel}`,
    `${lead.activitiesCount} logged activities · ${lead.openTasks} open tasks`,
    "",
    lead.insights.recommendedAction,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildFollowUpEmailDraft(lead: LeadAiSnippetInput): string {
  const first = lead.name.split(/\s+/)[0] || lead.name;
  return [
    `Subject: Following up — ${lead.company ?? lead.name}`,
    "",
    `Hi ${first},`,
    "",
    `Thank you for your interest. I wanted to follow up on our recent conversation regarding ${lead.company ?? "your requirements"}.`,
    "",
    lead.insights.recommendedAction,
    "",
    "Best regards,",
    lead.ownerName ?? "[Your name]",
  ].join("\n");
}

export function buildLeadHealthAnalysis(lead: LeadAiSnippetInput): string {
  const touch =
    lead.insights.lastResponseHours == null
      ? "No touchpoints recorded yet."
      : lead.insights.lastResponseHours < 24
        ? `Last engagement ${Math.round(lead.insights.lastResponseHours)}h ago.`
        : `Last engagement ${Math.round(lead.insights.lastResponseHours / 24)}d ago.`;

  return [
    "Lead health analysis (CRM signals)",
    "",
    `Health score: ${lead.insights.healthScore}/100`,
    `Engagement score: ${lead.insights.engagementScore}/100`,
    `Risk level: ${lead.insights.riskLevel.toUpperCase()}`,
    touch,
    "",
    "Recommendation:",
    lead.insights.recommendedAction,
  ].join("\n");
}

export function buildConversionPrediction(lead: LeadAiSnippetInput): string {
  return [
    "Conversion forecast (rule-based model)",
    "",
    `Probability: ${lead.insights.conversionProbability}%`,
    `Current stage: ${lead.stage}`,
    `Lead score: ${lead.score}`,
    "",
    "Drivers:",
    `- Pipeline stage weighting applied for "${lead.stage}"`,
    `- Engagement from ${lead.activitiesCount} activities`,
    lead.openTasks > 0 ? `- ${lead.openTasks} open task(s) increase follow-through` : null,
    "",
    "Next step:",
    lead.insights.recommendedAction,
  ]
    .filter(Boolean)
    .join("\n");
}
