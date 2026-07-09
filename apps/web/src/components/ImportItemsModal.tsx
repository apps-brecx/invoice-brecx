import { useRef, useState, type DragEvent } from "react";
import { api } from "../lib/api";
import { parseCsv, normHeader, headerIndex } from "../lib/csv";

interface ParsedItem {
  name: string;
  type: string; // Goods | Service
  unit: string;
  sellingPrice: number;
  description: string;
  inactive: boolean;
}

/** Map parsed CSV rows into item drafts using the header row. The format
 *  matches our own Export (CSV), so an exported file re-imports cleanly. */
function mapRows(rows: string[][]): { items: ParsedItem[]; skipped: number } {
  if (rows.length < 2) return { items: [], skipped: 0 };
  const headers = rows[0].map(normHeader);
  const col = (...names: string[]) => headerIndex(headers, ...names);
  const iName = col("name", "itemname", "item");
  const iType = col("type", "itemtype");
  const iDesc = col("description", "details");
  const iRate = col("rate", "price", "sellingprice", "amount");
  const iUnit = col("usageunit", "unit");
  const iStatus = col("status");

  const items: ParsedItem[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const at = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const name = at(iName);
    // Rate must be a sane non-negative number; junk rows get skipped.
    const rate = parseFloat(at(iRate).replace(/[^0-9.\-]/g, ""));
    if (!name || Number.isNaN(rate) || rate < 0) {
      skipped++;
      continue;
    }
    items.push({
      name: name.slice(0, 300),
      type: /service/i.test(at(iType)) ? "Service" : "Goods",
      unit: at(iUnit).slice(0, 40),
      sellingPrice: Math.min(rate, 100_000_000),
      description: at(iDesc).slice(0, 2000),
      inactive: /inactive/i.test(at(iStatus)),
    });
  }
  return { items, skipped };
}

type Phase = "pick" | "preview" | "importing" | "done";

export function ImportItemsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  /** Called after a successful run so the caller can refresh + toast. */
  onImported: (ok: number) => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [failures, setFailures] = useState<Array<{ name: string; reason: string }>>([]);

  function pickFile(file: File | undefined | null) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setError("Use a .csv file — you can export one from Excel or Google Sheets.");
      return;
    }
    setError("");
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { items, skipped: sk } = mapRows(parseCsv(String(reader.result ?? "")));
      if (items.length === 0) {
        setError(
          sk > 0
            ? "No usable rows — every row is missing a Name or a valid Rate."
            : 'No rows found. The first line must be headers including "Name" and "Rate" columns.',
        );
        return;
      }
      setParsed(items);
      setSkipped(sk);
      setPhase("preview");
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(file);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function runImport() {
    setPhase("importing");
    let ok = 0;
    const fails: Array<{ name: string; reason: string }> = [];
    for (let i = 0; i < parsed.length; i++) {
      const it = parsed[i];
      setProgress(i + 1);
      try {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const res = await api.post<{ item: any }>("/items", {
          name: it.name,
          type: it.type,
          unit: it.unit || null,
          sellingPrice: it.sellingPrice,
          description: it.description || null,
        });
        // Status column said Inactive → flip the flag after creation.
        if (it.inactive) {
          await api.patch(`/items/${res.item.id}/active`, { active: false });
        }
        ok++;
      } catch (err) {
        fails.push({
          name: it.name,
          reason: err instanceof Error ? err.message : "failed",
        });
      }
    }
    setOkCount(ok);
    setFailures(fails);
    setPhase("done");
    if (ok > 0) await onImported(ok);
  }

  return (
    <div className="modal-overlay" onClick={phase === "importing" ? undefined : onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>Import Items</h3>

        {phase === "pick" && (
          <>
            <p className="imp-help">
              Upload a CSV with a header row. Recognized columns: <b>Name</b> and <b>Rate</b>{" "}
              (required), Type, Description, Usage Unit, Status. A file from{" "}
              <b>Export (CSV)</b> imports as-is.
            </p>
            <div
              className={"imp-drop" + (dragOver ? " drag" : "")}
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 8l5-5 5 5M12 3v12" />
              </svg>
              <span>
                Drag a CSV here or <b>Browse</b>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
            {error && <p className="imp-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {phase === "preview" && (
          <>
            <p className="imp-help">
              <b>{fileName}</b> — {parsed.length} item{parsed.length === 1 ? "" : "s"} ready
              {skipped > 0 && (
                <> · {skipped} row{skipped === 1 ? "" : "s"} skipped (missing name/rate)</>
              )}
            </p>
            <div className="imp-preview">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th className="right">Rate</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.slice(0, 5).map((it, i) => (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td className="mut-cell">{it.type}</td>
                      <td className="num right">${it.sellingPrice.toFixed(2)}</td>
                      <td className="mut-cell">{it.unit || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <p className="imp-more">…and {parsed.length - 5} more</p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPhase("pick")}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void runImport()}>
                Import {parsed.length} item{parsed.length === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}

        {phase === "importing" && (
          <div className="imp-progress">
            <div className="spinner" />
            <p>
              Importing {progress} / {parsed.length}…
            </p>
          </div>
        )}

        {phase === "done" && (
          <>
            <p className="imp-help">
              <b>{okCount}</b> item{okCount === 1 ? "" : "s"} imported
              {failures.length > 0 && (
                <> · <b style={{ color: "var(--red)" }}>{failures.length}</b> failed</>
              )}
            </p>
            {failures.length > 0 && (
              <ul className="imp-fails">
                {failures.slice(0, 6).map((f, i) => (
                  <li key={i}>
                    <b>{f.name}</b> — {f.reason}
                  </li>
                ))}
                {failures.length > 6 && <li>…and {failures.length - 6} more</li>}
              </ul>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
