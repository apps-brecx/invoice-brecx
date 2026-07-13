import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, qs } from "../../lib/api";
import { money, useBilling } from "../../lib/store";
import { fetchTemplates } from "../../lib/template";
import { ConfirmModal } from "../../components/ConfirmModal";
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
  /** Template this invoice prints with — an existing template's name, or
   *  one proposed via propose_template in the same reply. */
  templateName?: string;
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
  /** ISO timestamp — shown under the message like claude.ai. */
  at?: string;
  attachments?: Attachment[];
  invoices?: Array<ProposedInvoice & { createdNumber?: string; creating?: boolean }>;
  templates?: Array<ProposedTemplate & { saved?: boolean; saving?: boolean; savedId?: number }>;
  cost?: number;
}
interface ChatSummary {
  id: number;
  title: string;
  pinned: boolean;
  updated_at: string;
}

/** What goes to the DB: same thread, minus attachment payloads (base64 can
 *  be megabytes; only the newest message's files ever reach Claude anyway). */
const stripForStore = (thread: ChatMsg[]): ChatMsg[] =>
  thread.map((m) => ({
    ...m,
    invoices: m.invoices?.map(({ creating, ...p }) => p),
    templates: m.templates?.map(({ saving, ...t }) => t),
    attachments: m.attachments?.map((a) => ({ ...a, data: "" })),
  }));

const titleOf = (thread: ChatMsg[]): string => {
  const first = thread.find((m) => m.role === "user");
  const t = first?.text.trim() || first?.attachments?.[0]?.name || "New chat";
  return t.length > 64 ? `${t.slice(0, 64)}…` : t;
};

/** Tiny inline-markdown for chat replies — **bold** and `code` only, so
 *  Claude's answers read like claude.ai without a markdown dependency. */
function richText(text: string): JSX.Element[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code className="ai-code" key={i}>
          {part.slice(1, -1)}
        </code>
      );
    return <span key={i}>{part}</span>;
  });
}

/** "8:58 PM" for today, "10 Jul · 8:58 PM" otherwise. */
const msgWhen = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return time;
  const day = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  return `${day} · ${time}`;
};

const timeAgo = (iso: string): string => {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};

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

  // claude.ai-style Recents: previous chats live in the DB, per user.
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  // Keyed by "rail:<id>" / "all:<id>" — the same chat renders in both lists.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<ChatSummary | null>(null);

  // "View all" page (claude.ai/chats style): search + filter + scroll paging.
  const ALL_PAGE = 30;
  const [view, setView] = useState<"chat" | "all">("chat");
  const [allQ, setAllQ] = useState("");
  const [allFilter, setAllFilter] = useState<"all" | "pinned">("all");
  const [allChats, setAllChats] = useState<ChatSummary[] | null>(null);
  const [allTotal, setAllTotal] = useState(0);
  const allBusy = useRef(false);

  const loadAll = async (reset: boolean, q = allQ, filter = allFilter) => {
    if (allBusy.current) return;
    allBusy.current = true;
    try {
      const offset = reset ? 0 : (allChats?.length ?? 0);
      const res = await api.get<{ chats: ChatSummary[]; total: number }>(
        `/assistant/chats${qs({ q, pinned: filter === "pinned" ? "true" : "", offset, limit: ALL_PAGE })}`,
      );
      setAllChats((cur) => (reset ? res.chats : [...(cur ?? []), ...res.chats]));
      setAllTotal(res.total);
    } catch {
      /* list stays as-is */
    } finally {
      allBusy.current = false;
    }
  };

  // Debounced reload when the search text or filter changes.
  useEffect(() => {
    if (view !== "all") return;
    const t = setTimeout(() => void loadAll(true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, allQ, allFilter]);
  const chatIdRef = useRef<number | null>(null);
  // Latest committed thread — persistence reads this after state settles, so
  // updaters stay pure (StrictMode double-invokes them in dev).
  const threadRef = useRef<ChatMsg[]>(thread);
  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);
  const persistBusy = useRef(false);

  const loadChats = () =>
    api
      .get<{ chats: ChatSummary[] }>("/assistant/chats")
      .then((r) => setChats(r.chats))
      .catch(() => {});

  useEffect(() => {
    api
      .get<{ configured: boolean; defaultModel: ModelKey }>("/assistant/config")
      .then((res) => {
        setConfigured(res.configured);
        setModel(res.defaultModel);
      })
      .catch(() => setConfigured(false));
    void loadChats();
  }, []);

  /** Create-or-update the active chat from the committed thread. Runs on a
   *  short timeout so it always reads post-commit state, and never twice in
   *  parallel (a second create would duplicate the chat). */
  function schedulePersist() {
    setTimeout(() => {
      if (persistBusy.current) {
        setTimeout(schedulePersist, 250);
        return;
      }
      persistBusy.current = true;
      const next = threadRef.current;
      const messages = stripForStore(next);
      const req = chatIdRef.current
        ? api.put(`/assistant/chats/${chatIdRef.current}`, { messages })
        : api
            .post<{ chat: ChatSummary }>("/assistant/chats", { title: titleOf(next), messages })
            .then(({ chat }) => {
              chatIdRef.current = chat.id;
              setActiveChatId(chat.id);
            });
      void req
        .then(() => loadChats())
        .catch(() => {
          /* history is best-effort — the conversation itself already worked */
        })
        .finally(() => {
          persistBusy.current = false;
        });
    }, 30);
  }

  function newChat() {
    if (busy) return;
    setThread([]);
    chatIdRef.current = null;
    setActiveChatId(null);
    setInput("");
    setPending([]);
    setView("chat");
  }

  async function openChat(id: number) {
    if (busy) return;
    if (id === activeChatId) {
      setView("chat");
      return;
    }
    try {
      const { chat } = await api.get<{ chat: { id: number; messages: ChatMsg[] } }>(
        `/assistant/chats/${id}`,
      );
      setThread(chat.messages);
      chatIdRef.current = chat.id;
      setActiveChatId(chat.id);
      setInput("");
      setPending([]);
      setView("chat");
    } catch {
      toast("Couldn't open that chat", "error");
      void loadChats();
    }
  }

  async function deleteChat(id: number) {
    try {
      await api.del(`/assistant/chats/${id}`);
      setChats((cur) => cur.filter((c) => c.id !== id));
      setAllChats((cur) => cur && cur.filter((c) => c.id !== id));
      setAllTotal((n) => Math.max(0, n - 1));
      if (id === chatIdRef.current) {
        setThread([]);
        chatIdRef.current = null;
        setActiveChatId(null);
      }
      toast("Chat deleted");
    } catch {
      toast("Couldn't delete the chat", "error");
    }
  }

  async function togglePin(c: ChatSummary) {
    setMenuFor(null);
    try {
      await api.patch(`/assistant/chats/${c.id}`, { pinned: !c.pinned });
      await loadChats();
      if (view === "all") await loadAll(true);
    } catch {
      toast("Couldn't update the chat", "error");
    }
  }

  // Any click outside the open ⋯ menu closes it.
  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  /** ⋯ options (pin / delete) — shared by the rail rows and the View-all list. */
  const chatMenu = (c: ChatSummary, where: "rail" | "all") => (
    <>
      <button
        type="button"
        className="ai-recent-more"
        aria-label={`Options for "${c.title}"`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setMenuFor(menuFor === `${where}:${c.id}` ? null : `${where}:${c.id}`);
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </button>
      {menuFor === `${where}:${c.id}` && (
        <div className="ai-menu" role="menu" onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => void togglePin(c)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 17v5M9 4h6l1 7 2.5 2.5H5.5L8 11z" />
            </svg>
            {c.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setMenuFor(null);
              setConfirmDel(c);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </>
  );

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
    const userMsg: ChatMsg = { role: "user", text, attachments: pending, at: new Date().toISOString() };
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
          at: new Date().toISOString(),
          invoices: res.invoices,
          templates: res.templates,
          cost: res.usage.cost,
        },
      ]);
      schedulePersist();
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
        const res = await api.post<{ client: any }>(
          "/clients",
          {
            name: proposal.customerName,
            type: "Business",
            currency: "USD",
            language: "English",
            paymentTerms: proposal.terms || "Due on Receipt",
            portalEnabled: false,
            contactPersons: [],
          },
          { "x-brecx-source": "claude-ai" },
        );
        clientId = res.client.id as number;
      }
      // Pin the proposal's design onto the draft: a template proposed in the
      // same reply is saved first; otherwise match a saved template by name.
      let templateId: number | null = null;
      const wantTpl = proposal.templateName?.trim().toLowerCase();
      if (wantTpl) {
        const tplIdx =
          thread[msgIdx]?.templates?.findIndex((t) => t.name.trim().toLowerCase() === wantTpl) ?? -1;
        if (tplIdx >= 0) templateId = await saveTemplate(msgIdx, tplIdx);
        if (templateId == null) {
          try {
            const existing = await fetchTemplates();
            templateId = existing.find((t) => t.name.trim().toLowerCase() === wantTpl)?.id ?? null;
          } catch {
            /* draft still renders — with the active template */
          }
        }
      }
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const created = await api.post<{ invoice: any }>(
        "/invoices",
        {
          clientId,
          templateId,
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
      schedulePersist();
      await refresh();
      toast(`Draft ${created.invoice.number} created`);
    } catch (err) {
      mark({ creating: false });
      toast(err instanceof Error ? err.message : "Failed to create the draft", "error");
    }
  }

  /** Saves a proposed template and returns its new id — createInvoice also
   *  calls this to pin a proposal's design onto the draft it creates. */
  async function saveTemplate(msgIdx: number, tplIdx: number): Promise<number | null> {
    const t = thread[msgIdx]?.templates?.[tplIdx];
    if (!t || t.saving) return null;
    if (t.saved) return t.savedId ?? null;
    const mark = (patch: { saving?: boolean; saved?: boolean; savedId?: number }) =>
      setThread((cur) =>
        cur.map((m, i) =>
          i === msgIdx
            ? { ...m, templates: m.templates?.map((x, j) => (j === tplIdx ? { ...x, ...patch } : x)) }
            : m,
        ),
      );
    mark({ saving: true });
    try {
      const res = await api.post<{ template: { id: number } }>(
        "/templates",
        normalizeTemplate(t),
        { "x-brecx-source": "claude-ai" },
      );
      mark({ saving: false, saved: true, savedId: res.template.id });
      schedulePersist();
      toast(`Template “${t.name}” saved to the gallery`);
      return res.template.id;
    } catch (err) {
      mark({ saving: false });
      toast(err instanceof Error ? err.message : "Failed to save the template", "error");
      return null;
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
          {p.templateName && (
            <span>
              <i>Template</i>
              <b>{p.templateName}</b>
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
      <aside className="ai-side" aria-label="Chat history">
        <button type="button" className="ai-new" disabled={busy} onClick={newChat}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
        <div className="ai-side-label">Recents</div>
        <div className="ai-recents">
          {chats.length === 0 && (
            <div className="ai-side-empty">
              <span className="ai-side-empty-spark" aria-hidden>
                <SparkIcon size={15} />
              </span>
              No chats yet — your
              <br />
              conversations land here.
            </div>
          )}
          {chats.map((c) => (
            <div className={"ai-recent" + (c.id === activeChatId ? " on" : "")} key={c.id}>
              <button
                type="button"
                className="ai-recent-t"
                title={c.title}
                disabled={busy}
                onClick={() => void openChat(c.id)}
              >
                <span className="ai-recent-name">
                  {c.pinned && (
                    <svg className="ai-pin" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-label="Pinned">
                      <path d="M16 3l5 5-4.5 1.5L13 13l-.5 5-3.5-3.5L4 19.5 4.5 15 9 10.5 5.5 7 8.5 6z" />
                    </svg>
                  )}
                  {c.title}
                </span>
                <span className="ai-recent-time">{timeAgo(c.updated_at)}</span>
              </button>
              {chatMenu(c, "rail")}
            </div>
          ))}
        </div>
        {chats.length > 0 && (
          <button type="button" className="ai-viewall" onClick={() => setView("all")}>
            View all chats →
          </button>
        )}
      </aside>

      <div className="ai-main">
      {view === "all" ? (
        <div className="ai-all">
          <div className="ai-all-head">
            <div>
              <h1>Chats</h1>
              <span className="ai-all-count">
                {allTotal} conversation{allTotal === 1 ? "" : "s"}
              </span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setView("chat")}>
              ← Back to chat
            </button>
          </div>
          <div className="ai-all-tools">
            <label className="ai-all-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                placeholder="Search chats…"
                value={allQ}
                onChange={(e) => setAllQ(e.target.value)}
                aria-label="Search chats"
              />
            </label>
            <div className="ai-all-filter" role="radiogroup" aria-label="Filter chats">
              {(["all", "pinned"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={allFilter === f}
                  className={"ai-all-chip" + (allFilter === f ? " on" : "")}
                  onClick={() => setAllFilter(f)}
                >
                  {f === "all" ? "All" : "Pinned"}
                </button>
              ))}
            </div>
          </div>
          <div
            className="ai-all-list"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (
                el.scrollTop + el.clientHeight >= el.scrollHeight - 160 &&
                (allChats?.length ?? 0) < allTotal
              ) {
                void loadAll(false);
              }
            }}
          >
            {allChats === null && <div className="ai-all-empty">Loading…</div>}
            {allChats?.length === 0 && (
              <div className="ai-all-empty">No chats match{allQ ? ` “${allQ}”` : ""}.</div>
            )}
            {allChats?.map((c) => (
              <div className={"ai-all-row" + (c.id === activeChatId ? " on" : "")} key={c.id}>
                <button type="button" className="ai-all-row-t" onClick={() => void openChat(c.id)}>
                  <span className="ai-all-ic" aria-hidden>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.2-.6L3 21l1.7-5.8a8.4 8.4 0 1 1 16.3-3.7Z" />
                    </svg>
                  </span>
                  <span className="ai-all-title">
                    {c.pinned && (
                      <svg className="ai-pin" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-label="Pinned">
                        <path d="M16 3l5 5-4.5 1.5L13 13l-.5 5-3.5-3.5L4 19.5 4.5 15 9 10.5 5.5 7 8.5 6z" />
                      </svg>
                    )}
                    {c.title}
                  </span>
                  <span className="ai-all-time">{timeAgo(c.updated_at)}</span>
                </button>
                {chatMenu(c, "all")}
              </div>
            ))}
            {allChats !== null && allChats.length > 0 && allChats.length < allTotal && (
              <div className="ai-all-more">Scroll for more…</div>
            )}
          </div>
        </div>
      ) : (
      <>
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
                {msgWhen(m.at) && <span className="ai-when num">{msgWhen(m.at)}</span>}
              </div>
            ) : (
              <div className="ai-msg assistant" key={i}>
                <span className="ai-avatar" aria-hidden>
                  <SparkIcon size={13} />
                </span>
                <div className="ai-body">
                  {m.text && <div className="ai-text">{richText(m.text)}</div>}
                  {m.invoices?.map((p, j) => invoiceCard(p, i, j))}
                  {m.templates?.map((t, j) => templateCard(t, i, j))}
                  {(m.at || m.cost !== undefined) && (
                    <span className="ai-meta-row">
                      {msgWhen(m.at) && <span className="ai-when num">{msgWhen(m.at)}</span>}
                      {m.cost !== undefined && (
                        <span className="ai-cost num" title="What this reply cost">
                          {m.cost < 0.005 ? "<$0.01" : `$${m.cost.toFixed(2)}`}
                        </span>
                      )}
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

      <div className="ai-dock">
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
      <p className="ai-dock-note">Claude can make mistakes — review each draft before creating it.</p>
      </div>
      </>
      )}
      </div>

      {confirmDel && (
        <ConfirmModal
          title="Delete this chat?"
          message={
            <>
              &ldquo;{confirmDel.title}&rdquo; will be permanently deleted. This can&apos;t be undone.
            </>
          }
          confirmLabel="Delete chat"
          onConfirm={() => {
            void deleteChat(confirmDel.id);
            setConfirmDel(null);
          }}
          onClose={() => setConfirmDel(null)}
        />
      )}
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
