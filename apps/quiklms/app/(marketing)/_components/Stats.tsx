import { Counter } from './Counter';

/**
 * Product facts, not adoption metrics.
 *
 * The QuikHRMS row this mirrors leads with "30,000+ employees managed" and a
 * "4.9★ average rating". Every number here is instead something the product
 * demonstrably does, each traceable to copy elsewhere on this page — nothing
 * that would be a fabricated claim about customers we'd have to defend.
 */
export default function Stats() {
  return (
    <section className="section" style={{ paddingTop: '60px' }}>
      <div className="wrap">
        <div className="stats">
          <div className="stat reveal">
            <Counter className="big gradient-text" value={10} />
            <div className="lbl">Content formats supported</div>
          </div>
          <div className="stat reveal" data-d="1">
            <Counter className="big gradient-text" value={5} />
            <div className="lbl">Question types</div>
          </div>
          <div className="stat reveal" data-d="2">
            <Counter className="big gradient-text" value={2} />
            <div className="lbl">SCORM standards</div>
          </div>
          <div className="stat reveal" data-d="3">
            <Counter className="big gradient-text" value={4} />
            <div className="lbl">Role surfaces</div>
          </div>
        </div>
      </div>
    </section>
  );
}
