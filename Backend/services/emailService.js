const nodemailer = require('nodemailer');

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
  <title>${title}</title>
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
  <div class="preheader">${preheader}</div>
  <div class="wrapper">
    <div class="main">
      <div class="header">
        <div class="logo-circle">H</div>
        <h1>WBI</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>Premium Home Services â€¢ Delivered with Care</p>
        <p>&copy; ${new Date().getFullYear()} WBI India. All rights reserved.</p>
        <div class="social-links">
          <a href="#">Help Center</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false // Fix ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR on AWS
    }
  });
};

const getAppUrl = (path = '') => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

const escapeHtml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

async function sendMailSafe({ to, subject, html, preheader, title }) {
  if (!to) return { success: false, skipped: true };
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log(`[EMAIL] (no SMTP) To: ${to} | ${subject}`);
    return { success: true, logged: true };
  }
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'WBI <noreply@wbi.com>',
    to,
    subject,
    html: emailWrapper(html, title || subject, preheader || subject)
  });
  return { success: true };
}

/**
 * Send OTP Email - Professional Style
 */
const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log(`[EMAIL SERVICE] OTP for ${email}: ${otp}`);
      return { success: true };
    }

    const transporter = createTransporter();
    const subjectPrefix = purpose === 'password_reset' ? 'Reset Password' : 'Verify Email';

    const content = `
      <div style="text-align: center;">
        <div class="badge badge-primary">Security</div>
        <h2>Verify your identity</h2>
        <p>Your one-time password (OTP) for WBI is ready. Use this code to complete your ${purpose.replace('_', ' ')}.</p>
        
        <div style="background: ${COLORS.bg}; border-radius: 20px; padding: 40px; margin: 40px 0; border: 2px dashed ${COLORS.primary};">
          <div style="font-size: 48px; font-weight: 900; letter-spacing: 12px; color: ${COLORS.primary}; margin-bottom: 8px;">${otp}</div>
          <div style="font-size: 13px; color: ${COLORS.lightText}; font-weight: 600; text-transform: uppercase;">Valid for 10 minutes only</div>
        </div>
        
        <p style="font-size: 14px;">If you didn't request this code, you can safely ignore this email. Someone else might have typed your email address by mistake.</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
      to: email,
      subject: `${subjectPrefix} - WBI`,
      html: emailWrapper(content, subjectPrefix, `Your verification code is ${otp}`)
    });
    return { success: true };
  } catch (error) {
    console.error('OTP email error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send Welcome Email - Professional App Style
 */
const sendWelcomeEmail = async (email, name) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return { success: true };
    const transporter = createTransporter();

    const content = `
      <div style="text-align: center;">
        <div class="badge badge-success">Welcome</div>
        <h2>Hello ${name}! ðŸ‘‹</h2>
        <p>Welcome to the WBI family. We're excited to help you take care of your home with our premium services.</p>
        
        <div style="display: flex; justify-content: space-around; margin: 40px 0; flex-wrap: wrap;">
          <div style="width: 140px; margin: 10px;">
             <div style="font-size: 32px; margin-bottom: 10px;">ðŸ›¡ï¸</div>
             <div style="font-size: 14px; font-weight: 700;">Verified Pros</div>
          </div>
          <div style="width: 140px; margin: 10px;">
             <div style="font-size: 32px; margin-bottom: 10px;">âš¡</div>
             <div style="font-size: 14px; font-weight: 700;">Fast Booking</div>
          </div>
          <div style="width: 140px; margin: 10px;">
             <div style="font-size: 32px; margin-bottom: 10px;">ðŸ’Ž</div>
             <div style="font-size: 14px; font-weight: 700;">Secure Pay</div>
          </div>
        </div>

        <div class="btn-container">
          <a href="#" class="btn">Book Your First Service</a>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
      to: email,
      subject: 'Welcome to WBI!',
      html: emailWrapper(content, 'Welcome', 'Welcome to the future of home services')
    });
    return { success: true };
  } catch (error) {
    console.error('Welcome email error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send Booking Email - Detailed App Style
 */
const sendBookingEmails = async (booking, user, vendor, service) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
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
        from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
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
        from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
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
        from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !vendor.email) return;
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
      from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
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
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !vendor.email) return;
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
      from: process.env.EMAIL_FROM || 'WBI <noreply@WBI.com>',
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
  getAppUrl
};

/**
 * Send B2B Job Completion Thank-You Notification Email
 */
async function sendB2BJobCompletionEmail(companyEmail, companyName, job, engineerName) {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
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
      from: `"TazkY Operations" <${process.env.EMAIL_USER}>`,
      to: companyEmail,
      subject: `✅ Job Completed — ${job.jobId} | TazkY B2B Platform`,
      html: emailWrapper(content, 'Job Completed', `Your service request ${job.jobId} has been completed.`)
    });

    console.log(`[EMAIL] B2B completion thank-you sent to ${companyEmail} for Job ${job.jobId}`);
  } catch (error) {
    console.error('[EMAIL] B2B completion email failed (non-blocking):', error.message);
  }
}

