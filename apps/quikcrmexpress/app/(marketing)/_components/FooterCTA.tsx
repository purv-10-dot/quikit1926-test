import { buildLoginUrl } from "@quikit/shared/login-url";

const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCRMEXPRESS_URL ?? "http://localhost:3017",
  postLoginPath: "/dashboard",
});

// Launcher origin — "See all apps" lands on the QuikIT app grid, the same
// destination the in-app AppSwitcher uses.
const LAUNCHER_HREF = `${(
  process.env.NEXT_PUBLIC_QUIKIT_URL ?? "http://localhost:3000"
).replace(/\/$/, "")}/apps`;

export default function FooterCTA() {
  return (
    <section className="footer-cta" id="start">
      <div className="wrap">
        <div data-reveal>
          <h2>Ready when your team is.</h2>
          <p>
            QuikCRMExpress is enabled per organisation by a QuikIT admin. If
            your organisation already has it, sign in and it will be waiting on
            your app grid.
          </p>
          <a href={LOGIN_HREF} className="btn btn-dark btn-lg">
            Sign in to QuikCRMExpress
          </a>
        </div>

        <div className="footer-meta">
          <span>© {new Date().getFullYear()} Quikit</span>
          <a href={LAUNCHER_HREF}>All apps</a>
          <a href="https://quikit.in">quikit.in</a>
        </div>
      </div>
    </section>
  );
}
