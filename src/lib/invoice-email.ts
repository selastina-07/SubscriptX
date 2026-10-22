import "server-only";
import nodemailer from "nodemailer";
import type { Invoice } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });
}

export async function sendInvoiceEmail(
  email: string,
  invoice: Invoice,
): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || "587");
  const from = process.env.EMAIL_FROM;
  const smtpValues = [host, user, password, from];

  if (smtpValues.every((value) => !value)) return false;
  if (
    smtpValues.some((value) => !value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, and a valid SMTP_PORT.");
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: invoice.currency,
  }).format(invoice.amount / 100);
  const planName = escapeHtml(invoice.plan);
  const invoiceNumber = escapeHtml(invoice.number);
  const startsAt = escapeHtml(invoice.startsAt.toISOString().slice(0, 10));
  const expiresAt = escapeHtml(invoice.expiresAt.toISOString().slice(0, 10));

  await transport.sendMail({
    from,
    to: email,
    subject: `SubscriptX DEMO invoice ${invoiceNumber}`,
    text: [
      "DEMO — NO REAL MONEY CHARGED.",
      `Demo subscription activated: SubscriptX ${invoice.plan}.`,
      `Invoice: ${invoice.number}`,
      `Amount: ${amount}`,
      `Subscription: ${startsAt} to ${expiresAt}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;margin:auto">
        <h1 style="color:#6d5dfc">SubscriptX</h1>
        <p><strong>DEMO — NO REAL MONEY CHARGED</strong></p>
        <p>Your demo subscription is active. No payment details were collected.</p>
        <section style="border:1px solid #e2e8f0;border-radius:12px;padding:20px">
          <h2 style="margin-top:0">Invoice ${invoiceNumber}</h2>
          <p><strong>Plan:</strong> ${planName} (${invoice.interval.toLowerCase()})</p>
          <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
          <p><strong>Subscription dates:</strong> ${startsAt} to ${expiresAt}</p>
          <p><strong>Issued:</strong> ${escapeHtml(invoice.issuedAt.toISOString().slice(0, 10))}</p>
        </section>
      </div>`,
  });
  return true;
}

export async function sendAndRecordInvoiceEmail(email: string, invoice: Invoice) {
  if (invoice.emailSentAt) return true;
  const sent = await sendInvoiceEmail(email, invoice);
  if (sent) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { emailSentAt: new Date() },
    });
  }
  return sent;
}
