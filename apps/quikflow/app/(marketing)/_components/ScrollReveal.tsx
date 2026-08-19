"use client";

import { useEffect } from "react";

const CHILD_SELECTORS = [
  ".section-header",
  ".feature-card",
  ".hero-eyebrow",
  ".hero-title",
  ".hero-row",
  ".hero-image",
  ".footer-cta",
].join(",");

/**
 * Fade-in-on-scroll for the QuikFlow landing page — mirrors
 * apps/quikscale/app/(marketing)/_components/ScrollReveal.tsx, trimmed to
 * the class names this page actually uses.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>("main.stage > section");
    sections.forEach((el) => el.classList.add("reveal"));

    document.querySelectorAll<HTMLElement>(CHILD_SELECTORS).forEach((el) => {
      el.classList.add("reveal-item");
    });

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
