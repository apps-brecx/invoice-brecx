/** Shimmering placeholder for the split detail pages (mini-list left, record
 *  right) — shown while the store loads on a hard refresh, instead of a
 *  misleading "not found". */
export function DetailSkeleton() {
  return (
    <section className="view detail-grid" aria-hidden="true">
      <aside className="card inv-mini-list print-hide">
        <div className="skel-mini-head">
          <span className="skel-bar" style={{ width: "52%" }} />
        </div>
        {Array.from({ length: 11 }, (_, i) => (
          <div className="skel-mini-row" key={i}>
            <span className="skel-bar" style={{ width: `${42 + ((i * 13) % 34)}%` }} />
            <span className="skel-bar" style={{ width: "17%" }} />
          </div>
        ))}
      </aside>
      <div className="skel-main">
        <div className="skel-head">
          <span className="skel-bar" style={{ width: 300, height: 20 }} />
          <span className="skel-bar" style={{ width: 150 }} />
        </div>
        <div className="card" style={{ padding: "22px 26px" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div className="skel-kv" key={i}>
              <span className="skel-bar" style={{ width: 120 }} />
              <span className="skel-bar" style={{ width: `${26 + ((i * 17) % 38)}%` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Shimmering placeholder rows shaped like the ledger table — shown while a
 *  list loads instead of a spinner. Bar widths vary per row so it reads as
 *  real content, not a repeated pattern. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  const widths = ["72%", "48%", "60%", "38%", "66%", "52%", "44%", "58%", "70%", "40%"];
  return (
    <div className="skel-table" aria-hidden="true">
      <div className="skel-trow head">
        <span className="skel-bar sq" />
        <span className="skel-bar" style={{ width: "18%" }} />
        <span className="skel-bar" style={{ width: "26%" }} />
        <span className="skel-bar" style={{ width: "52%", justifySelf: "end" }} />
        <span className="skel-bar" style={{ width: "48%" }} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-trow" key={i}>
          <span className="skel-bar sq" />
          <span className="skel-bar" style={{ width: widths[i % widths.length] }} />
          <span className="skel-bar" style={{ width: widths[(i + 3) % widths.length] }} />
          <span className="skel-bar" style={{ width: "56%", justifySelf: "end" }} />
          <span className="skel-bar" style={{ width: "34%" }} />
        </div>
      ))}
    </div>
  );
}
