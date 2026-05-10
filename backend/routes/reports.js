/**
 * Report Phishing Routes
 * Handles user submissions of suspicious emails and links
 * Analysis powered by the ML Python ensemble bridge (consistent with /api/phishing/analyze)
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const MLPythonBridge = require('../services/mlPythonBridge');

// Shared ML bridge instance (same Python ensemble server used by phishing.js)
const mlBridge = new MLPythonBridge(process.env.ML_SERVER_URL || 'http://localhost:5000');

/**
 * Convert the raw ML server response into the flat analysis shape
 * expected by the rest of this router. Mirrors phishing.js formatAnalysisResponse.
 */
function formatAnalysisResponse(mlResponse, contentType) {
  if (!mlResponse || !mlResponse.analysis) return null;

  const analysisData  = mlResponse.analysis;
  const phishingProb  = analysisData.phishing_probability || 0.5;
  const confidence    = analysisData.confidence || 0;
  const riskLevel     = analysisData.risk_level || 'UNCERTAIN';
  const recommendation = analysisData.recommendation || 'Manual review required';

  const indicators = [];

  if (contentType === 'email' && mlResponse.features_detected) {
    const f = mlResponse.features_detected;
    if (f.urgency_indicators?.has_urgency)
      indicators.push(`⚠️  Urgency language detected (${f.urgency_indicators.urgency_word_count} keywords)`);
    if (f.sender_indicators?.is_generic)
      indicators.push('⚠️  Generic sender name (e.g., "Admin", "Support")');
    if (f.sender_indicators?.suspicious_domain)
      indicators.push('🚨 Sender domain is suspicious or uses URL shortener');
    if (f.url_indicators?.has_ip_url)
      indicators.push('🚨 Contains direct IP address URL (common in phishing)');
    if (f.url_indicators?.shortened_urls > 0)
      indicators.push(`⚠️  Contains ${f.url_indicators.shortened_urls} shortened URL(s)`);
    if (f.content_indicators?.requests_personal_info > 0)
      indicators.push(`🚨 Requests sensitive information (${f.content_indicators.requests_personal_info} fields)`);
    if (f.content_indicators?.has_forms)
      indicators.push('🚨 Contains embedded forms to collect data');
    if (f.content_indicators?.broken_grammar)
      indicators.push('⚠️  Contains broken English or poor grammar');
    if (f.content_indicators?.uses_authority_tactic)
      indicators.push('⚠️  Impersonates known authority (bank, service provider, etc.)');
  } else if (contentType === 'url' && mlResponse.structural_features) {
    const f = mlResponse.structural_features;
    if (f.is_ip_address)   indicators.push('🚨 URL is a direct IP address (very suspicious)');
    if (f.has_at_symbol)   indicators.push('🚨 URL contains @ symbol (can hide real domain)');
    if (f.long_url)        indicators.push('⚠️  Unusually long URL');
    if (f.deep_subdomain)  indicators.push('⚠️  Multiple subdomains (may hide real domain)');
    if (f.uses_http)       indicators.push('⚠️  Uses plain HTTP (not encrypted)');
    if (f.new_tld)         indicators.push('⚠️  Uses suspicious TLD (.tk, .ml, .ga, etc.)');
    if (f.looks_like_typo) indicators.push('🚨 Domain looks like a common typo (e.g., "amaz0n")');
    if (mlResponse.reputation?.urlhaus_blacklisted)
      indicators.push(`🚨 Blacklisted on URLhaus (threat: ${mlResponse.reputation.urlhaus_threat})`);
  }

  if (confidence < 0.2)
    indicators.push('⚠️  Low confidence — manual review recommended');
  if (indicators.length === 0)
    indicators.push('No major phishing indicators detected');

  // Normalise risk level to lowercase (matches existing DB records)
  const mappedRiskLevel = {
    CRITICAL:  'critical',
    HIGH:      'high',
    MEDIUM:    'medium',
    LOW:       'low',
    UNCERTAIN: 'uncertain'
  }[riskLevel] || 'low';

  return {
    riskScore:       phishingProb,
    riskLevel:       mappedRiskLevel,
    confidence,
    indicators,
    recommendations: [recommendation],
    modelVersion:    analysisData.model_version || 'ensemble-v2',
    topRisks:        mlResponse.top_risks || [],
    timestamp:       mlResponse.timestamp
  };
}

/**
 * POST /api/reports
 * Submit a new phishing report
 */
router.post('/', authenticate, [
  body('reportType').isIn(['email', 'url', 'sms', 'other']).withMessage('Invalid report type'),
  body('content').notEmpty().withMessage('Content is required'),
  body('url').optional().isString().withMessage('URL must be a string'),
  body('senderEmail').optional().isString().withMessage('Sender email must be a string'),
  body('subject').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMsg = errors.array().map(e => e.msg).join(', ');
      return res.status(400).json({ error: `Validation failed: ${errorMsg}` });
    }

    const { reportType, content, url, senderEmail, subject, aiCategoryId, severity } = req.body;
    const database = db.getDb();

    // Analyze with the same Python ML ensemble used by /api/phishing/analyze
    let analysis;
    try {
      let mlResponse;
      if (reportType === 'url' && url) {
        mlResponse = await mlBridge.analyzeUrl(url);
        analysis   = formatAnalysisResponse(mlResponse, 'url');
      } else if (reportType === 'email') {
        mlResponse = await mlBridge.analyzeEmail(content, senderEmail || '', subject || '');
        analysis   = formatAnalysisResponse(mlResponse, 'email');
      } else {
        // sms / other — use email model as best fallback
        mlResponse = await mlBridge.analyzeEmail(content, '', '');
        analysis   = formatAnalysisResponse(mlResponse, 'email');
      }
    } catch (mlErr) {
      console.warn('⚠️  ML bridge failed for report analysis, using safe defaults:', mlErr.message);
    }

    // Hard fallback if ML server is unavailable
    if (!analysis) {
      analysis = {
        riskScore:       0.5,
        riskLevel:       'uncertain',
        confidence:      0,
        indicators:      ['Analysis service temporarily unavailable. Manual review recommended.'],
        recommendations: ['Verify this content through official channels before taking action.'],
        modelVersion:    'fallback'
      };
    }

    // Create report
    const reportId = uuidv4();
    const newReport = {
      id: reportId,
      userId: req.user.id,
      reportType,
      content,
      url: url || null,
      senderEmail: senderEmail || null,
      subject: subject || null,
      riskScore: analysis.riskScore || 0,
      riskLevel: analysis.riskLevel || 'safe',
      severity: severity || analysis.riskLevel || 'low',
      aiCategoryId: aiCategoryId || null,
      aiAnalysis: analysis,
      indicators: analysis.indicators || [],
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await database.ref('phishing_reports').child(reportId).set(newReport);

    // Check if user earned any achievements
    await checkReportAchievements(req.user.id, database);

    res.status(201).json({
      message: 'Report submitted successfully',
      report: {
        id: reportId,
        reportType,
        status: 'pending',
        analysis: {
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          indicators: analysis.indicators,
          recommendations: analysis.recommendations
        }
      }
    });
  } catch (error) {
    console.error('Report submission error:', error);
    res.status(500).json({ error: 'Failed to submit report', details: error.message });
  }
});

/**
 * GET /api/reports
 * Get user's phishing reports
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const database = db.getDb();

    const snapshot = await database.ref('phishing_reports')
      .orderByChild('userId')
      .equalTo(req.user.id)
      .once('value');
      
    let reports = [];
    snapshot.forEach((child) => {
      const report = child.val();
      if (!status || report.status === status) {
        reports.push(report);
      }
    });
    
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = reports.length;
    reports = reports.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      reports,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + reports.length < total
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to get reports' });
  }
});

/**
 * GET /api/reports/:id
 * Get a specific report
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const database = db.getDb();

    const snapshot = await database.ref(`phishing_reports/${id}`).once('value');
    const report = snapshot.val();

    if (!report || report.userId !== req.user.id) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * PATCH /api/reports/:id/status
 * Update report status (admin only)
 */
router.patch('/:id/status', authenticate, requireAdmin, [
  body('status').isIn(['pending', 'reviewed', 'confirmed', 'false_positive', 'resolved'])
    .withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { status } = req.body;
    const database = db.getDb();

    const reportRef = database.ref(`phishing_reports/${id}`);
    const snapshot = await reportRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    await reportRef.update({
      status,
      updatedAt: new Date().toISOString()
    });

    res.json({ message: 'Report status updated', status });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * GET /api/reports/stats/summary
 * Get report statistics
 */
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const database = db.getDb();

    const snapshot = await database.ref('phishing_reports')
      .orderByChild('userId')
      .equalTo(req.user.id)
      .once('value');
      
    let totalReports = 0;
    let confirmedPhishing = 0;
    let falsePositives = 0;
    let highRiskReports = 0;
    let totalScore = 0;
    
    const byTypeMap = {};
    
    snapshot.forEach((child) => {
      const report = child.val();
      totalReports++;
      if (report.status === 'confirmed') confirmedPhishing++;
      if (report.status === 'false_positive') falsePositives++;
      if (report.riskLevel === 'critical' || report.riskLevel === 'high') highRiskReports++;
      totalScore += report.riskScore || 0;
      
      byTypeMap[report.reportType] = (byTypeMap[report.reportType] || 0) + 1;
    });
    
    const stats = {
      total_reports: totalReports,
      confirmed_phishing: confirmedPhishing,
      false_positives: falsePositives,
      high_risk_reports: highRiskReports,
      average_risk_score: totalReports > 0 ? (totalScore / totalReports) : 0
    };
    
    const byType = Object.keys(byTypeMap).map(type => ({
      report_type: type,
      count: byTypeMap[type]
    }));

    res.json({
      stats: {
        ...stats,
        average_risk_score: Math.round((stats.average_risk_score || 0) * 100) / 100
      },
      byType,
      recentActivity: [] // Simplified for now
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Check and award report-related achievements
 */
async function checkReportAchievements(userId, database) {
  const snapshot = await database.ref('phishing_reports')
    .orderByChild('userId').equalTo(userId).once('value');
    
  const reportCount = snapshot.numChildren();

  const achievements = [
    { count: 1, type: 'first_report', name: 'First Reporter', desc: 'Submitted your first phishing report' },
    { count: 5, type: 'vigilant', name: 'Vigilant Eye', desc: 'Submitted 5 phishing reports' },
    { count: 10, type: 'guardian', name: 'Security Guardian', desc: 'Submitted 10 phishing reports' },
    { count: 25, type: 'champion', name: 'Phishing Champion', desc: 'Submitted 25 phishing reports' },
    { count: 50, type: 'legend', name: 'Security Legend', desc: 'Submitted 50 phishing reports' }
  ];

  for (const achievement of achievements) {
    if (reportCount >= achievement.count) {
      const existingSnap = await database.ref('achievements')
        .orderByChild('userId_type')
        .equalTo(`${userId}_${achievement.type}`)
        .once('value');
        
      if (!existingSnap.exists()) {
        const achId = uuidv4();
        await database.ref(`achievements/${achId}`).set({
          id: achId,
          userId,
          achievementType: achievement.type,
          achievementName: achievement.name,
          description: achievement.desc,
          userId_type: `${userId}_${achievement.type}`,
          earnedAt: new Date().toISOString()
        });
      }
    }
  }
}

module.exports = router;
