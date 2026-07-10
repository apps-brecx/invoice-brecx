import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { money, useBilling } from "../../lib/store";
import { useToast } from "../../components/Toast";

/* ------------------------------------------------------------------
 * "Claude AI" — the ledger clerk. Attach a PDF / Excel / photo, chat,
 * and Claude answers with PAPER: proposal cards shaped like miniature
 * invoices (brass rule, mono numerals, perforated edge). Nothing is
 * saved until the human presses Create — the cards are the confirm.
 * ------------------------------------------------------------------ */

interface ProposedLine {
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}
interface ProposedInvoice {
  customerName: string;
  customerId?: number;
  newCustomer?: boolean;
  issueDate: string;
  dueDate: string;
  terms: string;
  orderNumber?: string;
  subject?: string;
  notes?: string;
  discountPct?: number;
  taxPct?: number;
  shipping?: number;
  adjustment?: number;
  lines: ProposedLine[];
}
interface ProposedTemplate {
  name: string;
  documentTitle?: string;
  accent?: string;
  layout?: string;
  tableStyle?: string;
  headerStyle?: string;
  defaultTerms?: string;
  footerNote?: string;
  columns: Array<{
    key: string;
    label: string;
    show: boolean;
    group?: string;
    width?: number;
    tint?: string;
    total?: "count" | "money";
    sumLabel?: string;
  }>;
}
interface Attachment {
  name: string;
  mime: string;
  data: string; // base64
  size: number;
}
interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  attachments?: Attachment[];
  invoices?: Array<ProposedInvoice & { createdNumber?: string; creating?: boolean }>;
  templates?: Array<ProposedTemplate & { saved?: boolean; saving?: boolean }>;
  cost?: number;
}

type ModelKey = "haiku" | "sonnet" | "opus";
const MODEL_LABELS: Record<ModelKey, string> = {
  haiku: "Haiku · fastest",
  sonnet: "Sonnet · balanced",
  opus: "Opus · sharpest",
};

const EXAMPLES = [
  "Attach a PDF invoice and I'll draft it here",
  "Make an invoice for Home Goods DC #886 — 20 boxes of Blue Raspberry, Net 45",
  "Read this Excel order sheet and draft one invoice per customer",
  "This layout needs a units-per-box column — design a template for it",
];

/* The templates API validates strictly (column keys, width 4–80%, label
 * lengths, style enums). Claude's proposals are close but not guaranteed
 * exact — normalize instead of bouncing the save on a stray key. */
const BUILTIN_COLS = new Set(["index", "description", "qty", "unit", "rate", "amount"]);
const pickEnum = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined =>
  allowed.includes(v as T) ? (v as T) : undefined;

function normalizeTemplate(t: ProposedTemplate) {
  const columns = t.columns.slice(0, 14).map((c) => {
    let key = c.key.trim();
    if (!BUILTIN_COLS.has(key) && !/^custom:[A-Za-z0-9_-]{1,40}$/.test(key)) {
      key = `custom:${key.replace(/^custom:/, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40) || "col"}`;
    }
    return {
      key,
      label: (c.label || key).slice(0, 40),
      show: c.show !== false,
      group: c.group ? c.group.slice(0, 80) : undefined,
      // Out-of-range widths (Claude sometimes sends fractions) → automatic.
      width: typeof c.width === "number" && c.width >= 4 && c.width <= 80 ? c.width : undefined,
      tint: c.tint ? c.tint.slice(0, 30) : undefined,
      total: c.total === "count" || c.total === "money" ? c.total : undefined,
      sumLabel: c.sumLabel ? c.sumLabel.slice(0, 80) : undefined,
    };
  });
  return {
    name: t.name.trim().slice(0, 120) || "Claude template",
    settings: {
      documentTitle: t.documentTitle?.slice(0, 60) || undefined,
      accent: t.accent?.slice(0, 30) || undefined,
      layout: pickEnum(t.layout, ["standard", "continental", "compact"] as const),
      tableStyle: pickEnum(t.tableStyle, ["band", "zebra", "boxed", "minimal"] as const),
      headerStyle: pickEnum(t.headerStyle, ["logo-left", "logo-right", "centered", "brand-left"] as const),
      defaultTerms: t.defaultTerms?.slice(0, 5000) || undefined,
      footerNote: t.footerNote?.slice(0, 500) || undefined,
      columns,
    },
  };
}

const proposalTotal = (p: ProposedInvoice) => {
  const sub = p.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const disc = (sub * (p.discountPct ?? 0)) / 100;
  return sub - disc + ((sub - disc) * (p.taxPct ?? 0)) / 100 + (p.shipping ?? 0) + (p.adjustment ?? 0);
};

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const uri = String(reader.result ?? "");
      resolve({
        name: file.name,
        mime: file.type || "application/octet-stream",
        data: uri.slice(uri.indexOf("base64,") + 7),
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

const fmtSize = (n: number) =>
  n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`;

export function Assistant() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = useBilling();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState<ModelKey>("haiku");
  const [thread, setThread] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api
      .get<{ configured: boolean; defaultModel: ModelKey }>("/assistant/config")
      .then((res) => {
        setConfigured(res.configured);
        setModel(res.defaultModel);
      })
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread, busy]);

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (f.size > 10 * 1024 * 1024) {
        toast(`${f.name} is over 10 MB`, "error");
        continue;
      }
      if (pending.length >= 4) {
        toast("Up to 4 files per message", "error");
        break;
      }
      try {
        const a = await fileToAttachment(f);
        setPending((cur) => (cur.length >= 4 ? cur : [...cur, a]));
      } catch {
        toast(`Couldn't read ${f.name}`, "error");
      }
    }
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if ((!text && pending.length === 0) || busy) return;
    const userMsg: ChatMsg = { role: "user", text, attachments: pending };
    const nextThread = [...thread, userMsg];
    setThread(nextThread);
    setInput("");
    setPending([]);
    setBusy(true);
    try {
      const res = await api.post<{
        text: string;
        invoices: ProposedInvoice[];
        templates: ProposedTemplate[];
        usage: { model: string; cost: number };
      }>("/assistant/chat", {
        model,
        messages: nextThread.map((m) => ({
          role: m.role,
          // Replayed history is text-only; proposals get a bracketed summary
          // so Claude remembers what it already showed.
          text:
            m.role === "assistant"
              ? [
                  m.text,
                  ...(m.invoices ?? []).map(
                    (p) => `[Proposed invoice card: ${p.customerName} · ${money(proposalTotal(p))}]`,
                  ),
                  ...(m.templates ?? []).map((t) => `[Proposed template card: ${t.name}]`),
                ]
                  .filter(Boolean)
                  .join("\n")
              : m.text,
          attachments: m === userMsg ? m.attachments?.map(({ name, mime, data }) => ({ name, mime, data })) : undefined,
        })),
      });
      setThread((cur) => [
        ...cur,
        {
          role: "assistant",
          text: res.text,
          invoices: res.invoices,
          templates: res.templates,
          cost: res.usage.cost,
        },
      ]);
    } catch (err) {
      setThread((cur) => cur.slice(0, -1));
      setInput(text);
      setPending(userMsg.attachments ?? []);
      toast(err instanceof Error ? err.message : "Claude didn't answer — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice(msgIdx: number, invIdx: number) {
    const proposal = thread[msgIdx]?.invoices?.[invIdx];
    if (!proposal || proposal.creating || proposal.createdNumber) return;
    const mark = (patch: Partial<ChatMsg["invoices"] extends Array<infer T> | undefined ? T : never>) =>
      setThread((cur) =>
        cur.map((m, i) =>
          i === msgIdx
            ? { ...m, invoices: m.invoices?.map((p, j) => (j === invIdx ? { ...p, ...patch } : p)) }
            : m,
        ),
      );
    mark({ creating: true });
    try {
      let clientId = proposal.customerId ?? null;
      if (!clientId) {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const res = await api.post<{ client: any }>("/clients", {
          name: proposal.customerName,
          type: "Business",
          currency: "USD",
          language: "English",
          paymentTerms: proposal.terms || "Due on Receipt",
          portalEnabled: false,
          contactPersons: [],
        });
        clientId = res.client.id as number;
      }
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const created = await api.post<{ invoice: any }>(
        "/invoices",
        {
          clientId,
          orderNumber: proposal.orderNumber || null,
          issueDate: proposal.issueDate,
          dueDate: proposal.dueDate,
          terms: proposal.terms || "Due on Receipt",
          subject: proposal.subject || null,
          currency: "USD",
          taxRate: proposal.taxPct ?? 0,
          discountPct: proposal.discountPct ?? 0,
          shipping: proposal.shipping ?? 0,
          adjustment: proposal.adjustment ?? 0,
          notes: proposal.notes || null,
          items: proposal.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            unit: l.unit || null,
          })),
        },
        { "x-brecx-source": "claude-ai" },
      );
      mark({ creating: false, createdNumber: created.invoice.number });
      await refresh();
      toast(`Draft ${created.invoice.number} created`);
    } catch (err) {
      mark({ creating: false });
      toast(err instanceof Error ? err.message : "Failed to create the draft", "error");
    }
  }

  async function saveTemplate(msgIdx: number, tplIdx: number) {
    const t = thread[msgIdx]?.templates?.[tplIdx];
    if (!t || t.saving || t.saved) return;
    const mark = (patch: { saving?: boolean; saved?: boolean }) =>
      setThread((cur) =>
        cur.map((m, i) =>
          i === msgIdx
            ? { ...m, templates: m.templates?.map((x, j) => (j === tplIdx ? { ...x, ...patch } : x)) }
            : m,
        ),
      );
    mark({ saving: true });
    try {
      await api.post("/templates", normalizeTemplate(t));
      mark({ saving: false, saved: true });
      toast(`Template “${t.name}” saved to the gallery`);
    } catch (err) {
      mark({ saving: false });
      toast(err instanceof Error ? err.message : "Failed to save the template", "error");
    }
  }

  const invoiceCard = (p: NonNullable<ChatMsg["invoices"]>[number], msgIdx: number, invIdx: number) => {
    const sub = p.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const total = proposalTotal(p);
    return (
      <div className="ai-paper" key={invIdx}>
        <div className="ai-paper-head">
          <div>
            <span className="ai-paper-eyebrow">Invoice draft</span>
            <b>{p.customerName}</b>
            {p.newCustomer && !p.customerId && <span className="stamp draft ai-new">New customer</span>}
          </div>
          <span className="ai-paper-total num">{money(total)}</span>
        </div>
        <div className="ai-paper-meta">
          <span>
            <i>Issued</i>
            <b className="num">{p.issueDate}</b>
          </span>
          <span>
            <i>Due</i>
            <b className="num">{p.dueDate}</b>
          </span>
          <span>
            <i>Terms</i>
            <b>{p.terms}</b>
          </span>
          {p.orderNumber && (
            <span>
              <i>Order</i>
              <b className="num">{p.orderNumber}</b>
            </span>
          )}
        </div>
        <table className="ai-lines">
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="num">
                  {l.quantity} × {money(l.unitPrice)}
                </td>
                <td className="num right">{money(l.quantity * l.unitPrice)}</td>
              </tr>
            ))}
            {total !== sub && (
              <tr className="ai-adj">
                <td colSpan={2}>Discount / tax / shipping</td>
                <td className="num right">{money(total - sub)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="ai-paper-foot">
          {p.createdNumber ? (
            <button className="btn btn-ghost ai-open" onClick={() => navigate(`/invoices`)}>
              ✓ Draft {p.createdNumber} created — open list
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={p.creating}
              onClick={() => void createInvoice(msgIdx, invIdx)}
            >
              {p.creating ? "Creating…" : "Create Draft"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const templateCard = (t: NonNullable<ChatMsg["templates"]>[number], msgIdx: number, tplIdx: number) => (
    <div className="ai-paper ai-tpl" key={`t${tplIdx}`} style={{ borderTopColor: t.accent || "var(--brass)" }}>
      <div className="ai-paper-head">
        <div>
          <span className="ai-paper-eyebrow">Template design</span>
          <b>{t.name}</b>
        </div>
        <span className="ai-swatch" style={{ background: t.accent || "var(--brass)" }} />
      </div>
      <div className="ai-tpl-cols">
        {t.columns
          .filter((c) => c.show)
          .map((c, i) => (
            <span className="ai-col-chip" key={i} style={c.tint ? { background: c.tint } : undefined}>
              {c.group ? <i>{c.group.split("—")[0].trim()} · </i> : null}
              {c.label}
            </span>
          ))}
      </div>
      <div className="ai-paper-meta">
        {t.layout && (
          <span>
            <i>Layout</i>
            <b>{t.layout}</b>
          </span>
        )}
        {t.tableStyle && (
          <span>
            <i>Table</i>
            <b>{t.tableStyle}</b>
          </span>
        )}
      </div>
      <div className="ai-paper-foot">
        {t.saved ? (
          <button className="btn btn-ghost ai-open" onClick={() => navigate("/settings/template")}>
            ✓ Saved — open the gallery
          </button>
        ) : (
          <button className="btn btn-primary" disabled={t.saving} onClick={() => void saveTemplate(msgIdx, tplIdx)}>
            {t.saving ? "Saving…" : "Save Template"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="view ai-view">
      <div className="ai-thread-wrap">
        <div className="ai-thread">
          {thread.length === 0 && (
            <div className="ai-hero">
              <span className="ai-hero-spark" aria-hidden>
                <SparkIcon size={26} />
              </span>
              <h1>Claude, the ledger clerk</h1>
              <p>
                Attach a PDF, an Excel sheet or a photo of an order — or just describe the invoice —
                and I'll draft it as a card you can confirm. Odd layout? I'll design the template too.
              </p>
              <div className="ai-examples">
                {EXAMPLES.map((e, i) => (
                  <button key={i} type="button" style={{ animationDelay: `${180 + i * 70}ms` }} onClick={() => setInput(e)}>
                    {e}
                  </button>
                ))}
              </div>
              {configured === false && (
                <div className="em-warn" style={{ marginTop: 18 }}>
                  Claude isn't configured — set <b>ANTHROPIC_API_KEY</b> in the API env.
                </div>
              )}
            </div>
          )}

          {thread.map((m, i) =>
            m.role === "user" ? (
              <div className="ai-msg user" key={i}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="ai-files">
                    {m.attachments.map((a, j) => (
                      <span className="ai-file" key={j}>
                        <FileIcon />
                        {a.name}
                      </span>
                    ))}
                  </div>
                )}
                {m.text && <div className="ai-bubble">{m.text}</div>}
              </div>
            ) : (
              <div className="ai-msg assistant" key={i}>
                <span className="ai-avatar" aria-hidden>
                  <SparkIcon size={13} />
                </span>
                <div className="ai-body">
                  {m.text && <div className="ai-text">{m.text}</div>}
                  {m.invoices?.map((p, j) => invoiceCard(p, i, j))}
                  {m.templates?.map((t, j) => templateCard(t, i, j))}
                  {m.cost !== undefined && (
                    <span className="ai-cost num" title="What this reply cost">
                      {m.cost < 0.005 ? "<$0.01" : `$${m.cost.toFixed(2)}`}
                    </span>
                  )}
                </div>
              </div>
            ),
          )}

          {busy && (
            <div className="ai-msg assistant">
              <span className="ai-avatar" aria-hidden>
                <SparkIcon size={13} />
              </span>
              <div className="ai-typing" aria-label="Claude is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div
        className={"ai-composer" + (dragOver ? " drag" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        {pending.length > 0 && (
          <div className="ai-pending">
            {pending.map((a, i) => (
              <span className="ai-file" key={i}>
                <FileIcon />
                {a.name} <em>{fmtSize(a.size)}</em>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setPending((cur) => cur.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          rows={2}
          placeholder="Describe the invoice, or attach a PDF / Excel / photo…"
          value={input}
          disabled={configured === false}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="ai-composer-row">
          <button
            type="button"
            className="ai-attach"
            title="Attach PDF, Excel, CSV or image"
            onClick={() => fileRef.current?.click()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            Attach
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.xlsx,.xls,.csv,.txt,image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="ai-models" role="radiogroup" aria-label="Model">
            {(Object.keys(MODEL_LABELS) as ModelKey[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={model === k}
                className={"ai-model" + (model === k ? " on" : "")}
                title={MODEL_LABELS[k]}
                onClick={() => setModel(k)}
              >
                {MODEL_LABELS[k].split(" ·")[0]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary ai-send"
            disabled={busy || configured === false || (!input.trim() && pending.length === 0)}
            onClick={() => void send()}
          >
            <SparkIcon size={13} /> Send
          </button>
        </div>
      </div>
    </section>
  );
}

function SparkIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5c.5 4.8 2.2 6.5 7 7-4.8.5-6.5 2.2-7 7-.5-4.8-2.2-6.5-7-7 4.8-.5 6.5-2.2 7-7Z" />
      <path d="M19 14.5c.25 2.4 1.1 3.25 3.5 3.5-2.4.25-3.25 1.1-3.5 3.5-.25-2.4-1.1-3.25-3.5-3.5 2.4-.25 3.25-1.1 3.5-3.5Z" opacity=".65" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
