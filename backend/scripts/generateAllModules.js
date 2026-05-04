/**
 * Force-generate all missing learning modules across 3 difficulty levels.
 * Run from backend folder:  node scripts/generateAllModules.js
 *
 * 9 topics × 3 levels (beginner, intermediate, expert) = 27 modules
 */

require('dotenv').config();
const db = require('../config/database');
const axios = require('axios');

const BASE_TOPICS = [
  'Security Awareness Training',
  'Security Culture',
  'Social Engineering',
  'Phishing',
  'Spear Phishing',
  'CEO Fraud',
  'Ransomware',
  'Multi-Factor Authentication',
  'Global Compliance and Regulations'
];

const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'expert'];

function getPromptForLevel(topic, level) {
  const levelGuide = {
    beginner: {
      audience: 'absolute beginners with ZERO prior cybersecurity knowledge',
      tone: 'Use extremely simple, clear, jargon-free language. Explain every concept as if teaching a child.',
      complexity: 'Basic awareness, simple definitions, obvious real-world examples',
      quizDifficulty: 'Easy — obvious answers, one clearly correct option',
    },
    intermediate: {
      audience: 'professionals who understand basic cybersecurity but need deeper tactical knowledge',
      tone: 'Use professional language with some technical terms. Assume familiarity with basic concepts.',
      complexity: 'Tactical procedures, attack vector analysis, defense-in-depth strategies, real case studies with technical detail',
      quizDifficulty: 'Moderate — requires understanding of attack patterns and defense mechanisms',
    },
    expert: {
      audience: 'senior security analysts and IT administrators who need advanced threat hunting skills',
      tone: 'Use technical cybersecurity language. Reference frameworks (MITRE ATT&CK, NIST). Include IOCs and TTPs.',
      complexity: 'Advanced threat analysis, forensic indicators, APT techniques, zero-day scenarios, incident forensics, log analysis patterns',
      quizDifficulty: 'Hard — requires deep technical knowledge, scenario-based critical thinking',
    },
  };

  const g = levelGuide[level];
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  return `You are an expert cybersecurity educator creating a ${levelLabel}-level course about "${topic}".

TARGET AUDIENCE: ${g.audience}
TONE: ${g.tone}
COMPLEXITY: ${g.complexity}
QUIZ DIFFICULTY: ${g.quizDifficulty}

Generate a highly unique, specific interactive learning module. Use real-world scenarios and avoid generic filler.

The module MUST follow this exact 8-page learning journey in order:
PAGE 1 → Educational content (what it is, why it matters — tailored for ${level} level)
PAGE 2 → Real-world example (a detailed ${level === 'expert' ? 'advanced APT case study' : level === 'intermediate' ? 'enterprise attack scenario' : 'vivid story of a real attack'})
PAGE 3 → Warning signs / indicators (interactive ${level === 'expert' ? 'IOC flags' : 'red flags'})
PAGE 4 → ${level === 'expert' ? 'Incident response procedures' : level === 'intermediate' ? 'Defense strategies' : 'Safety practices'} (checklist)
PAGE 5 → Spot the threat (identify phishing vs. legitimate — difficulty: ${level})
PAGES 6–8 → Quiz (3 separate ${g.quizDifficulty.toLowerCase()} questions)

Output ONLY valid JSON:
{
  "id": "generate-a-kebab-case-id",
  "title": "Unique ${levelLabel} Module Title about ${topic}",
  "description": "Short description (1 sentence)",
  "duration": "${level === 'beginner' ? '15 min' : level === 'intermediate' ? '20 min' : '25 min'}",
  "difficulty": "${level}",
  "icon": "shield",
  "color": "${level === 'beginner' ? '#e8f0fe' : level === 'intermediate' ? '#fef3e0' : '#fce4ec'}",
  "accentColor": "${level === 'beginner' ? '#1a73e8' : level === 'intermediate' ? '#f57c00' : '#c62828'}",
  "level": "${levelLabel}",
  "lessons": [
    {
      "id": "lesson-1", "type": "info",
      "title": "📖 Page 1 Title",
      "content": "Write 6-8 concise bullet points explaining the concept at ${level} level.",
      "tip": "One practical tip."
    },
    {
      "id": "lesson-2", "type": "info",
      "title": "🌍 Page 2 Title",
      "content": "Detailed ${level}-appropriate real-world scenario (6-8 points).",
      "tip": "Key lesson learned."
    },
    {
      "id": "lesson-3", "type": "interactive",
      "title": "🚩 Page 3 Title",
      "content": "Tap each indicator below:",
      "flags": [
        { "icon": "⚠️", "title": "Indicator", "description": "Explanation." },
        { "icon": "🔍", "title": "Indicator", "description": "Explanation." },
        { "icon": "🎭", "title": "Indicator", "description": "Explanation." },
        { "icon": "📧", "title": "Indicator", "description": "Explanation." },
        { "icon": "🔗", "title": "Indicator", "description": "Explanation." }
      ]
    },
    {
      "id": "lesson-4", "type": "practice",
      "title": "🛡️ Page 4 Title",
      "checklist": [
        { "id": "item1", "text": "Action", "category": "Prevention" },
        { "id": "item2", "text": "Action", "category": "Prevention" },
        { "id": "item3", "text": "Action", "category": "Tools" },
        { "id": "item4", "text": "Action", "category": "Awareness" },
        { "id": "item5", "text": "Action", "category": "Response" },
        { "id": "item6", "text": "Action", "category": "Response" }
      ]
    },
    {
      "id": "lesson-5", "type": "practice",
      "title": "🎯 Page 5 Title",
      "emails": [
        { "id": "email1", "from": "sender@example.com", "subject": "Subject", "preview": "Content.", "isPhishing": true, "explanation": "Why." },
        { "id": "email2", "from": "noreply@legit.com", "subject": "Subject", "preview": "Content.", "isPhishing": false, "explanation": "Why." },
        { "id": "email3", "from": "phish@fake.net", "subject": "Subject", "preview": "Content.", "isPhishing": true, "explanation": "Why." }
      ]
    },
    {
      "id": "lesson-6", "type": "quiz", "title": "✅ Quiz Q1",
      "question": "Question.", "options": [
        { "id": "opt1", "text": "A", "correct": false },
        { "id": "opt2", "text": "B", "correct": true },
        { "id": "opt3", "text": "C", "correct": false },
        { "id": "opt4", "text": "D", "correct": false }
      ], "explanation": "Explanation."
    },
    {
      "id": "lesson-7", "type": "quiz", "title": "✅ Quiz Q2",
      "question": "Question.", "options": [
        { "id": "opt1", "text": "A", "correct": false },
        { "id": "opt2", "text": "B", "correct": false },
        { "id": "opt3", "text": "C", "correct": true },
        { "id": "opt4", "text": "D", "correct": false }
      ], "explanation": "Explanation."
    },
    {
      "id": "lesson-8", "type": "quiz", "title": "✅ Quiz Q3",
      "question": "Question.", "options": [
        { "id": "opt1", "text": "A", "correct": true },
        { "id": "opt2", "text": "B", "correct": false },
        { "id": "opt3", "text": "C", "correct": false },
        { "id": "opt4", "text": "D", "correct": false }
      ], "explanation": "Explanation."
    }
  ]
}

IMPORTANT:
- Content MUST be specifically tailored for ${level} level — NOT generic.
- Vary which option is correct across the 3 quizzes.
- Output ONLY the JSON object.`;
}

// --- AI provider chain ---
async function generateModuleWithAI(topic, level) {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing in .env');
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = getPromptForLevel(topic, level);

  const cleanJson = (raw) => {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return text;
  };

  const PROVIDERS = [
    {
      name: 'gemini-2.5-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 120000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'gemini-2.0-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 120000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'Groq / LLaMA-3.3-70B',
      call: () => axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        },
        {
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          timeout: 120000,
        }
      ),
      parse: (res) => res.data.choices[0].message.content,
    },
  ];

  let lastError = null;
  for (const provider of PROVIDERS) {
    console.log(`   🤖 Trying: ${provider.name}`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await provider.call();
        const parsed = JSON.parse(cleanJson(provider.parse(response)));
        console.log(`   ✅ Success via ${provider.name}`);
        return parsed;
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        if (status === 503) { console.warn(`   ⚠️ ${provider.name} overloaded (503). Next...`); break; }
        if (status === 429) { console.warn(`   ⚠️ ${provider.name} rate-limited (429). Waiting 8s...`); await new Promise(r => setTimeout(r, 8000)); break; }
        console.warn(`   ⚠️ ${provider.name} attempt ${attempt} failed: ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw lastError;
}

// --- Main ---
async function main() {
  console.log('========================================');
  console.log('  PhishGuard Multi-Level Module Generator');
  console.log('  9 topics × 3 levels = 27 modules');
  console.log('========================================\n');

  await db.initialize();
  const database = db.getDb();

  // Find existing modules
  const snapshot = await database.ref('learning_modules').once('value');
  const existingIds = new Set();
  if (snapshot.exists()) {
    snapshot.forEach(child => {
      existingIds.add(child.key);
      console.log(`  ✓ Exists: ${child.key}`);
    });
  }

  // Build missing list
  const allRequired = [];
  for (const topic of BASE_TOPICS) {
    for (const level of DIFFICULTY_LEVELS) {
      const id = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${level}`;
      if (!existingIds.has(id)) {
        allRequired.push({ topic, level, id });
      }
    }
  }

  console.log(`\n  Total in DB: ${existingIds.size}`);
  console.log(`  Missing: ${allRequired.length}\n`);

  if (allRequired.length === 0) {
    console.log('  All 27 modules exist! Nothing to generate.');
    process.exit(0);
  }

  let generated = 0;
  let failed = 0;

  for (const { topic, level, id } of allRequired) {
    const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
    console.log(`\n[${generated + failed + 1}/${allRequired.length}] ${topic} (${levelLabel})...`);
    try {
      const newModule = await generateModuleWithAI(topic, level);
      newModule.topic = topic;
      newModule.difficulty = level;
      newModule.level = levelLabel;
      newModule.id = id;
      newModule.createdAt = new Date().toISOString();

      await database.ref(`learning_modules/${id}`).set(newModule);
      console.log(`   💾 Saved: ${id}`);
      generated++;

      // Wait between generations to avoid rate limits
      if (generated + failed < allRequired.length) {
        console.log('   ⏳ Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (err) {
      console.error(`   ❌ FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log(`  Done! Generated: ${generated} | Failed: ${failed}`);
  console.log(`  Total modules: ${existingIds.size + generated}/27`);
  console.log('========================================');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
