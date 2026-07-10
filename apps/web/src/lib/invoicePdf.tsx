/**
 * Bulk invoice export (Zoho-style "Export as PDF" / "Export as ZIP").
 *
 * Each invoice is fetched, rendered offscreen through the real InvoicePaper
 * (active template and all), captured with modern-screenshot and laid into
 * jsPDF pages — the same pixel-for-pixel pipeline the customer statement
 * export uses. Libraries load lazily so the list page bundle stays lean.
 */
import { createRoot } from "react-dom/client";
import type { jsPDF } from "jspdf";
import { api } from "./api";
import { mapInvoice } from "./store";
import type { TemplateSettings } from "./template";
import { InvoicePaper, type PaperData } from "../components/InvoicePaper";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Maps an enriched invoice row + item rows (the /invoices/:id shape) to the
 *  paper's data model. Also used by the public share page. The status is
 *  always null — the ribbon is on-screen chrome, never on a document a
 *  customer sees. */
export function paperFromDetail(raw: any, items: any[]): PaperData {
  const inv = mapInvoice(raw);
  return {
    number: inv.number,
    status: null,
    issued: inv.issued,
    due: inv.due,
    terms: inv.terms,
    orderNumber: inv.orderNumber,
    subject: inv.subject,
    customerName: inv.customerName,
    customerAddress: [
      raw.address_line1,
      raw.address_line2,
      [raw.city, raw.postal_code].filter(Boolean).join(" "),
      raw.country,
    ].filter(Boolean),
    shipToAddress: [
      raw.shipping_attention,
      raw.shipping_street1,
      raw.shipping_street2,
      [raw.shipping_city, raw.shipping_zip].filter(Boolean).join(" "),
      raw.shipping_country,
    ].filter(Boolean),
    lines: items.map((it) => ({
      description: it.description,
      qty: Number(it.quantity),
      price: Number(it.unit_price),
      unit: it.unit ?? null,
      extra: it.extra ?? {},
    })),
    discountPct: inv.discountPct,
    taxPct: inv.taxPct,
    shipping: inv.shipping,
    adjustment: inv.adjustment,
    paid: inv.paid,
    notes: raw.notes,
    termsConditions: raw.terms_conditions,
  };
}

async function fetchPaper(id: number): Promise<{ number: string; paper: PaperData }> {
  const res = await api.get<{ invoice: any; items: any[] }>(`/invoices/${id}`);
  const paper = paperFromDetail(res.invoice, res.items);
  return { number: paper.number, paper };
}

/** Renders the paper into a hidden host and captures it at 2x. */
async function paperToCanvas(paper: PaperData, tpl: TemplateSettings): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  // Same width the on-screen paper stage uses, parked far offscreen.
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:760px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<InvoicePaper tpl={tpl} data={paper} />);
  // Let React paint + images (logo data-URLs) decode before the capture.
  await new Promise((r) => setTimeout(r, 150));
  try {
    const el = host.querySelector<HTMLElement>(".inv-paper");
    if (!el) throw new Error("Paper failed to render");
    const { domToCanvas } = await import("modern-screenshot");
    return await domToCanvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      onCloneNode: (cloned) => {
        const p = cloned as HTMLElement;
        p.classList.add("pdf-capture"); // strips the perforated-edge chrome
        p.style.boxShadow = "none";
        p.style.borderRadius = "0";
      },
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Lays a captured canvas into the pdf, spilling onto extra pages as needed.
 *  Expects the current page to be fresh. */
function addCanvasPages(pdf: jsPDF, canvas: HTMLCanvasElement): void {
  const img = canvas.toDataURL("image/jpeg", 0.92);
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const margin = 26;
  const imgW = W - margin * 2;
  const imgH = canvas.height * (imgW / canvas.width);
  const pageH = H - margin * 2;

  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
  heightLeft -= pageH;
  while (heightLeft > 0) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
    heightLeft -= pageH;
  }
}

/** One invoice as a base64 PDF — the email compose attachment. */
export async function buildInvoicePdfAttachment(
  id: number,
  tpl: TemplateSettings,
): Promise<{ filename: string; data: string }> {
  const { jsPDF } = await import("jspdf");
  const { number, paper } = await fetchPaper(id);
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  addCanvasPages(pdf, await paperToCanvas(paper, tpl));
  const uri: string = pdf.output("datauristring");
  return { filename: `${number}.pdf`, data: uri.slice(uri.indexOf("base64,") + 7) };
}

export type ExportProgress = (done: number, total: number) => void;

/** One combined PDF — each invoice starts on its own page. */
export async function exportInvoicesPdf(
  ids: number[],
  tpl: TemplateSettings,
  onProgress?: ExportProgress,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const numbers: string[] = [];
  for (const [i, id] of ids.entries()) {
    const { number, paper } = await fetchPaper(id);
    numbers.push(number);
    if (i > 0) pdf.addPage();
    addCanvasPages(pdf, await paperToCanvas(paper, tpl));
    onProgress?.(i + 1, ids.length);
  }
  pdf.save(ids.length === 1 ? `${numbers[0]}.pdf` : `brecx-invoices.pdf`);
}

/** A ZIP with one PDF file per invoice (Zoho's "Export as ZIP (File)"). */
export async function exportInvoicesZip(
  ids: number[],
  tpl: TemplateSettings,
  onProgress?: ExportProgress,
): Promise<void> {
  const [{ jsPDF }, { default: JSZip }] = await Promise.all([import("jspdf"), import("jszip")]);
  const zip = new JSZip();
  for (const [i, id] of ids.entries()) {
    const { number, paper } = await fetchPaper(id);
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    addCanvasPages(pdf, await paperToCanvas(paper, tpl));
    zip.file(`${number}.pdf`, pdf.output("arraybuffer"));
    onProgress?.(i + 1, ids.length);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "brecx-invoices.zip";
  a.click();
  URL.revokeObjectURL(url);
}
