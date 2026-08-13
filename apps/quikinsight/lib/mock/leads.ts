import type { Lead, LeadFunnelStage } from "@/types";

export const leadsBySource: Record<string, number> = {
  "Paid Search": 180,
  "Organic Search": 140,
  "Paid Social": 95,
  Referral: 40,
  Events: 25,
};

export const leadTrend = [310, 340, 365, 390, 410, 430];

export const leadFunnelStages: LeadFunnelStage[] = [
  { label: "New lead", value: 430 },
  { label: "Contacted", value: 310 },
  { label: "Qualified", value: 180 },
  { label: "Opportunity", value: 96 },
  { label: "Customer", value: 42 },
];

export const leads: Lead[] = [
  { id: "l1", name: "Alex Rivera", company: "Nimbus Retail", source: "Paid Search", status: "Qualified", score: 82, owner: "Daniel Osei", createdAt: "2024-07-26T09:00:00Z" },
  { id: "l2", name: "Priya Nandan", company: "Brightline Co", source: "Organic Search", status: "Customer", score: 95, owner: "Sam Torres", createdAt: "2024-07-21T09:00:00Z" },
  { id: "l3", name: "Marco Lee", company: "Fenwick Labs", source: "Paid Social", status: "Contacted", score: 58, owner: "Ana Kim", createdAt: "2024-07-25T09:00:00Z" },
  { id: "l4", name: "Sara Kim", company: "Uplift Health", source: "Referral", status: "New", score: 41, owner: "Daniel Osei", createdAt: "2024-07-28T09:00:00Z" },
  { id: "l5", name: "Tom Becker", company: "Northstar Logistics", source: "Events", status: "Qualified", score: 76, owner: "Marcus Webb", createdAt: "2024-07-24T09:00:00Z" },
  { id: "l6", name: "Elena Cho", company: "GreenLeaf Foods", source: "Paid Search", status: "Contacted", score: 64, owner: "Daniel Osei", createdAt: "2024-07-23T09:00:00Z" },
  { id: "l7", name: "Ravi Patel", company: "Skyline Media", source: "Organic Search", status: "New", score: 35, owner: "Sam Torres", createdAt: "2024-07-28T09:00:00Z" },
  { id: "l8", name: "Jamie Fox", company: "Cascade Analytics", source: "Paid Social", status: "Customer", score: 91, owner: "Ana Kim", createdAt: "2024-07-14T09:00:00Z" },
];
