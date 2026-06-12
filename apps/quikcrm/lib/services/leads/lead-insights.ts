/**
 * Rule-based lead intelligence (no external AI). Derived from CRM signals.
 */

export type InsightRisk = "low" | "medium" | "high";

export interface LeadInsights {
  healthScore: number;
  engagementScore: number;
  conversionProbability: number;
  lastResponseHours: number | null;
  recommendedAction: string;
  riskLevel: InsightRisk;
}

type ActivityLike = {
  type: string;
  activityCode?: string | null;
  occurredAt: Date | string | null;
  createdAt?: Date | string | null;
};

type CallLike = { createdAt: Date | string | null; startTime?: Date | string | null };

function hoursSince(d: Date | string | null | undefined, now: Date): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, (now.getTime() - ms) / (60 * 60 * 1000));
}

function isEmail(a: ActivityLike): boolean {
  const t = (a.type + (a.activityCode ?? "")).toLowerCase();
  return t.includes("email");
}

function isMeeting(a: ActivityLike): boolean {
  const t = (a.type + (a.activityCode ?? "")).toLowerCase();
  return t.includes("meeting");
}

export function computeLeadInsights(input: {
  score: number;
  stage: string;
  status: string;
  isDisengaged: boolean;
  daysSinceCreated: number;
  openTasks: number;
  activitiesCount: number;
  callsCount: number;
  notesCount: number;
  nextFollowUpAt: string | null;
  activities: ActivityLike[];
  callLogs: CallLike[];
  now?: Date;
}): LeadInsights {
  const now = input.now ?? new Date();
  const stage = input.stage.toLowerCase();
  const recentTouchMs: number[] = [];

  for (const a of input.activities) {
    const t = a.occurredAt ?? a.createdAt;
    if (t) recentTouchMs.push(new Date(t).getTime());
  }
  for (const c of input.callLogs) {
    const t = c.startTime ?? c.createdAt;
    if (t) recentTouchMs.push(new Date(t).getTime());
  }
  recentTouchMs.sort((a, b) => b - a);
  const lastTouchMs = recentTouchMs[0];
  const lastResponseHours = lastTouchMs
    ? (now.getTime() - lastTouchMs) / (60 * 60 * 1000)
    : null;

  let engagementScore = Math.min(
    100,
    input.activitiesCount * 8 + input.callsCount * 12 + input.notesCount * 5,
  );
  if (lastResponseHours != null && lastResponseHours < 48) engagementScore += 15;
  if (lastResponseHours != null && lastResponseHours > 14 * 24) engagementScore -= 25;
  engagementScore = Math.max(0, Math.min(100, engagementScore));

  let conversionProbability = input.score;
  if (stage.includes("qualified")) conversionProbability += 15;
  if (stage.includes("proposal")) conversionProbability += 25;
  if (stage.includes("negotiation")) conversionProbability += 35;
  if (stage.includes("won") || stage.includes("converted")) conversionProbability = 95;
  if (stage.includes("lost") || stage.includes("disqual")) conversionProbability = 5;
  if (input.nextFollowUpAt) conversionProbability += 5;
  conversionProbability = Math.max(0, Math.min(100, conversionProbability));

  let healthScore = Math.round((input.score + engagementScore + conversionProbability) / 3);
  if (input.isDisengaged) healthScore -= 30;
  if (input.openTasks > 0) healthScore += 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  let riskLevel: InsightRisk = "low";
  if (input.isDisengaged || (lastResponseHours != null && lastResponseHours > 7 * 24)) {
    riskLevel = "high";
  } else if (lastResponseHours != null && lastResponseHours > 3 * 24) {
    riskLevel = "medium";
  }

  let recommendedAction = "Log a touchpoint to keep momentum.";
  if (input.nextFollowUpAt) {
    recommendedAction = "Follow-up scheduled — prepare talking points before the call.";
  } else if (lastResponseHours != null && lastResponseHours > 72) {
    recommendedAction = "No recent engagement. Schedule a call or send a recap email today.";
  } else if (stage.includes("proposal") || stage.includes("negotiation")) {
    recommendedAction = "High intent stage. Schedule a demo or send proposal follow-up within 24h.";
  } else if (isMeeting(input.activities[0] ?? { type: "" })) {
    recommendedAction = "Meeting logged — capture notes and set the next step.";
  } else if (isEmail(input.activities[0] ?? { type: "" })) {
    recommendedAction = "Email thread active — reply while context is fresh.";
  } else if (conversionProbability >= 70) {
    recommendedAction = "Strong conversion signals. Push for commitment this week.";
  }

  return {
    healthScore,
    engagementScore,
    conversionProbability,
    lastResponseHours:
      lastResponseHours != null ? Math.round(lastResponseHours * 10) / 10 : null,
    recommendedAction,
    riskLevel,
  };
}
