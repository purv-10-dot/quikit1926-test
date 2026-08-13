import type { Insight, Recommendation } from "@/types";

export const insights: Insight[] = [
  { id: "i1", status: "attention", title: "CAC up 21% in paid search, driven by bid inflation on 4 keywords", meta: "Paid search · Today, 7:02am", resolved: false },
  { id: "i2", status: "good", title: "Content/SEO pipeline efficiency up 22% after March refresh", meta: "Content · Today, 7:02am", resolved: false },
  { id: "i3", status: "decision", title: "Paid social spend +9%, pipeline flat — budget window closes Friday", meta: "Paid social · Today, 7:02am", resolved: false },
  { id: "i4", status: "attention", title: "Email open rate dropped 15% after ESP migration", meta: "Lifecycle · 3 days ago", resolved: true },
  { id: "i5", status: "good", title: "LinkedIn ABM campaign crossed 3x ROAS threshold", meta: "Paid social · 5 days ago", resolved: true },
];

export const recommendations: Recommendation[] = [
  { id: "r1", label: "Budget reallocation opportunity", body: "Paid social spend +9% with flat pipeline. Shifting $80K to content is projected to add $260K in pipeline this quarter.", suggestedQuestion: "Model a budget reallocation from paid social to content" },
  { id: "r2", label: "CAC risk in paid search", body: "CAC has climbed for three straight weeks due to bid inflation on 4 keywords — worth a bid review this week.", suggestedQuestion: "Why is CAC rising in paid search?" },
  { id: "r3", label: "Repurpose a winner", body: "\"Q3 Content refresh\" is returning 7.4x ROAS. Repurposing it into a LinkedIn carousel could extend its reach cheaply.", suggestedQuestion: "How should we repurpose the Q3 Content refresh campaign?" },
];

export const activity = [
  { text: "Meta Ads token expired — sync paused", time: "2 hrs ago" },
  { text: "Daniel Osei updated the \"Brand search — core\" budget", time: "5 hrs ago" },
  { text: "Weekly exec report sent to 3 recipients", time: "Yesterday" },
  { text: "New anomaly detected: CAC drift in paid search", time: "3 days ago" },
];
