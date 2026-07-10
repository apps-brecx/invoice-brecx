import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { buildInvoicePdfAttachment } from "../lib/invoicePdf";
import type { TemplateSettings } from "../lib/template";
import type { Customer, Invoice } from "../lib/store";
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

/** Zoho-style "Send Email" compose for one invoice — From / Send To / Cc /
 *  Bcc / Subject / rich message. The API renders the branded summary card
 *  (amount, dates, VIEW INVOICE link) around the message and sends over SMTP;
 *  drafts flip to Sent on success. */
export function InvoiceEmailModal({
  invoice,
  customer,
  template,
  onDone,
  onClose,
}: {
  invoice: Invoice;
  customer: Customer;
  template: TemplateSettings;
  onDone: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const orgName = template.orgName || "Fresh Finest";
  const [sender, setSender] = useState<{ configured: boolean; from: string | null } | null>(null);
  const [to, setTo] = useState(customer.email ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(`Invoice - ${invoice.number} from ${orgName}`);
  const [messageHtml, setMessageHtml] = useState(
    `<p>Dear ${escHtml(customer.name)},</p>` +
      `<p>Thank you for your business. Your invoice can be viewed, printed and downloaded ` +
      `as PDF from the link below.</p>`,
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // The PDF capture takes a moment — kick it off the instant the modal opens
  // so it's ready by the time the user hits Send.
  const [attachPromise] = useState<Promise<{ filename: string; data: string } | null>>(() =>
    buildInvoicePdfAttachment(invoice.dbId, template).catch(() => null),
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
    origin: window.location.origin,
  });

  async function send() {
    if (!to.trim()) {
      toast("Add at least one recipient", "error");
      return;
    }
    setSending(true);
    try {
      let attachment = attachPdf ? await attachPromise : null;
      if (attachPdf && !attachment) {
        attachment = await buildInvoicePdfAttachment(invoice.dbId, template).catch(() => null);
        if (!attachment) toast("Couldn't build the PDF — sending without the attachment", "error");
      }
      await api.post(`/invoices/${invoice.dbId}/email`, {
        to: to.trim(),
        cc: cc.trim(),
        bcc: bcc.trim(),
        subject: subject.trim(),
        attachment: attachment ?? undefined,
        ...contentPayload(),
      });
      toast(`Invoice ${invoice.number} emailed to ${to.trim()}`);
      await onDone();
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
        `/invoices/${invoice.dbId}/email/preview`,
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
          <h3>Email {invoice.number} to {customer.name}</h3>

          <div className="modal-body">
            {sender && !sender.configured && (
              <div className="em-warn">
                Email isn't configured — set <b>SMTP_HOST / SMTP_USER / SMTP_PASS</b> in the API
                env to send from the app.
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
              <RichText initialHtml={messageHtml} onChange={setMessageHtml} minHeight={200} />
            </div>

            <div className="em-attach">
              <label className="em-attach-check">
                <input
                  type="checkbox"
                  checked={attachPdf}
                  onChange={(e) => setAttachPdf(e.target.checked)}
                />
              </label>
              <div>
                <b>Attach Invoice PDF</b>
                <span>
                  {invoice.number}.pdf · rendered with your active template · the email body also
                  carries a VIEW INVOICE link
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
