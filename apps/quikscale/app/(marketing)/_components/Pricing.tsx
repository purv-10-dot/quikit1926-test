const tiers = [
  {
    name: "Team",
    size: "Up to 10 users",
    price: "$99",
    suffix: "/ mo",
    blurb: "For leadership teams running their first Scaling Up cycle.",
    features: ["Full OPSP builder", "KPI scorecard + Rocks", "Daily / weekly rhythms", "Email support"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Company",
    size: "Up to 50 users",
    price: "$349",
    suffix: "/ mo",
    blurb: "For companies cascading goals across departments.",
    features: ["Everything in Team", "Top-down cascade", "Monthly + quarterly rhythms", "Coach seat included", "Slack + MS Teams"],
    cta: "Book a demo",
    highlight: true,
  },
  {
    name: "Enterprise",
    size: "Unlimited users",
    price: "Custom",
    suffix: "",
    blurb: "For multi-entity groups and certified coach practices.",
    features: ["Everything in Company", "Multi-company portfolio", "SSO + audit logs", "Dedicated success lead", "Coach partner share"],
    cta: "Talk to sales",
    highlight: false,
  },
] as const;

export default function Pricing() {
  return (
    <section id="pricing" className="surface-card section-card">
      <header className="section-header">
        <span className="section-eyebrow">Pricing</span>
        <h2 className="section-title">
          <span className="serif">Priced by company size,</span>{" "}
          <span className="serif-bold">not by feature gates.</span>
        </h2>
        <p className="section-lede">
          Every plan ships with the full four-pillar framework. You don&apos;t pay extra
          to track Cash.
        </p>
      </header>

      <div className="pricing-grid">
        {tiers.map((t) => (
          <article key={t.name} className={`price-card${t.highlight ? " price-card-hi" : ""}`}>
            {t.highlight && <span className="price-badge">Most popular</span>}
            <header className="price-head">
              <h3 className="price-name serif-bold">{t.name}</h3>
              <p className="price-size">{t.size}</p>
            </header>
            <div className="price-figure">
              <span className="price-amount serif">{t.price}</span>
              <span className="price-suffix">{t.suffix}</span>
            </div>
            <p className="price-blurb">{t.blurb}</p>
            <ul className="price-features">
              {t.features.map((f) => (
                <li key={f}>
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <a href="#start" className={`btn ${t.highlight ? "btn-dark" : "btn-ghost"} btn-lg price-cta`}>
              {t.cta}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
