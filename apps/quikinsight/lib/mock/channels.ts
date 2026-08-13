import type { Channel, Campaign } from "@/types";

export const channels: Channel[] = [
  { name: "Search",  color: "#6C5CE0", spend: 420, pipeline: 1400, type: "paid" },
  { name: "Social",  color: "#E8A33D", spend: 310, pipeline: 890,  type: "paid" },
  { name: "Content", color: "#16A34A", spend: 180, pipeline: 1100, type: "organic" },
  { name: "Events",  color: "#8B5CF6", spend: 260, pipeline: 780,  type: "paid" },
  { name: "Email",   color: "#DC2626", spend: 40,  pipeline: 650,  type: "organic" },
];

export const campaigns: Campaign[] = [
  { id: "c1", name: "Q3 Content refresh", channel: "Content", spend: 42, pipeline: 310, roas: 7.4 },
  { id: "c2", name: "Brand search — core", channel: "Search", spend: 88, pipeline: 260, roas: 3.0 },
  { id: "c3", name: "LinkedIn ABM — Enterprise", channel: "Social", spend: 61, pipeline: 190, roas: 3.1 },
  { id: "c4", name: "Retargeting — all traffic", channel: "Social", spend: 29, pipeline: 74, roas: 2.5 },
  { id: "c5", name: "Field marketing — regional events", channel: "Events", spend: 54, pipeline: 132, roas: 2.4 },
  { id: "c6", name: "Lifecycle nurture — email", channel: "Email", spend: 9, pipeline: 88, roas: 9.8 },
];

export const pipelineTrend = [3.1, 3.4, 3.9, 4.1, 4.5, 4.82]; // $M, last 6 weeks
export const leadsByDay = { Mon: 210, Tue: 340, Wed: 260, Thu: 190, Fri: 380, Sat: 90, Sun: 70 };

export const kpiBase = { pipeline: 4.82, revenue: 1.31, cac: 412, roas: 3.8 };
export const rangeMultiplier: Record<number, number> = { 7: 0.24, 30: 1, 90: 2.9, 365: 11.4 };

export const followerTrend = [118, 121, 124, 126, 127, 128.4]; // thousands
export const engagementByDay = { Mon: 3.8, Tue: 4.9, Wed: 4.1, Thu: 4.4, Fri: 5.6, Sat: 3.0, Sun: 2.6 };

export const organicPlatformData: Record<string, { followers: number; engagement: number; reach: number }> = {
  Facebook: { followers: 42000, engagement: 3.8, reach: 210000 },
  Instagram: { followers: 68000, engagement: 5.6, reach: 340000 },
  "LinkedIn Company Page": { followers: 15400, engagement: 4.9, reach: 52000 },
  "X (Twitter)": { followers: 8200, engagement: 2.1, reach: 38000 },
};
