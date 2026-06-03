export default function Hero() {
  return (
    <section className="hero-card surface-card hero-bold">
<h1 className="hero-bold-title">
        <span className="hero-bold-line">
          The Engineering Workspace That
        </span>
        <span className="hero-bold-line">
          <span className="accent-primary serif-bold">Ships Product Faster.</span>
        </span>
      </h1>

      <div className="hero-bold-divider" />

      <div className="hero-bold-row">
        <p className="hero-bold-desc">
          Sprint boards, backlog, issue tracking, and custom workflows — all connected
          in one fast, intelligent workspace.{" "}
          <strong>Real-time visibility from sprint kickoff to release. No add-ons. No paywalled features.</strong>
        </p>
        <a href="#start" className="btn-bold-cta">
          START FREE TRIAL
        </a>
      </div>

      <div className="hero-bold-image">
        <img src="/HEro BG.png" alt="QuikTrack engineering workspace — sprint boards and issue tracking" />
      </div>
    </section>
  );
}
