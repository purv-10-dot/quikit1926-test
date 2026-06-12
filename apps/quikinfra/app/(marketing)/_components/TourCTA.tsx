"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TOUR_VIDEO_SRC = "/product-tour.mp4";

export default function TourCTA({ className = "btn btn-solid" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const lockRef = useRef<{ scrollY: number; html: string; bodyOverflow: string; bodyPosition: string; bodyTop: string; bodyWidth: string } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const active = open || playing;
    if (!active) {
      if (lockRef.current) {
        const html = document.documentElement;
        const body = document.body;
        const saved = lockRef.current;
        html.style.overflow = saved.html;
        body.style.overflow = saved.bodyOverflow;
        body.style.position = saved.bodyPosition;
        body.style.top = saved.bodyTop;
        body.style.width = saved.bodyWidth;
        window.scrollTo(0, saved.scrollY);
        lockRef.current = null;
      }
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (playing) closePlayer();
      else closeForm();
    };
    document.addEventListener("keydown", onKey);

    if (!lockRef.current) {
      const html = document.documentElement;
      const body = document.body;
      lockRef.current = {
        scrollY: window.scrollY,
        html: html.style.overflow,
        bodyOverflow: body.style.overflow,
        bodyPosition: body.style.position,
        bodyTop: body.style.top,
        bodyWidth: body.style.width,
      };
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      body.style.position = "fixed";
      body.style.top = `-${lockRef.current.scrollY}px`;
      body.style.width = "100%";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open, playing]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setOpen(false);
      setPlaying(true);
    }, 400);
  };

  const closeForm = () => {
    setOpen(false);
    setTimeout(() => setEmail(""), 200);
  };

  const closePlayer = () => setPlaying(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Take a Product Tour
      </button>

      {open && mounted && createPortal(
        <div className="tour-modal" role="dialog" aria-modal="true" aria-labelledby="tour-title" onClick={closeForm}>
          <div className="tour-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tour-close" aria-label="Close" onClick={closeForm}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <h3 id="tour-title" className="tour-title">Take a product tour</h3>
            <p className="tour-sub">Drop your email and we&apos;ll get you straight into the walkthrough.</p>
            <form className="tour-form" onSubmit={submit}>
              <input
                type="email"
                required
                autoFocus
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="tour-input"
                aria-label="Work email"
              />
              <button type="submit" className="btn btn-solid tour-submit" disabled={submitting}>
                {submitting ? "Loading..." : "Continue with product tour"}
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {playing && mounted && createPortal(
        <div className="tour-player" role="dialog" aria-modal="true" aria-label="Product tour video">
          <div className="tour-player-frame">
            <div className="tour-player-head">
              <div className="tour-player-headtext">
                <h3 className="tour-player-title">Product Tour</h3>
                <p className="tour-player-sub">A 2-minute walkthrough of QuikInfra ERP.</p>
              </div>
              <button type="button" className="tour-player-close" aria-label="Close video" onClick={closePlayer}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="tour-player-screen">
              <video
                className="tour-player-video"
                src={TOUR_VIDEO_SRC}
                controls
                autoPlay
                playsInline
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
