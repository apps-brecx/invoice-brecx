import { useState, type CSSProperties, type ReactNode } from "react";
import type { TemplateSettings } from "../lib/template";
import { money, fmtLong, type DisplayStatus } from "../lib/store";
import { STATUS_LABEL } from "./bits";

/* ------------------------------------------------------------------
 * The invoice document, rendered as an ordered stack of BLOCKS.
 * In studio mode every template-owned text is edited INLINE (Notion
 * style): click it, type, blur to save. Invoice data (customer,
 * amounts, dates, line contents) is never editable here — it binds to
 * each invoice. Blocks drag-reorder; the item table grows columns and
 * sample rows straight from the preview.
 * ------------------------------------------------------------------ */

export interface PaperLine {
  description: string;
  qty: number;
  price: number;
  unit?: string | null;
  /** Values for template-defined custom columns ("custom:<id>"). */
  extra?: Record<string, string>;
}

export interface PaperData {
  number: string;
  status: DisplayStatus | null; // null → no ribbon (template preview)
  issued: string;
  due: string;
  terms: string;
  orderNumber?: string | null;
  subject?: string | null;
  customerName: string;
  customerAddress?: string[];
  shipToAddress?: string[];
  lines: PaperLine[];
  discountPct: number;
  taxPct: number;
  shipping: number;
  adjustment: number;
  paid?: number;
  notes?: string | null;
  termsConditions?: string | null;
}

/** Generic sample used by template previews (editor, gallery, drawer). */
export const SAMPLE_PAPER: PaperData = {
  number: "INV-00001",
  status: null,
  issued: "2026-01-15",
  due: "2026-02-14",
  terms: "Net 30",
  orderNumber: "PO-0001",
  customerName: "Customer name",
  customerAddress: ["Street address", "City, State"],
  shipToAddress: ["Warehouse address", "City, State"],
  lines: [
    // extra carries demo values for the custom columns used by the
    // starter presets (unknown keys are simply ignored by other templates).
    {
      description: "Item description", qty: 2, price: 120, unit: "box",
      extra: { "custom:units_per_box": "12", "custom:total_box": "10", "custom:adj_rate": "$130.00", "custom:adj_total": "$260.00" },
    },
    {
      description: "Another line item", qty: 1, price: 80, unit: "pcs",
      extra: { "custom:units_per_box": "24", "custom:total_box": "5", "custom:adj_rate": "$95.00", "custom:adj_total": "$95.00" },
    },
  ],
  discountPct: 5,
  taxPct: 9,
  shipping: 12.5,
  adjustment: 0,
  paid: 0,
  notes: "Customer notes appear here.",
};

const FONT_MAP: Record<TemplateSettings["font"], string> = {
  sans: "var(--font-body)",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "var(--font-mono)",
};

export function paperTotals(d: Pick<PaperData, "lines" | "discountPct" | "taxPct" | "shipping" | "adjustment">) {
  const sub = d.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const disc = (sub * d.discountPct) / 100;
  const tax = ((sub - disc) * d.taxPct) / 100;
  const grand = sub - disc + tax + d.shipping + d.adjustment;
  return { sub, disc, tax, grand };
}

function cellValue(key: string, l: PaperLine, index: number): ReactNode {
  switch (key) {
    case "index":
      return index + 1;
    case "description":
      return l.description || <span className="pp-untitled">Untitled item</span>;
    case "qty":
      return l.qty;
    case "unit":
      return l.unit ?? "—";
    case "rate":
      return money(l.price);
    case "amount":
      return money(l.qty * l.price);
    default:
      // custom:<id> — free-text value entered on the invoice form
      return l.extra?.[key] ?? "—";
  }
}

const RIGHT_COLS = new Set(["qty", "rate", "amount"]);
const CENTER_COLS = new Set(["index", "unit"]);

function blockStyle(b: TemplateSettings["blocks"][number]): CSSProperties {
  const s: CSSProperties = {};
  if (b.pad > 0) {
    s.paddingTop = b.pad;
    s.paddingBottom = b.pad;
  }
  if (b.size !== 100) s.fontSize = `${b.size}%`;
  if (b.color) s.color = b.color;
  if (b.bg) {
    s.background = b.bg;
    s.paddingLeft = 12;
    s.paddingRight = 12;
    s.borderRadius = 6;
  }
  if (b.align !== "auto") s.textAlign = b.align;
  if (b.w < 100) {
    s.width = `${b.w}%`;
    if (b.pos === "center") {
      s.marginLeft = "auto";
      s.marginRight = "auto";
    } else if (b.pos === "right") {
      s.marginLeft = "auto";
    } else {
      s.marginRight = "auto";
    }
  }
  return s;
}

type PaperColumn = TemplateSettings["columns"][number];

/** Header segments: consecutive visible columns sharing a `group` merge
 *  into one spanning cell; ungrouped columns each stand alone and span
 *  both header rows, so the whole thead reads as one solid band. */
function headSegments(cols: PaperColumn[]) {
  const out: Array<{ group: string | null; cols: PaperColumn[] }> = [];
  for (const c of cols) {
    const g = c.group?.trim() || null;
    const last = out[out.length - 1];
    if (last && last.group !== null && last.group === g) last.cols.push(c);
    else out.push({ group: g, cols: [c] });
  }
  return out;
}

/** "Special Pricing — within 60 days" → bold title + small subtitle. */
function GroupLabel({ text }: { text: string }) {
  const i = text.indexOf("—");
  if (i < 0) return <>{text}</>;
  return (
    <>
      <span className="g-title">{text.slice(0, i).trim()}</span>
      <span className="g-sub">{text.slice(i + 1).trim()}</span>
    </>
  );
}

/** Numeric value one line contributes to a column's TOTAL row. */
function lineColValue(key: string, l: PaperLine): number | null {
  if (key === "qty") return l.qty;
  if (key === "rate") return l.price;
  if (key === "amount") return l.qty * l.price;
  if (key.startsWith("custom:")) {
    const raw = (l.extra?.[key] ?? "").replace(/[^0-9.-]/g, "");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function colTotalText(c: PaperColumn, lines: PaperLine[]): string {
  const sum = lines.reduce((s, l) => s + (lineColValue(c.key, l) ?? 0), 0);
  return c.total === "money" ? money(sum) : sum.toLocaleString("en-US");
}

export interface PaperSelectable {
  selected: string | null;
  onSelect: (blockKey: string) => void;
  /** Studio capabilities: inline text edit, drag, hide, table growth. */
  actions?: {
    onEditText: (blockKey: string) => void;
    onReorder: (fromKey: string, toKey: string) => void;
    onHide: (blockKey: string) => void;
    requiredKeys: Set<string>;
    /** Inline edit save: path is "label:<key>" | "set:<settingKey>" |
     *  "col:<columnKey>" | "grp:<oldGroupName>". */
    onField?: (path: string, value: string) => void;
    onAddColumn?: () => void;
    onAddSampleRow?: () => void;
    onRemoveSampleRow?: (index: number) => void;
    /** Remove a single element (meta row, totals row, title…) by id. */
    onHideEl?: (id: string) => void;
    /** Free content rows (the "custom" block). */
    onFreeRowAdd?: () => void;
    onFreeRowDelete?: (ri: number) => void;
    onFreeCellAdd?: (ri: number) => void;
    onFreeCellPatch?: (ri: number, ci: number, patch: Record<string, unknown>) => void;
    onFreeCellDelete?: (ri: number, ci: number) => void;
  };
}

/** Tiny hover × that removes one element from the paper (studio only). */
function ElX({ id, acts }: { id: string; acts: PaperSelectable["actions"] | undefined }) {
  if (!acts?.onHideEl) return null;
  return (
    <button
      type="button"
      className="pp-el-x"
      title="Remove this item (restore from the Layout blocks panel)"
      onClick={(e) => {
        e.stopPropagation();
        acts.onHideEl!(id);
      }}
    >
      ×
    </button>
  );
}

/** Inline-editable text (Notion style). Single-line unless multi. */
function Ed({
  path,
  value,
  acts,
  multi = false,
  placeholder,
}: {
  path: string;
  value: string;
  acts: PaperSelectable["actions"] | undefined;
  multi?: boolean;
  placeholder?: string;
}) {
  if (!acts?.onField) return <>{value || placeholder || ""}</>;
  return (
    <span
      className="ed"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      style={multi ? { whiteSpace: "pre-line" } : undefined}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (!multi && e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
        if (e.key === "Escape") (e.target as HTMLElement).blur();
      }}
      onBlur={(e) => {
        const text = (e.currentTarget.textContent ?? "").replace(/ /g, " ");
        if (text.trim() !== value.trim()) acts.onField!(path, text.trim());
      }}
    >
      {value}
    </span>
  );
}

export function InvoicePaper({
  tpl,
  data,
  selectable,
}: {
  tpl: TemplateSettings;
  data: PaperData;
  /** Studio mode: blocks are clickable and the selected one is outlined. */
  selectable?: PaperSelectable;
}) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [selCell, setSelCell] = useState<{ ri: number; ci: number } | null>(null);
  const { sub, disc, tax, grand } = paperTotals(data);
  const paid = data.paid ?? 0;
  const balance = Math.max(0, grand - paid);
  const L = tpl.labels;
  const cols = tpl.columns.filter((c) => c.show);
  const acts = selectable?.actions;
  const hid = new Set(tpl.hidden);

  const style = {
    "--pp-accent": tpl.accent,
    "--pp-label": tpl.labelColor,
    fontFamily: FONT_MAP[tpl.font],
  } as CSSProperties;

  const renderers: Record<string, ReactNode> = {
    header: (
      <div className="pp-head">
        <div className="pp-org">
          {tpl.showLogo && tpl.logoDataUrl ? (
            <img className="pp-logo" src={tpl.logoDataUrl} alt={tpl.orgName} />
          ) : (
            <div className="pp-orgname">
              <Ed path="set:orgName" value={tpl.orgName} acts={acts} placeholder="Company name" />
            </div>
          )}
          {(tpl.orgTagline || acts) && (
            <div className="pp-tagline">
              <Ed path="set:orgTagline" value={tpl.orgTagline} acts={acts} placeholder="Tagline" />
            </div>
          )}
        </div>
        <div className="pp-org-meta">
          {tpl.showLogo && tpl.logoDataUrl && (
            <b>
              <Ed path="set:orgName" value={tpl.orgName} acts={acts} />
            </b>
          )}
          {acts ? (
            <span style={{ whiteSpace: "pre-line" }}>
              <Ed path="set:orgAddress" value={tpl.orgAddress} acts={acts} multi placeholder="Address" />
            </span>
          ) : (
            tpl.orgAddress.split("\n").filter(Boolean).map((l, i) => <span key={i}>{l}</span>)
          )}
          {(tpl.orgPhone || acts) && (
            <span>
              <Ed path="set:orgPhone" value={tpl.orgPhone} acts={acts} placeholder="Phone" />
            </span>
          )}
          {(tpl.orgEmail || acts) && (
            <span>
              <Ed path="set:orgEmail" value={tpl.orgEmail} acts={acts} placeholder="Email" />
            </span>
          )}
        </div>
      </div>
    ),
    titleMeta: (
      <div className="pp-titlebar">
        <div className="pp-addresses">
          {!hid.has("billTo") && (
            <div className="pp-billto pp-el">
              <ElX id="billTo" acts={acts} />
              <div className="pp-lab">
                <Ed path="label:billTo" value={L.billTo} acts={acts} />
              </div>
              <div className="pp-billname">{data.customerName || "—"}</div>
              {(data.customerAddress ?? []).map((l, i) => (
                <span className="pp-addr" key={i}>
                  {l}
                </span>
              ))}
            </div>
          )}
          {tpl.showShipTo && (data.shipToAddress ?? []).length > 0 && (
            <div className="pp-billto">
              <div className="pp-lab">
                <Ed path="label:shipTo" value={L.shipTo} acts={acts} />
              </div>
              {(data.shipToAddress ?? []).map((l, i) => (
                <span className="pp-addr" key={i}>
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="pp-title">
          {!hid.has("docTitle") && (
            <h2 className="pp-el">
              <ElX id="docTitle" acts={acts} />
              <Ed path="set:documentTitle" value={tpl.documentTitle} acts={acts} placeholder="INVOICE" />
            </h2>
          )}
          {tpl.showBalanceBox && (
            <div className="pp-balance-box">
              <span>
                <Ed path="label:balanceDue" value={L.balanceDue} acts={acts} />
              </span>
              <b>{money(balance)}</b>
            </div>
          )}
          <table className="pp-meta">
            <tbody>
              {!hid.has("meta:invoiceNo") && (
                <tr>
                  <td className="pp-el">
                    <ElX id="meta:invoiceNo" acts={acts} />
                    <Ed path="label:invoiceNo" value={L.invoiceNo} acts={acts} />
                  </td>
                  <td>{data.number}</td>
                </tr>
              )}
              {tpl.showOrderNumber && data.orderNumber && (
                <tr>
                  <td>
                    <Ed path="label:orderNumber" value={L.orderNumber} acts={acts} />
                  </td>
                  <td>{data.orderNumber}</td>
                </tr>
              )}
              {!hid.has("meta:invoiceDate") && (
                <tr>
                  <td className="pp-el">
                    <ElX id="meta:invoiceDate" acts={acts} />
                    <Ed path="label:invoiceDate" value={L.invoiceDate} acts={acts} />
                  </td>
                  <td>{fmtLong(data.issued)}</td>
                </tr>
              )}
              {!hid.has("meta:terms") && (
                <tr>
                  <td className="pp-el">
                    <ElX id="meta:terms" acts={acts} />
                    <Ed path="label:terms" value={L.terms} acts={acts} />
                  </td>
                  <td>{data.terms}</td>
                </tr>
              )}
              {!hid.has("meta:dueDate") && (
                <tr>
                  <td className="pp-el">
                    <ElX id="meta:dueDate" acts={acts} />
                    <Ed path="label:dueDate" value={L.dueDate} acts={acts} />
                  </td>
                  <td>{fmtLong(data.due)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    ),
    subject: data.subject ? <div className="pp-subject">{data.subject}</div> : null,
    itemTable: (
      <table className="pp-lines">
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={c.width ? { width: `${c.width}%` } : undefined} />
          ))}
          {acts?.onAddColumn && <col style={{ width: 28 }} />}
        </colgroup>
        <thead>
          {cols.some((c) => c.group?.trim()) ? (
            <>
              <tr className="pp-group-row">
                {headSegments(cols).map((s, i) =>
                  s.group === null ? (
                    s.cols.map((c) => (
                      <th
                        key={c.key}
                        rowSpan={2}
                        className={RIGHT_COLS.has(c.key) ? "r" : CENTER_COLS.has(c.key) ? "c" : undefined}
                      >
                        <Ed path={`col:${c.key}`} value={c.label} acts={acts} />
                      </th>
                    ))
                  ) : (
                    <th key={`g-${i}`} colSpan={s.cols.length} className="g">
                      {acts ? (
                        <Ed path={`grp:${s.group}`} value={s.group} acts={acts} />
                      ) : (
                        <GroupLabel text={s.group} />
                      )}
                    </th>
                  ),
                )}
                {acts?.onAddColumn && (
                  <th className="pp-addcol" rowSpan={2}>
                    <button
                      type="button"
                      title="Add custom column"
                      onClick={(e) => {
                        e.stopPropagation();
                        acts.onAddColumn!();
                      }}
                    >
                      +
                    </button>
                  </th>
                )}
              </tr>
              <tr className="pp-sub-row">
                {cols
                  .filter((c) => c.group?.trim())
                  .map((c) => (
                    <th
                      key={c.key}
                      className={RIGHT_COLS.has(c.key) ? "r" : CENTER_COLS.has(c.key) ? "c" : undefined}
                    >
                      <Ed path={`col:${c.key}`} value={c.label} acts={acts} />
                    </th>
                  ))}
              </tr>
            </>
          ) : (
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={RIGHT_COLS.has(c.key) ? "r" : CENTER_COLS.has(c.key) ? "c" : undefined}
                >
                  <Ed path={`col:${c.key}`} value={c.label} acts={acts} />
                </th>
              ))}
              {acts?.onAddColumn && (
                <th className="pp-addcol">
                  <button
                    type="button"
                    title="Add custom column"
                    onClick={(e) => {
                      e.stopPropagation();
                      acts.onAddColumn!();
                    }}
                  >
                    +
                  </button>
                </th>
              )}
            </tr>
          )}
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={RIGHT_COLS.has(c.key) ? "r" : CENTER_COLS.has(c.key) ? "c" : undefined}
                  style={c.tint ? { background: c.tint } : undefined}
                >
                  {cellValue(c.key, l, i)}
                </td>
              ))}
              {acts?.onRemoveSampleRow && (
                <td className="pp-rowdel">
                  <button
                    type="button"
                    title="Remove sample row"
                    onClick={(e) => {
                      e.stopPropagation();
                      acts.onRemoveSampleRow!(i);
                    }}
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
          {cols.some((c) => c.total) && (
            <tr className="pp-total-row">
              {cols.map((c, i) => (
                <td
                  key={c.key}
                  className={RIGHT_COLS.has(c.key) ? "r" : CENTER_COLS.has(c.key) ? "c" : undefined}
                >
                  {i === 0 ? L.total : c.total ? colTotalText(c, data.lines) : ""}
                </td>
              ))}
              {acts?.onRemoveSampleRow && <td className="pp-rowdel" />}
            </tr>
          )}
          {acts?.onAddSampleRow && (
            <tr className="pp-addrow">
              <td colSpan={cols.length + 1}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    acts.onAddSampleRow!();
                  }}
                >
                  + Add sample row
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    ),
    totals: (
      <div className="pp-bottom">
        {!hid.has("notesArea") && (
          <div className="pp-notes pp-el">
            <ElX id="notesArea" acts={acts} />
            {data.notes && (
              <>
                <div className="pp-lab">
                  <Ed path="label:notes" value={L.notes} acts={acts} />
                </div>
                <p>{data.notes}</p>
              </>
            )}
            {(tpl.footerNote || acts) && (
              <p className="pp-footnote">
                <Ed path="set:footerNote" value={tpl.footerNote} acts={acts} placeholder="Footer note" />
              </p>
            )}
          </div>
        )}
        <div className="pp-sums">
          {cols
            .filter((c) => c.total && c.sumLabel?.trim())
            .map((c) => (
              <div key={c.key}>
                <span>
                  <Ed path={`sumlab:${c.key}`} value={c.sumLabel!} acts={acts} />
                </span>
                <span>{colTotalText(c, data.lines)}</span>
              </div>
            ))}
          {!hid.has("sum:subTotal") && (
            <div className="pp-el">
              <ElX id="sum:subTotal" acts={acts} />
              <span>
                <Ed path="label:subTotal" value={L.subTotal} acts={acts} />
              </span>
              <span>{money(sub)}</span>
            </div>
          )}
          {tpl.showDiscountRow && data.discountPct > 0 && (
            <div>
              <span>
                <Ed path="label:discount" value={L.discount} acts={acts} /> ({data.discountPct}%)
              </span>
              <span>−{money(disc)}</span>
            </div>
          )}
          {!hid.has("sum:tax") && data.taxPct > 0 && (
            <div className="pp-el">
              <ElX id="sum:tax" acts={acts} />
              <span>
                <Ed path="label:tax" value={L.tax} acts={acts} /> ({data.taxPct}%)
              </span>
              <span>{money(tax)}</span>
            </div>
          )}
          {tpl.showShippingRow && data.shipping !== 0 && (
            <div>
              <span>
                <Ed path="label:shipping" value={L.shipping} acts={acts} />
              </span>
              <span>{money(data.shipping)}</span>
            </div>
          )}
          {data.adjustment !== 0 && (
            <div>
              <span>
                <Ed path="label:adjustment" value={L.adjustment} acts={acts} />
              </span>
              <span>{money(data.adjustment)}</span>
            </div>
          )}
          {!hid.has("sum:total") && (
            <div className="pp-total pp-el">
              <ElX id="sum:total" acts={acts} />
              <span>
                <Ed path="label:total" value={L.total} acts={acts} />
              </span>
              <span>{money(grand)}</span>
            </div>
          )}
          {paid > 0 && !hid.has("sum:paid") && (
            <div className="pp-el">
              <ElX id="sum:paid" acts={acts} />
              <span>
                <Ed path="label:paid" value={L.paid} acts={acts} />
              </span>
              <span>−{money(paid)}</span>
            </div>
          )}
          {!hid.has("sum:balance") && (
            <div className="pp-balance pp-el">
              <ElX id="sum:balance" acts={acts} />
              <span>
                <Ed path="label:balanceDue" value={L.balanceDue} acts={acts} />
              </span>
              <span>{money(balance)}</span>
            </div>
          )}
        </div>
      </div>
    ),
    custom:
      tpl.freeRows.length > 0 || acts?.onFreeRowAdd ? (
        <div className="pp-free">
          {tpl.freeRows.map((r, ri) => (
            <div className="pp-free-row" key={r.id}>
              {r.cells.map((c, ci) => {
                const isSel = selCell?.ri === ri && selCell?.ci === ci;
                return (
                  <div
                    className={"pp-free-cell" + (isSel ? " sel" : "")}
                    key={ci}
                    style={{
                      color: c.color || undefined,
                      fontWeight: c.b ? 700 : undefined,
                      fontSize: c.size !== 100 ? `${c.size}%` : undefined,
                      textAlign: c.align,
                      flex: c.w ? `0 0 ${c.w}%` : "1 1 0",
                    }}
                  >
                    {acts?.onFreeCellPatch ? (
                      <>
                        <span
                          className="ed"
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          data-placeholder="Type here…"
                          style={{ whiteSpace: "pre-line", display: "block" }}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={() => setSelCell({ ri, ci })}
                          onBlur={(e) =>
                            acts.onFreeCellPatch!(ri, ci, {
                              t: (e.currentTarget.textContent ?? "").trim(),
                            })
                          }
                        >
                          {c.t}
                        </span>
                        {isSel && (
                          <div className="cell-pop" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="color"
                              title="Text color"
                              value={c.color || "#1e2227"}
                              onChange={(e) => acts.onFreeCellPatch!(ri, ci, { color: e.target.value })}
                            />
                            <button
                              type="button"
                              className={c.b ? "on" : ""}
                              title="Bold"
                              onClick={() => acts.onFreeCellPatch!(ri, ci, { b: !c.b })}
                            >
                              B
                            </button>
                            <input
                              type="number"
                              min={60}
                              max={200}
                              title="Text size %"
                              value={c.size}
                              onChange={(e) => acts.onFreeCellPatch!(ri, ci, { size: +e.target.value || 100 })}
                            />
                            <input
                              type="number"
                              min={5}
                              max={100}
                              placeholder="W%"
                              title="Cell width % (empty = share evenly)"
                              value={c.w ?? ""}
                              onChange={(e) =>
                                acts.onFreeCellPatch!(ri, ci, {
                                  w: e.target.value ? +e.target.value : null,
                                })
                              }
                            />
                            <select
                              title="Align"
                              value={c.align}
                              onChange={(e) => acts.onFreeCellPatch!(ri, ci, { align: e.target.value })}
                            >
                              <option value="left">←</option>
                              <option value="center">↔</option>
                              <option value="right">→</option>
                            </select>
                            <button
                              type="button"
                              title="Delete cell"
                              onClick={() => {
                                setSelCell(null);
                                acts.onFreeCellDelete!(ri, ci);
                              }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ whiteSpace: "pre-line" }}>{c.t}</span>
                    )}
                  </div>
                );
              })}
              {acts?.onFreeCellAdd && (
                <div className="pp-free-rowtools">
                  <button
                    type="button"
                    title="Add cell to this row"
                    onClick={(e) => {
                      e.stopPropagation();
                      acts.onFreeCellAdd!(ri);
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    title="Delete row"
                    onClick={(e) => {
                      e.stopPropagation();
                      acts.onFreeRowDelete!(ri);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
          {acts?.onFreeRowAdd && (
            <button
              type="button"
              className="pp-free-add"
              onClick={(e) => {
                e.stopPropagation();
                acts.onFreeRowAdd!();
              }}
            >
              + Add row
            </button>
          )}
        </div>
      ) : null,
    paymentInstructions:
      tpl.paymentInstructions || acts ? (
        <div className="pp-payinstr">
          <div className="pp-lab">
            <Ed path="label:paymentInstructions" value={L.paymentInstructions} acts={acts} />
          </div>
          <p>
            <Ed
              path="set:paymentInstructions"
              value={tpl.paymentInstructions}
              acts={acts}
              multi
              placeholder="Bank name / account / SWIFT…"
            />
          </p>
        </div>
      ) : null,
    terms: data.termsConditions ? (
      <div className="pp-terms">
        <div className="pp-lab">
          <Ed path="label:termsConditions" value={L.termsConditions} acts={acts} />
        </div>
        <p>{data.termsConditions}</p>
      </div>
    ) : null,
    signature: (
      <div className="pp-sign">
        <span className="pp-sign-line" />
        <span className="pp-sign-lab">
          <Ed path="label:signature" value={L.signature} acts={acts} />
        </span>
      </div>
    ),
  };

  return (
    <div
      className={`paper inv-paper ${tpl.layout} h-${tpl.headerStyle} t-${tpl.tableStyle}${selectable ? " studio" : ""}`}
      style={style}
    >
      {data.status && data.status !== "due" && (
        <span className={`ribbon ${data.status}`}>{STATUS_LABEL[data.status]}</span>
      )}
      {tpl.blocks
        .filter((b) => b.show)
        .map((b) => {
          const content = renderers[b.key];
          if (!content) return null;
          const sel = selectable?.selected === b.key;
          return (
            <div
              key={b.key}
              className={`pp-block pp-b-${b.key}${sel ? " sel" : ""}${dragOverKey === b.key ? " drag-over" : ""}`}
              style={blockStyle(b)}
              onClick={
                selectable
                  ? (e) => {
                      e.stopPropagation();
                      selectable.onSelect(b.key);
                    }
                  : undefined
              }
              onDragOver={
                acts
                  ? (e) => {
                      e.preventDefault();
                      setDragOverKey(b.key);
                    }
                  : undefined
              }
              onDragLeave={acts ? () => setDragOverKey(null) : undefined}
              onDrop={
                acts
                  ? (e) => {
                      e.preventDefault();
                      setDragOverKey(null);
                      const from = e.dataTransfer.getData("text/block-key");
                      if (from && from !== b.key) acts.onReorder(from, b.key);
                    }
                  : undefined
              }
            >
              {sel && acts && (
                <div className="pp-toolbar" onClick={(e) => e.stopPropagation()}>
                  <button type="button" title="Edit this section — texts & styling" onClick={() => acts.onEditText(b.key)}>
                    ✎ Edit
                  </button>
                  <span
                    className="pp-drag"
                    title="Drag to move this section"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/block-key", b.key);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    ⠿
                  </span>
                  <button
                    type="button"
                    title={
                      acts.requiredKeys.has(b.key)
                        ? "Required — always printed"
                        : "Remove from paper"
                    }
                    disabled={acts.requiredKeys.has(b.key)}
                    onClick={() => acts.onHide(b.key)}
                  >
                    🗑
                  </button>
                </div>
              )}
              {content}
            </div>
          );
        })}
    </div>
  );
}
