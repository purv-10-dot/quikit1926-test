"use client";

import { useEffect } from "react";
import Nav from "./Nav";
import { LOGIN_HREF } from "./login-href";
import { LANDING_HTML } from "./landing-html";

/**
 * QuikCRM marketing landing — client shell.
 *
 * The markup (LANDING_HTML) and styles (marketing.css) are ported verbatim
 * from the source landing page (the `.navbar` is rendered by <Nav /> instead,
 * so its Login button can use the platform SSO handoff). The scroll-driven
 * effects below are the original vanilla-JS routines adapted to run inside a
 * React effect with a `cancelled` guard so their requestAnimationFrame loops
 * and scroll listeners are torn down on unmount (e.g. client-nav to /dashboard):
 *   1. hero scroll-video scrub + stretching headline + glass parallax
 *   2. image-banner mask/scale reveal
 *   3. back-to-top button (show past 600px, smooth-scroll to top)
 *   4. auto-hide nav on scroll direction
 *   5. sticky horizontal "conversions" scroll + scroll-scrubbed bg video
 */
export default function LandingClient() {
  useEffect(() => {
    let cancelled = false;

    // Reset scroll to top — the scrub timelines assume a 0 starting offset.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    // Wire the hero "Start Free Trial" CTAs to the platform login (Nav's Login
    // button is already wired via the React component). Other CTAs stay as-is.
    document
      .querySelectorAll<HTMLAnchorElement>(".hg-cta .btn:not(.btn-light)")
      .forEach((a) => a.setAttribute("href", LOGIN_HREF));

    // 1) Hero — scroll-video stage + stretching headline + glass parallax
    (function () {
      const scene = document.getElementById("svsScene");
      const video = document.getElementById("svsVideo") as HTMLVideoElement | null;
      if (!scene || !video) return;

      let duration = 0;
      let ready = false;
      let smoothedTime = 0;
      let smoothedProgress = 0;
      const SMOOTH = 0.07;

      function onMeta() {
        if (!video) return;
        duration = isFinite(video.duration) ? video.duration : 0;
        ready = duration > 0;
        try { video.currentTime = 0; } catch (e) {}
        smoothedTime = 0;
        smoothedProgress = 0;
      }
      if (video.readyState >= 1) onMeta();
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("loadeddata", onMeta);
      try { video.pause(); } catch (e) {}

      const heroGlassList = document.querySelectorAll<HTMLElement>(".hero-glass");
      let smoothedScrollY = window.scrollY;
      const heroHeadline = document.getElementById("heroHeadline");
      const heroHeadlineH1 = heroHeadline ? heroHeadline.querySelector("h1") : null;

      function tick() {
        if (cancelled || !scene || !video) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const sceneRect = scene.getBoundingClientRect();
        const scrubEl = scene.querySelector<HTMLElement>(".svs-scrub");
        const figureEl = scene.querySelector<HTMLElement>(".svs-figure");
        const dockEl = scene.querySelector<HTMLElement>(".svs-frame");

        let scrubProgress = 0;
        if (scrubEl) {
          const total = scrubEl.offsetHeight;
          if (total > 0) {
            scrubProgress = Math.min(Math.max(-sceneRect.top / total, 0), 1);
          }
        }

        let dockProgress = 0;
        let figRect: DOMRect | null = null;
        if (figureEl) {
          figRect = figureEl.getBoundingClientRect();
          const range = Math.max(figRect.height, 1);
          dockProgress = 1 - Math.min(Math.max((figRect.top - (vh - range)) / range, 0), 1);
        }

        if (ready) {
          const targetT = scrubProgress * duration;
          smoothedTime += (targetT - smoothedTime) * SMOOTH;
          if (Math.abs(video.currentTime - smoothedTime) > 1 / 120) {
            try { video.currentTime = smoothedTime; } catch (e) {}
          }
        }

        smoothedProgress += (scrubProgress - smoothedProgress) * SMOOTH;

        if (heroHeadlineH1 && heroHeadline) {
          const hp = Math.min(Math.max(scrubProgress / 0.25, 0), 1);
          const stretch = 1 + hp * 1.6;
          let rubberUp = hp > 0.6 ? ((hp - 0.6) / 0.4) * 320 : 0;
          rubberUp = (rubberUp * rubberUp) / 320 + rubberUp * 0.5;
          const opacity = 1 - hp;
          (heroHeadlineH1 as HTMLElement).style.transform =
            "translateY(" + (-rubberUp).toFixed(1) + "px) scaleY(" + stretch.toFixed(3) + ")";
          heroHeadline.style.opacity = opacity.toFixed(3);
          const fillAlpha = Math.max(0, 1 - hp / 0.35);
          const strokeW = Math.min(hp / 0.35, 1) * 1.5;
          (heroHeadlineH1 as HTMLElement).style.color = "rgba(255,255,255," + fillAlpha.toFixed(3) + ")";
          (heroHeadlineH1 as HTMLElement).style.webkitTextStroke = strokeW.toFixed(2) + "px #fff";
        }

        smoothedScrollY += (window.scrollY - smoothedScrollY) * 0.12;
        const extraY = -smoothedScrollY * 0.35;
        for (let c = 0; c < heroGlassList.length; c++) {
          const card = heroGlassList[c];
          card.style.transform = "translate3d(0," + extraY.toFixed(1) + "px, 0)";
          const cardRect = card.getBoundingClientRect();
          const cardEnter = Math.min(Math.max((vh - cardRect.top) / vh, 0), 1.6);
          const inner = card.querySelectorAll<HTMLElement>("[data-parallax]");
          for (let i = 0; i < inner.length; i++) {
            const n = inner[i];
            const rate = parseFloat(n.getAttribute("data-parallax") || "0") || 0;
            let offset = -cardEnter * rate * 50;
            if (offset < -40) offset = -40;
            n.style.transform = "translateY(" + offset.toFixed(1) + "px)";
          }
        }

        const beforeScene = sceneRect.top >= vh;
        let afterFigure = figRect ? figRect.bottom <= 0 : sceneRect.bottom <= 0;
        const bannerEl = document.getElementById("imgBanner");
        if (afterFigure && bannerEl) {
          const br = bannerEl.getBoundingClientRect();
          if (br.bottom > 0 && br.top < vh) afterFigure = false;
        }

        let exitFade = 1;
        if (figRect && figRect.top < 0) {
          const fadeRange = Math.max(figRect.height * 0.4, 1);
          exitFade = Math.max(0, Math.min(1, figRect.bottom / fadeRange));
        }

        if (beforeScene || afterFigure) {
          video.style.opacity = "0";
          video.style.transform = "";
          video.style.clipPath = "";
        } else {
          video.style.opacity = String(exitFade);
          if (dockEl && dockProgress > 0) {
            const dr = dockEl.getBoundingClientRect();
            const lerp = (a: number, b: number) => a + (b - a) * dockProgress;
            const sx = lerp(1, dr.width / vw);
            const sy = lerp(1, dr.height / vh);
            const tx = lerp(0, dr.left + dr.width / 2 - vw / 2);
            const ty = lerp(0, dr.top + dr.height / 2 - vh / 2);
            video.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + sx + "," + sy + ")";
            video.style.clipPath = "";
          } else {
            video.style.transform = "";
            video.style.clipPath = sceneRect.top > 0 ? "inset(" + sceneRect.top + "px 0 0 0)" : "";
          }
        }

        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })();

    // 2) Image banner — scroll-driven mask/scale expand
    (function () {
      const section = document.getElementById("imgBanner");
      const img = document.getElementById("bannerImg");
      if (!section || !img) return;
      img.style.setProperty("--p", "0");
      function tick() {
        if (cancelled || !section || !img) return;
        const r = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const total = section.offsetHeight;
        const scrolled = vh - r.top;
        const raw = total > 0 ? Math.min(Math.max(scrolled / total, 0), 1) : 0;
        const t = Math.min(raw / 0.5, 1);
        img.style.setProperty("--p", t.toFixed(4));
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })();

    // 3) Back-to-top button — visible past 600px, smooth-scroll to top
    const backTop = document.getElementById("backToTop");
    function onBackTopScroll() {
      if (!backTop) return;
      if (window.scrollY > 600) backTop.classList.add("is-visible");
      else backTop.classList.remove("is-visible");
    }
    function onBackTopClick() {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (backTop) {
      backTop.addEventListener("click", onBackTopClick);
      window.addEventListener("scroll", onBackTopScroll, { passive: true });
      onBackTopScroll();
    }

    // 4) Auto-hide / show nav on scroll direction
    const nav = document.querySelector(".navbar");
    let lastY = window.scrollY;
    const navThreshold = 6;
    function onNavScroll() {
      if (!nav) return;
      const y = window.scrollY;
      if (y < 80) {
        nav.classList.remove("is-hidden");
      } else if (y - lastY > navThreshold) {
        nav.classList.add("is-hidden");
      } else if (lastY - y > navThreshold) {
        nav.classList.remove("is-hidden");
      }
      lastY = y;
    }
    if (nav) window.addEventListener("scroll", onNavScroll, { passive: true });

    // 5) Conversions — sticky horizontal scroll + scroll-scrubbed bg video
    (function () {
      const section = document.getElementById("convSection");
      const track = document.getElementById("convTrack");
      const video = document.getElementById("convBgVideo") as HTMLVideoElement | null;
      if (!section || !track) return;
      let smoothed = 0;
      let smoothedTime = 0;
      let videoReady = false;
      let videoDuration = 0;
      if (video) {
        const onMeta = function () {
          videoDuration = isFinite(video.duration) ? video.duration : 0;
          videoReady = videoDuration > 0;
        };
        if (video.readyState >= 1) onMeta();
        video.addEventListener("loadedmetadata", onMeta);
        video.addEventListener("loadeddata", onMeta);
        try { video.pause(); } catch (e) {}
      }
      function tick() {
        if (cancelled || !section || !track) return;
        const rect = section.getBoundingClientRect();
        const vh = window.innerHeight;
        const total = section.offsetHeight - vh;
        if (total <= 0) { requestAnimationFrame(tick); return; }
        const raw = Math.min(Math.max(-rect.top / total, 0), 1);
        smoothed += (raw - smoothed) * 0.12;
        const viewport = track.parentElement as HTMLElement;
        const maxTx = Math.max(0, track.scrollWidth - viewport.clientWidth);
        const tx = -smoothed * maxTx;
        track.style.transform = "translate3d(" + tx.toFixed(1) + "px, 0, 0)";

        const maskP = Math.min(Math.max((vh - rect.top) / vh, 0), 1);
        section.style.setProperty("--mask-p", maskP.toFixed(3));
        if (video && videoReady) {
          const targetT = smoothed * videoDuration;
          smoothedTime += (targetT - smoothedTime) * 0.18;
          if (Math.abs(video.currentTime - smoothedTime) > 1 / 120) {
            try { video.currentTime = smoothedTime; } catch (e) {}
          }
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onNavScroll);
      window.removeEventListener("scroll", onBackTopScroll);
      if (backTop) backTop.removeEventListener("click", onBackTopClick);
    };
  }, []);

  return (
    <>
      <Nav />
      <main className="stage" id="main-content" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
    </>
  );
}
