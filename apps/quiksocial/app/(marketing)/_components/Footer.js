import styles from "./Footer.module.css";

const LINKS = [
  { label: "Terms of Service", href: "#terms"   },
  { label: "Privacy Policy",   href: "#privacy" },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer id="contact" className={styles.footer} aria-label="Footer" data-reveal>
      {/* Products panel */}
      <div className={styles.products}>
        <div className={styles.copy}>
          <h3 className={styles.headline}>Explore our other products</h3>
          <p className={styles.desc}>
            Beyond social media management, the QuikSocial suite covers
            the full content stack — from ideation to scheduling to
            analytics and AI-powered creative.
          </p>
          <a href="#products" className={styles.cta}>
            View all Products →
          </a>
        </div>
        <div className={styles.orbit} aria-hidden="true">
          <img src="/QuikSocial%20Footer.png" alt="" />
        </div>
      </div>

      {/* Brand + links grid */}
      <div className={styles.grid}>
        <div className={styles.brand}>
          <a href="#" className={styles.logo} aria-label="QuikSocial">
            <img
              src="/Quiksocial%20Logo%20Dark.png"
              alt="QuikSocial"
              className={styles.logoImg}
            />
          </a>
          <p className={styles.copyline}>
            © Copyright {year} QuikSocial, Inc. All rights reserved.
          </p>
        </div>

        <div className={styles.col}>
          <h4 className={styles.colHead}>Useful links</h4>
          <ul className={styles.colList}>
            {LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom watermark — spans the full footer width */}
      <div className={styles.watermark} aria-hidden="true">
        <img src="/Quiksocialfooter.png" alt="" />
      </div>
    </footer>
  );
}
