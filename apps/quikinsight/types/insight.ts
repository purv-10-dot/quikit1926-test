export type InsightStatus = "attention" | "good" | "decision";

export interface Insight {
  id: string;
  status: InsightStatus;
  title: string;
  meta: string;
  resolved: boolean;
}

export interface Recommendation {
  id: string;
  label: string;
  body: string;
  suggestedQuestion: string;
}
