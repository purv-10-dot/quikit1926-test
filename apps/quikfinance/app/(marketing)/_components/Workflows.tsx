export default function Workflows() {
  return (
    <section id="workflows" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">The Product</span>
        <h2 className="section-title">
          <span className="serif">Everything your finance team needs.</span>{" "}
          <span className="serif-bold">All in one workspace.</span>
        </h2>
        <p className="section-lede">
          Invoicing, banking, GST, inventory, and reports — connected in a single, fast,
          intuitive workspace.
        </p>
      </header>

      <div className="workflows-grid">
        {/* Row 1 — 2 wide cards */}
        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Invoicing &amp; Receivables</h3>
            <p className="workflow-body">
              Quotations → sales orders → invoices → payments, with payment links,
              automated reminders, and live receivables aging. Get paid faster, chase less.
            </p>
          </div>
          <div className="workflow-visual wf-opsp">
            <div className="wf-tabs">
              <span className="wf-tab active">Invoices</span>
              <span className="wf-tab">Quotes</span>
              <span className="wf-tab">Payments</span>
              <span className="wf-tab">Aging</span>
            </div>
            <div className="wf-opsp-grid">
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Outstanding</span>
                <span className="wf-opsp-value">₹24,120</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Overdue</span>
                <span className="wf-opsp-value">3 invoices</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">This month</span>
                <span className="wf-opsp-value">₹1,43,800</span>
              </div>
              <div className="wf-opsp-cell">
                <span className="wf-opsp-label">Collected</span>
                <span className="wf-opsp-value">92%</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card workflow-wide">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Bills &amp; Payments</h3>
            <p className="workflow-body">
              Nothing missed, nothing paid twice. Every bill gets an owner, a due date, and
              an approval trail — captured with full purchase order → GRN → bill matching.
            </p>
          </div>
          <div className="workflow-visual wf-ownership">
            <div className="wf-ownership-head">
              <span>Vendor</span>
              <span>Bill</span>
              <span>Approval</span>
              <span>Due</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar">AW</span>
              <span>Office rent — Aug</span>
              <span className="wf-bar"><span style={{ width: "82%" }} /></span>
              <span className="wf-due">Sep 30</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-2">TC</span>
              <span>AWS invoice</span>
              <span className="wf-bar"><span style={{ width: "50%" }} /></span>
              <span className="wf-due">Oct 15</span>
            </div>
            <div className="wf-ownership-row">
              <span className="wf-avatar wf-avatar-3">SR</span>
              <span>Courier — Sep</span>
              <span className="wf-bar"><span style={{ width: "95%" }} /></span>
              <span className="wf-due">Sep 18</span>
            </div>
          </div>
        </article>

        {/* Row 2 — 3 narrower cards */}
        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Reports &amp; Insights</h3>
            <p className="workflow-body">
              P&amp;L, balance sheet, cash flow, and aging — live, accurate, and exportable.
              No add-on, no overnight batch.
            </p>
          </div>
          <div className="workflow-visual wf-progress">
            <div className="wf-progress-head">
              <span>Cash flow</span>
              <span className="wf-progress-pct">+18</span>
            </div>
            <div className="wf-bars">
              {[78, 92, 65, 88, 95, 72, 90].map((h, i) => (
                <span
                  key={i}
                  className="wf-bar-vertical"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <span className="wf-progress-meta">+18% vs last month</span>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">Banking &amp; Reconciliation</h3>
            <p className="workflow-body">
              Auto-match bank feeds with rules and clear unreconciled lines in minutes —
              not days. Every rupee accounted for.
            </p>
          </div>
          <div className="workflow-visual wf-rhythm">
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-people" />
              <div>
                <span className="wf-rhythm-title">Imported</span>
                <span className="wf-rhythm-time">142 bank lines</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-execution" />
              <div>
                <span className="wf-rhythm-title">Auto-matched</span>
                <span className="wf-rhythm-time">128 by rules</span>
              </div>
            </div>
            <div className="wf-rhythm-row">
              <span className="wf-dot pillar-strategy" />
              <div>
                <span className="wf-rhythm-title">Reconciled</span>
                <span className="wf-rhythm-time">14 left to review</span>
              </div>
            </div>
          </div>
        </article>

        <article className="workflow-card">
          <div className="workflow-copy">
            <h3 className="workflow-title serif-bold">GST &amp; Compliance</h3>
            <p className="workflow-body">
              GSTR-1, 3B, e-invoicing, and ITC reconciliation — generated from your books
              and ready before the deadline.
            </p>
          </div>
          <div className="workflow-visual wf-review">
            <div className="wf-review-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" className="wf-ring-bg" />
                <circle cx="50" cy="50" r="42" className="wf-ring-fg" />
              </svg>
              <div className="wf-ring-label">
                <span className="wf-ring-value">3B</span>
                <span className="wf-ring-text">Ready</span>
              </div>
            </div>
            <div className="wf-review-meta">
              <span className="wf-review-chip">
                <span className="wf-dot pillar-execution" />
                Files 20th
              </span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
