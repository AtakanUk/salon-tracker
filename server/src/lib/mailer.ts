import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';
import { config } from '../config.js';

/** Email is optional: without SMTP env vars the system runs, just without mail. */
export function mailConfigured(): boolean {
  return !!(config.smtp.host && config.smtp.user && config.smtp.pass && config.alertTo);
}

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

export async function sendMail(options: {
  subject: string;
  text: string;
  attachments?: Mail.Attachment[];
}): Promise<{ sent: boolean; error?: string }> {
  if (!mailConfigured()) {
    return { sent: false, error: 'mail_not_configured' };
  }
  try {
    await getTransport().sendMail({
      from: config.mailFrom || config.smtp.user,
      to: config.alertTo,
      subject: options.subject,
      text: options.text,
      attachments: options.attachments,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
