import type { Metadata } from "next";
import "./marketing.css";

export const metadata: Metadata = {
  title: "QuikSupport — Helpdesk & Ticketing",
  description:
    "Multi-tenant helpdesk for QuikIT: tickets, SLA tracking, categories, agent queues and reporting.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <div className="qs-landing">{children}</div>;
}
