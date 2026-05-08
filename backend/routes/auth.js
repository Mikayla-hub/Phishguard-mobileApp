const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const BCRYPT_ROUNDS = 12;

// Email transporter (configure SMTP credentials in .env)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Validate email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Validate password strength
const validatePassword = (password) => {
  const errors = [];
  if (password.length < 8)         errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password))     errors.push('one uppercase letter');
  if (!/[a-z]/.test(password))     errors.push('one lowercase letter');
  if (!/[0-9]/.test(password))     errors.push('one number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('one special character (!@#$% etc.)');
  return errors;
};

// Handle Signup
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate email format
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    // Validate password strength
    const pwErrors = validatePassword(password || '');
    if (pwErrors.length > 0) {
      return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}.` });
    }

    const database = db.getDb();
    
    // Check if user already exists in Firebase Realtime Database
    const usersRef = database.ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');
    if (snapshot.exists()) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const newUser = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString()
    };

    // Save to Firebase Realtime Database
    await usersRef.child(userId).set(newUser);

    const token = jwt.sign({ id: userId, email, role: newUser.role }, JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ message: 'User created', token, user: { id: userId, name, email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Handle Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const database = db.getDb();

    // Fetch user from Firebase Realtime Database
    const usersRef = database.ref('users');
    const snapshot = await usersRef.orderByChild('email').equalTo(email).once('value');

    if (!snapshot.exists()) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const usersData = snapshot.val();
    const userId = Object.keys(usersData)[0];
    const user = usersData[userId];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Generates a 6-digit OTP, stores it in Firebase with a 15-min expiry, and emails it to the user.
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const database = db.getDb();
    const snapshot = await database.ref('users').orderByChild('email').equalTo(email).once('value');

    // Always respond success to prevent user enumeration
    if (!snapshot.exists()) {
      return res.json({ message: 'If that email is registered, a reset code has been sent.' });
    }

    const userId = Object.keys(snapshot.val())[0];
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes from now

    // Store OTP in Firebase
    await database.ref(`password_resets/${userId}`).set({ otp, expiresAt, email });

    // Send email
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('[Auth] EMAIL_USER / EMAIL_PASS not set in .env — OTP not sent via email.');
      // In dev mode, log OTP to console so you can test without email config
      console.log(`[Auth][DEV] OTP for ${email}: ${otp}`);
    } else {
      await transporter.sendMail({
        from: `"PhishGuard Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your PhishGuard Password Reset Code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <div style="background:#1a73e8;padding:24px;text-align:center">
              <h2 style="color:#fff;margin:0">🛡️ PhishGuard</h2>
            </div>
            <div style="padding:32px">
              <h3 style="color:#333">Password Reset Request</h3>
              <p style="color:#555">Use the code below to reset your password. It expires in <strong>15 minutes</strong>.</p>
              <div style="background:#f0f4ff;border-radius:8px;padding:20px;text-align:center;margin:24px 0">
                <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a73e8">${otp}</span>
              </div>
              <p style="color:#888;font-size:13px">If you did not request this, you can safely ignore this email. Your password will not change.</p>
            </div>
          </div>
        `,
      });
    }

    res.json({ message: 'If that email is registered, a reset code has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

/**
 * POST /api/auth/reset-password
 * Validates the OTP and updates the user's password.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
    }

    const pwErrors = validatePassword(newPassword);
    if (pwErrors.length > 0) {
      return res.status(400).json({ error: `Password must contain: ${pwErrors.join(', ')}.` });
    }

    const database = db.getDb();

    // Find user by email
    const userSnap = await database.ref('users').orderByChild('email').equalTo(email).once('value');
    if (!userSnap.exists()) {
      return res.status(400).json({ error: 'Invalid reset request.' });
    }

    const userId = Object.keys(userSnap.val())[0];

    // Validate OTP
    const resetSnap = await database.ref(`password_resets/${userId}`).once('value');
    const resetData = resetSnap.val();

    if (!resetData) {
      return res.status(400).json({ error: 'No reset request found. Please request a new code.' });
    }
    if (resetData.otp !== otp) {
      return res.status(400).json({ error: 'Incorrect reset code. Please check and try again.' });
    }
    if (Date.now() > resetData.expiresAt) {
      await database.ref(`password_resets/${userId}`).remove();
      return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
    }

    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await database.ref(`users/${userId}`).update({ password: hashedPassword });

    // Delete the used OTP
    await database.ref(`password_resets/${userId}`).remove();

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});


/**
 * GET /api/auth/me
 * Returns the current logged-in user's profile from Firebase
 */
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, twoFA: req.user.twoFA || false } });
});

/**
 * PUT /api/auth/profile
 * Update display name and/or email for the authenticated user
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

    const database = db.getDb();
    const userId   = req.user.id;

    // If email changed, make sure it isn't taken by another user
    if (email && email !== req.user.email) {
      const snap = await database.ref('users').orderByChild('email').equalTo(email).once('value');
      if (snap.exists()) return res.status(400).json({ error: 'Email is already in use by another account.' });
    }

    const updates = { name: name.trim() };
    if (email) updates.email = email.trim();

    await database.ref(`users/${userId}`).update(updates);
    res.json({ message: 'Profile updated successfully.', user: { ...req.user, ...updates } });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

/**
 * PUT /api/auth/change-password
 * Verify currentPassword, then hash and save newPassword
 */
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required.' });
    }

    const pwErrors = validatePassword(newPassword);
    if (pwErrors.length > 0) {
      return res.status(400).json({ error: `New password must contain: ${pwErrors.join(', ')}.` });
    }

    const database = db.getDb();
    const snap     = await database.ref(`users/${req.user.id}`).once('value');
    const user     = snap.val();

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await database.ref(`users/${req.user.id}`).update({ password: hashed });

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

/**
 * DELETE /api/auth/account
 * Permanently delete the user and all their associated data from Firebase
 */
router.delete('/account', authenticate, async (req, res) => {
  try {
    const database = db.getDb();
    const userId   = req.user.id;

    // Delete user record
    await database.ref(`users/${userId}`).remove();

    // Delete all associated data
    const cleanups = [
      database.ref('reports').orderByChild('userId').equalTo(userId).once('value')
        .then(s => { const p = []; s.forEach(c => p.push(c.ref.remove())); return Promise.all(p); }),
      database.ref('incidents').orderByChild('userId').equalTo(userId).once('value')
        .then(s => { const p = []; s.forEach(c => p.push(c.ref.remove())); return Promise.all(p); }),
      database.ref('learning_progress').orderByChild('user_id').equalTo(userId).once('value')
        .then(s => { const p = []; s.forEach(c => p.push(c.ref.remove())); return Promise.all(p); }),
      database.ref('achievements').orderByChild('userId').equalTo(userId).once('value')
        .then(s => { const p = []; s.forEach(c => p.push(c.ref.remove())); return Promise.all(p); }),
      database.ref(`password_resets/${userId}`).remove(),
    ];

    await Promise.all(cleanups);
    res.json({ message: 'Account and all data permanently deleted.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

/**
 * POST /api/auth/2fa/send
 * Generates a 6-digit 2FA code, saves it to Firebase, and emails it to the user.
 */
router.post('/2fa/send', authenticate, async (req, res) => {
  try {
    const database = db.getDb();
    const userId   = req.user.id;
    const email    = req.user.email;

    const code      = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await database.ref(`two_fa_codes/${userId}`).set({ code, expiresAt, email });

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      await transporter.sendMail({
        from: `"PhishGuard Security" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your PhishGuard 2FA Verification Code',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
            <div style="background:#1a73e8;padding:24px;text-align:center">
              <h2 style="color:#fff;margin:0">🛡️ PhishGuard 2FA</h2>
            </div>
            <div style="padding:32px">
              <h3 style="color:#333">Two-Factor Authentication Setup</h3>
              <p style="color:#555">Enter this code in the app to enable 2FA. It expires in <strong>10 minutes</strong>.</p>
              <div style="background:#f0f4ff;border-radius:8px;padding:20px;text-align:center;margin:24px 0">
                <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#1a73e8">${code}</span>
              </div>
              <p style="color:#888;font-size:13px">If you did not request this, please secure your account immediately.</p>
            </div>
          </div>
        `,
      });
    } else {
      // Dev fallback — log to console
      console.log(`[2FA][DEV] Code for ${email}: ${code}`);
    }

    res.json({ message: '2FA code sent to your email address.' });
  } catch (err) {
    console.error('2FA send error:', err);
    res.status(500).json({ error: 'Failed to send 2FA code.' });
  }
});

/**
 * POST /api/auth/2fa/verify
 * Validates the code and enables or disables 2FA on the account.
 * Body: { code: "123456", enable: true|false }
 */
router.post('/2fa/verify', authenticate, async (req, res) => {
  try {
    const { code, enable } = req.body;
    if (!code) return res.status(400).json({ error: 'Verification code is required.' });

    const database = db.getDb();
    const userId   = req.user.id;

    const snap = await database.ref(`two_fa_codes/${userId}`).once('value');
    const data  = snap.val();

    if (!data) return res.status(400).json({ error: 'No code found. Please request a new one.' });
    if (data.code !== code) return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    if (Date.now() > data.expiresAt) {
      await database.ref(`two_fa_codes/${userId}`).remove();
      return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }

    // Save 2FA status to the user record
    await database.ref(`users/${userId}`).update({ twoFA: enable !== false });
    await database.ref(`two_fa_codes/${userId}`).remove();

    res.json({ message: enable !== false ? '2FA enabled successfully.' : '2FA disabled successfully.', twoFA: enable !== false });
  } catch (err) {
    console.error('2FA verify error:', err);
    res.status(500).json({ error: 'Failed to verify 2FA code.' });
  }
});

module.exports = router;


