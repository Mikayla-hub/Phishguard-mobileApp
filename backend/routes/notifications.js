/**
 * Notifications Routes
 * Handles AI-generated daily security tips, cached in Firebase by date
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const db      = require('../config/database');

const SECURITY_TIP_TOPICS = [
  'phishing emails', 'suspicious links', 'password hygiene', 'multi-factor authentication',
  'social engineering', 'ransomware prevention', 'public Wi-Fi safety', 'CEO fraud / BEC scams',
  'software update security', 'USB / removable media risks', 'vishing (voice phishing)',
  'smishing (SMS phishing)', 'data backup best practices', 'insider threats', 'safe browsing habits',
  'email spoofing detection', 'secure file sharing', 'credential stuffing attacks',
  'zero-trust principles', 'incident response basics',
];

/**
 * Call Gemini to generate a unique daily security tip
 */
async function generateTipWithAI(topic, dateStr) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');

  const prompt = `You are a concise cybersecurity expert writing a daily push notification security tip for employees of small and medium enterprises in Africa.

Today's topic: "${topic}"
Date: ${dateStr}

Write ONE unique, practical, actionable security tip about this topic.
- Keep it under 120 characters so it fits in a mobile notification body
- Write a bold, attention-grabbing notification title (max 6 words)
- Make it specific, not generic
- Do NOT start with "Remember to" or "Always"

Respond ONLY with valid JSON in this exact format:
{
  "title": "Short eye-catching title",
  "body": "The full tip text under 120 characters.",
  "topic": "${topic}"
}`;

  // Try Gemini first
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { timeout: 20000 }
    );
    const raw = res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (geminiErr) {
    console.warn('[DailyTip] Gemini failed, falling back to Groq:', geminiErr.message);
  }

  // Fallback: Groq
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqKey) throw new Error('Both Gemini and Groq failed.');

  const groqRes = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
    },
    { headers: { Authorization: `Bearer ${groqKey}` }, timeout: 20000 }
  );
  const raw2 = groqRes.data.choices?.[0]?.message?.content || '';
  const clean2 = raw2.replace(/```json|```/g, '').trim();
  return JSON.parse(clean2);
}

/**
 * GET /api/notifications/daily-tip
 * Returns (and caches) today's AI-generated security tip.
 * Public — no auth required so the app can fetch on startup.
 */
router.get('/daily-tip', async (req, res) => {
  try {
    const database = db.getDb();
    const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const cacheRef = database.ref(`daily_tips/${today}`);

    // Return cached tip if it exists
    const cached = await cacheRef.once('value');
    if (cached.exists()) {
      return res.json({ tip: cached.val(), cached: true });
    }

    // Pick today's topic deterministically from the date (same topic all day)
    const dayOfYear = Math.floor(
      (new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000
    );
    const topic = SECURITY_TIP_TOPICS[dayOfYear % SECURITY_TIP_TOPICS.length];

    const tip = await generateTipWithAI(topic, today);
    tip.date  = today;
    tip.generatedAt = new Date().toISOString();

    // Cache in Firebase for the rest of the day
    await cacheRef.set(tip);

    // Optional: delete tips older than 7 days to keep DB clean
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const oldSnap = await database.ref('daily_tips').once('value');
    oldSnap.forEach(child => {
      if (child.key < cutoff.toISOString().slice(0, 10)) {
        child.ref.remove();
      }
    });

    res.json({ tip, cached: false });
  } catch (err) {
    console.error('[DailyTip] Error:', err.message);
    // Return a hardcoded fallback so the app never crashes
    res.json({
      tip: {
        title: '🛡️ Stay Alert Today',
        body: 'Think before you click. Verify the sender before opening any attachment or link in your email.',
        topic: 'phishing awareness',
        date: new Date().toISOString().slice(0, 10),
      },
      cached: false,
      fallback: true,
    });
  }
});

module.exports = router;
