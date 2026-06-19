const ITEMS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    ),
    title: "Multi-tenant SaaS",
    desc: "Strict per-organisation data isolation across every module.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M12 1 3 5v6c0 5 3.8 9 9 10 5.2-1 9-5 9-10V5l-9-4Zm0 6a2.5 2.5 0 0 1 1 4.8V14a1 1 0 0 1-2 0v-2.2A2.5 2.5 0 0 1 12 7Z"
          fill="currentColor"
        />
      </svg>
    ),
    title: "RBAC & data scoping",
    desc: "Custom roles with self / team / org scoping on every module.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M17 8V7a5 5 0 0 0-10 0v1H5v14h14V8h-2Zm-8 0V7a3 3 0 0 1 6 0v1H9Z"
          fill="currentColor"
        />
      </svg>
    ),
    title: "2FA & lockout",
    desc: "Email + 2FA login with account lockout protection.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Z"
          fill="currentColor"
        />
      </svg>
    ),
    title: "Full audit trail",
    desc: "Every change logged — plus invitations & lifecycle management.",
  },
];

export function Security() {
  return (
    <section className="section" id="security">
      <div className="wrap">
        <div className="security">
          <div className="mesh">
            <span className="blob b1" />
            <span className="blob b2" />
          </div>
          <div
            className="section-head reveal"
            style={{ textAlign: "left", margin: 0, maxWidth: "640px" }}
          >
            <span className="eyebrow">Security &amp; Administration</span>
            <h2>
              Enterprise-grade control &amp;{" "}
              <span className="serif-italic gradient-text">isolation</span>
            </h2>
            <p>
              Strict per-organisation data isolation, granular permissions and a full audit trail —
              so the right people see exactly the right data.
            </p>
          </div>
          <div className="sec-grid">
            {ITEMS.map((item, i) => (
              <div className="sec-item reveal" key={item.title} {...(i ? { "data-d": i } : {})}>
                <div className="s-ico">{item.icon}</div>
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
