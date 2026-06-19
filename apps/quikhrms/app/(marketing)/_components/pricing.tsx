"use client";

import { useEffect, useRef, useState } from "react";

interface Plan {
  name: string;
  desc: string;
  monthly?: number;
  annual?: number;
  custom?: boolean;
  cta: string;
  ctaClass: string;
  popular?: boolean;
  feats: string[];
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    desc: "Core HR for small, growing teams.",
    monthly: 49,
    annual: 39,
    cta: "Start free trial",
    ctaClass: "btn btn-ghost p-cta",
    feats: [
      "Core workspace & dashboards",
      "Employee directory & org chart",
      "Time, attendance & leave",
      "Self-service & help desk",
      "Email + 2FA security",
    ],
  },
  {
    name: "Growth",
    desc: "The full suite for scaling companies.",
    monthly: 99,
    annual: 79,
    cta: "Book a demo",
    ctaClass: "btn btn-primary p-cta",
    popular: true,
    feats: [
      "Everything in Starter, plus:",
      "India-ready payroll & payslips",
      "Performance, OKRs & appraisals",
      "Recruitment (ATS) & AI matching",
      "No-code automation & webhooks",
      "Expenses, claims & analytics",
    ],
  },
  {
    name: "Enterprise",
    desc: "Advanced control for large orgs.",
    custom: true,
    cta: "Contact sales",
    ctaClass: "btn btn-ghost p-cta",
    feats: [
      "Everything in Growth, plus:",
      "Granular RBAC & custom roles",
      "Multi-entity & data residency",
      "Dedicated success manager",
      "Priority SLA & audit support",
      "Custom integrations",
    ],
  },
];

/** Price that cross-fades when the billing period flips. */
function Amount({ monthly, annual, isAnnual }: { monthly: number; annual: number; isAnnual: boolean }) {
  const [shown, setShown] = useState(monthly);
  const [faded, setFaded] = useState(false);
  const target = isAnnual ? annual : monthly;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setFaded(true);
    const id = setTimeout(() => {
      setShown(target);
      setFaded(false);
    }, 150);
    return () => clearTimeout(id);
  }, [target]);

  return (
    <span className="amt" style={{ opacity: faded ? 0 : 1, transition: "opacity .15s" }}>
      {shown}
    </span>
  );
}

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Pricing</span>
          <h2>
            Simple, <span className="serif-italic gradient-text">per-employee</span> pricing
          </h2>
          <p>
            Pay only for active employees. No setup fees, no per-module charges — switch plans
            anytime.
          </p>
          <div className={`bill-toggle reveal${annual ? " annual" : ""}`} data-d="1">
            <span className={`bt-label${annual ? "" : " active"}`}>Monthly</span>
            <button
              className="bt-switch"
              onClick={() => setAnnual((a) => !a)}
              aria-label="Toggle billing period"
            >
              <span className="bt-knob" />
            </button>
            <span className={`bt-label${annual ? " active" : ""}`}>
              Annual <em>save 20%</em>
            </span>
          </div>
        </div>

        <div className="pgrid">
          {PLANS.map((plan, i) => (
            <article
              key={plan.name}
              className={`pcard${plan.popular ? " popular" : ""} reveal`}
              {...(i ? { "data-d": i } : {})}
            >
              {plan.popular && <span className="p-badge">Most popular</span>}
              <h3>{plan.name}</h3>
              <p className="p-desc">{plan.desc}</p>
              <div className="p-price">
                {plan.custom ? (
                  <span className="amt amt-custom">Custom</span>
                ) : (
                  <>
                    <span className="cur">₹</span>
                    <Amount monthly={plan.monthly!} annual={plan.annual!} isAnnual={annual} />
                    <span className="per">/employee/mo</span>
                  </>
                )}
              </div>
              <a href="#cta" className={plan.ctaClass}>
                {plan.cta}
              </a>
              <ul className="p-feats">
                {plan.feats.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
