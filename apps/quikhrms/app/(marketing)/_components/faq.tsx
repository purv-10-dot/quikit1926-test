"use client";

import { useEffect, useRef, useState } from "react";

const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "payroll", label: "Payroll" },
  { key: "setup", label: "Setup" },
  { key: "security", label: "Security" },
  { key: "self", label: "Self-service" },
  { key: "integrations", label: "Integrations" },
];

const QUESTIONS = [
  {
    cat: "payroll",
    q: "Is QuikHRMS compliant with Indian statutory requirements?",
    a: "Yes — PF, ESI, Professional Tax and TDS with overrides, plus TDS challans, tax filings and Form-16 generation, all built for Indian regulations.",
  },
  {
    cat: "payroll",
    q: "How does a monthly payroll run work?",
    a: "Salary structures and templates drive each run — review, approve and publish payslips, with statutory deductions, one-time pay, loans and full-and-final settlement handled automatically.",
  },
  {
    cat: "setup",
    q: "How long does onboarding and data migration take?",
    a: "Most teams are live within days. Bulk employee import, guided onboarding workflows and document templates move your whole workforce over without spreadsheets.",
  },
  {
    cat: "setup",
    q: "Can we import our existing employee data?",
    a: "Absolutely — bulk import brings in employees, profiles and documents in one go, and the document vault keeps everything organised per employee from day one.",
  },
  {
    cat: "security",
    q: "How is our data kept secure and isolated?",
    a: "QuikHRMS is multi-tenant with strict per-organisation data isolation, email + 2FA login, account lockout and a full audit trail of every change.",
  },
  {
    cat: "security",
    q: "Can we set custom roles and permissions?",
    a: "Yes — granular role-based access control with custom roles, plus self / team / org data scoping on every module so people see exactly the right data.",
  },
  {
    cat: "self",
    q: "Can employees and managers self-serve?",
    a: "Every role gets a personalised dashboard — employees check in, apply for leave, download payslips and raise tickets, while managers handle approvals and delegation directly.",
  },
  {
    cat: "integrations",
    q: "Does it integrate with our existing tools?",
    a: "Yes. Webhooks and no-code workflow actions push events to external systems, and scheduled jobs keep everything in sync automatically.",
  },
];

function FaqItem({
  q,
  a,
  open,
  onToggle,
  hidden,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
  hidden: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // max-height animation needs the rendered scrollHeight, so it's imperative.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.style.maxHeight = open ? body.scrollHeight + "px" : "";
  }, [open]);

  return (
    <div className={`faq-item${open ? " open" : ""}`} style={hidden ? { display: "none" } : undefined}>
      <button className="faq-q" onClick={onToggle}>
        <span className="faq-t">{q}</span>
        <span className="faq-toggle" aria-hidden="true">
          <i />
          <i />
        </span>
      </button>
      <div className="faq-a" ref={bodyRef}>
        <p>{a}</p>
      </div>
    </div>
  );
}

export function Faq() {
  const [cat, setCat] = useState("all");
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const anyVisible = QUESTIONS.some((item) => cat === "all" || item.cat === cat);

  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">FAQ</span>
          <h2>
            Questions, <span className="serif-italic gradient-text">answered</span>
          </h2>
          <p>Browse by topic — everything you need before bringing QuikHRMS to your team.</p>
        </div>

        <div className="faq2 reveal" data-d="1">
          <div className="faq2-cats">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`faq2-cat${cat === c.key ? " active" : ""}`}
                onClick={() => setCat(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="faq2-list">
            {QUESTIONS.map((item, i) => (
              <FaqItem
                key={item.q}
                q={item.q}
                a={item.a}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? null : i)}
                hidden={cat !== "all" && item.cat !== cat}
              />
            ))}
          </div>
          {!anyVisible && <p className="faq2-empty">No questions match — try a different topic.</p>}
          <p className="faq2-foot">
            Still have questions? <a href="#cta">Talk to our team →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
