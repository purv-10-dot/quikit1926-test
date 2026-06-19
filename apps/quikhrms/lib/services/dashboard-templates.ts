import type { WidgetConfig } from "./dashboard-widgets";

export interface DashboardTemplate {
  key: string;
  name: string;
  description: string;
  category: "growth" | "retention" | "career" | "finance" | "hiring";
  iconName: string;
  color: string;
  widgets: WidgetConfig[];
}

let counter = 0;
const id = () => `w-${++counter}`;

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: "growth",
    name: "Growth",
    description: "See how people are distributed in your org over time.",
    category: "growth",
    iconName: "Users",
    color: "#14b8a6",
    widgets: [
      { id: id(), type: "headcount-trend", title: "Headcount over time" },
      { id: id(), type: "new-hires", title: "New hires (12 months)" },
      { id: id(), type: "headcount-by-department", title: "Headcount by department" },
      { id: id(), type: "headcount-by-location", title: "Headcount by location" },
      { id: id(), type: "headcount-by-gender", title: "Gender distribution" },
      { id: id(), type: "tenure-distribution", title: "Tenure distribution" },
      { id: id(), type: "age-distribution", title: "Age distribution" },
    ],
  },
  {
    key: "retention",
    name: "Retention",
    description: "Look at rates of turnover, attrition, and retention.",
    category: "retention",
    iconName: "Star",
    color: "#f97316",
    widgets: [
      { id: id(), type: "turnover-rate", title: "Turnover rate", benchmark: 1.5 },
      { id: id(), type: "attrition-rate", title: "Attrition rate", benchmark: 1.0 },
      { id: id(), type: "terminations", title: "Terminations" },
      { id: id(), type: "tenure-distribution", title: "Tenure distribution" },
    ],
  },
  {
    key: "career",
    name: "Career Development",
    description: "Explore trends related to promotions and internal mobility.",
    category: "career",
    iconName: "BadgeCheck",
    color: "#ec4899",
    widgets: [
      { id: id(), type: "promotions-this-year", title: "Promotions this year" },
      { id: id(), type: "internal-mobility", title: "Internal moves YTD" },
      { id: id(), type: "tenure-distribution", title: "Tenure distribution" },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Get insights into the distribution of salary across your org.",
    category: "finance",
    iconName: "DollarSign",
    color: "#1e3a8a",
    widgets: [
      { id: id(), type: "ctc-spend", title: "Total CTC spend" },
      { id: id(), type: "salary-by-department", title: "Salary by department" },
      { id: id(), type: "headcount-by-department", title: "Headcount by department" },
    ],
  },
  {
    key: "hiring",
    name: "Hiring",
    description: "Track open positions, pipeline health, time-to-hire and offer outcomes.",
    category: "hiring",
    iconName: "UserPlus",
    color: "#8b5cf6",
    widgets: [
      // KPI strip (metric widgets — render as compact tiles up top)
      { id: id(), type: "open-positions",         title: "Open positions" },
      { id: id(), type: "hires-count",            title: "Hires" },
      { id: id(), type: "time-to-hire",           title: "Avg. time to hire (days)" },
      { id: id(), type: "offer-acceptance-rate",  title: "Offer acceptance rate" },
      { id: id(), type: "candidates-interviewed", title: "Candidates interviewed" },
      { id: id(), type: "recruitment-sources",    title: "Sources" },
      // Charts (render in the grid below)
      { id: id(), type: "new-hires",              title: "Hires per month" },
      { id: id(), type: "open-positions-by-department", title: "Open positions by department" },
      { id: id(), type: "pipeline-funnel",        title: "Pipeline by stage" },
      { id: id(), type: "top-sources-by-hires",   title: "Top sources by hires" },
      { id: id(), type: "aging-requisitions",     title: "Open roles by age" },
      { id: id(), type: "top-hiring-departments", title: "Top hiring departments" },
    ],
  },
];
