const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter.
 * We prioritize AWS SES SMTP credentials if available.
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'email-smtp.us-east-1.amazonaws.com',
    port: process.env.SMTP_PORT || process.env.EMAIL_PORT || 587,
    secure: (process.env.SMTP_SECURE === 'true') || false,
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    },
    pool: true, // Use pooled connections for scalability (important for high volume)
    maxConnections: 10, // Increased for 1 Lakh+ scale
    maxMessages: 500,
  });
};

/**
 * Send an OTP Email using AWS SES (via Nodemailer)
 * @param {string} email - The recipient email address
 * @param {string} otp - The 6-digit OTP code
 * @param {string} role - The user role (e.g., 'worker', 'engineer')
 */
const sendOtpEmail = async (email, otp, role) => {
  try {
    // If no credentials are set anywhere, fallback to mock
    if (!(process.env.SMTP_USER || process.env.EMAIL_USER)) {
        console.log(`[LOCAL DEV MODE] Mock Delivery: Sending OTP ${otp} to Email ${email} (Role: ${role})`);
        return true;
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Appzeto'}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Your Password Reset OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
          <p style="color: #555; font-size: 16px;">Hello,</p>
          <p style="color: #555; font-size: 16px;">We received a request to reset the password for your ${role} account.</p>
          <div style="background-color: #f4f4f4; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4F46E5;">${otp}</span>
          </div>
          <p style="color: #555; font-size: 14px;">This OTP is valid for <strong>5 minutes</strong>. Please do not share it with anyone.</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[AWS SES Email] OTP sent to ${email}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[AWS SES Email Error] Failed to send OTP to ${email}:`, error);
    throw error; // Throwing error will be caught by authController
  }
};

module.exports = {
  sendOtpEmail,
};
