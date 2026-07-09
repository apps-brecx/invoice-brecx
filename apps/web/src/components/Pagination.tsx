/**
 * Numbered pagination — Previous/Next plus page-number pills with ellipsis
 * for long ranges (1 … 4 [5] 6 … 12). Current page is highlighted.
 * (Ported from Wholesale HQ.)
 */
export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages < 1) return null;

  // Window of numbers around the current page; ellipsis where gaps exist.
  const nums: (number | "…")[] = [];
  const add = (n: number) => {
    if (nums[nums.length - 1] !== n) nums.push(n);
  };
  add(1);
  if (page - 1 > 2) nums.push("…");
  for (let n = Math.max(2, page - 1); n <= Math.min(pages - 1, page + 1); n++) add(n);
  if (page + 1 < pages - 1) nums.push("…");
  if (pages > 1) add(pages);

  return (
    <nav className="pgn" aria-label="Pagination">
      <button
        type="button"
        className="pgn-nav"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft /> Prev
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span className="pgn-dots" key={`d${i}`}>
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={"pgn-num" + (n === page ? " current" : "")}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ),
      )}
      <button
        type="button"
        className="pgn-nav"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next <ChevronRight />
      </button>
    </nav>
  );
}

function ChevronLeft() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
