'use client';

import { useState } from 'react';
import {
  Award,
  BarChart,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileText,
  Layers,
  MonitorPlay,
  QrCode,
  Video,
} from './icons';
import { Counter } from './Counter';

/** Mouse-follow spotlight: feeds the card's ::before radial-gradient vars. */
function spotlight(e: React.PointerEvent<HTMLElement>) {
  const card = e.currentTarget;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', e.clientX - r.left + 'px');
  card.style.setProperty('--my', e.clientY - r.top + 'px');
}

const CHART_BARS = ['42%', '64%', '55%', '82%', '70%', '94%', '61%'];

/**
 * Bento overview of the platform — the six capabilities the long-form
 * section used to list as a flat 3-column grid, re-cut as the HRMS-style
 * bento so the page has a visual centrepiece instead of six equal boxes.
 */
export default function Platform() {
  const [sequential, setSequential] = useState(true);

  return (
    <section className="section" id="platform">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">The platform</span>
          <h2>
            Everything between enrolment and <span className="serif-italic gradient-text">evidence</span>
          </h2>
          <p>
            Most teams run an LMS for delivery, a separate tool for exams, and a spreadsheet for who
            has actually completed what. QuikLMS is the three of those as one system.
          </p>
        </div>

        <div className="bento">
          {/* Authoring — the anchor card, with a mini course dashboard */}
          <article
            className="card bx-feat reveal"
            style={{ '--acc': '#6366f1' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="c-ico">
              <Layers />
            </div>
            <h3>Structured authoring</h3>
            <p>
              Courses hold modules, modules hold sub-modules, sub-modules hold resources — drag to
              reorder at every level. Video, audio, documents, rich text, embeds and SCORM packages
              all sit side by side.
            </p>
            <div className="cv-kpis">
              <div className="cv-kpi">
                <small>Courses</small>
                <Counter as="b" value={48} />
              </div>
              <div className="cv-kpi">
                <small>Modules</small>
                <Counter as="b" value={216} />
              </div>
              <div className="cv-kpi">
                <small>Resources</small>
                <Counter as="b" value={1340} />
              </div>
            </div>
            <div className="cv-chart" aria-hidden="true">
              {CHART_BARS.map((h, i) => (
                <span key={i} style={{ height: h }} />
              ))}
            </div>
            <div className="bx-foot">
              <span className="bx-pill">
                <ClipboardCheck /> Sequential progression
              </span>
              <button
                className={`bx-toggle${sequential ? ' on' : ''}`}
                onClick={() => setSequential((v) => !v)}
                aria-label="Toggle sequential progression"
                aria-pressed={sequential}
              />
            </div>
          </article>

          {/* Formats */}
          <article
            className="card bx-track reveal"
            data-d="1"
            style={{ '--acc': '#8b5cf6' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-row">
              <div>
                <h4>Ten content formats</h4>
                <small>Video, audio, documents, SCORM — one player</small>
              </div>
              <div className="bx-chips">
                <span className="bx-chip" style={{ '--c': '#6366f1' } as React.CSSProperties}>
                  <Video />
                </span>
                <span className="bx-chip" style={{ '--c': '#22d3ee' } as React.CSSProperties}>
                  <FileText />
                </span>
                <span className="bx-chip" style={{ '--c': '#8b5cf6' } as React.CSSProperties}>
                  <MonitorPlay />
                </span>
                <span className="bx-chip bx-chip-more">+7</span>
              </div>
            </div>
          </article>

          {/* Scoring integrity */}
          <article
            className="card bx-stat reveal"
            data-d="2"
            style={{ '--acc': '#22d3ee' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-stat-top">
              <h4>Scored server-side</h4>
              <span className="bx-live">● Enforced</span>
            </div>
            <small>Graded against the exact paper the learner was served</small>
            <Counter className="bx-big gradient-text" value={100} suffix="%" />
            <div className="bx-bar" aria-hidden="true">
              <i style={{ '--w': '100%' } as React.CSSProperties} />
            </div>
            <small className="bx-stat-sub">Attempt limits applied wherever they are defined</small>
          </article>

          {/* Six capabilities */}
          <article
            className="card bx-hero reveal"
            data-d="1"
            style={{ '--acc': '#6366f1' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <Counter className="bx-huge gradient-text" value={6} />
            <div className="bx-dots" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <h3>Capabilities, one system</h3>
            <p>
              Authoring, a tracking player, assessment, certificates, batches and reporting — sharing
              one learner record instead of four exports.
            </p>
          </article>

          {/* Verification */}
          <article
            className="card bx-short reveal"
            data-d="2"
            style={{ '--acc': '#22d3ee' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="bx-short-l">
              <span className="c-ico sm">
                <QrCode />
              </span>
              <div>
                <h4>Verify a certificate</h4>
                <small>Public page + QR — no account needed</small>
              </div>
            </div>
            <a href="/verify-certificate" className="bx-pill">
              <Award /> Open verifier
            </a>
          </article>
        </div>

        {/* The two capabilities the bento cards don't spell out. */}
        <div className="roles" style={{ marginTop: '18px', gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <article
            className="card role-card reveal"
            style={{ '--acc': '#8b5cf6' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="c-ico">
              <Calendar />
            </div>
            <h3>Batches and timetables</h3>
            <p>
              For schools: batches, scheduled classes, attendance, homework and parent visibility.
              For enterprises: course assignments, due dates and compliance windows.
            </p>
          </article>
          <article
            className="card role-card reveal"
            data-d="1"
            style={{ '--acc': '#6366f1' } as React.CSSProperties}
            onPointerMove={spotlight}
          >
            <div className="c-ico">
              <BarChart />
            </div>
            <h3>Reporting that answers questions</h3>
            <p>
              Progress by learner, batch, course and org. Compliance dashboards show who is overdue
              right now — not who was overdue when the last export ran.
            </p>
          </article>
        </div>

        <p
          className="reveal"
          style={{
            textAlign: 'center',
            marginTop: '28px',
            color: 'var(--lp-text-faint)',
            fontSize: '13.5px',
          }}
        >
          <BookOpen
            style={{ display: 'inline-block', verticalAlign: '-3px', width: 15, height: 15 }}
          />{' '}
          SCORM 1.2 and 2004 report completion and score straight back into the learner record.
        </p>
      </div>
    </section>
  );
}
