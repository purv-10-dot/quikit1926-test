'use client';

import { useEffect, useRef } from 'react';

const STAGES = [
  { n: '01', title: 'Enrol', desc: 'Assign or batch, with due dates' },
  { n: '02', title: 'Learn', desc: 'Player tracks every resource' },
  { n: '03', title: 'Practise', desc: 'Quizzes from question banks' },
  { n: '04', title: 'Assess', desc: 'Proctored, randomised exams' },
  { n: '05', title: 'Certify', desc: 'Issued on genuine completion' },
  { n: '06', title: 'Report', desc: 'Progress and compliance, live' },
];

/** Six-stage timeline whose connecting line fills in when scrolled into view. */
export default function Lifecycle() {
  const timelineRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const timeline = timelineRef.current;
    const fill = fillRef.current;
    if (!timeline) return;

    function activate() {
      timeline!.classList.add('in');
      if (fill) fill.style.width = '88%';
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      activate();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            activate();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(timeline);
    return () => io.disconnect();
  }, []);

  return (
    <section className="section" id="journey">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">The whole journey</span>
          <h2>
            From enrolled to <span className="serif-italic gradient-text">evidenced</span>
          </h2>
          <p>
            Six stages on one record. Nothing is re-keyed between them, so the certificate at the end
            is backed by the attempts that earned it.
          </p>
        </div>
        <div className="timeline reveal" ref={timelineRef}>
          <span className="line-fill" ref={fillRef} />
          {STAGES.map((s) => (
            <div className="tnode" key={s.n}>
              <div className="tdot">{s.n}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
