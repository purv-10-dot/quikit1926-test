import { buildLoginUrl } from "@quikit/shared/login-url";

const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCRMEXPRESS_URL ?? "http://localhost:3017",
  postLoginPath: "/dashboard",
});

export default function Hero() {
  return (
    <header className="hero wrap" data-reveal>
      <span className="eyebrow">Part of the Quikit suite</span>
      <h1>Every lead worked. Every call logged.</h1>
      <p className="lede">
        QuikCRMExpress runs the whole sales motion in one place — capture and
        score leads, move deals through the pipeline, quote and close, and dial
        straight from the record with the outcome written back automatically.
      </p>
      <div className="hero-actions">
        <a href={LOGIN_HREF} className="btn btn-dark btn-lg">
          Open QuikCRMExpress
        </a>
        <a href="#features" className="btn btn-ghost btn-lg">
          See what it does
        </a>
      </div>

      <div className="hero-stats">
        <div className="hero-stat">
          <strong>One login</strong>
          <span>Shared QuikIT identity across every app</span>
        </div>
        <div className="hero-stat">
          <strong>Click to call</strong>
          <span>Disposition written back to the lead</span>
        </div>
        <div className="hero-stat">
          <strong>Quote to order</strong>
          <span>No re-keying between the two</span>
        </div>
      </div>
    </header>
  );
}
