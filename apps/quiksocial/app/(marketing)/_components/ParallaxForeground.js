import styles from "./ParallaxForeground.module.css";
import RevealBlock from "./RevealBlock";

/**
 * Foreground over the fixed BG image. Contains only the pin-scrubbed
 * RevealBlock — FeaturesScroll picks up immediately after.
 */
export default function ParallaxForeground() {
  return (
    <section className={styles.fg} aria-label="Section copy">
      <RevealBlock headline="An AI that thinks in hooks — generating, rewriting, and scoring every line before it ships. Trained on what actually performs, not just what sounds good, it helps you create high-converting content engineered to capture attention, drive engagement, and make every word work harder." />
    </section>
  );
}
