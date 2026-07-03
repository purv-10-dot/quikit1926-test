/**
 * Public marketing nav for quikfinance (localhost:3013/).
 *
 * The Login button points at this app's `/login` stub, which is public and
 * auto-triggers the central QuikIT SSO (signIn("quikit")) with a callbackUrl
 * back to /dashboard. Keeps all SSO wiring in one place.
 */
export default function Nav() {
  return (
    <nav className="nav site-nav" aria-label="Primary">
      <a href="/" className="logo-link" aria-label="QuikFinance">
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            height: 30,
            width: 30,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: "linear-gradient(135deg,#2d88ff,#1e6fe0)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "-0.04em",
          }}
        >
          QF
        </span>
        <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", color: "#0f172a" }}>
          QuikFinance
        </span>
      </a>
      <span className="nav-spacer" />
      <a href="/login" className="btn btn-dark">
        Login
      </a>
    </nav>
  );
}
