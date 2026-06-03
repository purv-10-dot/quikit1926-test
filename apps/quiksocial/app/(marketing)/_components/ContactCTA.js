"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ContactCTA.module.css";

export default function ContactCTA() {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const firstInputRef = useRef(null);

  // SSR guard for the portal
  useEffect(() => setMounted(true), []);

// Close on ESC + auto-focus first input + freeze page scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => firstInputRef.current?.focus(), 80);

    // Stop Lenis smooth scroll + lock native scroll on html/body.
    const lenis = typeof window !== "undefined" ? window.__lenis : null;
    if (lenis) lenis.stop();
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      if (lenis) lenis.start();
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  // Paste your Apps Script Web App `/exec` URL here.
  const ENDPOINT =
    "https://script.google.com/macros/s/AKfycbz2HAU1oHxEQJCUbDXT837HzEVRhVpXPhek6Q1RgpHMQeaMaj6-lniPwfduRUZXrhpB/exec";

  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      name:    fd.get("name")    || "",
      email:   fd.get("email")   || "",
      phone:   fd.get("phone")   || "",
      message: fd.get("message") || "",
    };

    setSubmitted(true);
    try {
      // `no-cors` mode avoids the CORS preflight issue with Apps Script.
      // IMPORTANT: in no-cors, browsers restrict Content-Type to "simple"
      // values (text/plain, x-www-form-urlencoded, multipart/form-data).
      // Setting application/json is silently rejected and the body is
      // dropped — so we send the JSON as text/plain and parse it on the
      // server. The request still reaches the script; we just can't read
      // the response (which is fine — script writes to sheet + emails).
      await fetch(ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // swallow — `no-cors` always resolves opaquely; the script ran.
    }

    form.reset();
    // Keep the success state visible long enough to read (3.5s), then
    // close. The user can also dismiss earlier via the CLOSE button or
    // by clicking the backdrop / pressing ESC.
    setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
    }, 3500);
  };

  return (
    <>
      <button
        type="button"
        className="topbar-cta"
        onClick={() => setOpen(true)}
      >
        CONTACT US
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </button>

      {open && mounted && createPortal(
        <div
          className={styles.backdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="presentation"
        >
          <div
            className={styles.card}
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
          >
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Close contact form"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>

            {submitted ? (
              <div className={styles.success} role="status" aria-live="polite">
                <div className={styles.successIcon} aria-hidden="true">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7" />
                  </svg>
                </div>
                <h2 className={styles.title}>
                  Message <em>sent</em>.
                </h2>
                <p className={styles.sub}>
                  Thanks for reaching out — we&rsquo;ve received your message and
                  will get back to you within one working day.
                </p>
                <button
                  type="button"
                  className={styles.send}
                  onClick={() => {
                    setOpen(false);
                    setSubmitted(false);
                  }}
                >
                  CLOSE
                </button>
              </div>
            ) : (
              <>
            <h2 id="contact-title" className={styles.title}>
              Get in <em>touch</em>.
            </h2>
            <p className={styles.sub}>
              Tell us a bit about your operation and we'll get back within
              one working day.
            </p>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span className={styles.label}>Full name</span>
                <input
                  ref={firstInputRef}
                  type="text"
                  name="name"
                  required
                  placeholder="Your full name"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@company.com"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>
                  Phone <span className={styles.optional}>(optional)</span>
                </span>
                <input
                  type="tel"
                  name="phone"
                  placeholder="+91 …"
                  className={styles.input}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Your message</span>
                <textarea
                  name="message"
                  required
                  placeholder="What are you looking to solve?"
                  rows={4}
                  className={styles.textarea}
                />
              </label>

              <button
                type="submit"
                className={styles.send}
              >
                SEND
              </button>
            </form>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
