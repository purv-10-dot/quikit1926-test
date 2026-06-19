import { Counter } from "./counter";

export function Stats() {
  return (
    <section className="section" style={{ paddingTop: "60px" }}>
      <div className="wrap">
        <div className="stats">
          <div className="stat reveal">
            <Counter className="big gradient-text" value={30000} suffix="+" />
            <div className="lbl">Employees managed</div>
          </div>
          <div className="stat reveal" data-d="1">
            <Counter className="big gradient-text" value={13} />
            <div className="lbl">Integrated modules</div>
          </div>
          <div className="stat reveal" data-d="2">
            <Counter className="big gradient-text" text="99.9%" />
            <div className="lbl">Uptime SLA</div>
          </div>
          <div className="stat reveal" data-d="3">
            <Counter className="big gradient-text" text="4.9★" />
            <div className="lbl">Average customer rating</div>
          </div>
        </div>
      </div>
    </section>
  );
}
