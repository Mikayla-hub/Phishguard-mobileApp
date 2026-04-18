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
 * Required dynamic topics per the new curriculum
 */
const REQUIRED_TOPICS = [
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

  const prompt = `You are an expert, empathetic cybersecurity educator designing courses for absolute beginners with ZERO prior knowledge of phishing. Generate a **highly unique, specific, and creative** interactive learning module about "${topic}". DO NOT use overly technical jargon. Use extremely simple, clear, user-friendly language focusing on the direct dangers and how everyday people can avoid them. Invent a specific, relatable real-world scenario for this session.
  Output ONLY valid JSON. It MUST strictly follow this exact schema:
  {
    "id": "generate-a-kebab-case-id",
    "title": "Unique Beginner Module",
    "description": "Extremely simple, relatable short description",
    "duration": "15 min",
    "difficulty": "beginner",
    "icon": "shield",
    "lessons": [
      {
        "id": "lesson-1",
        "type": "info",
        "title": "Educational Concept",
        "content": "- STRICTLY output 4-5 concise bullet points (using hyphens and newlines ONLY, absolutely no paragraphs) explaining what this specific threat actually is in user-friendly language."
      },
      {
        "id": "lesson-2",
        "type": "info",
        "title": "Real-World Example",
        "content": "- STRICTLY output 4-5 concise bullet points (using hyphens and newlines ONLY, absolutely no paragraphs) providing exactly how this scenario happens to everyday people giving real world examples."
      },
      {
        "id": "lesson-3",
        "type": "quiz",
        "title": "Performance Check: Q1",
        "question": "First performance check question?",
        "options": [
          { "id": "opt1", "text": "Option A", "correct": true },
          { "id": "opt2", "text": "Option B", "correct": false },
          { "id": "opt3", "text": "Option C", "correct": false },
          { "id": "opt4", "text": "Option D", "correct": false }
        ],
        "explanation": "Explanation for Q1"
      },
      {
        "id": "lesson-4",
        "type": "quiz",
        "title": "Performance Check: Q2",
        "question": "Second performance check question?",
        "options": [
          { "id": "opt1", "text": "Option A", "correct": true },
          { "id": "opt2", "text": "Option B", "correct": false },
          { "id": "opt3", "text": "Option C", "correct": false },
          { "id": "opt4", "text": "Option D", "correct": false }
        ],
        "explanation": "Explanation for Q2"
      },
      {
        "id": "lesson-5",
        "type": "quiz",
        "title": "Performance Check: Q3",
        "question": "Third performance check question?",
        "options": [
          { "id": "opt1", "text": "Option A", "correct": true },
          { "id": "opt2", "text": "Option B", "correct": false },
          { "id": "opt3", "text": "Option C", "correct": false },
          { "id": "opt4", "text": "Option D", "correct": false }
        ],
        "explanation": "Explanation for Q3"
      }
    ]
  }`;

  // Retry up to 2 times if Gemini returns malformed JSON
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: "application/json" }
        },
        { timeout: 60000 }
      );

      const responseText = response.data.candidates[0].content.parts[0].text;
      // Clean up common AI JSON issues
      let cleanedText = responseText
        .replace(/^```json\n?/, '').replace(/\n?```$/, '')  // Remove markdown fences
        .replace(/,\s*([}\]])/g, '$1')                      // Remove trailing commas
        .replace(/[\x00-\x1F\x7F]/g, (ch) =>                // Escape control chars
          ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '' : ''
        );

      return JSON.parse(cleanedText);
    } catch (err) {
      lastError = err;
      console.warn(`AI JSON parse attempt ${attempt} failed:`, err.message);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1000)); // Wait before retry
      }
    }
  }
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

    // Determine which REQUIRED_TOPICS haven't been generated yet
    const existingTopics = allModules.map(m => (m.title || m.topic || '').toLowerCase());
    const pendingTopics = REQUIRED_TOPICS.filter(topic => 
      !existingTopics.some(existing => existing.includes(topic.toLowerCase()))
    );

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
    const { topic } = req.body;
    if (!topic || !REQUIRED_TOPICS.includes(topic)) {
      return res.status(400).json({ error: 'Invalid or missing topic requested.' });
    }

    const database = db.getDb();

    const existingSnap = await database.ref('learning_modules').orderByChild('topic').equalTo(topic).once('value');
    if (existingSnap.exists()) {
      const existing = Object.values(existingSnap.val())[0];
      return res.json({ message: 'Module already exists', module: existing });
    }

    const newModule = await generateModuleWithAI(topic);
    newModule.topic = topic;
    
    await database.ref(`learning_modules/${newModule.id}`).set(newModule);

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
