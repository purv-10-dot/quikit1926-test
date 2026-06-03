"use client";

import { useState } from "react";
import styles from "./FAQ.module.css";

const FAQS = [
  {
    q: "How is QuikSocial different from other scheduling tools?",
    a: "QuikSocial replaces three separate tools — copywriting, scheduling, and analytics — with one AI-aware workspace. Every post is generated, scored, scheduled, and measured in a single flow, so your team stops switching tabs and starts shipping.",
  },
  {
    q: "Which platforms does QuikSocial support?",
    a: "Instagram, LinkedIn, Facebook, X / Twitter, TikTok, YouTube, and Pinterest — with native previews, channel-specific copy variants, and platform-tuned scheduling for each.",
  },
  {
    q: "How accurate is the AI hook scoring?",
    a: "The model is fine-tuned on millions of real-world high-performing posts in your niche. Hook scores correlate with first-three-second retention at r ≈ 0.74 in our user benchmarks. Underperforming hooks get three rewrite suggestions, instantly.",
  },
  {
    q: "Can I collaborate with my team?",
    a: "Yes — approvals, comments, brand presets, and role-based access are built in. Agencies can spin up unlimited client workspaces from a single seat, and clients get review-only access without an extra license.",
  },
  {
    q: "Is there a free trial?",
    a: "Every plan starts with a 14-day full-access trial — no credit card required. You can publish, schedule, and run analytics on real accounts during the trial; nothing is locked behind the paywall.",
  },
  {
    q: "How does pricing work?",
    a: "Three tiers — Creator, Team, and Agency. Pricing scales with the number of brand workspaces, not seats, so a 12-person team pays the same as a 3-person team if they manage the same number of brands. No per-post limits on any plan.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section className={styles.section} aria-label="Frequently asked questions" data-reveal>
      <header className={styles.head}>
        <h2 className={styles.title}>
          Questions, <em>answered</em>.
        </h2>
        <p className={styles.body}>
          Everything teams ask before switching. If there's something
          missing, our support inbox replies within one business day.
        </p>
      </header>

      <ul className={styles.list}>
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          // Six rows with varied rise + staggered delay → cascading entrance
          const rises  = [60, 90, 70, 110, 80, 100];
          const delays = [0,  0.07, 0.14, 0.21, 0.28, 0.35];
          return (
            <li
              key={i}
              className={`${styles.item} ${isOpen ? styles.open : ""}`}
              data-reveal
              style={{ "--rise": `${rises[i]}px`, "--delay": `${delays[i]}s` }}
            >
              <button
                type="button"
                className={styles.q}
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
              >
                <span className={styles.qText}>{item.q}</span>
                <span className={styles.icon} aria-hidden="true">
                  <span className={styles.iconH} />
                  <span className={styles.iconV} />
                </span>
              </button>
              <div className={styles.answer}>
                <p>{item.a}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
