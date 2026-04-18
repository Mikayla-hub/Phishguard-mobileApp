/**
 * PhishGuard Dataset Evaluation Script
 *
 * Evaluates the current ML + heuristic analyzer against samples
 * drawn from the 3 CSV datasets:
 *   1. Phishing_Email.csv
 *   2. PhiUSIIL_Phishing_URL_Dataset.csv
 *   3. zimbabwe_phishing_dataset.csv
 *
 * Run from the backend folder with:
 *   node train.js
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const phishingAnalyzer = require('./services/phishingAnalyzer');

const DATASETS_DIR = path.join(__dirname, 'data', 'datasets');

/**
 * Read a CSV file and return rows as an array of objects.
 * @param {string} filePath
 * @param {number} maxRows - optional cap
 */
function readCSV(filePath, maxRows = Infinity) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  File not found: ${filePath}`);
      return resolve([]);
    }
    const rows = [];
    const stream = fs.createReadStream(filePath)
      .pipe(csv({ bom: true }))
      .on('data', (row) => {
        if (rows.length >= maxRows) { stream.destroy(); return; }
        rows.push(row);
      })
      .on('end', () => resolve(rows))
      .on('close', () => resolve(rows))
      .on('error', reject);
  });
}

async function evaluateEmails() {
  const phishingEmails = [];
  const legitimateEmails = [];

  // Dataset 1: Phishing_Email.csv  (columns: "Email Text", "Email Type")
  // Sample up to 200 of each class to keep evaluation fast
  const emailCSV = path.join(DATASETS_DIR, 'Phishing_Email.csv');
  console.log('Loading Phishing_Email.csv (sampling up to 200 per class)...');
  const emailRows = await readCSV(emailCSV);
  let phishCount = 0, legitCount = 0;
  for (const row of emailRows) {
    const text = (row['Email Text'] || '').trim();
    const type = (row['Email Type'] || '').trim().toLowerCase();
    if (!text || !type) continue;

    if (type.includes('phishing') && phishCount < 200) {
      phishingEmails.push({ id: `email-phish-${phishCount + 1}`, subject: text.substring(0, 80), body: text, sender: '' });
      phishCount++;
    } else if (!type.includes('phishing') && legitCount < 200) {
      legitimateEmails.push({ id: `email-legit-${legitCount + 1}`, subject: text.substring(0, 80), body: text, sender: '' });
      legitCount++;
    }
    if (phishCount >= 200 && legitCount >= 200) break;
  }

  // Dataset 3: zimbabwe_phishing_dataset.csv  (columns: "text", "label")
  const zwCSV = path.join(DATASETS_DIR, 'zimbabwe_phishing_dataset.csv');
  console.log('Loading zimbabwe_phishing_dataset.csv ...');
  const zwRows = await readCSV(zwCSV);
  for (const row of zwRows) {
    const text = (row['text'] || '').trim();
    const label = (row['label'] || '').trim().toLowerCase();
    if (!text || !label) continue;

    if (label === 'phishing') {
      phishingEmails.push({ id: `zw-phish-${phishingEmails.length + 1}`, subject: text.substring(0, 80), body: text, sender: '' });
    } else {
      legitimateEmails.push({ id: `zw-legit-${legitimateEmails.length + 1}`, subject: text.substring(0, 80), body: text, sender: '' });
    }
  }

  // Evaluate
  let tp = 0, fn = 0, tn = 0, fp = 0;
  const phishingMisses = [];
  const legitFalseAlarms = [];
  const phishingThreshold = 0.3;

  for (const email of phishingEmails) {
    const { subject, body, sender, id } = email;
    const result = phishingAnalyzer.analyzeEmail({ subject, body, sender });
    const score = result.riskScore || 0;
    if (score >= phishingThreshold) {
      tp++;
    } else {
      fn++;
      phishingMisses.push({ id, score, riskLevel: result.riskLevel, subject: subject.substring(0, 60) });
    }
  }

  for (const email of legitimateEmails) {
    const { subject, body, sender, id } = email;
    const result = phishingAnalyzer.analyzeEmail({ subject, body, sender });
    const score = result.riskScore || 0;
    if (score < phishingThreshold) {
      tn++;
    } else {
      fp++;
      legitFalseAlarms.push({ id, score, riskLevel: result.riskLevel, subject: subject.substring(0, 60) });
    }
  }

  console.log('\n=== EMAIL EVALUATION ===');
  console.log(`Phishing emails:   ${phishingEmails.length}  (${phishCount} from Phishing_Email.csv + ${phishingEmails.length - phishCount} from zimbabwe)`);
  console.log(`Legitimate emails: ${legitimateEmails.length}  (${legitCount} from Phishing_Email.csv + ${legitimateEmails.length - legitCount} from zimbabwe)`);
  console.log(`Threshold:         riskScore >= ${phishingThreshold.toFixed(2)} = phishing\n`);

  console.log(`True Positives (phishing caught):       ${tp}`);
  console.log(`False Negatives (phishing missed):      ${fn}`);
  console.log(`True Negatives (legit kept safe):       ${tn}`);
  console.log(`False Positives (legit flagged risky):  ${fp}\n`);

  const precision = tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(1) : 'N/A';
  const recall = tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(1) : 'N/A';
  console.log(`Precision: ${precision}%`);
  console.log(`Recall:    ${recall}%`);

  if (phishingMisses.length) {
    console.log('\n--- Phishing emails scored too low (sample, max 10) ---');
    phishingMisses.slice(0, 10).forEach(m => {
      console.log(`  [${m.id}] score=${m.score}, level=${m.riskLevel} :: ${m.subject}`);
    });
    if (phishingMisses.length > 10) console.log(`  ...and ${phishingMisses.length - 10} more`);
  }

  if (legitFalseAlarms.length) {
    console.log('\n--- Legitimate emails scored too high (sample, max 10) ---');
    legitFalseAlarms.slice(0, 10).forEach(m => {
      console.log(`  [${m.id}] score=${m.score}, level=${m.riskLevel} :: ${m.subject}`);
    });
    if (legitFalseAlarms.length > 10) console.log(`  ...and ${legitFalseAlarms.length - 10} more`);
  }
}

async function evaluateUrls() {
  const phishingUrls = [];
  const legitimateUrls = [];

  // Dataset 2: PhiUSIIL_Phishing_URL_Dataset.csv  (columns: "URL", "label")
  // Sample up to 200 of each class
  const urlCSV = path.join(DATASETS_DIR, 'PhiUSIIL_Phishing_URL_Dataset.csv');
  console.log('\nLoading PhiUSIIL_Phishing_URL_Dataset.csv (sampling up to 200 per class)...');
  const urlRows = await readCSV(urlCSV, 50000); // read up to 50k to get enough of each class
  let phishCount = 0, legitCount = 0;
  for (const row of urlRows) {
    const url = (row['URL'] || '').trim();
    const label = (row['label'] || '').trim();
    if (!url || !['0', '1'].includes(label)) continue;

    if (label === '1' && phishCount < 200) {
      phishingUrls.push({ id: `url-phish-${phishCount + 1}`, url });
      phishCount++;
    } else if (label === '0' && legitCount < 200) {
      legitimateUrls.push({ id: `url-legit-${legitCount + 1}`, url });
      legitCount++;
    }
    if (phishCount >= 200 && legitCount >= 200) break;
  }

  // Evaluate
  let tp = 0, fn = 0, tn = 0, fp = 0;
  const phishingMisses = [];
  const legitFalseAlarms = [];
  const phishingThreshold = 0.3;

  for (const entry of phishingUrls) {
    const { url, id } = entry;
    const result = phishingAnalyzer.analyzeUrl(url);
    const score = result.riskScore || 0;
    if (score >= phishingThreshold) {
      tp++;
    } else {
      fn++;
      phishingMisses.push({ id, score, riskLevel: result.riskLevel, url });
    }
  }

  for (const entry of legitimateUrls) {
    const { url, id } = entry;
    const result = phishingAnalyzer.analyzeUrl(url);
    const score = result.riskScore || 0;
    if (score < phishingThreshold) {
      tn++;
    } else {
      fp++;
      legitFalseAlarms.push({ id, score, riskLevel: result.riskLevel, url });
    }
  }

  console.log('\n=== URL EVALUATION ===');
  console.log(`Phishing URLs:   ${phishingUrls.length}  (from PhiUSIIL dataset)`);
  console.log(`Legitimate URLs: ${legitimateUrls.length}  (from PhiUSIIL dataset)`);
  console.log(`Threshold:       riskScore >= ${phishingThreshold.toFixed(2)} = phishing\n`);

  console.log(`True Positives (phishing caught):       ${tp}`);
  console.log(`False Negatives (phishing missed):      ${fn}`);
  console.log(`True Negatives (legit kept safe):       ${tn}`);
  console.log(`False Positives (legit flagged risky):  ${fp}\n`);

  const precision = tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(1) : 'N/A';
  const recall = tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(1) : 'N/A';
  console.log(`Precision: ${precision}%`);
  console.log(`Recall:    ${recall}%`);

  if (phishingMisses.length) {
    console.log('\n--- Phishing URLs scored too low (sample, max 10) ---');
    phishingMisses.slice(0, 10).forEach(m => {
      console.log(`  [${m.id}] score=${m.score}, level=${m.riskLevel} :: ${m.url}`);
    });
    if (phishingMisses.length > 10) console.log(`  ...and ${phishingMisses.length - 10} more`);
  }

  if (legitFalseAlarms.length) {
    console.log('\n--- Legitimate URLs scored too high (sample, max 10) ---');
    legitFalseAlarms.slice(0, 10).forEach(m => {
      console.log(`  [${m.id}] score=${m.score}, level=${m.riskLevel} :: ${m.url}`);
    });
    if (legitFalseAlarms.length > 10) console.log(`  ...and ${legitFalseAlarms.length - 10} more`);
  }
}

async function main() {
  console.log('======================================');
  console.log('  PhishGuard Dataset Evaluation Report');
  console.log('======================================\n');

  await evaluateEmails();
  console.log('\n--------------------------------------');
  await evaluateUrls();

  console.log('\nDone.');
}

main().catch(console.error);
