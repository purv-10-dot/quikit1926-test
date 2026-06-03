import styles from "./Testimonials.module.css";

const QUOTES = [
  {
    quote:
      "We replaced four separate tools with QuikSocial in a week. Our content team now ships twice the volume with half the meetings — the AI rewrites alone paid for the year.",
    name: "Maya Chen",
    role: "Head of Social, Northbound",
  },
  {
    quote:
      "The hook scoring is uncanny. It surfaced two openers we would have killed in review that ended up being our top-performing posts of the quarter.",
    name: "Daniel Okafor",
    role: "Creator, 480K followers",
  },
  {
    quote:
      "Approval cycles used to take three days. Now drafts land, get reviewed, and ship in the same afternoon. The dashboard turned our weekly stand-up into a 15-minute glance.",
    name: "Priya Ramaswamy",
    role: "Founder, Threadlight Studio",
  },
];

export default function Testimonials() {
  return (
    <section className={styles.section} aria-label="Testimonials" data-reveal>
      <header className={styles.head}>
        <h2 className={styles.title}>
          Loved by <em>creators</em> and teams.
        </h2>
        <p className={styles.body}>
          Built with feedback from thousands of operators who ship social
          content for a living — not in theory, in the trenches.
        </p>
      </header>

      <ul className={styles.grid}>
        {QUOTES.map((q, i) => {
          const rises  = [80, 120, 90];
          const delays = [0,  0.12, 0.24];
          return (
            <li
              key={i}
              className={styles.card}
              data-reveal
              style={{ "--rise": `${rises[i]}px`, "--delay": `${delays[i]}s` }}
            >
              <span aria-hidden="true" className={styles.glyph}>“</span>
              <blockquote className={styles.quote}>{q.quote}</blockquote>
              <footer className={styles.author}>
                <span className={styles.name}>{q.name}</span>
                <span className={styles.role}>{q.role}</span>
              </footer>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
