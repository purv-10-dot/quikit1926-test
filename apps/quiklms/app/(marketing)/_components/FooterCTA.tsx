import { ArrowRight } from './icons';

/**
 * Closing CTA banner. Sits above the footer proper (see ./Footer).
 */
export default function FooterCTA() {
  return (
    <section className="section" id="cta">
      <div className="wrap">
        <div className="cta-banner">
          <div className="mesh" aria-hidden="true">
            <span className="blob b1" />
            <span className="blob b2" />
            <span className="blob b3" />
          </div>
          <div className="grid-overlay" aria-hidden="true" />
          <div className="wrap-inner reveal">
            <h2>
              Ready when <span className="serif-italic gradient-text">you</span> are
            </h2>
            <p>
              Sign in with your Quikit account. If your organisation already uses another Quikit app,
              you are one click away.
            </p>
            <div className="hero-cta">
              <a href="/login" className="btn btn-primary btn-lg">
                Sign in to QuikLMS
                <ArrowRight />
              </a>
              <a href="/verify-certificate" className="btn btn-ghost btn-lg">
                Verify a certificate
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
