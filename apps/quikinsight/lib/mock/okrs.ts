import type { MemberOkrs } from "@/types";

export const memberOkrs: MemberOkrs[] = [
  {
    memberId: "m1", name: "Daniel Osei", role: "Paid Search Lead", initials: "DO", color: "#6C5CE0",
    okrs: [{
      objective: "Improve paid search efficiency this quarter",
      keyResults: [
        { label: "Reduce paid search CAC to $380", pct: 60 },
        { label: "Launch Q3 bid strategy across top 10 keywords", pct: 85 },
      ],
    }],
  },
  {
    memberId: "m2", name: "Sam Torres", role: "Content & SEO Lead", initials: "ST", color: "#16A34A",
    okrs: [{
      objective: "Scale organic pipeline through content",
      keyResults: [
        { label: "Ship the Q3 content refresh rollout", pct: 100 },
        { label: "Complete the SEO technical audit", pct: 40 },
      ],
    }],
  },
  {
    memberId: "m3", name: "Ana Kim", role: "Social & Lifecycle", initials: "AK", color: "#E8A33D",
    okrs: [{
      objective: "Grow owned audience and engagement",
      keyResults: [
        { label: "Run the Instagram growth campaign", pct: 35 },
        { label: "Redesign the lifecycle nurture sequence", pct: 70 },
      ],
    }],
  },
  {
    memberId: "m4", name: "Marcus Webb", role: "Marketing Ops", initials: "MW", color: "#DC2626",
    okrs: [{
      objective: "Strengthen marketing data infrastructure",
      keyResults: [
        { label: "Migrate to the new attribution model", pct: 55 },
        { label: "Automate the weekly reporting pipeline", pct: 90 },
      ],
    }],
  },
];

// Dedicated OKR tools — deliberately separate from teamConnectOptions in team.ts,
// since OKRs and tasks usually live in different systems.
export const okrConnectOptions = ["Lattice", "Ally.io", "Gtmhub", "Perdoo", "Weekdone"];
