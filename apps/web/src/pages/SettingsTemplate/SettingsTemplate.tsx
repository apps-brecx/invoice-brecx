import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  REQUIRED_BLOCK_KEYS,
  REQUIRED_COLUMN_KEYS,
  type BlockKey,
} from "@inv/shared";
import type { TemplateRecord, TemplateSettings } from "../../lib/template";
import {
  fetchTemplates,
  createTemplate,
  updateTemplate,
  activateTemplate,
  deleteTemplate,
  DEFAULT_TEMPLATE,
} from "../../lib/template";
import { InvoicePaper, SAMPLE_PAPER } from "../../components/InvoicePaper";
import { ConfirmModal } from "../../components/ConfirmModal";
import { useToast } from "../../components/Toast";

type Labels = TemplateSettings["labels"];

const BLOCK_NAMES: Record<BlockKey, string> = {
  header: "Header — logo & company",
  titleMeta: "Title, Bill/Ship To & invoice meta",
  subject: "Subject line",
  itemTable: "Item table",
  totals: "Notes & totals",
  custom: "Custom content — free rows",
  paymentInstructions: "Payment instructions",
  terms: "Terms & conditions",
  signature: "Signature",
};

const ELEMENT_NAMES: Record<string, string> = {
  docTitle: "Document title",
  billTo: "Bill To block",
  "meta:invoiceNo": "Invoice number row",
  "meta:invoiceDate": "Invoice date row",
  "meta:terms": "Terms row",
  "meta:dueDate": "Due date row",
  "sum:subTotal": "Sub total row",
  "sum:tax": "Tax row",
  "sum:total": "Total row",
  "sum:paid": "Payments received row",
  "sum:balance": "Balance due row",
  notesArea: "Notes & footer note",
};

const REQUIRED_BLOCKS = new Set<string>(REQUIRED_BLOCK_KEYS);
const REQUIRED_COLS = new Set<string>(REQUIRED_COLUMN_KEYS);

const LABEL_FIELDS: Array<[keyof Labels, string]> = [
  ["billTo", "Bill To block"],
  ["shipTo", "Ship To block"],
  ["invoiceNo", "Invoice number"],
  ["orderNumber", "Order number"],
  ["invoiceDate", "Invoice date"],
  ["terms", "Terms"],
  ["dueDate", "Due date"],
  ["balanceDue", "Balance due"],
  ["subTotal", "Sub total"],
  ["discount", "Discount"],
  ["tax", "Tax"],
  ["shipping", "Shipping"],
  ["adjustment", "Adjustment"],
  ["total", "Total"],
  ["paid", "Payments received"],
  ["notes", "Notes"],
  ["termsConditions", "Terms & conditions"],
  ["signature", "Signature line"],
  ["paymentInstructions", "Payment instructions"],
];

/* =================== Gallery =================== */

export function SettingsTemplate() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TemplateRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TemplateRecord | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates());
    } catch {
      toast("Could not load templates", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function use(t: TemplateRecord) {
    try {
      await activateTemplate(t.id);
      await load();
      toast(`"${t.name}" is now used on every invoice`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to activate", "error");
    }
  }

  async function remove(t: TemplateRecord) {
    setConfirmDelete(null);
    setDeletingId(t.id);
    try {
      await deleteTemplate(t.id);
      await load();
      toast(`Template "${t.name}" deleted`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete the template", "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    // Gallery-shaped shimmer: the real page head plus three placeholder
    // template cards, so nothing jumps when the templates arrive.
    return (
      <section className="view" aria-busy="true">
        <div className="page-head">
          <div>
            <h1>Invoice templates</h1>
            <p>Every template previews live — pick one, edit it, or design a new one.</p>
          </div>
        </div>
        <div className="tpl-gallery" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div className="card tpl-gal-card" key={i}>
              <div className="tpl-skel">
                <div className="skel-bar w60" />
                <div className="skel-block" />
                <div className="skel-bar w80" />
                <div className="skel-bar w40" />
              </div>
              <div className="tpl-gal-foot">
                <span className="skel-bar" style={{ display: "block", width: `${46 + i * 12}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (editing) {
    return (
      <TemplateStudio
        record={editing}
        onBack={async (changed) => {
          setEditing(null);
          if (changed) await load();
        }}
      />
    );
  }

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>Invoice templates</h1>
          <p>Every template previews live — pick one, edit it, or design a new one.</p>
        </div>
        <div className="right">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New template
          </button>
        </div>
      </div>

      <div className="tpl-gallery">
        {templates.map((t) => {
          const deleting = deletingId === t.id;
          return (
            <div
              className={"card tpl-gal-card" + (t.active ? " on" : "") + (deleting ? " deleting" : "")}
              key={t.id}
            >
              {deleting ? (
                <div className="tpl-skel">
                  <div className="skel-bar w60" />
                  <div className="skel-block" />
                  <div className="skel-bar w80" />
                  <div className="skel-bar w40" />
                  <span className="tpl-skel-lab">Deleting…</span>
                </div>
              ) : (
                <div className="tpl-thumb lg">
                  <span className="tpl-thumb-inner lg">
                    <InvoicePaper tpl={t.settings} data={SAMPLE_PAPER} />
                  </span>
                </div>
              )}
              {t.active && !deleting && <span className="tpl-selected">★ SELECTED</span>}
              <div className="tpl-gal-foot">
                <b>{t.name}</b>
                <div className="tpl-gal-actions">
                  {!t.active && (
                    <button className="btn btn-ghost" disabled={deleting} onClick={() => void use(t)}>
                      Use
                    </button>
                  )}
                  <button className="btn btn-ghost" disabled={deleting} onClick={() => setEditing(t)}>
                    ✎ Edit
                  </button>
                  {!t.active && (
                    <button
                      className="btn btn-danger"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(t)}
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete this template?"
          message={
            <>
              <b>“{confirmDelete.name}”</b> will be permanently deleted. Invoices already
              created are not affected — they always print with the active template.
            </>
          }
          confirmLabel="Yes, delete it"
          onConfirm={() => void remove(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {creating && (
        <NewTemplateModal
          templates={templates}
          onClose={() => setCreating(false)}
          onCreated={async (rec) => {
            setCreating(false);
            await load();
            setEditing(rec); // straight into the studio
            toast(`Template "${rec.name}" created — design away`);
          }}
        />
      )}
    </section>
  );
}

/* =================== New template =================== */

function NewTemplateModal({
  templates,
  onClose,
  onCreated,
}: {
  templates: TemplateRecord[];
  onClose: () => void;
  onCreated: (rec: TemplateRecord) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseId, setBaseId] = useState<number | 0>(templates.find((t) => t.active)?.id ?? 0);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const base = templates.find((t) => t.id === baseId)?.settings ?? DEFAULT_TEMPLATE;
      const rec = await createTemplate(name.trim(), base);
      await onCreated(rec);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to create template", "error");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>New template</h3>
        <div className="field lab-top">
          <span className="f-cap">Template name *</span>
          <input
            required
            autoFocus
            placeholder="e.g. Wholesale — dual pricing"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field lab-top">
          <span className="f-cap">Start from</span>
          <select value={baseId} onChange={(e) => setBaseId(Number(e.target.value))}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                Copy of “{t.name}”
              </option>
            ))}
            <option value={0}>Blank (defaults)</option>
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create & design"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* =================== Block text editor =================== */

/** "✎ Edit" on a selected preview block — texts, labels, per-block field
 *  toggles AND placement/styling for exactly that block, in one modal. */
function BlockTextModal({
  blockKey,
  tpl,
  set,
  onLogoPick,
  onClose,
}: {
  blockKey: string;
  tpl: TemplateSettings;
  set: <K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) => void;
  onLogoPick: (file: File | undefined) => void;
  onClose: () => void;
}) {
  type Block = TemplateSettings["blocks"][number];
  const block = tpl.blocks.find((b) => b.key === blockKey);
  const patchBlock = (patch: Partial<Block>) =>
    set(
      "blocks",
      tpl.blocks.map((b) => (b.key === blockKey ? { ...b, ...patch } : b)),
    );
  const logoRef = useRef<HTMLInputElement>(null);
  const L = tpl.labels;
  const setL = (k: keyof Labels, v: string) => set("labels", { ...tpl.labels, [k]: v });
  // Plain function call (not a JSX component) — a nested component type
  // would remount on every keystroke and drop input focus.
  const Txt = ({ k, caption }: { k: keyof Labels; caption: string }): ReactNode => (
    <div className="field" key={k}>
      <input value={L[k]} onChange={(e) => setL(k, e.target.value)} />
      <small>{caption}</small>
    </div>
  );

  let body: ReactNode;
  switch (blockKey) {
    case "header":
      body = (
        <>
          <div className="f-row">
            <div className="field">
              <input value={tpl.orgName} onChange={(e) => set("orgName", e.target.value)} />
              <small>Company name</small>
            </div>
            <div className="field">
              <input value={tpl.orgTagline} onChange={(e) => set("orgTagline", e.target.value)} />
              <small>Tagline</small>
            </div>
          </div>
          <div className="field">
            <textarea
              rows={2}
              value={tpl.orgAddress}
              onChange={(e) => set("orgAddress", e.target.value)}
            />
            <small>Address (one line per row)</small>
          </div>
          <div className="f-row">
            <div className="field">
              <input value={tpl.orgPhone} onChange={(e) => set("orgPhone", e.target.value)} />
              <small>Phone</small>
            </div>
            <div className="field">
              <input value={tpl.orgEmail} onChange={(e) => set("orgEmail", e.target.value)} />
              <small>Email</small>
            </div>
          </div>
          <div className="logo-row">
            {tpl.logoDataUrl ? (
              <img className="logo-thumb" src={tpl.logoDataUrl} alt="Logo" />
            ) : (
              <div className="logo-thumb empty">No logo</div>
            )}
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onLogoPick(e.target.files?.[0])}
            />
            <button type="button" className="btn btn-ghost" onClick={() => logoRef.current?.click()}>
              Upload logo
            </button>
            {tpl.logoDataUrl && (
              <button type="button" className="btn btn-danger" onClick={() => set("logoDataUrl", "")}>
                Remove
              </button>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showLogo}
                onChange={(e) => set("showLogo", e.target.checked)}
              />
              Show logo
            </label>
          </div>
        </>
      );
      break;
    case "titleMeta":
      body = (
        <>
          <div className="field">
            <input
              value={tpl.documentTitle}
              onChange={(e) => set("documentTitle", e.target.value.toUpperCase())}
            />
            <small>Document title</small>
          </div>
          <div className="labels-grid">
            {Txt({ k: "billTo", caption: "Bill To label" })}
            {Txt({ k: "shipTo", caption: "Ship To label" })}
            {Txt({ k: "invoiceNo", caption: "Invoice number label" })}
            {Txt({ k: "orderNumber", caption: "Order number label" })}
            {Txt({ k: "invoiceDate", caption: "Invoice date label" })}
            {Txt({ k: "terms", caption: "Terms label" })}
            {Txt({ k: "dueDate", caption: "Due date label" })}
            {Txt({ k: "balanceDue", caption: "Balance due label" })}
          </div>
          <div className="check-grid">
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showBalanceBox}
                onChange={(e) => set("showBalanceBox", e.target.checked)}
              />
              Balance Due box
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showOrderNumber}
                onChange={(e) => set("showOrderNumber", e.target.checked)}
              />
              Order number row
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showShipTo}
                onChange={(e) => set("showShipTo", e.target.checked)}
              />
              Ship To block
            </label>
          </div>
        </>
      );
      break;
    case "itemTable":
      body = (
        <>
          {tpl.columns.map((col, i) => (
            <div className="col-row" key={col.key}>
              <label className="check" title={REQUIRED_COLS.has(col.key) ? "Required" : undefined}>
                <input
                  type="checkbox"
                  checked={col.show}
                  disabled={REQUIRED_COLS.has(col.key)}
                  onChange={(e) =>
                    set(
                      "columns",
                      tpl.columns.map((c, idx) => (idx === i ? { ...c, show: e.target.checked } : c)),
                    )
                  }
                />
              </label>
              <input
                className="col-label"
                value={col.label}
                onChange={(e) =>
                  set(
                    "columns",
                    tpl.columns.map((c, idx) => (idx === i ? { ...c, label: e.target.value } : c)),
                  )
                }
              />
              <input
                className="col-label group"
                placeholder="Group"
                value={col.group ?? ""}
                onChange={(e) =>
                  set(
                    "columns",
                    tpl.columns.map((c, idx) =>
                      idx === i ? { ...c, group: e.target.value || null } : c,
                    ),
                  )
                }
              />
              <input
                className="col-label col-w"
                type="number"
                min={4}
                max={80}
                placeholder="W%"
                title="Column width (% of table). Empty = automatic."
                value={col.width ?? ""}
                onChange={(e) =>
                  set(
                    "columns",
                    tpl.columns.map((c, idx) =>
                      idx === i ? { ...c, width: e.target.value ? +e.target.value : null } : c,
                    ),
                  )
                }
              />
              {col.key.startsWith("custom:") && (
                <button
                  type="button"
                  className="icon-btn"
                  title="Delete column"
                  onClick={() => set("columns", tpl.columns.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add-line"
            onClick={() =>
              set("columns", [
                ...tpl.columns,
                {
                  key: `custom:${Math.random().toString(36).slice(2, 8)}`,
                  label: "Custom column",
                  show: true,
                },
              ])
            }
          >
            + Add custom column
          </button>
          <p className="tab-note">
            Width is % of the table (empty = automatic). Drag-reorder from the “Item table
            columns” panel.
          </p>
        </>
      );
      break;
    case "totals":
      body = (
        <>
          <div className="labels-grid">
            {Txt({ k: "subTotal", caption: "Sub total label" })}
            {Txt({ k: "discount", caption: "Discount label" })}
            {Txt({ k: "tax", caption: "Tax label" })}
            {Txt({ k: "shipping", caption: "Shipping label" })}
            {Txt({ k: "adjustment", caption: "Adjustment label" })}
            {Txt({ k: "total", caption: "Total label" })}
            {Txt({ k: "paid", caption: "Payments received label" })}
            {Txt({ k: "balanceDue", caption: "Balance due label" })}
            {Txt({ k: "notes", caption: "Notes label" })}
          </div>
          <div className="field">
            <input value={tpl.footerNote} onChange={(e) => set("footerNote", e.target.value)} />
            <small>Footer note</small>
          </div>
          <div className="check-grid">
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showDiscountRow}
                onChange={(e) => set("showDiscountRow", e.target.checked)}
              />
              Discount row
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={tpl.showShippingRow}
                onChange={(e) => set("showShippingRow", e.target.checked)}
              />
              Shipping row
            </label>
          </div>
        </>
      );
      break;
    case "paymentInstructions":
      body = (
        <>
          {Txt({ k: "paymentInstructions", caption: "Block heading" })}
          <div className="field">
            <textarea
              rows={4}
              placeholder={"Bank name: …\nAccount number: …\nSWIFT: …"}
              value={tpl.paymentInstructions}
              onChange={(e) => set("paymentInstructions", e.target.value)}
            />
            <small>Payment instructions text</small>
          </div>
        </>
      );
      break;
    case "terms":
      body = (
        <>
          {Txt({ k: "termsConditions", caption: "Block heading" })}
          <div className="field">
            <textarea
              rows={4}
              value={tpl.defaultTerms}
              onChange={(e) => set("defaultTerms", e.target.value)}
            />
            <small>Default terms & conditions (each invoice can override)</small>
          </div>
        </>
      );
      break;
    case "signature":
      body = Txt({ k: "signature", caption: "Signature line label" });
      break;
    case "custom":
      body = (
        <p className="tab-note">
          Edit this block directly on the paper — “+ Add row” for new rows, “+” beside a
          row for more cells, click a cell to type and style it (color, bold, size, width,
          align).
        </p>
      );
      break;
    default:
      body = (
        <p className="tab-note">
          This section's text comes from each invoice (the Subject field on the invoice
          form) — the template only controls its placement and style.
        </p>
      );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Edit — {BLOCK_NAMES[blockKey as BlockKey] ?? blockKey}</h3>
        {body}
        {block && (
          <>
            <div className="modal-sub">Placement & styling</div>
            <div className="block-style in-modal">
              <div className="bs-field">
                <input
                  type="number"
                  min={30}
                  max={100}
                  value={block.w}
                  onChange={(e) => patchBlock({ w: +e.target.value || 100 })}
                />
                <small>Width (%)</small>
              </div>
              <div className="bs-field">
                <select
                  value={block.pos}
                  onChange={(e) => patchBlock({ pos: e.target.value as Block["pos"] })}
                  disabled={block.w >= 100}
                  title={block.w >= 100 ? "Set width below 100% to position the block" : undefined}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <small>Position</small>
              </div>
              <div className="bs-field">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={block.pad}
                  onChange={(e) => patchBlock({ pad: +e.target.value || 0 })}
                />
                <small>Padding (px)</small>
              </div>
              <div className="bs-field">
                <input
                  type="number"
                  min={70}
                  max={140}
                  value={block.size}
                  onChange={(e) => patchBlock({ size: +e.target.value || 100 })}
                />
                <small>Text size (%)</small>
              </div>
              <div className="bs-field">
                <select
                  value={block.align}
                  onChange={(e) => patchBlock({ align: e.target.value as Block["align"] })}
                >
                  <option value="auto">Auto</option>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
                <small>Align</small>
              </div>
              <div className="bs-field">
                <div className="bs-color">
                  <input
                    type="color"
                    value={block.color || "#1e2227"}
                    onChange={(e) => patchBlock({ color: e.target.value })}
                  />
                  {block.color && (
                    <button type="button" className="link-btn" onClick={() => patchBlock({ color: "" })}>
                      ✕
                    </button>
                  )}
                </div>
                <small>Text color</small>
              </div>
              <div className="bs-field">
                <div className="bs-color">
                  <input
                    type="color"
                    value={block.bg || "#ffffff"}
                    onChange={(e) => patchBlock({ bg: e.target.value })}
                  />
                  {block.bg && (
                    <button type="button" className="link-btn" onClick={() => patchBlock({ bg: "" })}>
                      ✕
                    </button>
                  )}
                </div>
                <small>Background</small>
              </div>
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== Studio =================== */

/** Accordion section — defined at module level so React keeps its children
 *  mounted across renders (inputs would lose focus otherwise). */
function Sec({
  id,
  title,
  openSecs,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  openSecs: Set<string>;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const open = openSecs.has(id);
  return (
    <div className={"acc" + (open ? " open" : "")}>
      <button type="button" className="acc-head" onClick={() => onToggle(id)}>
        <span>{title}</span>
        <i>{open ? "−" : "+"}</i>
      </button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  );
}

function TemplateStudio({
  record,
  onBack,
}: {
  record: TemplateRecord;
  onBack: (changed: boolean) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(record.name);
  const [tpl, setTpl] = useState<TemplateSettings>(record.settings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [openSecs, setOpenSecs] = useState<Set<string>>(new Set(["logo", "design", "blocks"]));
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [textBlock, setTextBlock] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) => {
    setTpl((cur) => ({ ...cur, [key]: value }));
    setDirty(true);
  };

  const toggleSec = (id: string) =>
    setOpenSecs((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  type Block = TemplateSettings["blocks"][number];
  const setBlock = (i: number, patch: Partial<Block>) =>
    set(
      "blocks",
      tpl.blocks.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    );
  const setCol = (i: number, patch: Partial<TemplateSettings["columns"][number]>) =>
    set(
      "columns",
      tpl.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );

  const [dragOverRow, setDragOverRow] = useState<string | null>(null);

  function reorderByKey<T extends { key: string }>(arr: T[], fromKey: string, toKey: string): T[] {
    const fi = arr.findIndex((x) => x.key === fromKey);
    const ti = arr.findIndex((x) => x.key === toKey);
    if (fi < 0 || ti < 0 || fi === ti) return arr;
    const next = [...arr];
    const [moved] = next.splice(fi, 1);
    next.splice(ti, 0, moved);
    return next;
  }
  const reorderBlocks = (from: string, to: string) =>
    set("blocks", reorderByKey(tpl.blocks, from, to));
  const reorderCols = (from: string, to: string) =>
    set("columns", reorderByKey(tpl.columns, from, to));

  function onLogoPick(file: File | undefined) {
    if (!file) return;
    if (file.size > 300_000) {
      toast("Logo must be under 300 KB — export a smaller PNG/SVG.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoDataUrl", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }

  async function onSave() {
    setSaving(true);
    try {
      await updateTemplate(record.id, name.trim() || record.name, tpl);
      toast(`Template "${name}" saved${record.active ? " — live on every invoice" : ""}`);
      setDirty(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save template", "error");
    } finally {
      setSaving(false);
    }
  }

  // Clicking a block on the preview selects it (toolbar appears on it).
  function selectFromPreview(key: string) {
    setOpenBlock(key);
  }

  function hideBlockByKey(key: string) {
    const i = tpl.blocks.findIndex((b) => b.key === key);
    if (i < 0) return;
    setBlock(i, { show: false });
    setOpenBlock(null);
  }

  // Notion-style inline edits coming back from the preview.
  const STRING_SETTINGS = new Set([
    "orgName", "orgTagline", "orgAddress", "orgPhone", "orgEmail",
    "documentTitle", "footerNote", "paymentInstructions",
  ]);
  function onFieldEdit(path: string, value: string) {
    const sep = path.indexOf(":");
    const kind = path.slice(0, sep);
    const key = path.slice(sep + 1);
    if (kind === "label") {
      set("labels", { ...tpl.labels, [key]: value });
    } else if (kind === "set" && STRING_SETTINGS.has(key)) {
      set(key as "orgName", key === "documentTitle" ? value.toUpperCase() : value);
    } else if (kind === "col") {
      set("columns", tpl.columns.map((c) => (c.key === key ? { ...c, label: value } : c)));
    } else if (kind === "grp") {
      set(
        "columns",
        tpl.columns.map((c) => ((c.group ?? "") === key ? { ...c, group: value || null } : c)),
      );
    } else if (kind === "sumlab") {
      set(
        "columns",
        tpl.columns.map((c) => (c.key === key ? { ...c, sumLabel: value || null } : c)),
      );
    }
  }

  const addColumn = () =>
    set("columns", [
      ...tpl.columns,
      { key: `custom:${Math.random().toString(36).slice(2, 8)}`, label: "Custom column", show: true },
    ]);

  // Sample rows are preview-only — they help judge widths and styles.
  const [sampleLines, setSampleLines] = useState(SAMPLE_PAPER.lines);
  const previewData = { ...SAMPLE_PAPER, lines: sampleLines };

  // Granular element removal + free content rows.
  const hideEl = (id: string) =>
    set("hidden", tpl.hidden.includes(id) ? tpl.hidden : [...tpl.hidden, id]);
  const restoreEl = (id: string) => set("hidden", tpl.hidden.filter((h) => h !== id));
  type FreeCellT = TemplateSettings["freeRows"][number]["cells"][number];
  const newCell = (): FreeCellT => ({ t: "", color: "", b: false, size: 100, w: null, align: "left" });
  const freeRowAdd = () =>
    set("freeRows", [
      ...tpl.freeRows,
      { id: Math.random().toString(36).slice(2, 8), cells: [newCell()] },
    ]);
  const freeRowDelete = (ri: number) =>
    set("freeRows", tpl.freeRows.filter((_, i) => i !== ri));
  const freeCellAdd = (ri: number) =>
    set(
      "freeRows",
      tpl.freeRows.map((r, i) =>
        i === ri && r.cells.length < 6 ? { ...r, cells: [...r.cells, newCell()] } : r,
      ),
    );
  const freeCellPatch = (ri: number, ci: number, patch: Record<string, unknown>) =>
    set(
      "freeRows",
      tpl.freeRows.map((r, i) =>
        i === ri
          ? { ...r, cells: r.cells.map((c, j) => (j === ci ? { ...c, ...patch } : c)) }
          : r,
      ),
    );
  const freeCellDelete = (ri: number, ci: number) =>
    set(
      "freeRows",
      tpl.freeRows
        .map((r, i) => (i === ri ? { ...r, cells: r.cells.filter((_, j) => j !== ci) } : r))
        .filter((r) => r.cells.length > 0),
    );

  return (
    <section className="view">
      <div className="page-head">
        <div>
          <h1>
            <button className="icon-btn" style={{ marginRight: 10 }} onClick={() => void onBack(!dirty)}>
              ←
            </button>
            Template studio
          </h1>
          <p>
            Click any section on the paper to style it ·{" "}
            {record.active
              ? "this is the active template — changes apply to every invoice."
              : "not active — use it from the gallery when ready."}
          </p>
        </div>
        <div className="right">
          <button className="btn btn-ghost" onClick={() => setTpl(DEFAULT_TEMPLATE)}>
            Reset
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      <div className="tpl-grid studio-grid">
        <div className="card form-card studio-panel" ref={panelRef}>
          <Sec id="template" title="Template" openSecs={openSecs} onToggle={toggleSec}>
            <div className="field">
              <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              <small>Template name</small>
            </div>
            <div className="field">
              <select
                value={tpl.layout}
                onChange={(e) => set("layout", e.target.value as TemplateSettings["layout"])}
              >
                <option value="standard">Standard</option>
                <option value="continental">Continental</option>
                <option value="compact">Compact</option>
              </select>
              <small>Layout preset</small>
            </div>
          </Sec>

          <Sec id="business" title="Business details" openSecs={openSecs} onToggle={toggleSec}>
            <div className="f-row">
              <div className="field">
                <input value={tpl.orgName} onChange={(e) => set("orgName", e.target.value)} />
                <small>Company name</small>
              </div>
              <div className="field">
                <input value={tpl.orgTagline} onChange={(e) => set("orgTagline", e.target.value)} />
                <small>Tagline (optional)</small>
              </div>
            </div>
            <div className="field">
              <textarea
                rows={2}
                value={tpl.orgAddress}
                onChange={(e) => set("orgAddress", e.target.value)}
              />
              <small>Address (one line per row)</small>
            </div>
            <div className="f-row">
              <div className="field">
                <input value={tpl.orgPhone} onChange={(e) => set("orgPhone", e.target.value)} />
                <small>Phone</small>
              </div>
              <div className="field">
                <input value={tpl.orgEmail} onChange={(e) => set("orgEmail", e.target.value)} />
                <small>Email</small>
              </div>
            </div>
          </Sec>

          <Sec id="logo" title="Logo" openSecs={openSecs} onToggle={toggleSec}>
            <div className="logo-row">
              {tpl.logoDataUrl ? (
                <img className="logo-thumb" src={tpl.logoDataUrl} alt="Logo" />
              ) : (
                <div className="logo-thumb empty">No logo</div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onLogoPick(e.target.files?.[0])}
              />
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                Upload logo
              </button>
              {tpl.logoDataUrl && (
                <button type="button" className="btn btn-danger" onClick={() => set("logoDataUrl", "")}>
                  Remove
                </button>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showLogo}
                  onChange={(e) => set("showLogo", e.target.checked)}
                />
                Show logo
              </label>
            </div>
            <p className="tab-note" style={{ padding: "8px 0 0" }}>
              No logo? The company name prints in its place.
            </p>
          </Sec>

          <Sec id="design" title="Design — colors, fonts, styles" openSecs={openSecs} onToggle={toggleSec}>
            <div className="f-row three">
              <div className="field">
                <input
                  type="color"
                  className="color-in"
                  value={tpl.accent}
                  onChange={(e) => set("accent", e.target.value)}
                />
                <small>Accent color</small>
              </div>
              <div className="field">
                <input
                  type="color"
                  className="color-in"
                  value={tpl.labelColor}
                  onChange={(e) => set("labelColor", e.target.value)}
                />
                <small>Label color</small>
              </div>
              <div className="field">
                <select
                  value={tpl.font}
                  onChange={(e) => set("font", e.target.value as TemplateSettings["font"])}
                >
                  <option value="sans">Sans (Jakarta)</option>
                  <option value="serif">Serif (Georgia)</option>
                  <option value="mono">Mono (JetBrains)</option>
                </select>
                <small>Font</small>
              </div>
            </div>
            <div className="f-row three">
              <div className="field">
                <select
                  value={tpl.headerStyle}
                  onChange={(e) => set("headerStyle", e.target.value as TemplateSettings["headerStyle"])}
                >
                  <option value="logo-left">Logo left (classic)</option>
                  <option value="logo-right">Logo right</option>
                  <option value="centered">Centered</option>
                  <option value="brand-left">Brand left (stacked)</option>
                </select>
                <small>Header style</small>
              </div>
              <div className="field">
                <select
                  value={tpl.tableStyle}
                  onChange={(e) => set("tableStyle", e.target.value as TemplateSettings["tableStyle"])}
                >
                  <option value="band">Accent band</option>
                  <option value="zebra">Zebra rows</option>
                  <option value="boxed">Boxed grid</option>
                  <option value="minimal">Minimal lines</option>
                </select>
                <small>Item table style</small>
              </div>
              <div className="field">
                <input
                  value={tpl.documentTitle}
                  onChange={(e) => set("documentTitle", e.target.value.toUpperCase())}
                />
                <small>Document title</small>
              </div>
            </div>
            <div className="check-grid">
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showBalanceBox}
                  onChange={(e) => set("showBalanceBox", e.target.checked)}
                />
                Balance Due box under title
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showShipTo}
                  onChange={(e) => set("showShipTo", e.target.checked)}
                />
                Ship To block
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showOrderNumber}
                  onChange={(e) => set("showOrderNumber", e.target.checked)}
                />
                Order number row
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showDiscountRow}
                  onChange={(e) => set("showDiscountRow", e.target.checked)}
                />
                Discount row
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={tpl.showShippingRow}
                  onChange={(e) => set("showShippingRow", e.target.checked)}
                />
                Shipping row
              </label>
            </div>
          </Sec>

          <Sec id="blocks" title="Layout blocks" openSecs={openSecs} onToggle={toggleSec}>
            <p className="tab-note" style={{ padding: "0 0 8px" }}>
              Everything is edited on the paper: click a section to select it, then
              <b> ✎ Edit</b> opens its editor (texts + styling), <b>⠿</b> drags it to a
              new position, <b>🗑</b> removes it. Removed things come back from here.
            </p>
            {tpl.blocks.some((b) => !b.show) && (
              <div className="hidden-chips">
                <small>Removed sections — click to restore:</small>
                <div>
                  {tpl.blocks.map((b, i) =>
                    b.show ? null : (
                      <button
                        key={b.key}
                        type="button"
                        className="chip"
                        onClick={() => setBlock(i, { show: true })}
                      >
                        {BLOCK_NAMES[b.key as BlockKey] ?? b.key} ↩
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {tpl.hidden.length > 0 && (
              <div className="hidden-chips">
                <small>Removed items — click to restore:</small>
                <div>
                  {tpl.hidden.map((id) => (
                    <button key={id} type="button" className="chip" onClick={() => restoreEl(id)}>
                      {ELEMENT_NAMES[id] ?? id} ↩
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Sec>

          <Sec id="columns" title="Item table columns" openSecs={openSecs} onToggle={toggleSec}>
            <p className="tab-note" style={{ padding: "0 0 8px" }}>
              Rename, reorder, add custom columns. Same “Group” name on neighbouring
              columns prints a spanning header (e.g. “Special Pricing”). 🔒 columns carry
              the invoice math.
            </p>
            {tpl.columns.map((col, i) => {
              const isCustom = col.key.startsWith("custom:");
              const locked = REQUIRED_COLS.has(col.key);
              return (
                <div
                  className={"col-row" + (dragOverRow === `col:${col.key}` ? " drag-over" : "")}
                  key={col.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverRow(`col:${col.key}`);
                  }}
                  onDragLeave={() => setDragOverRow(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverRow(null);
                    const from = e.dataTransfer.getData("text/col-key");
                    if (from && from !== col.key) reorderCols(from, col.key);
                  }}
                >
                  <span
                    className="drag-handle"
                    title="Drag to reorder"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/col-key", col.key);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    ⠿
                  </span>
                  <label
                    className="check"
                    title={locked ? "Required — the invoice math needs it" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={col.show}
                      disabled={locked}
                      onChange={(e) => setCol(i, { show: e.target.checked })}
                    />
                  </label>
                  <input
                    className="col-label"
                    value={col.label}
                    onChange={(e) => setCol(i, { label: e.target.value })}
                  />
                  <input
                    className="col-label group"
                    placeholder="Group"
                    value={col.group ?? ""}
                    onChange={(e) => setCol(i, { group: e.target.value || null })}
                  />
                  <input
                    className="col-label col-w"
                    type="number"
                    min={4}
                    max={80}
                    placeholder="W%"
                    title="Column width (% of table). Empty = automatic."
                    value={col.width ?? ""}
                    onChange={(e) => setCol(i, { width: e.target.value ? +e.target.value : null })}
                  />
                  <select
                    className="col-sum"
                    title="Sum this column in a TOTAL row at the foot of the table — as a count (Σ #) or as money (Σ $)"
                    value={col.total ?? ""}
                    onChange={(e) =>
                      setCol(i, { total: (e.target.value || null) as TemplateSettings["columns"][number]["total"] })
                    }
                  >
                    <option value="">Σ off</option>
                    <option value="count">Σ #</option>
                    <option value="money">Σ $</option>
                  </select>
                  <span className="col-key">
                    {isCustom ? "custom" : col.key}
                    {locked && " 🔒"}
                  </span>
                  {isCustom ? (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete column"
                      onClick={() => set("columns", tpl.columns.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  ) : (
                    <span style={{ width: 28 }} />
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="add-line"
              onClick={() =>
                set("columns", [
                  ...tpl.columns,
                  {
                    key: `custom:${Math.random().toString(36).slice(2, 8)}`,
                    label: "Custom column",
                    show: true,
                  },
                ])
              }
            >
              + Add custom column
            </button>
            <p className="tab-note" style={{ padding: "6px 0 0" }}>
              Custom columns get their own input on the invoice form — whatever you type
              there prints in this column.
            </p>
          </Sec>

          <Sec id="labels" title="Field labels" openSecs={openSecs} onToggle={toggleSec}>
            <p className="tab-note" style={{ padding: "0 0 8px" }}>
              Rename any label — e.g. “Rate” → “Unit Price”, “Bill To” → “Sold To”.
            </p>
            <div className="labels-grid">
              {LABEL_FIELDS.map(([key, caption]) => (
                <div className="field" key={key}>
                  <input
                    value={tpl.labels[key]}
                    onChange={(e) => set("labels", { ...tpl.labels, [key]: e.target.value })}
                  />
                  <small>{caption}</small>
                </div>
              ))}
            </div>
          </Sec>

          <Sec id="content" title="Content — payment instructions & defaults" openSecs={openSecs} onToggle={toggleSec}>
            <div className="field">
              <textarea
                rows={3}
                placeholder={"Bank name: …\nAccount number: …\nSWIFT: …"}
                value={tpl.paymentInstructions}
                onChange={(e) => set("paymentInstructions", e.target.value)}
              />
              <small>Payment instructions (printed in a box above the footer)</small>
            </div>
            <div className="field">
              <input value={tpl.footerNote} onChange={(e) => set("footerNote", e.target.value)} />
              <small>Footer note (printed on every invoice)</small>
            </div>
            <div className="field">
              <textarea
                rows={2}
                value={tpl.defaultNotes}
                onChange={(e) => set("defaultNotes", e.target.value)}
              />
              <small>Default customer notes for new invoices</small>
            </div>
            <div className="field">
              <textarea
                rows={2}
                value={tpl.defaultTerms}
                onChange={(e) => set("defaultTerms", e.target.value)}
              />
              <small>Default terms & conditions for new invoices</small>
            </div>
          </Sec>
        </div>

        <div className="tpl-preview">
          <InvoicePaper
            tpl={tpl}
            data={previewData}
            selectable={{
              selected: openBlock,
              onSelect: selectFromPreview,
              actions: {
                onEditText: (k) => setTextBlock(k),
                onReorder: reorderBlocks,
                onHide: hideBlockByKey,
                requiredKeys: REQUIRED_BLOCKS,
                onField: onFieldEdit,
                onAddColumn: addColumn,
                onHideEl: hideEl,
                onFreeRowAdd: freeRowAdd,
                onFreeRowDelete: freeRowDelete,
                onFreeCellAdd: freeCellAdd,
                onFreeCellPatch: freeCellPatch,
                onFreeCellDelete: freeCellDelete,
                onAddSampleRow: () =>
                  setSampleLines((cur) => [
                    ...cur,
                    { description: "Sample item", qty: 1, price: 50, unit: "pcs", extra: {} },
                  ]),
                onRemoveSampleRow: (i) =>
                  setSampleLines((cur) =>
                    cur.length > 1 ? cur.filter((_, idx) => idx !== i) : cur,
                  ),
              },
            }}
          />
        </div>
      </div>

      {textBlock && (
        <BlockTextModal
          blockKey={textBlock}
          tpl={tpl}
          set={set}
          onLogoPick={onLogoPick}
          onClose={() => setTextBlock(null)}
        />
      )}
    </section>
  );
}
