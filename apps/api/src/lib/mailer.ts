/**
 * Outbound email over SMTP (same pattern as Wholesale HQ's mailer).
 * Credentials come from env (SMTP_HOST/PORT/USER/PASS, SMTP_FROM).
 */
import nodemailer from "nodemailer";
import { env } from "../env.js";
import { logger } from "../logger.js";

export function smtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error("Email isn't configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in the API env.");
  }
  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    cc: opts.cc || undefined,
    bcc: opts.bcc || undefined,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });
  logger.info({ messageId: info.messageId, to: opts.to }, "email sent");
}
