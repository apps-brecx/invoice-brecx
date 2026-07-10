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
        <div className="skel-mini-foot">
          <span className="skel-bar" />
          <span className="skel-bar" />
          <span className="skel-bar" />
        </div>
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

/** Invoice-paper-shaped shimmer for the detail pane — shown while a single
 *  invoice loads (e.g. switching invoices in the mini list). */
export function PaperSkeleton() {
  return (
    <div className="paper-skel" aria-hidden="true">
      <div className="skel-head">
        <span className="skel-bar" style={{ width: 210, height: 20 }} />
        <span className="skel-bar" style={{ width: 300 }} />
      </div>
      <span className="skel-bar" style={{ height: 46, borderRadius: 12 }} />
      <div className="card paper-skel-paper">
        <div className="psk-top">
          <span className="skel-bar" style={{ width: 140, height: 28 }} />
          <span className="skel-bar" style={{ width: 96, height: 16 }} />
        </div>
        <div className="psk-cols">
          <div>
            <span className="skel-bar" style={{ width: "58%" }} />
            <span className="skel-bar" style={{ width: "42%" }} />
            <span className="skel-bar" style={{ width: "50%" }} />
            <span className="skel-bar" style={{ width: "30%" }} />
          </div>
          <div className="psk-right">
            <span className="skel-bar" style={{ width: 150, height: 22 }} />
            <span className="skel-bar" style={{ width: 170 }} />
            <span className="skel-bar" style={{ width: 140 }} />
            <span className="skel-bar" style={{ width: 160 }} />
          </div>
        </div>
        <span className="skel-bar" style={{ height: 30 }} />
        {Array.from({ length: 3 }, (_, i) => (
          <div className="psk-row" key={i}>
            <span className="skel-bar" style={{ width: `${44 + ((i * 17) % 22)}%` }} />
            <span className="skel-bar" style={{ width: "9%", marginLeft: "auto" }} />
            <span className="skel-bar" style={{ width: "11%" }} />
          </div>
        ))}
        <div className="psk-tot">
          <span className="skel-bar" style={{ width: 190 }} />
          <span className="skel-bar" style={{ width: 220, height: 16 }} />
        </div>
      </div>
    </div>
  );
}

/** Form-shaped shimmer for settings cards — label + input pairs ending in a
 *  save-button bar, so the card keeps its final height while loading. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  const labels = [110, 150, 90, 135, 120, 100];
  return (
    <div className="skel-form" aria-hidden="true">
      {Array.from({ length: fields }, (_, i) => (
        <div className="skel-field" key={i}>
          <span className="skel-bar" style={{ width: labels[i % labels.length], height: 11 }} />
          <span className="skel-bar input" />
        </div>
      ))}
      <span className="skel-bar" style={{ width: 120, height: 34, borderRadius: 8, alignSelf: "flex-end" }} />
    </div>
  );
}

/** List-row shimmer (sessions, team members) — leading icon + two stacked
 *  lines + a trailing action pill per row. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-list-row" key={i}>
          <span className="skel-bar sq" />
          <span className="skel-list-main">
            <span className="skel-bar" style={{ width: `${34 + ((i * 19) % 30)}%` }} />
            <span className="skel-bar" style={{ width: `${52 + ((i * 13) % 26)}%`, height: 10 }} />
          </span>
          <span className="skel-bar" style={{ width: 70, height: 26, borderRadius: 8 }} />
        </div>
      ))}
    </div>
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
