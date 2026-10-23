const {
  sendMail,
  getTransporter,
  isConfigured,
  mailFrom,
  brandName,
  appBaseUrl,
  panelUrl
} = require('./mail/mailer');

const COLORS = {
  primary: '#00a6a6',
  secondary: '#115e59',
  accent: '#f59e0b',
  success: '#10b981',
  bg: '#f1f5f9',
  white: '#ffffff',
  text: '#0f172a',
  lightText: '#64748b',
  border: '#e2e8f0'
};

const emailWrapper = (content, title, preheader = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: ${COLORS.bg}; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .preheader { display: none; max-width: 0; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0; }
    .wrapper { width: 100%; table-layout: fixed; background-color: ${COLORS.bg}; padding-bottom: 60px; }
    .main { max-width: 600px; margin: 0 auto; background-color: ${COLORS.white}; border-radius: 24px; overflow: hidden; margin-top: 40px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); }
    
    .header { background: linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%); padding: 48px 40px; text-align: center; position: relative; }
    .logo-circle { width: 64px; height: 64px; background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); color: white; border-radius: 20px; display: inline-flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; border: 1px solid rgba(255,255,255,0.3); margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 24px; color: ${COLORS.white}; font-weight: 800; letter-spacing: -0.5px; }
    
    .content { padding: 48px 40px; color: ${COLORS.text}; }
    .badge { display: inline-block; padding: 8px 16px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 24px; }
    .badge-primary { background-color: ${COLORS.primary}15; color: ${COLORS.primary}; }
    .badge-success { background-color: ${COLORS.success}15; color: ${COLORS.success}; }
    
    h2 { font-size: 28px; font-weight: 800; line-height: 1.2; margin: 0 0 16px 0; color: ${COLORS.text}; letter-spacing: -0.5px; }
    p { font-size: 16px; line-height: 1.6; color: ${COLORS.lightText}; margin: 0 0 24px 0; }
    
    .card { background-color: #f8fafc; border: 1px solid ${COLORS.border}; border-radius: 20px; padding: 32px; margin: 32px 0; }
    .card-title { font-size: 14px; font-weight: 700; text-transform: uppercase; color: ${COLORS.lightText}; letter-spacing: 1px; margin-bottom: 20px; border-bottom: 1px solid ${COLORS.border}; padding-bottom: 12px; }
    
    .data-row { display: flex; justify-content: space-between; padding: 12px 0; }
    .data-label { font-size: 14px; font-weight: 600; color: ${COLORS.lightText}; }
    .data-value { font-size: 14px; font-weight: 700; color: ${COLORS.text}; text-align: right; }
    
    .total-row { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 20px; border-top: 2px dashed ${COLORS.border}; }
    .total-label { font-size: 18px; font-weight: 800; color: ${COLORS.text}; }
    .total-value { font-size: 22px; font-weight: 900; color: ${COLORS.primary}; }
    
    .btn-container { text-align: center; margin-top: 40px; }
    .btn { display: inline-block; background-color: ${COLORS.primary}; color: ${COLORS.white} !important; padding: 18px 36px; border-radius: 16px; font-weight: 700; font-size: 16px; text-decoration: none; box-shadow: 0 10px 15px -3px rgba(0, 166, 166, 0.3); transition: all 0.2s; }
    
    .footer { text-align: center; padding: 40px; }
    .footer p { font-size: 13px; color: ${COLORS.lightText}; margin-bottom: 8px; }
    .social-links { margin-top: 20px; }
    .social-links a { color: ${COLORS.primary}; text-decoration: none; font-weight: 600; font-size: 13px; margin: 0 10px; }
    
    @media only screen and (max-width: 600px) {
      .main { margin-top: 0; border-radius: 0; }
      .content { padding: 32px 24px; }
      .card { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="preheader">${escapeHtml(preheader)}</div>
  <div class="wrapper">
    <div class="main">
      <div class="header">
        <div class="logo-circle">${escapeHtml(brandName().charAt(0).toUpperCase())}</div>
        <h1>${escapeHtml(brandName())}</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>This is an automated message from ${escapeHtml(brandName())}. Please do not reply to this email.</p>
        ${process.env.SUPPORT_EMAIL ? `<p>Need help? Write to <a href="mailto:${escapeHtml(process.env.SUPPORT_EMAIL)}" style="color:${COLORS.primary};">${escapeHtml(process.env.SUPPORT_EMAIL)}</a></p>` : ''}
        <p>&copy; ${new Date().getFullYear()} ${escapeHtml(brandName())}. All rights reserved.</p>
        <div class="social-links">
          <a href="${appBaseUrl()}/user/help-support">Help Center</a>
          <a href="${appBaseUrl()}/user/privacy-policy">Privacy Policy</a>
          <a href="${appBaseUrl()}/user/terms-services">Terms of Service</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

/** Shared pooled transport (kept as a function for the existing callers). */
const createTransporter = () => getTransporter();

const getAppUrl = (path = '') => {
  const base = appBaseUrl();
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Send an HTML body inside the branded layout. Throws on delivery failure. */
async function sendMailSafe({ to, subject, html, preheader, title, replyTo, attachments }) {
  if (!to) return { success: false, skipped: true };
  return sendMail({
    to,
    subject,
    replyTo,
    attachments,
    html: emailWrapper(html, title || subject, preheader || subject)
  });
}

const TONES = {
  info: { bg: '#e0f2fe', fg: '#0369a1' },
  success: { bg: '#dcfce7', fg: '#15803d' },
  warning: { bg: '#fef3c7', fg: '#b45309' },
  danger: { bg: '#fee2e2', fg: '#b91c1c' },
  neutral: { bg: '#f1f5f9', fg: '#475569' }
};

/**
 * Body of a transactional email built from plain data. Every value is
 * escaped, and the markup is table based with inline styles so it renders
 * the same in Gmail, Outlook and mobile clients.
 *
 * @param {object} o
 * @param {string} [o.badge]    short label above the heading
 * @param {string} [o.tone]     info | success | warning | danger | neutral
 * @param {string} o.heading
 * @param {string} [o.greeting] e.g. "Hi Asha,"
 * @param {string|string[]} [o.paragraphs]
 * @param {Array<[string, any]>} [o.rows]  label/value pairs shown in a card
 * @param {string} [o.rowsTitle]
 * @param {string} [o.ctaUrl]
 * @param {string} [o.ctaLabel]
 * @param {string} [o.note]     small print under the button
 * @param {string} [o.highlight] large monospace value (codes)
 */
function renderBlocks(o = {}) {
  const tone = TONES[o.tone] || TONES.info;
  const paras = (Array.isArray(o.paragraphs) ? o.paragraphs : [o.paragraphs]).filter(Boolean);
  const rows = (o.rows || []).filter((r) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== '');

  const badge = o.badge
    ? `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">${escapeHtml(o.badge)}</span>`
    : '';

  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f8fafc;border:1px solid ${COLORS.border};border-radius:12px;">
        ${o.rowsTitle ? `<tr><td colspan="2" style="padding:14px 18px 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COLORS.lightText};">${escapeHtml(o.rowsTitle)}</td></tr>` : ''}
        ${rows.map(([label, value]) => `
        <tr>
          <td style="padding:10px 18px;font-size:14px;color:${COLORS.lightText};vertical-align:top;width:42%;">${escapeHtml(label)}</td>
          <td style="padding:10px 18px;font-size:14px;color:${COLORS.text};font-weight:600;text-align:right;word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`).join('')}
      </table>`
    : '';

  const highlight = o.highlight
    ? `<div style="margin:28px 0;padding:24px;border:2px dashed ${COLORS.primary};border-radius:14px;text-align:center;font-family:'Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:${COLORS.primary};">${escapeHtml(o.highlight)}</div>`
    : '';

  const cta = o.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;"><tr><td style="border-radius:10px;background:${COLORS.primary};">
        <a href="${escapeHtml(o.ctaUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(o.ctaLabel || 'Open dashboard')}</a>
      </td></tr></table>
      <p style="font-size:12px;line-height:1.5;color:${COLORS.lightText};margin:8px 0 0;">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:${COLORS.secondary};">${escapeHtml(o.ctaUrl)}</span></p>`
    : '';

  return `
    ${badge ? `<div style="margin-bottom:18px;">${badge}</div>` : ''}
    <h2 style="font-size:24px;line-height:1.3;margin:0 0 16px;color:${COLORS.text};">${escapeHtml(o.heading || '')}</h2>
    ${o.greeting ? `<p style="font-size:15px;line-height:1.6;color:${COLORS.text};margin:0 0 12px;">${escapeHtml(o.greeting)}</p>` : ''}
    ${paras.map((p) => `<p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 14px;">${escapeHtml(p)}</p>`).join('')}
    ${highlight}
    ${rowsHtml}
    ${cta}
    ${o.note ? `<p style="font-size:13px;line-height:1.5;color:${COLORS.lightText};margin:22px 0 0;">${escapeHtml(o.note)}</p>` : ''}
  `;
}

/** Render blocks into the layout and send. Throws on delivery failure. */
async function sendBlocksEmail({ to, subject, preheader, replyTo, ...blocks }) {
  return sendMailSafe({
    to,
    subject,
    title: blocks.heading || subject,
    preheader: preheader || (Array.isArray(blocks.paragraphs) ? blocks.paragraphs[0] : blocks.paragraphs) || subject,
    replyTo,
    html: renderBlocks(blocks)
  });
}

const OTP_PURPOSE_LABEL = {
  verification: 'verify your email',
  password_reset: 'reset your password',
  login: 'sign in'
};

/**
 * OTP email. Returns `{ success }` (never throws) for the existing callers;
 * use `deliverOtpEmail` where a failure must stop the request.
 */
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    const res = await deliverOtpEmail(email, otp, { purpose });
    return { success: Boolean(res.success), ...res };
  } catch (error) {
    console.error('[mail] OTP email error:', error.message);
    return { success: false, error: error.message };
  }
};

const ROLE_LABEL = {
  user: 'customer',
  vendor: 'vendor',
  engineer: 'engineer',
  worker: 'service partner',
  admin: 'admin',
  b2b: 'business'
};

/** OTP email that throws when it could not be sent. */
async function deliverOtpEmail(email, otp, { purpose = 'verification', role, validMinutes = 10 } = {}) {
  const action = OTP_PURPOSE_LABEL[purpose] || 'continue';
  const res = await sendBlocksEmail({
    to: email,
    subject: `${otp} is your ${brandName()} ${purpose === 'password_reset' ? 'password reset' : 'verification'} code`,
    preheader: `Use ${otp} to ${action}. It expires in ${validMinutes} minutes.`,
    badge: 'Security',
    tone: 'info',
    heading: purpose === 'password_reset' ? 'Reset your password' : 'Your verification code',
    paragraphs: [
      `Use this one-time code to ${action}${role && ROLE_LABEL[role] ? ` on your ${ROLE_LABEL[role]} account` : ''}.`
    ],
    highlight: otp,
    note: `The code expires in ${validMinutes} minutes. ${brandName()} will never ask you for this code. If you did not request it, you can ignore this email — your account is safe.`
  });
  if (res.skipped && res.reason === 'smtp_not_configured') {
    throw new Error('Email delivery is not configured');
  }
  return res;
}

/** Customer welcome email (kept for existing callers). */
const sendWelcomeEmail = async (email, name) => {
  try {
    return await sendBlocksEmail({
      to: email,
      subject: `Welcome to ${brandName()}`,
      badge: 'Welcome',
      tone: 'success',
      heading: `Welcome to ${brandName()}${name ? `, ${name}` : ''}!`,
      paragraphs: [
        'Your account is ready. Book verified professionals, track every job live and pay securely — all in one place.'
      ],
      ctaUrl: panelUrl('user', '/home'),
      ctaLabel: 'Book a service'
    });
  } catch (error) {
    console.error('[mail] Welcome email error:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send Booking Email - Detailed App Style
 */
const sendBookingEmails = async (booking, user, vendor, service) => {
  try {
    if (!isConfigured()) return;
    const transporter = createTransporter();
    const bookingId = booking.bookingNumber || booking._id;

    if (user && user.email) {
      const content = `
        <div class="badge badge-success">Confirmed</div>
        <h2>Booking Scheduled</h2>
        <p>Great news! Your booking for <strong>${service.title || service.name}</strong> has been confirmed. A professional will be at your door as per the schedule below.</p>
        
        <div class="card">
          <div class="card-title">Order Summary</div>
          <div class="data-row"><span class="data-label">Booking ID</span><span class="data-value">#${bookingId}</span></div>
          <div class="data-row"><span class="data-label">Date</span><span class="data-value">${new Date(booking.scheduledDate).toLocaleDateString('en-IN', { dateStyle: 'full' })}</span></div>
          <div class="data-row"><span class="data-label">Time Slot</span><span class="data-value">${booking.scheduledTime}</span></div>
          <div class="data-row"><span class="data-label">Address</span><span class="data-value">${booking.address.city}, ${booking.address.pincode}</span></div>
          
          <div class="total-row">
            <span class="total-label">Total Amount</span>
            <span class="total-value">â‚¹${booking.finalAmount}</span>
          </div>
        </div>

        <div class="btn-container">
          <a href="${getAppUrl(`/user/bookings/${booking._id}`)}" class="btn">Track order in app</a>
        </div>
      `;

      await transporter.sendMail({
        from: mailFrom(),
        to: user.email,
        subject: `Booking Confirmed #${bookingId} - WBI`,
        html: emailWrapper(content, 'Confirmed', 'Your booking is scheduled successfully')
      });
    }

    if (vendor && vendor.email) {
      const vContent = `
        <div class="badge badge-primary">New Job</div>
        <h2>Incoming Order</h2>
        <p>Hello ${vendor.name}, a new booking has been assigned to you. Plan your resources accordingly.</p>
        
        <div class="card">
          <div class="card-title">Job Details</div>
          <div class="data-row"><span class="data-label">Order</span><span class="data-value">#${bookingId}</span></div>
          <div class="data-row"><span class="data-label">Service</span><span class="data-value">${service.title}</span></div>
          <div class="data-row"><span class="data-label">Customer</span><span class="data-value">${user.name}</span></div>
          <div class="data-row"><span class="data-label">Schedule</span><span class="data-value">${new Date(booking.scheduledDate).toLocaleDateString()} at ${booking.scheduledTime}</span></div>
          <div class="data-row"><span class="data-label">Amount</span><span class="data-value">â‚¹${booking.finalAmount}</span></div>
        </div>

        <div class="btn-container">
          <a href="${getAppUrl('/vendor/bookings')}" class="btn" style="background-color: ${COLORS.secondary};">View in vendor portal</a>
        </div>
      `;

      await transporter.sendMail({
        from: mailFrom(),
        to: vendor.email,
        subject: `New Job Assigned #${bookingId} - WBI`,
        html: emailWrapper(vContent, 'New Job', 'Action Required: New job assigned')
      });
    }
  } catch (error) { console.error('Booking email error:', error); }
};

/**
 * Send Invoice Email - Professional Invoice Style
 */
const sendBookingCompletionEmails = async (booking) => {
  try {
    if (!isConfigured()) return;
    const transporter = createTransporter();
    const user = booking.userId;
    const bookingId = booking.bookingNumber || booking._id;

    if (user && user.email) {
      const content = `
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-size: 48px; margin-bottom: 16px;">â­</div>
          <h2>Service Completed</h2>
          <p>Thank you for choosing WBI. We hope the service for <strong>${booking.serviceId?.title || 'Home Service'}</strong> was to your satisfaction.</p>
        </div>

        <div class="card" style="background-color: white;">
          <div class="card-title">Official Receipt</div>
          <div class="data-row"><span class="data-label">Invoice No.</span><span class="data-value">INV-${bookingId}</span></div>
          <div class="data-row"><span class="data-label">Completed On</span><span class="data-value">${new Date().toLocaleDateString('en-IN')}</span></div>
          <div class="data-row"><span class="data-label">Service Charge</span><span class="data-value">â‚¹${booking.basePrice - booking.discount}</span></div>
          <div class="data-row"><span class="data-label">Visiting Fee</span><span class="data-value">â‚¹${booking.visitingCharges}</span></div>
          <div class="data-row"><span class="data-label">HST (Tax)</span><span class="data-value">â‚¹${booking.tax}</span></div>
          
          <div class="total-row">
            <span class="total-label">Amount Paid</span>
            <span class="total-value">â‚¹${booking.finalAmount}</span>
          </div>
        </div>

        <div style="text-align: center; margin-top: 32px; border: 1px solid ${COLORS.border}; border-radius: 16px; padding: 24px;">
           <div style="font-weight: 700; font-size: 14px; color: ${COLORS.text}; margin-bottom: 8px;">RATE THE PROFESSIONAL</div>
           <p style="font-size: 13px; margin: 0;">How was your experience with us? Help others by rating the service.</p>
           <div class="btn-container" style="margin-top: 16px;">
             <a href="#" class="btn" style="background-color: #f59e0b;">Submit Rating</a>
           </div>
        </div>
      `;

      await transporter.sendMail({
        from: mailFrom(),
        to: user.email,
        subject: `Service Invoice #${bookingId} - WBI`,
        html: emailWrapper(content, 'Invoice', 'Your service is complete. Here is the receipt.')
      });
    }
  } catch (error) { console.error('Invoice email error:', error); }
};

/**
 * Send Withdrawal Approved Email
 */
const sendWithdrawalApprovedEmail = async (vendor, amount, transactionId) => {
  try {
    if (!isConfigured() || !vendor.email) return;
    const transporter = createTransporter();

    const content = `
      <div style="text-align: center;">
        <div class="badge badge-success">Settlemet Done</div>
        <h2>Funds Withdrawn Successfully</h2>
        <p>Hi ${vendor.name}, your withdrawal request has been approved and successfully processed to your account.</p>
        
        <div class="card">
          <div class="data-row"><span class="data-label">Transaction Ref</span><span class="data-value">${transactionId || 'N/A'}</span></div>
          <div class="data-row"><span class="data-label">Settlemet Date</span><span class="data-value">${new Date().toLocaleDateString()}</span></div>
          <div class="total-row">
            <span class="total-label">Amount Sent</span>
            <span class="total-value" style="color: ${COLORS.success}">â‚¹${amount}</span>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: mailFrom(),
      to: vendor.email,
      subject: 'Withdrawal Success - WBI',
      html: emailWrapper(content, 'Withdrawal', 'Your funds are on the way')
    });
  } catch (error) { console.error(error); }
};

/**
 * Send Dues Payment Approved Email
 */
const sendDuesPaymentApprovedEmail = async (vendor, amount, balanceAfter) => {
  try {
    if (!isConfigured() || !vendor.email) return;
    const transporter = createTransporter();

    const content = `
      <div style="text-align: center;">
        <div class="badge badge-success">Verified</div>
        <h2>Payment Acknowledged</h2>
        <p>Hi ${vendor.name}, we've successfully verified your dues payment. Your wallet has been updated.</p>
        
        <div class="card">
          <div class="data-row"><span class="data-label">Payment Amount</span><span class="data-value">â‚¹${amount}</span></div>
          <div class="total-row">
            <span class="total-label">Remaining Balance</span>
            <span class="total-value">â‚¹${balanceAfter}</span>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: mailFrom(),
      to: vendor.email,
      subject: 'Dues Payment Verified - WBI',
      html: emailWrapper(content, 'Verified', 'We have received your payment')
    });
  } catch (error) { console.error(error); }
};

async function sendEngineerOpsJobAssignedEmail(engineer, vendor, job, project) {
  const email = engineer?.email;
  if (!email) return { success: false, skipped: true };

  const vendorName = escapeHtml(vendor?.businessName || vendor?.name || 'Your vendor');
  const content = `
    <div class="badge badge-primary">New assignment</div>
    <h2>You have a new field job</h2>
    <p><strong>${vendorName}</strong> assigned you a job. Open the engineer app to accept and view client details.</p>
    <div class="card">
      <div class="card-title">Job details</div>
      <div class="data-row"><span class="data-label">Job code</span><span class="data-value">${escapeHtml(job.jobCode || job._id)}</span></div>
      <div class="data-row"><span class="data-label">Service</span><span class="data-value">${escapeHtml(job.title)}</span></div>
      <div class="data-row"><span class="data-label">Client</span><span class="data-value">${escapeHtml(job.clientName || '—')}</span></div>
      <div class="data-row"><span class="data-label">Location</span><span class="data-value">${escapeHtml([job.city, job.address].filter(Boolean).join(' — ') || '—')}</span></div>
      <div class="data-row"><span class="data-label">Budget (est.)</span><span class="data-value">₹${Number(job.budget || 0).toLocaleString('en-IN')}</span></div>
    </div>
    <div class="btn-container">
      <a href="${getAppUrl(`/engineer/ops-jobs/${job._id}`)}" class="btn">Open job in app</a>
    </div>
  `;
  return sendMailSafe({
    to: email,
    subject: `Action required: ${job.jobCode || 'New job'} — WBI`,
    html: content,
    title: 'New job assigned',
    preheader: `${vendorName} assigned: ${job.title}`
  });
}

async function sendVendorOpportunityEmail(vendor, opp) {
  if (!vendor?.email) return { success: false, skipped: true };
  const content = `
    <div class="badge badge-primary">New opportunity</div>
    <h2>New business intake</h2>
    <p>Hello ${escapeHtml(vendor.businessName || vendor.name)}, a new project is available. Review and respond in your vendor portal.</p>
    <div class="card">
      <div class="card-title">Opportunity</div>
      <div class="data-row"><span class="data-label">Code</span><span class="data-value">${escapeHtml(opp.opportunityCode || '—')}</span></div>
      <div class="data-row"><span class="data-label">Title</span><span class="data-value">${escapeHtml(opp.title || '—')}</span></div>
      <div class="data-row"><span class="data-label">City</span><span class="data-value">${escapeHtml(opp.city || '—')}</span></div>
      <div class="data-row"><span class="data-label">Budget</span><span class="data-value">${escapeHtml(opp.budgetLabel || 'On request')}</span></div>
      <div class="data-row"><span class="data-label">Engineers needed</span><span class="data-value">${opp.requiredEngineers || 1}</span></div>
    </div>
    <div class="btn-container">
      <a href="${getAppUrl('/vendor/business-intake')}" class="btn">View in portal</a>
    </div>
  `;
  return sendMailSafe({
    to: vendor.email,
    subject: `New lead: ${opp.opportunityCode || 'Opportunity'} — WBI`,
    html: content,
    title: 'New opportunity',
    preheader: opp.title || 'New project in your area'
  });
}

async function sendVendorEngineerJobUpdateEmail(vendor, job, engineer, status) {
  if (!vendor?.email) return { success: false, skipped: true };
  const engineerName = escapeHtml(engineer?.name || job.engineerName || 'Engineer');
  const verbs = { accepted: 'accepted', rejected: 'declined', completed: 'completed' };
  const verb = verbs[status] || status;
  const content = `
    <div class="badge badge-success">Job update</div>
    <h2>${engineerName} ${verb} the job</h2>
    <p>Your ops job status has been updated.</p>
    <div class="card">
      <div class="data-row"><span class="data-label">Job</span><span class="data-value">${escapeHtml(job.title || job.jobCode)}</span></div>
      <div class="data-row"><span class="data-label">Engineer</span><span class="data-value">${engineerName}</span></div>
      <div class="data-row"><span class="data-label">Time</span><span class="data-value">${new Date().toLocaleString('en-IN')}</span></div>
    </div>
    <div class="btn-container">
      <a href="${getAppUrl(job.projectId ? `/vendor/project-ops/${job.projectId}` : '/vendor/project-ops')}" class="btn">Open project</a>
    </div>
  `;
  return sendMailSafe({
    to: vendor.email,
    subject: `Engineer ${verb}: ${job.jobCode || job.title} — WBI`,
    html: content,
    title: 'Job update',
    preheader: `${engineerName} ${verb} — ${job.title}`
  });
}

async function sendVendorPartnerActivationEmail(vendor, onboardingPayload = {}) {
  if (!vendor?.email) return { success: false, skipped: true };
  const partnerName = escapeHtml(vendor.businessName || vendor.name || 'Partner');
  const code = onboardingPayload.uniqueCompanyCode || vendor.uniqueCompanyCode;
  const content = `
    <div class="badge badge-success">Go live</div>
    <h2>Your partner workspace is active</h2>
    <p>Hello ${partnerName}, congratulations — your WBI partner dashboard has been provisioned and is ready to use.</p>
    <div class="card">
      <div class="card-title">Activation summary</div>
      <div class="data-row"><span class="data-label">Partner</span><span class="data-value">${partnerName}</span></div>
      ${code ? `<div class="data-row"><span class="data-label">Company code</span><span class="data-value">${escapeHtml(code)}</span></div>` : ''}
      <div class="data-row"><span class="data-label">Activated</span><span class="data-value">${new Date().toLocaleString('en-IN')}</span></div>
    </div>
    <div class="btn-container">
      <a href="${getAppUrl('/vendor/digital-solution/dashboard')}" class="btn">Open partner dashboard</a>
    </div>
  `;
  return sendMailSafe({
    to: vendor.email,
    subject: 'Partner workspace active — WBI',
    html: content,
    title: 'Workspace active',
    preheader: 'Your WBI partner dashboard is live'
  });
}

async function sendServiceRequestPaymentEmail({ email, name, serviceName, requestCode, amount, razorpayPaymentId, serviceRequestId }) {
  if (!email) return { success: false, skipped: true };
  const content = `
    <div class="badge badge-success">Payment received</div>
    <h2>Thank you, ${escapeHtml(name)}</h2>
    <p>We received your payment. Your request is being assigned to verified vendors.</p>
    <div class="card">
      <div class="card-title">Payment summary</div>
      <div class="data-row"><span class="data-label">Request ID</span><span class="data-value">${escapeHtml(requestCode || serviceRequestId)}</span></div>
      <div class="data-row"><span class="data-label">Service</span><span class="data-value">${escapeHtml(serviceName)}</span></div>
      <div class="data-row"><span class="data-label">Amount paid</span><span class="data-value">₹${Number(amount || 0).toLocaleString('en-IN')}</span></div>
      ${razorpayPaymentId ? `<div class="data-row"><span class="data-label">Payment ref</span><span class="data-value">${escapeHtml(razorpayPaymentId)}</span></div>` : ''}
    </div>
    <div class="btn-container">
      <a href="${getAppUrl('/user/my-bookings')}" class="btn">Track status</a>
    </div>
  `;
  return sendMailSafe({
    to: email,
    subject: `Payment received — ${serviceName} — WBI`,
    html: content,
    title: 'Payment received',
    preheader: `₹${amount} received for ${serviceName}`
  });
}

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendBookingEmails,
  sendBookingCompletionEmails,
  sendWithdrawalApprovedEmail,
  sendDuesPaymentApprovedEmail,
  sendB2BJobCompletionEmail,
  sendEngineerOpsJobAssignedEmail,
  sendVendorOpportunityEmail,
  sendVendorEngineerJobUpdateEmail,
  sendVendorPartnerActivationEmail,
  sendServiceRequestPaymentEmail,
  sendMailSafe,
  sendTemplatedNotification,
  sendBlocksEmail,
  renderBlocks,
  deliverOtpEmail,
  sendB2BInviteEmail,
  escapeHtml,
  getAppUrl
};

/**
 * Email for a catalogued notification event (called by the orchestrator's
 * email channel). `email` carries the presentation the catalog computed:
 * { badge, tone, greeting, paragraphs, rows, rowsTitle, ctaLabel, note }.
 */
async function sendTemplatedNotification({ to, title, message, actionUrl, role, email = {} }) {
  const ctaUrl = actionUrl ? panelUrl(role, actionUrl) : null;
  const paragraphs = email.paragraphs?.length ? email.paragraphs : [message].filter(Boolean);
  return sendBlocksEmail({
    to,
    subject: email.subject || title || `${brandName()} notification`,
    preheader: email.preheader || message || title,
    badge: email.badge,
    tone: email.tone,
    heading: email.heading || title,
    greeting: email.greeting,
    paragraphs,
    rows: email.rows,
    rowsTitle: email.rowsTitle,
    ctaUrl: email.noCta ? null : ctaUrl,
    ctaLabel: email.ctaLabel,
    note: email.note
  });
}

/**
 * Invitation to join a company's B2B workspace. Sent directly (not through
 * the delivery log) because the link carries a one-time token. Throws on
 * failure so the caller can report it.
 */
async function sendB2BInviteEmail({ to, name, companyName, role, inviteLink, invitedBy, expiresHours = 24, resend = false }) {
  return sendBlocksEmail({
    to,
    subject: `${resend ? 'Reminder: ' : ''}You're invited to join ${companyName || 'your company'} on ${brandName()}`,
    preheader: `${invitedBy || 'Your company admin'} invited you as ${role || 'a team member'}. The link expires in ${expiresHours} hours.`,
    badge: 'Team invitation',
    tone: 'info',
    heading: `Join ${companyName || 'your company'} on ${brandName()}`,
    greeting: name ? `Hi ${name},` : undefined,
    paragraphs: [
      `${invitedBy || 'Your company admin'} has invited you to the ${companyName || 'company'} business workspace on ${brandName()}.`,
      'Accept the invitation and set your password to get started.'
    ],
    rows: [
      ['Company', companyName],
      ['Role', role],
      ['Login email', to]
    ],
    ctaUrl: inviteLink,
    ctaLabel: 'Accept invitation',
    note: `This link expires in ${expiresHours} hours and can be used once. If you were not expecting this invitation, you can ignore this email.`
  });
}

/**
 * Send B2B Job Completion Thank-You Notification Email
 */
async function sendB2BJobCompletionEmail(companyEmail, companyName, job, engineerName) {
  try {
    if (!isConfigured()) {
      console.log(`[EMAIL] B2B job completion email skipped (no email config) for ${companyEmail}`);
      return;
    }

    const content = `
      <div class="badge badge-success">✅ Job Completed</div>
      <h2>Task Successfully Completed!</h2>
      <p>Dear <strong>${companyName}</strong>, we're pleased to inform you that the following service request has been successfully closed.</p>
      
      <div class="card">
        <div class="card-title">Job Closure Summary</div>
        <div class="data-row">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Job ID</span>
          <span style="color:#0f172a;font-size:14px;font-weight:700;">${job.jobId}</span>
        </div>
        <div class="data-row">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Service</span>
          <span style="color:#0f172a;font-size:14px;font-weight:700;">${job.service}</span>
        </div>
        <div class="data-row">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Location</span>
          <span style="color:#0f172a;font-size:14px;font-weight:700;">${job.city}</span>
        </div>
        <div class="data-row">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Engineer</span>
          <span style="color:#0f172a;font-size:14px;font-weight:700;">${engineerName || 'TazkY Field Expert'}</span>
        </div>
        <div class="data-row">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Completed At</span>
          <span style="color:#0f172a;font-size:14px;font-weight:700;">${new Date().toLocaleString('en-IN')}</span>
        </div>
        <div class="data-row" style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:8px;">
          <span style="color:#64748b;font-size:14px;font-weight:600;">Amount Settled</span>
          <span style="color:#10b981;font-size:16px;font-weight:800;">₹${(job.charge || 0).toLocaleString('en-IN')}</span>
        </div>
      </div>

      <p>We look forward to continuing our partnership. Please rate the service experience in your B2B portal — your feedback helps us improve the quality of our engineers.</p>
      <p style="background:#f0fdfa;border:1px solid #10AFA5;border-radius:12px;padding:16px;font-size:13px;color:#0f766e;">
        <strong>🙏 Thank you for choosing TazkY!</strong><br>
        Your trust drives our commitment to operational excellence.
      </p>
    `;

    const transporter = createTransporter();
    await transporter.sendMail({
      from: mailFrom(),
      to: companyEmail,
      subject: `✅ Job Completed — ${job.jobId} | TazkY B2B Platform`,
      html: emailWrapper(content, 'Job Completed', `Your service request ${job.jobId} has been completed.`)
    });

    console.log(`[EMAIL] B2B completion thank-you sent to ${companyEmail} for Job ${job.jobId}`);
  } catch (error) {
    console.error('[EMAIL] B2B completion email failed (non-blocking):', error.message);
  }
}

