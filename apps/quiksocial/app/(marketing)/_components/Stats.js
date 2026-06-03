import styles from "./Stats.module.css";
import ScrambleCount from "./ScrambleCount";

const STATS = [
  // value: numeric portion (string preserves zero-pad), suffix: trailing glyph
  { value: "10", suffix: "×", rest: "Faster Content Production" },
  { value: "95", suffix: "%", rest: "Less Manual Scheduling" },
  { value: "03", suffix: "X", rest: "Higher Team Productivity" },
  { value: "50", suffix: "+", rest: "AI-Powered Workflows" },
];

export default function Stats() {
  return (
    <section className={styles.section} aria-label="Key stats" data-reveal>
      <div className={styles.grid}>
        {STATS.map((s, i) => {
          // Stagger: each card gets a slightly different rise + delay so
          // they cascade in rather than move in lockstep.
          const rises  = [80, 110, 90, 120];
          const delays = [0,  0.08, 0.16, 0.24];
          return (
            <article
              key={i}
              className={styles.card}
              data-reveal
              style={{ "--rise": `${rises[i]}px`, "--delay": `${delays[i]}s` }}
            >
              <em className={styles.lead}>
                <ScrambleCount value={s.value} suffix={s.suffix} />
              </em>
              <span className={styles.rest}>{s.rest}</span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
