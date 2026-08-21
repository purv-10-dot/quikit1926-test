/**
 * Leads sample data — a verbatim copy of the figures in
 * `quikinsight-ui-preview-v15.html` (leadsBySource / leadTrend /
 * leadFunnelStages / leadsData).
 *
 * Shown until a CRM is connected, via `withSample()` in lib/api/leads.ts, and
 * always stamped with <SampleDataBanner /> per the honesty rule in lib/api/sample.ts.
 * Do not "freshen" these numbers — they are the reference's, and the page is
 * meant to be a carbon copy of it until real CRM data lands.
 */
import type { LeadsData } from "@/lib/api/leads";

export const LEADS_SAMPLE: Omit<LeadsData, "connected"> = {
  leadsBySource: {
    "Paid Search": 180,
    "Organic Search": 140,
    "Paid Social": 95,
    Referral: 40,
    Events: 25,
  },
  leadTrend: [310, 340, 365, 390, 410, 430],
  leadFunnelStages: [
    { label: "New lead", value: 430 },
    { label: "Contacted", value: 310 },
    { label: "Qualified", value: 180 },
    { label: "Opportunity", value: 96 },
    { label: "Customer", value: 42 },
  ],
  leads: [
    { id: "l1", name: "Alex Rivera", company: "Nimbus Retail", source: "Paid Search", status: "Qualified", score: 82, owner: "Daniel Osei", createdAt: "2024-07-26T09:00:00Z" },
    { id: "l2", name: "Priya Nandan", company: "Brightline Co", source: "Organic Search", status: "Customer", score: 95, owner: "Sam Torres", createdAt: "2024-07-21T09:00:00Z" },
    { id: "l3", name: "Marco Lee", company: "Fenwick Labs", source: "Paid Social", status: "Contacted", score: 58, owner: "Ana Kim", createdAt: "2024-07-25T09:00:00Z" },
    { id: "l4", name: "Sara Kim", company: "Uplift Health", source: "Referral", status: "New", score: 41, owner: "Daniel Osei", createdAt: "2024-07-28T09:00:00Z" },
    { id: "l5", name: "Tom Becker", company: "Northstar Logistics", source: "Events", status: "Qualified", score: 76, owner: "Marcus Webb", createdAt: "2024-07-24T09:00:00Z" },
    { id: "l6", name: "Elena Cho", company: "GreenLeaf Foods", source: "Paid Search", status: "Contacted", score: 64, owner: "Daniel Osei", createdAt: "2024-07-23T09:00:00Z" },
    { id: "l7", name: "Ravi Patel", company: "Skyline Media", source: "Organic Search", status: "New", score: 35, owner: "Sam Torres", createdAt: "2024-07-28T09:00:00Z" },
    { id: "l8", name: "Jamie Fox", company: "Cascade Analytics", source: "Paid Social", status: "Customer", score: 91, owner: "Ana Kim", createdAt: "2024-07-14T09:00:00Z" },
    { id: "l9", name: "Nina Alvarez", company: "Solstice Robotics", source: "Paid Search", status: "Qualified", score: 88, owner: "Daniel Osei", createdAt: "2024-07-27T09:00:00Z" },
    { id: "l10", name: "Owen Brooks", company: "Meadowlark SaaS", source: "Referral", status: "Customer", score: 97, owner: "Marcus Webb", createdAt: "2024-07-10T09:00:00Z" },
    { id: "l11", name: "Yuki Tanaka", company: "Orbital Finance", source: "Organic Search", status: "Contacted", score: 69, owner: "Sam Torres", createdAt: "2024-07-22T09:00:00Z" },
    { id: "l12", name: "Grace Muli", company: "Harborlight Insurance", source: "Events", status: "New", score: 29, owner: "Ana Kim", createdAt: "2024-07-29T09:00:00Z" },
    { id: "l13", name: "Ben Ostrander", company: "Cedarline Manufacturing", source: "Paid Social", status: "Qualified", score: 73, owner: "Daniel Osei", createdAt: "2024-07-20T09:00:00Z" },
    { id: "l14", name: "Layla Haddad", company: "Vantage Biotech", source: "Paid Search", status: "New", score: 44, owner: "Sam Torres", createdAt: "2024-07-29T09:00:00Z" },
    { id: "l15", name: "Curtis Boyd", company: "Prairie Freight Co", source: "Organic Search", status: "Contacted", score: 55, owner: "Marcus Webb", createdAt: "2024-07-19T09:00:00Z" },
    { id: "l16", name: "Mei Lin", company: "Aurora Dynamics", source: "Referral", status: "Customer", score: 99, owner: "Ana Kim", createdAt: "2024-07-05T09:00:00Z" },
  ],
};
