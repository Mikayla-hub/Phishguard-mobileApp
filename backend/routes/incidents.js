/**
 * Incident Response Routes
 * Handles incident tracking, reporting, and response procedures
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * AI Generation Logic for Incident Procedures
 */
async function generateProcedureWithAI(threatType) {
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '').trim();
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey) {
    throw new Error('AI API Key is missing. Please set GEMINI_API_KEY in your .env file.');
  }

  const prompt = `You are a world-class cybersecurity incident response expert. Generate a step-by-step incident response procedure for a threat of type: "${threatType}".
  Output ONLY valid JSON strictly following this schema:
  {
    "title": "Clear Title (e.g., Phishing Email Response)",
    "severity": "low|medium|high|critical",
    "steps": [
      { "step": 1, "action": "Clear immediate action", "duration": "Immediate" },
      { "step": 2, "action": "Next step", "duration": "5 minutes" }
    ],
    "recovery": [
      "Recovery action 1",
      "Recovery action 2"
    ]
  }`;

  const cleanJson = (raw) => {
    let text = raw.trim();
    text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      text = text.substring(start, end + 1);
    }
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    return text;
  };

  const PROVIDERS = [
    {
      name: 'gemini-2.5-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 60000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'gemini-2.0-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
        { timeout: 60000 }
      ),
      parse: (res) => res.data.candidates[0].content.parts[0].text,
    },
    {
      name: 'gemini-1.5-flash',
      call: () => axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
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
    console.log(`🤖 [Incidents] Trying provider: ${provider.name}`);

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await provider.call();
        const parsed = JSON.parse(cleanJson(provider.parse(response)));
        console.log(`✅ [Incidents] Procedure generated successfully using ${provider.name}`);
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
          console.warn(`⚠️  ${provider.name} hit rate limit (429). Waiting 2s before next provider...`);
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
        console.warn(`⚠️  ${provider.name} attempt ${attempt} failed (JSON parse): ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw lastError;
}

/**
 * Caches the procedure in Firebase if it's new, or retrieves existing
 */
async function getOrGenerateProcedure(database, incidentType) {
  const safeKey = incidentType.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const ref = database.ref(`procedures/${safeKey}`);
  const snapshot = await ref.once('value');
  
  if (snapshot.exists()) {
    return { id: safeKey, ...snapshot.val() };
  }
  
  console.log(`🤖 Generating new AI response procedure for: ${incidentType}`);
  const procedure = await generateProcedureWithAI(incidentType);
  await ref.set(procedure);
  return { id: safeKey, ...procedure };
}

/**
 * GET /api/incidents/procedures
 * Get incident response procedures relevant ONLY to the current user's reported incidents
 */
router.get('/procedures', authenticate, async (req, res) => {
  try {
    const database = db.getDb();
    
    // 1. Get all incidents reported by the current user
    const userIncidentsSnapshot = await database.ref('incidents')
      .orderByChild('userId')
      .equalTo(req.user.id)
      .once('value');
      
    // 2. Extract unique procedure IDs from those incidents
    const userProcedureIds = new Set();
    if (userIncidentsSnapshot.exists()) {
      userIncidentsSnapshot.forEach(child => {
        const incident = child.val();
        if (incident.incidentType) {
          userProcedureIds.add(incident.incidentType);
        }
      });
    }
    
    // 3. Fetch only those specific procedures from the cache
    const procedures = [];
    if (userProcedureIds.size > 0) {
      const proceduresSnapshot = await database.ref('procedures').once('value');
      if (proceduresSnapshot.exists()) {
        proceduresSnapshot.forEach(child => {
          if (userProcedureIds.has(child.key)) {
            procedures.push({ id: child.key, ...child.val() });
          }
        });
      }
    }

    res.json({ procedures });
  } catch (error) {
    console.error('Get procedures error:', error);
    res.status(500).json({ error: 'Failed to get procedures' });
  }
});

/**
 * GET /api/incidents/procedures/:procedureId
 * Get a specific procedure (generates dynamically if not cached)
 */
router.get('/procedures/:procedureId', authenticate, async (req, res) => {
  try {
    const { procedureId } = req.params;
    const database = db.getDb();
    
    const procedure = await getOrGenerateProcedure(database, procedureId);

    res.json(procedure);
  } catch (error) {
    console.error('Get procedure error:', error);
    res.status(500).json({ error: 'Failed to get procedure' });
  }
});

/**
 * POST /api/incidents
 * Create a new incident report dynamically mapped to a procedure
 */
router.post('/', authenticate, [
  body('title').notEmpty().withMessage('Title is required'),
  body('incidentType').notEmpty().withMessage('Incident type is required'),
  body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid severity'),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, incidentType, severity, description, affectedSystems } = req.body;
    const database = db.getDb();

    // Dynamically get or generate the step-by-step procedure via AI
    const procedure = await getOrGenerateProcedure(database, incidentType);
    const incidentId = uuidv4();

    const newIncident = {
      id: incidentId,
      userId: req.user.id,
      title,
      description: description || '',
      severity,
      incidentType: procedure.id,
      affectedSystems: affectedSystems || [],
      timeline: [{
        timestamp: new Date().toISOString(),
        action: 'Incident reported',
        user: req.user.name || 'User'
      }],
      status: 'open',
      createdAt: new Date().toISOString()
    };
    
    await database.ref(`incidents/${incidentId}`).set(newIncident);

    res.status(201).json({
      message: 'Incident reported successfully',
      incident: {
        id: incidentId,
        title,
        incidentType: procedure.id,
        severity,
        status: 'open'
      },
      procedure: {
        title: procedure.title,
        steps: procedure.steps,
        recovery: procedure.recovery
      }
    });
  } catch (error) {
    console.error('Create incident error:', error);
    res.status(500).json({ error: 'Failed to create incident' });
  }
});

/**
 * GET /api/incidents
 * Get user's incidents
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, severity, limit = 20, offset = 0 } = req.query;
    const database = db.getDb();

    const snapshot = await database.ref('incidents')
      .orderByChild('userId')
      .equalTo(req.user.id)
      .once('value');
      
    let incidents = [];
    snapshot.forEach((child) => {
      const inc = child.val();
      if ((!status || inc.status === status) && (!severity || inc.severity === severity)) {
        incidents.push(inc);
      }
    });
    
    incidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    incidents = incidents.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({ incidents });
  } catch (error) {
    console.error('Get incidents error:', error);
    res.status(500).json({ error: 'Failed to get incidents' });
  }
});

/**
 * GET /api/incidents/:id
 * Get a specific incident
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const database = db.getDb();

    const snapshot = await database.ref(`incidents/${id}`).once('value');
    const incident = snapshot.val();

    if (!incident || incident.userId !== req.user.id) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const procSnap = await database.ref(`procedures/${incident.incidentType}`).once('value');
    const procedure = procSnap.exists() ? { id: procSnap.key, ...procSnap.val() } : null;

    res.json({
      incident: {
        ...incident,
        affectedSystems: incident.affectedSystems || [],
        timeline: incident.timeline || [],
        actionsTaken: incident.actionsTaken || []
      },
      procedure
    });
  } catch (error) {
    console.error('Get incident error:', error);
    res.status(500).json({ error: 'Failed to get incident' });
  }
});

/**
 * PATCH /api/incidents/:id
 * Update an incident
 */
router.patch('/:id', authenticate, [
  body('status').optional().isIn(['open', 'in_progress', 'resolved', 'closed']),
  body('actionTaken').optional().isString(),
  body('resolution').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status, actionTaken, resolution } = req.body;
    const database = db.getDb();

    const incidentRef = database.ref(`incidents/${id}`);
    const snapshot = await incidentRef.once('value');
    const incident = snapshot.val();

    if (!incident || incident.userId !== req.user.id) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    // Update timeline
    const timeline = incident.timeline || [];
    
    if (actionTaken) {
      timeline.push({
        timestamp: new Date().toISOString(),
        action: actionTaken,
        user: req.user.name || 'User'
      });
    }

    if (status) {
      timeline.push({
        timestamp: new Date().toISOString(),
        action: `Status changed to ${status}`,
        user: req.user.name || 'User'
      });
    }

    // Update actions taken
    const actions = incident.actionsTaken || [];
    if (actionTaken) {
      actions.push({
        action: actionTaken,
        timestamp: new Date().toISOString(),
        user: req.user.name || 'User'
      });
    }

    const updates = {
      updatedAt: new Date().toISOString(),
      timeline,
      actionsTaken: actions
    };
    
    if (status) {
      updates.status = status;
      if (status === 'resolved' || status === 'closed') {
        updates.resolvedAt = new Date().toISOString();
      }
    }
    if (resolution) updates.resolution = resolution;
    
    await incidentRef.update(updates);

    res.json({
      message: 'Incident updated successfully',
      timeline: timeline.slice(-5) // Return last 5 timeline entries
    });
  } catch (error) {
    console.error('Update incident error:', error);
    res.status(500).json({ error: 'Failed to update incident' });
  }
});

/**
 * GET /api/incidents/stats/summary
 * Get incident statistics
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const database = db.getDb();

    const snapshot = await database.ref('incidents')
      .orderByChild('userId')
      .equalTo(req.user.id)
      .once('value');
      
    let totalIncidents = 0;
    let openIncidents = 0;
    let resolvedIncidents = 0;
    let criticalCount = 0;
    let highCount = 0;
    const byTypeMap = {};
    let recentIncidents = [];
    
    snapshot.forEach((child) => {
      const inc = child.val();
      totalIncidents++;
      if (inc.status === 'open') openIncidents++;
      if (inc.status === 'resolved' || inc.status === 'closed') resolvedIncidents++;
      if (inc.severity === 'critical') criticalCount++;
      if (inc.severity === 'high') highCount++;
      byTypeMap[inc.incidentType] = (byTypeMap[inc.incidentType] || 0) + 1;
      recentIncidents.push(inc);
    });
    
    recentIncidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    recentIncidents = recentIncidents.slice(0, 5);
    
    const stats = {
      total_incidents: totalIncidents,
      open_incidents: openIncidents,
      resolved_incidents: resolvedIncidents,
      critical_count: criticalCount,
      high_count: highCount
    };
    
    const byType = Object.keys(byTypeMap).map(type => ({
      incident_type: type,
      count: byTypeMap[type]
    }));

    res.json({
      stats,
      byType,
      recentIncidents
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
