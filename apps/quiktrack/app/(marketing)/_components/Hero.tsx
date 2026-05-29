export default function Hero() {
  return (
    <section className="hero-card surface-card hero-bold">
      <div className="hero-bold-eyebrow">JIRA ALTERNATIVE · BUILT FOR INDIA</div>

      <h1 className="hero-bold-title">
        <span className="hero-bold-line">
          The <span className="accent-primary serif-bold">Jira Alternative</span> Built
        </span>
        <span className="hero-bold-line">
          for Indian Engineering Teams
        </span>
      </h1>

      <div className="hero-bold-divider" />

      <div className="hero-bold-row">
        <p className="hero-bold-desc">
          Sprint boards, backlog, bug tracking, custom workflows — everything Jira
          does, at 1/10th the price. INR pricing. No Atlassian add-ons.{" "}
          <strong>A 50-person team saves ₹3.5L a year. Without losing a feature.</strong>
        </p>
        <a href="#start" className="btn-bold-cta">
          START FREE TRIAL
        </a>
      </div>

      <div className="hero-bold-image">
        <img src="/marketing/HEro BG.png" alt="QuikTrack sprint board — Jira alternative India" />
      </div>
    </section>
  );
}
