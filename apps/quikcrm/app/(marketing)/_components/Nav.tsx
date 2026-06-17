import { LOGIN_HREF } from "./login-href";

/**
 * Public marketing nav for QuikCRM (crm.quikit.ai/).
 *
 * Renders the same `.navbar > .nav` markup as the source landing so the
 * auto-hide scroll routine in landing-client.tsx keeps targeting `.navbar`.
 * The Login button uses the platform SSO handoff (buildLoginUrl → /dashboard),
 * matching the QuikScale / QuikTrack Nav pattern. The other menu links remain
 * placeholder anchors, as in the source design.
 */
export default function Nav() {
  return (
    <div className="navbar">
      <nav className="nav">
        <a href="/" className="nav-logo" aria-label="QuikCRM">
          <img src="/marketing/CRM%20logo.png" alt="QuikCRM" />
        </a>
        <div className="menu">
          <a href="#">Product</a>
          <a href="#">Solutions</a>
          <a href="#">Agencies</a>
          <a href="#">Pricing</a>
          <a href="#">Resources</a>
        </div>
        <a href={LOGIN_HREF} className="btn">
          Login <span className="dot">→</span>
        </a>
      </nav>
    </div>
  );
}
