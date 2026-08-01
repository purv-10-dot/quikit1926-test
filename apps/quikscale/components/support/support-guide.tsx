"use client";

/**
 * User Guide view — scrollable getting-started content, ported from the
 * reference widget.
 *
 * Content is rewritten for QuikScale. The reference guide described the Quikit
 * marketing suite ("pick the apps your team needs", CRM/Projects/Marketing),
 * which doesn't describe this product; this covers the modules a QuikScale user
 * actually has in their sidebar.
 */

export function SupportGuide() {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-[var(--color-text-secondary)] space-y-4">
      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          Getting started with QuikScale
        </h4>
        <p>
          QuikScale is your performance operating system — strategy, execution and meeting
          rhythm in one place. Here&apos;s the short tour.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          1. Set up your quarters
        </h4>
        <p>
          Everything is organised by fiscal quarter. An admin sets the fiscal year start
          under <strong className="text-[var(--color-text-primary)]">Settings → Configurations</strong>.
          Until that&apos;s done, KPIs and Priorities have no period to attach to.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          2. Track execution
        </h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-[var(--color-text-primary)]">KPI</strong> — the numbers you
            watch weekly. Set a quarterly goal, enter weekly values, and the traffic-light
            colours show performance at a glance.
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">Priority</strong> — your
            quarterly rocks. Each has an owner, a start and end week, and a status.
          </li>
          <li>
            <strong className="text-[var(--color-text-primary)]">WWW</strong> — Who / What /
            When: the short-term action items that come out of your meetings.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          3. Plan your strategy
        </h4>
        <p>
          The <strong className="text-[var(--color-text-primary)]">OPSP</strong> (One Page
          Strategic Plan) holds long-term goals, this year&apos;s targets and the quarterly
          plan in a single view. Sections can be assigned to owners and reviewed each quarter.
          Habits and SWT sit alongside it.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          4. Run your meeting rhythm
        </h4>
        <p>
          Daily huddles and weekly meetings live under{" "}
          <strong className="text-[var(--color-text-primary)]">Meeting Rhythm</strong>, with
          attendance, scores and notes recorded per meeting. Anything actionable goes straight
          into WWW so it doesn&apos;t get lost.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          5. Invite your team
        </h4>
        <p>
          Add people and assign roles under{" "}
          <strong className="text-[var(--color-text-primary)]">Org Setup</strong>. Roles control
          who can view and edit each module — everyone shares the same data, so there&apos;s
          nothing to sync.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
          Need more help?
        </h4>
        <p>
          Go back and choose{" "}
          <strong className="text-[var(--color-text-primary)]">Raise a request</strong> to reach
          the QuikIT team, or ask the AI Copilot for a quick answer. You can track everything
          you&apos;ve raised under{" "}
          <strong className="text-[var(--color-text-primary)]">Settings → Support Status</strong>.
        </p>
      </section>
    </div>
  );
}
