/**
 * Sender Reputation Graph
 * 
 * Lightweight alternative to a full Neo4j graph database.
 * Tracks sender domain reputation in Firebase Realtime Database,
 * building a growing trust/distrust network over time.
 * 
 * Schema in Firebase:
 * /sender_reputation/{domainHash}/
 *   domain: string
 *   totalScans: number
 *   avgRiskScore: number
 *   flaggedCount: number      (times classified as HIGH/CRITICAL)
 *   safeCount: number         (times classified as LOW)
 *   lastSeen: ISO string
 *   reputationScore: number   (0-100, higher = more trusted)
 */

const crypto = require('crypto');

/**
 * Hash a domain name for use as a Firebase key (Firebase doesn't allow dots in keys)
 */
function hashDomain(domain) {
  return crypto.createHash('md5').update(domain.toLowerCase()).digest('hex').substring(0, 16);
}

/**
 * Extract the root domain from an email address or full domain string.
 * e.g. "no-reply@accounts.google.com" → "google.com"
 */
function extractRootDomain(sender) {
  try {
    let domain = sender.includes('@') ? sender.split('@').pop() : sender;
    domain = domain.toLowerCase().trim();
    // Get last two parts: accounts.google.com → google.com
    const parts = domain.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domain;
  } catch {
    return null;
  }
}

/**
 * Update the sender reputation graph in Firebase after each analysis.
 * This is fire-and-forget (non-blocking) — never delays the user's result.
 */
async function updateSenderReputation(database, sender, riskScore, riskLevel) {
  if (!sender || !database) return;

  const rootDomain = extractRootDomain(sender);
  if (!rootDomain || rootDomain.length < 4) return;

  const domainKey = hashDomain(rootDomain);
  const ref = database.ref(`sender_reputation/${domainKey}`);

  try {
    const snapshot = await ref.once('value');
    const existing = snapshot.val() || {
      domain: rootDomain,
      totalScans: 0,
      avgRiskScore: 0,
      flaggedCount: 0,
      safeCount: 0,
    };

    const newTotal = existing.totalScans + 1;
    const newAvg = ((existing.avgRiskScore * existing.totalScans) + riskScore) / newTotal;
    const isFlagged = ['high', 'critical'].includes((riskLevel || '').toLowerCase());
    const isSafe = ['low'].includes((riskLevel || '').toLowerCase());

    // Reputation score: starts at 50, goes up for safe scans, down for flagged ones
    const newFlagged = existing.flaggedCount + (isFlagged ? 1 : 0);
    const newSafe = existing.safeCount + (isSafe ? 1 : 0);
    const reputationScore = Math.max(0, Math.min(100,
      50 + (newSafe * 5) - (newFlagged * 10)
    ));

    await ref.set({
      domain: rootDomain,
      totalScans: newTotal,
      avgRiskScore: parseFloat(newAvg.toFixed(3)),
      flaggedCount: newFlagged,
      safeCount: newSafe,
      reputationScore,
      lastSeen: new Date().toISOString(),
    });

    console.log(`📊 [SenderGraph] Updated reputation for ${rootDomain}: score=${reputationScore}/100`);
  } catch (err) {
    // Non-critical — silently ignore to not affect user experience
    console.warn(`⚠️  [SenderGraph] Failed to update reputation for ${rootDomain}: ${err.message}`);
  }
}

/**
 * Query the sender's historical reputation before the ML model runs.
 * Returns a reputation object or null if the domain is unknown.
 * 
 * @param {object} database - Firebase Realtime Database instance
 * @param {string} sender - Sender email address
 * @returns {object|null} Reputation data or null
 */
async function getSenderReputation(database, sender) {
  if (!sender || !database) return null;

  const rootDomain = extractRootDomain(sender);
  if (!rootDomain) return null;

  const domainKey = hashDomain(rootDomain);

  try {
    const snapshot = await database.ref(`sender_reputation/${domainKey}`).once('value');
    return snapshot.val();
  } catch {
    return null;
  }
}

/**
 * Use sender reputation to adjust the phishing probability.
 * Domains with high reputation scores (many safe scans) get a small score reduction.
 * Domains with low reputation scores (many flagged scans) get a small score increase.
 * 
 * @param {number} currentProb - Current phishing probability (0-1)
 * @param {object|null} reputation - Reputation data from getSenderReputation()
 * @returns {{ adjustedProb: number, adjustment: string }}
 */
function applyReputationAdjustment(currentProb, reputation) {
  if (!reputation || reputation.totalScans < 3) {
    // Not enough data to make a reputation adjustment
    return { adjustedProb: currentProb, adjustment: 'none' };
  }

  const score = reputation.reputationScore;

  if (score >= 80 && reputation.totalScans >= 5) {
    // Highly trusted domain — apply a 15% dampening
    const adjusted = currentProb * 0.85;
    console.log(`🛡️  [SenderGraph] Trusted domain (score=${score}) — dampened ${(currentProb*100).toFixed(0)}% → ${(adjusted*100).toFixed(0)}%`);
    return { adjustedProb: adjusted, adjustment: 'dampened' };
  }

  if (score <= 20 && reputation.totalScans >= 3) {
    // Highly suspicious domain — apply a 20% amplification
    const adjusted = Math.min(0.95, currentProb * 1.20);
    console.log(`🚨 [SenderGraph] Suspicious domain (score=${score}) — amplified ${(currentProb*100).toFixed(0)}% → ${(adjusted*100).toFixed(0)}%`);
    return { adjustedProb: adjusted, adjustment: 'amplified' };
  }

  return { adjustedProb: currentProb, adjustment: 'none' };
}

module.exports = { updateSenderReputation, getSenderReputation, applyReputationAdjustment, extractRootDomain };
