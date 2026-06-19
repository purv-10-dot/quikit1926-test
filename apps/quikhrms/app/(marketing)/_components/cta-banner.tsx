import { LOGIN_HREF } from "./login-href";

export function CtaBanner() {
  return (
    <section className="section" id="cta">
      <div className="wrap">
        <div className="cta-banner">
          <div className="mesh">
            <span className="blob b1" />
            <span className="blob b2" />
            <span className="blob b3" />
          </div>
          <div className="grid-overlay" />
          <div className="wrap-inner reveal">
            <h2>
              Ready to retire the <span className="serif-italic gradient-text">spreadsheets?</span>
            </h2>
            <p>
              See how QuikHRMS unifies your entire employee lifecycle in one secure platform. Book
              a personalised demo with our team.
            </p>
            <div className="hero-cta">
              <a href={LOGIN_HREF} className="btn btn-primary btn-lg">
                Get started
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
