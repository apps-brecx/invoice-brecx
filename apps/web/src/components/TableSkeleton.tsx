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
