import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppAccessDeniedPopup } from "@quikit/ui/app-access-denied-popup";
import { authOptions } from "@/lib/auth";
import ScrollStage from "./_components/ScrollStage";
import HorizontalPunch from "./_components/HorizontalPunch";
import HorizontalModules from "./_components/HorizontalModules";
import Nav from "./_components/Nav";
import FlipDie from "./_components/FlipDie";
import BackToTop from "./_components/BackToTop";
import TourCTA from "./_components/TourCTA";
import CountUp from "./_components/CountUp";
import Flow from "./_components/Flow";
import Roles from "./_components/Roles";
import RevealRoot from "./_components/RevealRoot";

/**
 * Public landing page at `/`.
 *
 *   - Unauthenticated → render the landing page (200 OK)
 *   - Authenticated   → redirect to `/dashboard`
 *
 * Middleware lets `/` through (added to publicRoutes). The session check
 * here keeps logged-in users out of the marketing page — they expect the
 * app, not a brochure, when they hit the root.
 */

const STATS = [
  { num: <CountUp from={8} to={15} pad={2} suffix={<em>%</em>} />, lbl: "revenue typically lost to broken systems" },
  { num: <CountUp to={1} pad={2} />, lbl: "unified platform replacing Excel + WhatsApp" },
  { num: <CountUp to={4} pad={2} />, lbl: "core modules — site to boardroom" },
  { num: <CountUp to={100} suffix={<em>%</em>} />, lbl: "visibility on materials, money & progress" },
];

const FLOW = [
  "Site raises request (MR)",
  "Approval workflow triggers",
  "Purchase order generated",
  "Material received & tracked",
  "DPR updates progress",
  "Dashboard shows real-time insights",
];

const MODULES = [
  {
    no: "Module 01",
    cat: "Project Management",
    title: "Plan, Track & Bill Every Project",
    items: [
      "BOQ upload & tracking",
      "Daily Progress Reports (DPR)",
      "Auto contractor billing (RAB)",
      "Real-time project dashboards",
    ],
  },
  {
    no: "Module 02",
    cat: "Procurement Control",
    title: "Buy Right. Buy Once.",
    items: [
      "Material Requisition (MR)",
      "3-level approval workflow",
      "Vendor comparison (L1 / L2 / L3)",
      "Purchase Orders + GRN tracking",
    ],
  },
  {
    no: "Module 03",
    cat: "Inventory & Store",
    title: "Stock You Can Actually Trust",
    items: [
      "Live stock register",
      "Site-wise inventory tracking",
      "Gate pass system",
      "Material issue & returns",
    ],
  },
  {
    no: "Module 04",
    cat: "AI Intelligence",
    title: "An Operator That Never Sleeps",
    items: [
      "Smart vendor recommendations",
      "Rate anomaly detection",
      "Auto material estimation",
      "AI chatbot for instant answers",
    ],
  },
];

const PRICING = [
  {
    tag: "STARTER",
    title: "For Small Teams",
    desc: "Built for small contractors and growing teams running 1–3 active sites who need to replace Excel and WhatsApp with one system.",
    price: "₹14,999",
    period: "per month",
    points: ["Up to 3 sites", "All core modules", "Email support"],
    accent: "linear-gradient(135deg,#FFAF55 0%,#ea580c 100%)",
  },
  {
    tag: "GROWTH",
    title: "For Scaling Operations",
    desc: "For mid-sized construction companies juggling multiple projects who want real-time visibility, tighter procurement, and faster decisions.",
    price: "₹39,999",
    period: "per month",
    points: ["Up to 15 sites", "Advanced analytics", "Priority support"],
    accent: "linear-gradient(135deg,#0a0a0a 0%,#3a3a3a 100%)",
  },
  {
    tag: "ENTERPRISE",
    title: "Custom Built For You",
    desc: "For large construction enterprises with complex operations, custom workflows, and the need for dedicated support and integrations.",
    price: "Let's talk",
    period: "tailored pricing",
    points: ["Unlimited sites", "Dedicated success manager", "Custom integrations"],
    accent: "linear-gradient(135deg,#1e3a8a 0%,#0a0a0a 100%)",
  },
];

const ROLES = [
  { ix: "R / 01", title: "Director / MD", line: "See project profitability instantly — across every site, in real time.", tag: "Boardroom" },
  { ix: "R / 02", title: "Project Manager", line: "Track progress, control delays, hold contractors accountable.", tag: "Operations" },
  { ix: "R / 03", title: "Procurement Manager", line: "Optimize vendor & pricing decisions with full L1 / L2 / L3 visibility.", tag: "Procurement" },
  { ix: "R / 04", title: "Site Engineer", line: "Raise requests and submit DPR from the site — in under a minute.", tag: "Field" },
];

export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  // A user bounced here for lacking app access must see the landing page +
  // popup even if they still hold a session (SessionGuard would re-bounce them).
  const deniedAccess = searchParams?.reason === "no_app_access";
  const session = await getServerSession(authOptions);
  if (session?.user?.id && !deniedAccess) {
    redirect("/dashboard");
  }

  return (
    <div className="frame">
      <AppAccessDeniedPopup appName="QuikInfra" />
      <main className="sheet">
        <Nav />

        {/* HERO */}
        <section className="hero">
          <h1>
            <small>Construction Operations · One Platform</small>
            Run Every Construction Site<br />From <span className="grad-text">One Dashboard</span>
          </h1>

          <div className="hero-sub">
            <p>
              QuikInfra is the AI-powered construction ERP software built for Indian builders.
              Replace Excel, WhatsApp, and guesswork with real-time control over materials, money,
              and project progress — across every site.
            </p>
            <div className="cta">
              <TourCTA />
            </div>
          </div>
        </section>

        <ScrollStage />

        {/* STATS */}
        <section className="stats-section">
          <div className="stats-intro" data-reveal style={{ ["--rise" as string]: "70px" }}>
            <p className="stats-lead">
              We are on a mission to help construction businesses take real-time control of materials, money,
              and progress — turning fragmented operations into one unified, intelligent platform.
            </p>
          </div>
          <div className="stats" aria-label="Headline stats">
            {STATS.map((s, i) => (
              <div
                className="stat"
                key={i}
                data-reveal
                style={{
                  ["--rise" as string]: `${[60, 100, 80, 120][i % 4]}px`,
                  ["--delay" as string]: `${i * 110}ms`,
                }}
              >
                <div className="num">{s.num}</div>
                <div className="lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
        </section>

        {/* PROBLEM */}
        <section className="section" id="problem">
          <div className="section-head" data-reveal style={{ ["--rise" as string]: "60px" }}>
            <h2>The Problem</h2>
            <div className="rule" />
            <div className="num">01</div>
          </div>

          <div className="section-body section-body--full" data-reveal style={{ ["--rise" as string]: "80px", ["--delay" as string]: "120ms" }}>
            <p>
              Construction companies lose <strong>8–15% of revenue</strong> every year — not
              because of bad people or bad projects, but because the construction management
              tools holding their operations together were never built for construction. Generic
              spreadsheets, chat apps, and manual registers create slow, blind, leaky operations
              where decisions arrive too late to matter.
            </p>
          </div>

          <div className="problem-grid" style={{ marginTop: 48 }}>
            <div data-reveal style={{ ["--rise" as string]: "100px", ["--delay" as string]: "0ms" }}>
              <h4>Today&apos;s stack</h4>
              <ul>
                <li>Excel sheets for tracking</li>
                <li>WhatsApp for approvals</li>
                <li>Manual registers for stock</li>
                <li>Phone calls for site updates</li>
              </ul>
            </div>
            <div data-reveal style={{ ["--rise" as string]: "140px", ["--delay" as string]: "150ms" }}>
              <h4>What it costs you</h4>
              <ul className="neg">
                <li>No real-time visibility</li>
                <li>Material theft &amp; over-ordering</li>
                <li>Delayed decisions</li>
                <li>Contractor billing fraud</li>
              </ul>
            </div>
          </div>

          <HorizontalPunch />
        </section>

        {/* SOLUTION */}
        <section className="section" id="solution">
          <div className="section-head" data-reveal style={{ ["--rise" as string]: "60px" }}>
            <h2>The Solution</h2>
            <div className="rule" />
            <div className="num">02</div>
          </div>

          <div className="section-body" data-reveal style={{ ["--rise" as string]: "80px", ["--delay" as string]: "120ms" }}>
            <p className="lead">One construction ERP to run your entire operation.</p>
            <div>
              <p>
                QuikInfra ERP connects <strong>site, store, procurement, and management</strong>
                {" "}into a single construction management platform — purpose-built so every request,
                approval, and rupee leaves an auditable trail. From the moment a site engineer raises
                a material requisition to the moment a director signs off the dashboard, every step is
                connected, timestamped, and visible to the right people.
              </p>
            </div>
          </div>

          <Flow steps={FLOW} />

          <div className="highlight highlight--flip">
            <FlipDie sides={["Every decision", "is tracked.", "Every rupee", "is visible."]} />
          </div>
        </section>

        {/* MODULES */}
        <section className="section section--horizontal" id="features">
          <HorizontalModules modules={MODULES} />
        </section>

        {/* ROLES */}
        <section className="section" id="roles">
          <div className="section-head" data-reveal style={{ ["--rise" as string]: "60px" }}>
            <h2>Built For Every Role</h2>
            <div className="rule" />
            <div className="num">04</div>
          </div>

          <div className="section-body section-body--full" data-reveal style={{ ["--rise" as string]: "80px", ["--delay" as string]: "120ms" }}>
            <p>
              Construction is a team sport. Our construction management software gives every role a
              view tuned to the decisions they actually make — no more digging through spreadsheets
              to figure out where things stand. From the boardroom to the boundary wall, everyone
              works off the same source of truth.
            </p>
          </div>

          <Roles roles={ROLES} />
        </section>

        {/* PRICING */}
        <section className="pricing-wrap" id="pricing">
          <div className="pricing-card">
            <div className="pricing-info" data-reveal style={{ ["--rise" as string]: "70px" }}>
              <h2>Affordable pricing.<br />Easy scaling.</h2>
              <p>
                One construction ERP to run every site, every approval, and every rupee.
                Start small, expand as you grow — transparent pricing, no hidden costs.
              </p>
              <ul className="pricing-bullets">
                <li>All four core modules included</li>
                <li>Unlimited users on every plan</li>
                <li>Live onboarding &amp; migration support</li>
              </ul>
            </div>
            <div className="pricing-stack">
              {PRICING.map((p, i) => (
                <article
                  className="pricing-mini"
                  key={p.tag}
                  data-reveal
                  style={{
                    ["--rise" as string]: `${[80, 130, 100][i % 3]}px`,
                    ["--delay" as string]: `${i * 130}ms`,
                  }}
                >
                  <span className="pricing-pill">{p.tag}</span>
                  <div className="pricing-mini-head">
                    <span className="amt">{p.price}</span>
                    <span className="per">/{p.period.includes("month") ? "month" : "custom"}</span>
                  </div>
                  <p className="pricing-mini-desc">{p.desc}</p>
                  <ul>
                    {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                  </ul>
                  <a href="#contact" className="pricing-mini-cta">Start now →</a>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="site-foot" id="contact">
        <div className="foot-products">
          <div className="foot-products-copy">
            <h3>Explore our other products</h3>
            <p>Beyond construction ERP software, the QuikInfra suite covers the full operations stack — from procurement to people to AI.</p>
            <a href="https://quikinfra.com" className="btn btn-solid foot-products-cta">View all Products →</a>
          </div>
          <div className="foot-orbit" aria-hidden="true">
            <img src="/marketing/Frame%202131329809.png" alt="" />
          </div>
        </div>

        <div className="foot-grid">
          <div className="foot-brand">
            <div className="foot-logo">
              <img src="/marketing/Quikinfra%20light%20Logo.png" alt="QuikInfra" />
            </div>
            <p>© Copyright 2026 QuikInfra, Inc. All rights reserved.</p>
          </div>
          <div className="foot-col">
            <h4>Useful links</h4>
            <ul>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Privacy Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="foot-watermark-row">
          <img src="/marketing/Quikinfra%20watermark.png" alt="" aria-hidden="true" />
        </div>
      </footer>
      <BackToTop />
      <RevealRoot />
    </div>
  );
}
