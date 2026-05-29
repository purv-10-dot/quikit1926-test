"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ContactCTA({ className = "btn btn-solid nav-cta nav-pill" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const lockRef = useRef<{
    scrollY: number;
    html: string;
    bodyOverflow: string;
    bodyPosition: string;
    bodyTop: string;
    bodyWidth: string;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
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

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
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

    return () => { document.removeEventListener("keydown", onKey); };
  }, [open]);

  const close = () => {
    setOpen(false);
    setTimeout(() => {
      setDone(false);
      setSubmitting(false);
      setForm({ name: "", email: "", phone: "", message: "" });
    }, 220);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) || !form.message.trim()) return;
    setSubmitting(true);
    try {
      const body = new URLSearchParams({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
        source: "QuikConstruction landing — Contact Us",
        submittedAt: new Date().toISOString(),
      });
      await fetch(
        "https://script.google.com/macros/s/AKfycbwjbC6DVHLidWogm8EJ-7Y1a3vCIkAgf3SwyNGOgsgOmCNnQYTGlMBrGGB2XbDuxxHu/exec",
        { method: "POST", mode: "no-cors", body }
      );
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Contact Us
      </button>

      {open && mounted && createPortal(
        <div className="contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title" onClick={close}>
          <div className="contact-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tour-close" aria-label="Close" onClick={close}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            {done ? (
              <>
                <h3 id="contact-title" className="tour-title">Thanks, we&apos;ll be in touch.</h3>
                <p className="tour-sub">We&apos;ve got your message and will reply at <strong>{form.email}</strong> shortly.</p>
                <button type="button" className="btn btn-solid tour-submit" onClick={close}>Done</button>
              </>
            ) : (
              <>
                <h3 id="contact-title" className="tour-title">Get in touch</h3>
                <p className="tour-sub">Tell us a bit about your operation and we&apos;ll get back within one working day.</p>
                <form className="contact-form" onSubmit={submit}>
                  <label className="contact-field">
                    <span>Full name</span>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="Your full name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="tour-input"
                    />
                  </label>
                  <label className="contact-field">
                    <span>Email</span>
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="tour-input"
                    />
                  </label>
                  <label className="contact-field">
                    <span>Phone <em>(optional)</em></span>
                    <input
                      type="tel"
                      placeholder="+91 ..."
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="tour-input"
                    />
                  </label>
                  <label className="contact-field">
                    <span>Your message</span>
                    <textarea
                      required
                      rows={4}
                      placeholder="What are you looking to solve?"
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      className="tour-input contact-textarea"
                    />
                  </label>
                  <button type="submit" className="btn btn-solid tour-submit" disabled={submitting}>
                    {submitting ? "Sending..." : "Send"}
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
