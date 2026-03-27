const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;

function getTransporter() {
  if (!transporter) {
    if (config.smtp.host && config.smtp.user) {
      transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
    } else {
      // Dev fallback: log emails to console
      transporter = {
        sendMail: async (opts) => {
          console.log('\n📧 DEV EMAIL:', opts.subject);
          console.log('   To:', opts.to);
          console.log('   Body:', opts.html || opts.text, '\n');
          return { messageId: 'dev-' + Date.now() };
        },
      };
    }
  }
  return transporter;
}

async function sendOTP(email, otp) {
  return getTransporter().sendMail({
    from: `"Triple I ESG" <${config.smtp.user || 'noreply@esg.io'}>`,
    to: email,
    subject: 'Your Verification Code',
    html: `<h2>Email Verification</h2><p>Your verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
  });
}

async function sendResetLink(email, token) {
  const link = `${config.frontend.url}/reset-password?token=${token}`;
  return getTransporter().sendMail({
    from: `"Triple I ESG" <${config.smtp.user || 'noreply@esg.io'}>`,
    to: email,
    subject: 'Reset Your Password',
    html: `<h2>Password Reset</h2><p>Click <a href="${link}">here</a> to reset your password.</p><p>This link expires in 1 hour.</p>`,
  });
}

async function sendInvite(email, token, companyName) {
  const link = `${config.frontend.url}/accept-invite?token=${token}`;
  return getTransporter().sendMail({
    from: `"Triple I ESG" <${config.smtp.user || 'noreply@esg.io'}>`,
    to: email,
    subject: `You're invited to ${companyName} on Triple I ESG`,
    html: `<h2>Invitation</h2><p>You've been invited to join <strong>${companyName}</strong> on the Triple I ESG Portal.</p><p>Click <a href="${link}">here</a> to set up your account.</p>`,
  });
}

module.exports = { sendOTP, sendResetLink, sendInvite };
