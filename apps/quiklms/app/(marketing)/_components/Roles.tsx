'use client';

import { GraduationCap, Presentation, Settings, Users } from './icons';

/** Mouse-follow spotlight: feeds the card's ::before radial-gradient vars. */
function spotlight(e: React.PointerEvent<HTMLElement>) {
  const card = e.currentTarget;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', e.clientX - r.left + 'px');
  card.style.setProperty('--my', e.clientY - r.top + 'px');
}

const ROLES = [
  {
    name: 'Learners',
    Icon: GraduationCap,
    acc: '#6366f1',
    body: 'A clear queue of what is assigned and what is due, a player that remembers where they stopped, and certificates they can share.',
    points: ['Resume where you left off', 'Attempt history and scores', 'Shareable certificates'],
  },
  {
    name: 'Teachers',
    Icon: Presentation,
    acc: '#8b5cf6',
    body: 'Batches, attendance, homework and tutoring requests in one place — plus availability and payout summaries.',
    points: ['Batch rosters and schedules', 'Homework and grading', 'Availability and payouts'],
  },
  {
    name: 'Administrators',
    Icon: Settings,
    acc: '#22d3ee',
    body: 'Author or approve content, assign it, and see compliance across the whole organisation without exporting anything.',
    points: ['Course and quiz authoring', 'Approval workflow', 'Compliance and analytics'],
  },
  {
    name: 'Parents',
    Icon: Users,
    acc: '#f59e0b',
    body: 'For schools: visibility of a child’s schedule, homework status, live classes and results — without a separate portal.',
    points: ['Schedule and attendance', 'Homework status', 'Progress and results'],
  },
];

export default function Roles() {
  return (
    <section className="section" id="roles">
      <div className="wrap">
        <div className="section-head reveal">
          <span className="eyebrow">Who it’s for</span>
          <h2>
            One platform, four very <span className="serif-italic gradient-text">different</span> jobs
          </h2>
          <p>
            Each role gets its own surface. Nobody is handed an admin console and asked to find the
            three things that concern them.
          </p>
        </div>

        <div className="roles">
          {ROLES.map((r, i) => (
            <article
              key={r.name}
              className="card role-card reveal"
              {...(i ? { 'data-d': String(Math.min(i, 4)) } : {})}
              style={{ '--acc': r.acc } as React.CSSProperties}
              onPointerMove={spotlight}
            >
              <div className="c-ico">
                <r.Icon />
              </div>
              <h3>{r.name}</h3>
              <p>{r.body}</p>
              <ul>
                {r.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
