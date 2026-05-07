/**
 * Report Phishing Routes
 * Handles user submissions of suspicious emails and links
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const phishingAnalyzer = require('../services/phishingAnalyzer');

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

    // Automatically analyze the report content
    let analysis;
    if (reportType === 'url' && url) {
      analysis = phishingAnalyzer.analyzeUrl(url);
    } else if (reportType === 'email') {
      analysis = phishingAnalyzer.analyzeEmail({ 
        subject, 
        body: content, 
        sender: senderEmail 
      });
    } else {
      analysis = phishingAnalyzer.analyzeContent(content);
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
