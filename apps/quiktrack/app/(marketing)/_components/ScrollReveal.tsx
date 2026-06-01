"use client";

import { useEffect } from "react";

const CHILD_SELECTORS = [
  ".section-header",
  ".outcome-card",
  ".why-card",
  ".workflow-card",
  ".pillar-card",
  ".feature-card",
  ".who-tile",
  ".price-card",
  ".cmp-wrap",
  ".cmp-table tbody tr",
  ".coach-copy",
  ".coach-visual",
  ".client-row",
  ".hero-bold-title",
  ".hero-bold-row",
  ".hero-bold-image",
  ".footer-cta",
].join(",");

export default function ScrollReveal() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("main.stage > section");
    sections.forEach((el) => el.classList.add("reveal"));

    // Tag every child element worth revealing and assign a staggered delay
    document.querySelectorAll<HTMLElement>(CHILD_SELECTORS).forEach((el) => {
      el.classList.add("reveal-item");
    });

    // Stagger children within their parent section
    sections.forEach((section) => {
      const children = section.querySelectorAll<HTMLElement>(".reveal-item");
      children.forEach((child, i) => {
        child.style.transitionDelay = `${Math.min(i * 70, 420)}ms`;
      });
    });

    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(".reveal, .reveal-item").forEach((el) =>
        el.classList.add("is-visible")
      );
      return;
    }

    const reveal = (entry: IntersectionObserverEntry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach(reveal),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    sections.forEach((el) => io.observe(el));
    document.querySelectorAll<HTMLElement>(".reveal-item").forEach((el) =>
      io.observe(el)
    );

    return () => io.disconnect();
  }, []);

  return null;
}
