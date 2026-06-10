// Shared types for the Habits page components — kept local to the route
// so changes here don't ripple through the rest of quikscale.

export type CampaignStatus = "draft" | "active" | "closed";

export interface AdminCampaignRow {
  id: string;
  quarter: string;
  year: number;
  status: CampaignStatus;
  isLegacy: boolean;
  deadline: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  assessmentDate: string;
  assessedBy: string;
  // Legacy single-user score columns — only populated when isLegacy=true.
  habit1_vision: number | null;
  habit2_meetings: number | null;
  habit3_scoreboards: number | null;
  habit4_accountable: number | null;
  habit5_rhythm: number | null;
  habit6_sticking: number | null;
  habit7_cascading: number | null;
  habit8_recognition: number | null;
  habit9_training: number | null;
  habit10_innovation: number | null;
  maturityLevel: string | null;
  averageScore: number | null;
  // Multi-round metadata — computed server-side, always 1/1 for legacy rows.
  round: number;
  totalRounds: number;
}

export interface MemberCampaignSummary {
  id: string;
  quarter: string;
  year: number;
  status: CampaignStatus;
  deadline: string | null;
  publishedAt: string | null;
  hasSubmitted: boolean;
  submittedAt: string | null;
  round: number;
  totalRounds: number;
}

export function roundLabel(round: number, totalRounds: number): string {
  return totalRounds > 1 ? ` · Round ${round}` : "";
}
