const LOGOS = [
  "Nimbus",
  "Vertex Labs",
  "Lumina",
  "Northwind",
  "Quanta",
  "Helios",
  "Meridian",
  "Orbit Co.",
];

/** Infinite logo marquee — the track is doubled so the CSS loop is seamless. */
export function TrustMarquee() {
  return (
    <section className="trust">
      <div className="wrap">
        <p>Trusted by fast-growing teams across India</p>
        <div className="marquee">
          <div className="marquee-track">
            {[...LOGOS, ...LOGOS].map((name, i) => (
              <span key={`${name}-${i}`}>{name}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
