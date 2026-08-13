import { FAQS } from "./faq-data";

/**
 * Native <details> accordion — no client JS, so it works before hydration and
 * with JS disabled. The same FAQS array is serialised to FAQPage JSON-LD in
 * the marketing layout, so the rendered copy and the structured data cannot
 * drift apart.
 */
export default function Faq() {
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <div className="section-header" data-reveal>
          <span className="eyebrow">Questions</span>
          <h2>The things people ask before they switch.</h2>
        </div>

        <div className="faq-list">
          {FAQS.map((item) => (
            <details className="faq-item" key={item.q} data-reveal>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
