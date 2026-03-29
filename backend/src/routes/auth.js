const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const { generateOTP, generateToken } = require('../utils/helpers');
const { sendOTP, sendResetLink, sendInvite } = require('../utils/email');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ─── Sign Up (2-step: personal + company) ────────────────────

router.post('/signup', async (req, res) => {
  try {
    const {
      email, password, firstName, lastName, phone,
      companyName, country, industry, companySize,
      ownershipType, yearEstablished, legalStructure,
      hqLocation, regionsOfOp, stockExchange, tickerSymbol,
    } = req.body;

    if (!email || !password || !firstName || !lastName || !companyName || !country || !industry || !companySize) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOTP();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName, country, industry, companySize,
          ownershipType: ownershipType || null,
          yearEstablished: yearEstablished ? parseInt(yearEstablished) : null,
          legalStructure: legalStructure || null,
          hqLocation: hqLocation || null,
          regionsOfOp: regionsOfOp || [],
          stockExchange: stockExchange || null,
          tickerSymbol: tickerSymbol || null,
        },
      });

      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(), passwordHash, firstName, lastName, phone,
          role: 'ADMIN', companyId: company.id,
          otpCode: otp,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpLastSentAt: new Date(),
        },
      });

      // Create default org unit
      await tx.orgUnit.create({
        data: { name: 'Headquarters', country, companyId: company.id },
      });

      return { user, company };
    });

    await sendOTP(email, otp);

    res.status(201).json({
      message: 'Account created. Check your email for verification code.',
      userId: result.user.id,
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── Verify Email (OTP) ─────────────────────────────────────

router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Already verified' });
    if (!user.otpCode || user.otpCode !== otp) return res.status(400).json({ error: 'Invalid verification code' });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ error: 'Code expired. Request a new one.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, isActive: true, otpCode: null, otpExpiresAt: null },
    });

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ─── Resend OTP (60s cooldown) ──────────────────────────────

router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Already verified' });

    if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < 60000) {
      const wait = Math.ceil((60000 - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
      return res.status(429).json({ error: `Wait ${wait}s before resending` });
    }

    const otp = generateOTP();
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpLastSentAt: new Date() },
    });

    await sendOTP(email, otp);
    res.json({ message: 'New code sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// ─── Sign In ────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: { select: { id: true, name: true, creditBalance: true } } },
    });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.emailVerified) return res.status(403).json({ error: 'Please verify your email first', needsVerification: true });
    if (!user.isActive) return res.status(403).json({ error: 'Account is deactivated' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = jwt.sign({ userId: user.id, companyId: user.companyId, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.accessExpiry });
    const refreshToken = jwt.sign({ userId: user.id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, company: user.company,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Refresh Token ──────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const accessToken = jwt.sign({ userId: user.id, companyId: user.companyId, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.accessExpiry });
    const newRefresh = jwt.sign({ userId: user.id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });

    res.json({ accessToken, refreshToken: newRefresh });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── Logout ─────────────────────────────────────────────────

router.post('/logout', authenticate, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { refreshToken: null } });
  res.json({ message: 'Logged out' });
});

// ─── Forgot Password ───────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If the email exists, a reset link has been sent.' });

    const token = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExp: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await sendResetLink(email, token);
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ─── Reset Password ────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character' });
    }

    const user = await prisma.user.findFirst({ where: { resetToken: token, resetTokenExp: { gt: new Date() } } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link' });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), resetToken: null, resetTokenExp: null },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

// ─── Invite User (Admin) ───────────────────────────────────

router.post('/invite', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, phone, jobTitle, role } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, first name, and last name required' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const token = generateToken();
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });

    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: '', // Set via invite link
        firstName, lastName, phone, jobTitle,
        role: role === 'ADMIN' ? 'ADMIN' : 'CUSTOM',
        companyId: req.user.companyId,
        emailVerified: true,
        inviteToken: token,
        inviteTokenExp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await sendInvite(email, token, company.name);
    res.status(201).json({ message: 'Invitation sent' });
  } catch (err) {
    console.error('Invite error:', err);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

// ─── Accept Invite ──────────────────────────────────────────

router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character' });
    }

    const user = await prisma.user.findFirst({ where: { inviteToken: token, inviteTokenExp: { gt: new Date() } } });
    if (!user) return res.status(400).json({ error: 'Invalid or expired invitation' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        isActive: true,
        inviteToken: null,
        inviteTokenExp: null,
      },
    });

    res.json({ message: 'Account activated. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// ─── Get Current User ───────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, email: true, firstName: true, lastName: true, phone: true,
      jobTitle: true, role: true, isActive: true, createdAt: true,
      company: { select: { id: true, name: true, creditBalance: true, country: true, industry: true } },
      permissions: { include: { orgUnit: true } },
    },
  });
  res.json(user);
});

module.exports = router;
