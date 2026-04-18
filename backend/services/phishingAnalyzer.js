/**
 * Phishing Analyzer Service
 * Now powered by the ML Service (Naive Bayes Classifier)
 */

const mlService = require('./mlService');

function analyzeContent(content, type = 'text') {
  const textToAnalyze = typeof content === 'object' ? JSON.stringify(content) : String(content);
  return mlService.analyze(textToAnalyze);
}

function analyzeUrl(url) {
  return mlService.analyze(url);
}

function analyzeEmail(email) {
  const textToAnalyze = `${email.subject || ''} ${email.body || ''} ${email.sender || ''}`;
  return mlService.analyze(textToAnalyze);
}

function analyzeText(text) {
  return mlService.analyze(text);
}

function getRiskLevel(score) {
  if (score >= 0.75) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.3) return 'medium';
  if (score > 0.1) return 'low';
  return 'safe';
}

function getAnalysisStats() {
  return { status: "Powered by ML Service" };
}

module.exports = {
  analyzeContent,
  analyzeUrl,
  analyzeEmail,
  analyzeText,
  getRiskLevel,
  getAnalysisStats
};
