/**
 * Learning Module Routes
 * Handles interactive learning progress and quiz responses
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

/**
 * Required dynamic topics and difficulty levels for the curriculum
 */
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

// Build full required list: 9 topics × 3 levels = 27 modules
const REQUIRED_TOPICS = [];
for (const topic of BASE_TOPICS) {
  for (const level of DIFFICULTY_LEVELS) {
    REQUIRED_TOPICS.push({ topic, level });
  }
}

/**
 * Helper to get all modules from DB
 */
const getAllModulesFromDb = async (database) => {
  const snapshot = await database.ref('learning_modules').once('value');
  const modules = [];
  if (snapshot.exists()) {
    snapshot.forEach(child => {
      const val = child.val();
      // Enforce data sanitization: only serve modules constructed after the new AI architecture fixes 
      if (val.createdAt) {
        modules.push({ ...val, id: child.key });
      }
    });
  }

  // Sort temporally to enforce chronological order, so random UUID strings don't override new modules
  modules.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  return modules;
};

/**
 * AI Generation Logic
 * Uses Google Gemini API as default (can be adapted to OpenAI/Anthropic)
 */
async function generateModuleWithAI(topic) {
  // Set your LLM API Key in your .env file
  const apiKey = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('AI API Key is missing. Please set GEMINI_API_KEY in your .env file.');
  }

  const prompt = `You are an expert, empathetic cybersecurity educator designing courses for absolute beginners with ZERO prior knowledge. Generate a **highly unique, specific, and creative** interactive learning module about "${topic}". Use extremely simple, clear, user-friendly language. Invent specific, relatable real-world scenarios.

The module MUST follow this exact 8-page learning journey in order:
PAGE 1 → Educational content (what it is, why it matters)
PAGE 2 → Real-world example (a vivid story of a real attack)
PAGE 3 → Warning signs to watch for (interactive red flags)
PAGE 4 → How to practise safety (a self-assessment checklist)
PAGE 5 → Spot the threat (identify phishing vs. legitimate emails)
PAGES 6–8 → Quiz performance checks (3 separate quiz questions)

Output ONLY valid JSON. It MUST strictly follow this exact schema with exactly 8 lessons:
{
  "id": "generate-a-kebab-case-id",
  "title": "Unique Beginner Module Title",
  "description": "Short beginner-friendly description (1 sentence)",
  "duration": "15 min",
  "difficulty": "beginner",
  "icon": "shield",
  "color": "#e8f0fe",
  "accentColor": "#1a73e8",
  "level": "Beginner",
  "lessons": [
    {
      "id": "lesson-1",
      "type": "info",
      "title": "📖 Page 1: What You Need to Know",
      "content": "Write 6-8 concise bullet points (each starting with a hyphen) explaining the core concept in simple everyday language. Cover: what it is, why it matters, who is targeted, how attackers operate, and common misconceptions. Separate each bullet with a newline.",
      "tip": "Write one practical, memorable safety tip the user can apply immediately today."
    },
    {
      "id": "lesson-2",
      "type": "info",
      "title": "🌍 Page 2: Real-World Example",
      "content": "Write a detailed real-world story (6-8 bullet points, each starting with a hyphen) about a specific person or organisation that fell victim to this exact type of attack. Include: who was targeted, what the attacker did step-by-step, what happened as a result, how much was lost or what damage was caused, and exactly how it could have been prevented. Make it vivid and relatable.",
      "tip": "Write the single most important lesson learned from this real-world story."
    },
    {
      "id": "lesson-3",
      "type": "interactive",
      "title": "🚩 Page 3: Warning Signs to Watch For",
      "content": "Tap each warning sign below to learn more about it:",
      "flags": [
        { "icon": "⚠️", "title": "First red flag title specific to this topic", "description": "Detailed, practical explanation of this warning sign and how to spot it in real life." },
        { "icon": "🔍", "title": "Second red flag title specific to this topic", "description": "Detailed, practical explanation of this warning sign and how to spot it in real life." },
        { "icon": "🎭", "title": "Third red flag title specific to this topic", "description": "Detailed, practical explanation of this warning sign and how to spot it in real life." },
        { "icon": "📧", "title": "Fourth red flag title specific to this topic", "description": "Detailed, practical explanation of this warning sign and how to spot it in real life." },
        { "icon": "🔗", "title": "Fifth red flag title specific to this topic", "description": "Detailed, practical explanation of this warning sign and how to spot it in real life." }
      ]
    },
    {
      "id": "lesson-4",
      "type": "practice",
      "title": "🛡️ Page 4: How to Stay Safe — Self-Assessment",
      "checklist": [
        { "id": "item1", "text": "First specific safety habit or protective action related to this topic", "category": "Prevention" },
        { "id": "item2", "text": "Second specific safety habit or protective action related to this topic", "category": "Prevention" },
        { "id": "item3", "text": "Third specific safety habit or tool related to this topic", "category": "Tools" },
        { "id": "item4", "text": "Fourth specific safety habit related to this topic", "category": "Awareness" },
        { "id": "item5", "text": "Fifth specific response action if you suspect this type of attack", "category": "Response" },
        { "id": "item6", "text": "Sixth specific action to protect others around you from this threat", "category": "Response" }
      ]
    },
    {
      "id": "lesson-5",
      "type": "practice",
      "title": "🎯 Page 5: Spot the Threat",
      "emails": [
        { "id": "email1", "from": "realistic-phishing-sender@suspicious-domain.com", "subject": "Realistic phishing subject line related to this topic", "preview": "First 2 sentences of a convincing phishing message with subtle red flags related to this topic.", "isPhishing": true, "explanation": "Explain exactly which red flags reveal this is phishing — be specific to this topic." },
        { "id": "email2", "from": "noreply@legitimate-company.com", "subject": "Legitimate email subject line", "preview": "First 2 sentences of a legitimate, safe message that could be mistaken for phishing.", "isPhishing": false, "explanation": "Explain clearly why this email is legitimate and what makes it trustworthy." },
        { "id": "email3", "from": "another-phish@fake-lookalike.net", "subject": "Another phishing subject with urgency related to this topic", "preview": "First 2 sentences with subtle but real phishing indicators specific to this topic.", "isPhishing": true, "explanation": "Explain the specific red flags in this second phishing attempt for this topic." }
      ]
    },
    {
      "id": "lesson-6",
      "type": "quiz",
      "title": "✅ Page 6: Performance Check — Q1",
      "question": "Ask a scenario-based question that tests understanding of the core educational concept from Page 1.",
      "options": [
        { "id": "opt1", "text": "Option A", "correct": false },
        { "id": "opt2", "text": "Option B (the correct answer)", "correct": true },
        { "id": "opt3", "text": "Option C", "correct": false },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Detailed explanation of why the correct answer is right and why each wrong option is incorrect."
    },
    {
      "id": "lesson-7",
      "type": "quiz",
      "title": "✅ Page 7: Performance Check — Q2",
      "question": "Ask a practical question about identifying a warning sign from Page 3 or responding to this threat.",
      "options": [
        { "id": "opt1", "text": "Option A", "correct": false },
        { "id": "opt2", "text": "Option B", "correct": false },
        { "id": "opt3", "text": "Option C (the correct answer)", "correct": true },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Detailed explanation of why the correct answer is right and why each wrong option is incorrect."
    },
    {
      "id": "lesson-8",
      "type": "quiz",
      "title": "✅ Page 8: Performance Check — Q3",
      "question": "Ask a question about a specific safety practice or prevention strategy from Page 4.",
      "options": [
        { "id": "opt1", "text": "Option A (the correct answer)", "correct": true },
        { "id": "opt2", "text": "Option B", "correct": false },
        { "id": "opt3", "text": "Option C", "correct": false },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Detailed explanation of why the correct answer is right and why each wrong option is incorrect."
    }
  ]
}

IMPORTANT RULES:
- Follow the 8-page journey strictly: Educational → Real-World → Warning Signs → Safety Practices → Spot the Threat → Quiz×3.
- Make ALL content unique and specific to "${topic}" — never use generic placeholders.
- Vary which option is correct across the 3 quizzes (not always the same position).
- The checklist on Page 4 must contain ACTIONABLE safety habits, not vague advice.
- The practice emails on Page 5 must be realistic with believable sender addresses and subjects.
- Every bullet point must be substantive and educational, not filler.
- Output ONLY the JSON object, nothing else.`;



  // Multi-provider fallback chain — tries each in order until one succeeds
  const groqKey = process.env.GROQ_API_KEY;

  const cleanJson = (raw) => {
    let text = raw.trim();
    // Strip markdown code blocks if present
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

    // Extract everything between the first { and last }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
    }

    // Remove invalid control characters but keep structural newlines and tabs
    // Note: We don't replace \n with \\n globally because that destroys JSON structure
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    return text;
  };

  const PROVIDERS = [
    {
      name: 'gemini-2.5-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 60000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'gemini-2.0-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 60000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'gemini-2.0-flash-lite',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 60000 }
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
          timeout: 60000,
        }
      ),
      parse: (res) => res.data.choices[0].message.content,
    },
  ];

  let lastError = null;

  for (const provider of PROVIDERS) {
    console.log(`🤖 Trying provider: ${provider.name}`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await provider.call();
        const parsed = JSON.parse(cleanJson(provider.parse(response)));
        console.log(`✅ Module generated successfully using ${provider.name}`);
        return parsed;

      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        const isUnavailable = status === 503 || err?.response?.data?.error?.status === 'UNAVAILABLE';
        const isRateLimited = status === 429 || err?.response?.data?.error?.status === 'RESOURCE_EXHAUSTED';

        if (isUnavailable) {
          console.warn(`⚠️  ${provider.name} is overloaded (503). Switching to next provider...`);
          break;
        }
        if (isRateLimited) {
          console.warn(`⚠️  ${provider.name} hit rate limit (429). Waiting 5s before next provider...`);
          await new Promise(r => setTimeout(r, 5000));
          break;
        }
        console.warn(`⚠️  ${provider.name} attempt ${attempt} failed (JSON parse): ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // All providers exhausted
  throw lastError;
}


/**
 * GET /api/learning/modules
 * Get all available learning modules and pending topics
 */
router.get('/modules', authenticate, async (req, res) => {
  try {
    const database = db.getDb();
    const allModules = await getAllModulesFromDb(database);

    // Get user progress for each module
    const progressSnapshot = await database.ref('learning_progress')
      .orderByChild('user_id')
      .equalTo(req.user.id)
      .once('value');

    const progressMap = {};
    if (progressSnapshot.exists()) {
      progressSnapshot.forEach(child => {
        const p = child.val();
        if (!progressMap[p.module_id]) {
          progressMap[p.module_id] = { completed_lessons: 0, score_sum: 0, score_count: 0 };
        }
        if (p.status === 'completed') progressMap[p.module_id].completed_lessons++;
        if (p.score !== null && p.score !== undefined) {
          progressMap[p.module_id].score_sum += p.score;
          progressMap[p.module_id].score_count++;
        }
      });
    }

    const modulesWithProgress = allModules.map(module => ({
      id: module.id,
      title: module.title,
      topic: module.topic || module.title,
      description: module.description,
      duration: module.duration,
      difficulty: module.difficulty,
      icon: module.icon,
      totalLessons: module.lessons ? module.lessons.length : 0,
      progress: {
        completed_lessons: progressMap[module.id]?.completed_lessons || 0,
        average_score: progressMap[module.id]?.score_count > 0
          ? progressMap[module.id].score_sum / progressMap[module.id].score_count
          : null
      }
    }));

    // Determine which REQUIRED topic+level combos haven't been generated yet
    const existingKeys = allModules.map(m => {
      const topic = (m.topic || m.title || '').toLowerCase();
      const level = (m.difficulty || 'beginner').toLowerCase();
      return `${topic}::${level}`;
    });
    const pendingTopics = REQUIRED_TOPICS.filter(({ topic, level }) =>
      !existingKeys.some(key => key.includes(topic.toLowerCase()) && key.includes(level))
    ).map(({ topic, level }) => ({ topic, level }));

    res.json({ modules: modulesWithProgress, pendingTopics });
  } catch (error) {
    console.error('Get modules error:', error);
    res.status(500).json({ error: 'Failed to get modules' });
  }
});

/**
 * POST /api/learning/modules/generate
 * Triggers real-time AI generation of a new topic module and saves it to DB
 */
router.post('/modules/generate', authenticate, async (req, res) => {
  try {
    const { topic, level = 'beginner' } = req.body;
    const validTopic = BASE_TOPICS.includes(topic);
    const validLevel = DIFFICULTY_LEVELS.includes(level);
    if (!topic || !validTopic || !validLevel) {
      return res.status(400).json({ error: 'Invalid or missing topic/level requested.' });
    }

    const database = db.getDb();

    // Check if this topic+level combo already exists
    const moduleId = `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${level}`;
    const existingSnap = await database.ref(`learning_modules/${moduleId}`).once('value');
    if (existingSnap.exists()) {
      return res.json({ message: 'Module already exists', module: existingSnap.val() });
    }

    const fullTopic = `${topic} (${level.charAt(0).toUpperCase() + level.slice(1)} Level)`;
    const newModule = await generateModuleWithAI(fullTopic);
    newModule.topic = topic;
    newModule.difficulty = level;
    newModule.level = level.charAt(0).toUpperCase() + level.slice(1);
    newModule.id = moduleId;
    newModule.createdAt = new Date().toISOString();

    await database.ref(`learning_modules/${moduleId}`).set(newModule);

    res.status(201).json({ message: 'Module generated and saved dynamically.', module: newModule });
  } catch (error) {
    console.error('AI Generation error:', error.message);
    res.status(500).json({ error: 'Failed to dynamically generate module.', details: error.message });
  }
});

/**
 * POST /api/learning/modules/generate-unique
 * Triggers real-time AI generation of a new unique topic module and saves it to DB
 */
router.post('/modules/generate-unique', authenticate, async (req, res) => {
  try {
    const database = db.getDb();

    // Direct the unique module generator to use the requested core security topics
    const baseTopics = [...REQUIRED_TOPICS];

    // Create a unique topic by appending a random session ID
    const randomBase = baseTopics[Math.floor(Math.random() * baseTopics.length)];
    const uniqueTopic = `${randomBase} (Session ${Math.random().toString(36).substring(2, 8).toUpperCase()})`;

    const newModule = await generateModuleWithAI(uniqueTopic);

    // Ensure unique tracking identifiers
    newModule.id = uuidv4();
    newModule.title = uniqueTopic;
    newModule.topic = uniqueTopic;
    newModule.createdAt = new Date().toISOString();

    await database.ref(`learning_modules/${newModule.id}`).set(newModule);

    res.status(201).json({ message: 'Unique module generated and saved.', module: newModule });
  } catch (error) {
    console.error('Unique AI Generation error:', error.message);
    res.status(500).json({ error: 'Failed to dynamically generate unique module.', details: error.message });
  }
});

/**
 * GET /api/learning/modules/:moduleId
 * Get a specific module with lessons
 */
router.get('/modules/:moduleId', authenticate, async (req, res) => {
  try {
    const { moduleId } = req.params;
    const database = db.getDb();

    const snapshot = await database.ref(`learning_modules/${moduleId}`).once('value');
    const module = snapshot.val();

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    // Firebase may store arrays as objects with numeric keys — normalize
    if (module.lessons && !Array.isArray(module.lessons)) {
      module.lessons = Object.values(module.lessons);
    }
    if (!module.lessons) {
      module.lessons = [];
    }
    // Deep-normalize nested arrays inside each lesson
    module.lessons = module.lessons.map(lesson => {
      const l = { ...lesson };
      if (l.options && !Array.isArray(l.options)) l.options = Object.values(l.options);
      if (l.flags && !Array.isArray(l.flags)) l.flags = Object.values(l.flags);
      if (l.emails && !Array.isArray(l.emails)) l.emails = Object.values(l.emails);
      if (l.websites && !Array.isArray(l.websites)) l.websites = Object.values(l.websites);
      if (l.checklist && !Array.isArray(l.checklist)) l.checklist = Object.values(l.checklist);
      if (l.points && !Array.isArray(l.points)) l.points = Object.values(l.points);
      if (l.scenario && l.scenario.urls && !Array.isArray(l.scenario.urls)) {
        l.scenario = { ...l.scenario, urls: Object.values(l.scenario.urls) };
      }
      return l;
    });

    // Get user progress for this module's lessons
    const progressSnapshot = await database.ref('learning_progress')
      .orderByChild('user_id')
      .equalTo(req.user.id)
      .once('value');

    const progressMap = {};
    if (progressSnapshot.exists()) {
      progressSnapshot.forEach(child => {
        const p = child.val();
        if (p.module_id === moduleId) {
          progressMap[p.lesson_id] = p;
        }
      });
    }

    const moduleWithProgress = {
      ...module,
      lessons: (module.lessons || []).map(lesson => ({
        ...lesson,
        progress: progressMap[lesson.id] || { status: 'not_started', score: null }
      }))
    };

    res.json({ module: moduleWithProgress });
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({ error: 'Failed to get module' });
  }
});

/**
 * GET /api/learning/modules/:moduleId/lessons/:lessonId
 * Get a specific lesson
 */
router.get('/modules/:moduleId/lessons/:lessonId', authenticate, async (req, res) => {
  try {
    const { moduleId, lessonId } = req.params;
    const database = db.getDb();

    const snapshot = await database.ref(`learning_modules/${moduleId}`).once('value');
    const module = snapshot.val();

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const lesson = module.lessons && module.lessons.find(l => l.id === lessonId);

    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Get or create progress record
    const progressId = `${req.user.id}_${moduleId}_${lessonId}`;
    const progSnap = await database.ref(`learning_progress/${progressId}`).once('value');
    let progress = progSnap.val();

    if (!progress) {
      // Create new progress record
      progress = {
        id: progressId,
        user_id: req.user.id,
        module_id: moduleId,
        lesson_id: lessonId,
        status: 'in_progress',
        score: null,
        time_spent: 0,
        updated_at: new Date().toISOString()
      };
      await database.ref(`learning_progress/${progressId}`).set(progress);
    } else if (progress.status === 'not_started') {
      // Update to in_progress
      progress.status = 'in_progress';
      progress.updated_at = new Date().toISOString();
      await database.ref(`learning_progress/${progressId}`).update({
        status: 'in_progress',
        updated_at: progress.updated_at
      });
    }

    res.json({
      lesson,
      progress,
      moduleTitle: module.title
    });
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({ error: 'Failed to get lesson' });
  }
});

/**
 * POST /api/learning/modules/:moduleId/lessons/:lessonId/submit
 * Submit quiz answers for a lesson
 */
router.post('/modules/:moduleId/lessons/:lessonId/submit', authenticate, [
  body('answers').isArray().withMessage('Answers must be an array'),
  body('timeSpent').isInt({ min: 0 }).withMessage('Time spent must be a positive integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { moduleId, lessonId } = req.params;
    const { answers, timeSpent } = req.body;

    const database = db.getDb();

    const snapshot = await database.ref(`learning_modules/${moduleId}`).once('value');
    const module = snapshot.val();

    if (!module) {
      return res.status(404).json({ error: 'Module not found' });
    }

    const lesson = module.lessons && module.lessons.find(l => l.id === lessonId);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    // Calculate score
    let correctCount = 0;
    const results = [];

    if (lesson.quiz) {
      lesson.quiz.forEach(async (question, index) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === question.correctAnswer;
        if (isCorrect) correctCount++;

        results.push({
          questionId: question.id,
          isCorrect,
          correctAnswer: question.correctAnswer,
          userAnswer
        });

        // Save quiz response
        const qrId = uuidv4();
        await database.ref(`quiz_responses/${qrId}`).set({
          id: qrId,
          user_id: req.user.id,
          module_id: moduleId,
          lesson_id: lessonId,
          question_id: question.id,
          selected_answer: String(userAnswer),
          is_correct: isCorrect ? 1 : 0,
          created_at: new Date().toISOString()
        });
      });
    }

    const score = lesson.quiz ? Math.round((correctCount / lesson.quiz.length) * 100) : 100;
    const passed = score >= 70;

    // Update progress
    const progressId = `${req.user.id}_${moduleId}_${lessonId}`;
    const progSnap = await database.ref(`learning_progress/${progressId}`).once('value');
    let currentScore = score;
    let currentTime = timeSpent;

    if (progSnap.exists()) {
      const p = progSnap.val();
      if (p.score > score) currentScore = p.score;
      currentTime = (p.time_spent || 0) + timeSpent;
    }

    await database.ref(`learning_progress/${progressId}`).set({
      id: progressId,
      user_id: req.user.id,
      module_id: moduleId,
      lesson_id: lessonId,
      status: passed ? 'completed' : 'in_progress',
      score: currentScore,
      time_spent: currentTime,
      completed_at: passed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    });

    // Check for achievements
    await checkLearningAchievements(req.user.id, database);

    res.json({
      score,
      passed,
      results,
      message: passed ? 'Congratulations! You passed this lesson.' : 'Keep practicing! You need 70% to pass.'
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

/**
 * POST /api/learning/progress
 * Save learning progress (from frontend Module completion)
 */
router.post('/progress', authenticate, async (req, res) => {
  try {
    const { moduleId, score, totalQuestions, checklistScore } = req.body;
    const database = db.getDb();

    const progressId = `${req.user.id}_${moduleId}`;
    await database.ref(`learning_progress/${progressId}`).set({
      id: progressId,
      user_id: req.user.id,
      module_id: moduleId,
      status: 'completed',
      score: score,
      totalQuestions: totalQuestions,
      checklistScore: checklistScore,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await checkLearningAchievements(req.user.id, database);
    res.json({ message: 'Progress saved successfully' });
  } catch (error) {
    console.error('Save progress error:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

/**
 * GET /api/learning/progress
 * Get overall learning progress
 */
router.get('/progress', authenticate, async (req, res) => {
  try {
    const database = db.getDb();

    const allModules = await getAllModulesFromDb(database);
    const totalLessons = allModules.reduce((acc, m) => acc + (m.lessons ? m.lessons.length : 0), 0);

    const progressSnap = await database.ref('learning_progress').orderByChild('user_id').equalTo(req.user.id).once('value');

    let completed_lessons = 0;
    let score_sum = 0;
    let score_count = 0;
    let total_time_spent = 0;
    const moduleProgressMap = {};

    if (progressSnap.exists()) {
      progressSnap.forEach(child => {
        const p = child.val();
        if (!moduleProgressMap[p.module_id]) {
          moduleProgressMap[p.module_id] = { lessons_started: 0, lessons_completed: 0, score_sum: 0, score_count: 0 };
        }
        moduleProgressMap[p.module_id].lessons_started++;

        if (p.status === 'completed') {
          completed_lessons++;
          moduleProgressMap[p.module_id].lessons_completed++;
        }

        if (p.score !== null && p.score !== undefined) {
          score_sum += p.score;
          score_count++;
          moduleProgressMap[p.module_id].score_sum += p.score;
          moduleProgressMap[p.module_id].score_count++;
        }
        total_time_spent += (p.time_spent || 0);
      });
    }

    const achievementsSnap = await database.ref('achievements').orderByChild('userId').equalTo(req.user.id).once('value');
    const achievements = [];
    if (achievementsSnap.exists()) {
      achievementsSnap.forEach(child => achievements.push(child.val()));
    }
    achievements.sort((a, b) => new Date(b.earnedAt || b.earned_at) - new Date(a.earnedAt || a.earned_at));

    const moduleProgress = Object.keys(moduleProgressMap).map(moduleId => {
      const mp = moduleProgressMap[moduleId];
      const module = allModules.find(m => m.id === moduleId);
      return {
        module_id: moduleId,
        lessons_started: mp.lessons_started,
        lessons_completed: mp.lessons_completed,
        average_score: mp.score_count > 0 ? mp.score_sum / mp.score_count : null,
        moduleName: module?.title,
        totalLessons: module?.lessons?.length || 0
      };
    });

    res.json({
      overall: {
        totalLessons,
        completedLessons: completed_lessons,
        averageScore: score_count > 0 ? Math.round((score_sum / score_count) * 100) / 100 : 0,
        totalTimeSpent: total_time_spent,
        completionPercentage: totalLessons > 0 ? Math.round((completed_lessons / totalLessons) * 100) : 0
      },
      moduleProgress,
      achievements: achievements.map(a => ({
        achievement_type: a.achievementType || a.achievement_type,
        achievement_name: a.achievementName || a.achievement_name,
        description: a.description,
        earned_at: a.earnedAt || a.earned_at
      }))
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

/**
 * Check and award learning-related achievements
 */
async function checkLearningAchievements(userId, database) {
  const progressSnap = await database.ref('learning_progress').orderByChild('user_id').equalTo(userId).once('value');

  let completed = 0;
  const modules = new Set();
  let score_sum = 0;
  let score_count = 0;

  if (progressSnap.exists()) {
    progressSnap.forEach(child => {
      const p = child.val();
      modules.add(p.module_id);
      if (p.status === 'completed') completed++;
      if (p.score !== null && p.score !== undefined) {
        score_sum += p.score;
        score_count++;
      }
    });
  }

  const avg_score = score_count > 0 ? score_sum / score_count : 0;
  const modulesCount = modules.size;

  const achievements = [
    { condition: completed >= 1, type: 'first_lesson', name: 'First Steps', desc: 'Completed your first lesson' },
    { condition: completed >= 5, type: 'dedicated_learner', name: 'Dedicated Learner', desc: 'Completed 5 lessons' },
    { condition: completed >= 10, type: 'knowledge_seeker', name: 'Knowledge Seeker', desc: 'Completed 10 lessons' },
    { condition: modulesCount >= 3, type: 'well_rounded', name: 'Well Rounded', desc: 'Started all learning modules' },
    { condition: avg_score >= 90, type: 'high_achiever', name: 'High Achiever', desc: 'Achieved 90%+ average score' },
    { condition: avg_score === 100 && score_count > 0, type: 'perfectionist', name: 'Perfectionist', desc: 'Achieved 100% on all quizzes' }
  ];

  for (const achievement of achievements) {
    if (achievement.condition) {
      const existingSnap = await database.ref('achievements')
        .orderByChild('userId_type')
        .equalTo(`${userId}_${achievement.type}`)
        .once('value');

      if (!existingSnap.exists()) {
        const achId = uuidv4();
        await database.ref(`achievements/${achId}`).set({
          id: achId, userId: userId, user_id: userId,
          achievementType: achievement.type, achievement_type: achievement.type,
          achievementName: achievement.name, achievement_name: achievement.name,
          description: achievement.desc, userId_type: `${userId}_${achievement.type}`,
          earnedAt: new Date().toISOString(), earned_at: new Date().toISOString()
        });
      }
    }
  }
}

module.exports = router;
