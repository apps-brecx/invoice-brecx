import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtLong, type Customer } from "../lib/store";
import { RichText } from "./RichText";
import { useToast } from "./Toast";

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The HTML body loses tags for the email's plain-text alternative. */
function htmlToText(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n");
  return (div.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export interface StatementForEmail {
  opening: number;
  invoiced: number;
  received: number;
  closing: number;
  rows: Array<{ date: string; label: string; details: string; amount: number; payment: number }>;
}

/** Zoho-style "Send Email Statement" compose — From / Send To / Cc / Bcc /
 *  Subject / message body. The statement for the selected period is rendered
 *  into the email by the API, which sends it over the configured SMTP. */
export function EmailStatementModal({
  customer,
  periodFrom,
  periodTo,
  statement,
  getAttachment,
  attachmentName,
  onClose,
}: {
  customer: Customer;
  periodFrom: string;
  periodTo: string;
  statement: StatementForEmail;
  /** Builds the statement PDF (base64) to attach to the email. */
  getAttachment?: () => Promise<{ filename: string; data: string }>;
  attachmentName?: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [sender, setSender] = useState<{ configured: boolean; from: string | null } | null>(null);
  const [to, setTo] = useState(customer.email ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(
    `Account Statement from ${fmtLong(periodFrom)} to ${fmtLong(periodTo)}`,
  );
  const [messageHtml, setMessageHtml] = useState(
    `<p>Dear ${escHtml(customer.name)},</p>` +
      `<p>It's been a great experience working with you.<br/>` +
      `Included in this email is the statement of all transactions for the period between <b>${fmtLong(periodFrom)}</b> and <b>${fmtLong(periodTo)}</b>.<br/>` +
      `If you have any questions, just drop us an email or call us.</p>` +
      `<p>Regards,<br/>Fresh Finest LLC</p>`,
  );
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // The PDF capture takes a few seconds — kick it off the moment the modal
  // opens so it's ready by the time the user hits Send. The period can't
  // change while the modal is open, so the early capture stays valid.
  const [attachPromise] = useState<Promise<{ filename: string; data: string } | null>>(() =>
    getAttachment ? getAttachment().catch(() => null) : Promise.resolve(null),
  );

  useEffect(() => {
    api
      .get<{ configured: boolean; from: string | null }>("/email/sender")
      .then(setSender)
      .catch(() => setSender({ configured: false, from: null }));
  }, []);

  const contentPayload = () => ({
    message: htmlToText(messageHtml) || "(empty message)",
    messageHtml,
    periodFrom,
    periodTo,
    statement: {
      opening: statement.opening,
      invoiced: statement.invoiced,
      received: statement.received,
      balance: statement.closing,
      rows: statement.rows.map((r) => ({
        date: r.date,
        label: r.label,
        details: r.details,
        amount: r.amount || null,
        payment: r.payment || null,
      })),
    },
  });

  async function send() {
    if (!to.trim()) {
      toast("Add at least one recipient", "error");
      return;
    }
    setSending(true);
    try {
      // Usually already resolved (started at modal open); retry once if the
      // early capture failed.
      let attachment = await attachPromise;
      if (!attachment && getAttachment) {
        attachment = await getAttachment().catch(() => null);
      }
      if (!attachment && getAttachment) {
        toast("Couldn't build the PDF — sending without the attachment", "error");
      }
      await api.post(`/clients/${customer.id}/statement/email`, {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        attachment: attachment ?? undefined,
        ...contentPayload(),
      });
      toast(`Statement emailed to ${to.trim()}`);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to send the email", "error");
      setSending(false);
    }
  }

  async function openPreview() {
    setPreviewBusy(true);
    try {
      const res = await api.post<{ html: string }>(
        `/clients/${customer.id}/statement/email/preview`,
        contentPayload(),
      );
      setPreviewHtml(res.html);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to build the preview", "error");
    } finally {
      setPreviewBusy(false);
    }
  }

  return (
    <>
    {/* No backdrop-close: a stray click while drafting must never lose the
        email — only Cancel / ✕ dismisses this modal. */}
    <div className="modal-overlay">
      <div className="modal modal-lg email-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
        <h3>Send Email Statement for {customer.name}</h3>

        <div className="modal-body">
          {sender && !sender.configured && (
            <div className="em-warn">
              Email isn't configured — set <b>SMTP_HOST / SMTP_USER / SMTP_PASS</b> in the API env
              to send from the app.
            </div>
          )}

          <div className="em-row">
            <label>From</label>
            <div className="em-static">{sender?.from ?? "…"}</div>
          </div>
          <div className="em-row">
            <label>Send To</label>
            <div className="em-field">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="customer@email.com — separate multiple with commas"
              />
              <span className="em-ccs">
                {!showCc && (
                  <button type="button" className="ov-link" onClick={() => setShowCc(true)}>
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button type="button" className="ov-link" onClick={() => setShowBcc(true)}>
                    Bcc
                  </button>
                )}
              </span>
            </div>
          </div>
          {showCc && (
            <div className="em-row">
              <label>Cc</label>
              <div className="em-field">
                <input value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
            </div>
          )}
          {showBcc && (
            <div className="em-row">
              <label>Bcc</label>
              <div className="em-field">
                <input value={bcc} onChange={(e) => setBcc(e.target.value)} />
              </div>
            </div>
          )}
          <div className="em-row">
            <label>Subject</label>
            <div className="em-field">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>

          <div className="em-editor">
            <RichText initialHtml={messageHtml} onChange={setMessageHtml} minHeight={230} />
          </div>

          <div className="em-attach">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <div>
              <b>{attachmentName ?? "Customer Statement"} attached</b>
              <span>
                {fmtLong(periodFrom)} — {fmtLong(periodTo)} · {statement.rows.length} transaction
                {statement.rows.length === 1 ? "" : "s"} · PDF attachment + rendered inside the
                email
              </span>
            </div>
            <button
              type="button"
              className="icon-btn em-eye"
              title="Preview the email"
              aria-label="Preview the email"
              disabled={previewBusy}
              onClick={() => void openPreview()}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={sending} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sending || !sender?.configured}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>

    {previewHtml && (
      <div className="modal-overlay" onClick={() => setPreviewHtml(null)}>
        <div className="modal email-preview" onClick={(e) => e.stopPropagation()} role="dialog">
          <button
            type="button"
            className="modal-close"
            aria-label="Close preview"
            onClick={() => setPreviewHtml(null)}
          >
            ✕
          </button>
          <h3>Email Preview</h3>
          <iframe className="em-frame" title="Email preview" sandbox="" srcDoc={previewHtml} />
        </div>
      </div>
    )}
    </>
  );
}
