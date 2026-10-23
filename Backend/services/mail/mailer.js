/**
 * SMTP transport shared by every email the platform sends.
 *
 * One pooled connection per process (opening a TLS session per message is
 * slow and trips provider rate limits). Configuration comes from EMAIL_* with
 * SMTP_* accepted as aliases:
 *
 *   EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS   required to send
 *   EMAIL_FROM            "Brand <noreply@domain>" (defaults to EMAIL_USER)
 *   EMAIL_REPLY_TO        optional reply-to for every message
 *   EMAIL_SECURE          'true' for implicit TLS (auto when port is 465)
 *   EMAIL_TLS_REJECT_UNAUTHORIZED  'false' only for a relay with a private cert
 *   EMAIL_DISABLED        'true' to stop all outgoing mail (logged instead)
 *   APP_PUBLIC_URL        base URL used in email links (else first FRONTEND_URL)
 */
const nodemailer = require('nodemailer');

const env = (...keys) => {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const isProduction = () => process.env.NODE_ENV === 'production';

const isConfigured = () =>
  Boolean(env('EMAIL_HOST', 'SMTP_HOST') && env('EMAIL_USER', 'SMTP_USER') && env('EMAIL_PASS', 'SMTP_PASS'));

const isDisabled = () => process.env.EMAIL_DISABLED === 'true';

const brandName = () => env('APP_NAME') || 'WBI';

/** RFC 5322 sender: EMAIL_FROM, else the authenticated mailbox. */
const mailFrom = () => {
  const from = env('EMAIL_FROM', 'SMTP_FROM');
  if (from) return from;
  const address = env('SMTP_FROM_EMAIL', 'EMAIL_USER', 'SMTP_USER');
  return address ? `"${brandName()}" <${address}>` : undefined;
};

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  const port = parseInt(env('EMAIL_PORT', 'SMTP_PORT') || '587', 10);
  const secureFlag = env('EMAIL_SECURE', 'SMTP_SECURE');
  transporter = nodemailer.createTransport({
    host: env('EMAIL_HOST', 'SMTP_HOST'),
    port,
    secure: secureFlag ? secureFlag === 'true' : port === 465,
    auth: {
      user: env('EMAIL_USER', 'SMTP_USER'),
      pass: env('EMAIL_PASS', 'SMTP_PASS')
    },
    pool: true,
    maxConnections: parseInt(env('EMAIL_MAX_CONNECTIONS') || '5', 10),
    maxMessages: 100,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
    tls: {
      rejectUnauthorized: env('EMAIL_TLS_REJECT_UNAUTHORIZED') !== 'false'
    }
  });
  return transporter;
};

const stripHtml = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

const maskEmail = (to) =>
  String(Array.isArray(to) ? to.join(',') : to || '').replace(/(^|,)\s*([^@,]{1,2})[^@,]*@/g, '$1$2***@');

/**
 * Send one message. Resolves `{ success, messageId }`, `{ skipped }` when
 * mail is off, and throws on a delivery error so queued callers can retry.
 */
async function sendMail({ to, subject, html, text, replyTo, headers, attachments, cc, bcc }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : to;
  if (!recipients || (Array.isArray(recipients) && !recipients.length)) {
    return { success: false, skipped: true, reason: 'no_recipient' };
  }

  if (isDisabled()) {
    console.log(`[mail] disabled — not sent: "${subject}" → ${maskEmail(recipients)}`);
    return { success: false, skipped: true, reason: 'disabled' };
  }

  if (!isConfigured()) {
    if (isProduction()) {
      console.error(`[mail] SMTP is not configured — "${subject}" to ${maskEmail(recipients)} was NOT sent`);
      return { success: false, skipped: true, reason: 'smtp_not_configured' };
    }
    console.log(`[mail] (dev, no SMTP) "${subject}" → ${maskEmail(recipients)}`);
    return { success: true, logged: true };
  }

  const info = await getTransporter().sendMail({
    from: mailFrom(),
    to: recipients,
    cc,
    bcc,
    replyTo: replyTo || env('EMAIL_REPLY_TO') || undefined,
    subject,
    html,
    text: text || stripHtml(html),
    headers,
    attachments
  });
  return { success: true, messageId: info?.messageId };
}

/** Check the SMTP login once at boot so a bad credential is visible in logs. */
async function verifyMailer() {
  if (isDisabled()) {
    console.warn('[mail] EMAIL_DISABLED=true — outgoing email is off');
    return false;
  }
  if (!isConfigured()) {
    const log = isProduction() ? console.error : console.warn;
    log('[mail] EMAIL_HOST / EMAIL_USER / EMAIL_PASS not set — emails will not be delivered');
    return false;
  }
  try {
    await getTransporter().verify();
    console.log(`[mail] SMTP ready (${env('EMAIL_HOST', 'SMTP_HOST')}) as ${maskEmail(env('EMAIL_USER', 'SMTP_USER'))}`);
    return true;
  } catch (err) {
    console.error('[mail] SMTP verification failed:', err.message);
    return false;
  }
}

/** Public base URL for links in emails (first FRONTEND_URL when it is a list). */
const appBaseUrl = () => {
  const raw = env('APP_PUBLIC_URL') || env('FRONTEND_URL').split(',')[0] || 'http://localhost:5173';
  return raw.trim().replace(/\/+$/, '');
};

/** Route prefix of each panel in the web app. */
const PANEL_PREFIX = {
  user: '/user',
  vendor: '/vendor',
  engineer: '/engineer',
  worker: '/worker',
  admin: '/admin',
  b2b: '/b2b'
};

/**
 * Absolute link for a panel path. Catalog links are often relative to the
 * panel ('dashboard', 'finance/wallet'); those get the role's prefix.
 */
const panelUrl = (role, path = '') => {
  const p = String(path || '').trim();
  if (/^https?:\/\//i.test(p)) return p;
  const base = appBaseUrl();
  const prefix = PANEL_PREFIX[role] || '';
  if (!p) return `${base}${prefix}`;
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  const hasPanelPrefix = Object.values(PANEL_PREFIX).some(
    (pre) => withSlash === pre || withSlash.startsWith(`${pre}/`) || withSlash.startsWith(`${pre}?`)
  );
  return `${base}${hasPanelPrefix ? withSlash : `${prefix}${withSlash}`}`;
};

module.exports = {
  sendMail,
  verifyMailer,
  getTransporter,
  isConfigured,
  isProduction,
  mailFrom,
  brandName,
  appBaseUrl,
  panelUrl,
  stripHtml,
  maskEmail,
  PANEL_PREFIX
};
