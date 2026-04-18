const fs = require('fs');
const csv = require('csv-parser');
const natural = require('natural');
const path = require('path');

class MLService {
  constructor() {
    // Initialize a new Naive Bayes text classifier
    this.classifier = new natural.BayesClassifier();
    this.isTrained = false;
  }

  /**
   * Stream a single CSV and add documents to the classifier (does NOT call train()).
   * Returns the number of samples added.
   * @param {object} config - { filePath, textCol, labelCol, phishingVal, maxRows }
   */
  _addDocumentsFromCSV(config) {
    const {
      filePath,
      textCol = 'text',
      labelCol = 'label',
      phishingVal = 'phishing',
      maxRows = Infinity,
    } = config;

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        console.warn(`⚠️  Dataset not found, skipping: ${filePath}`);
        return resolve(0);
      }

      let added = 0;
      const stream = fs.createReadStream(filePath)
        .pipe(csv({ bom: true }))
        .on('data', (row) => {
          if (added >= maxRows) {
            stream.destroy(); // stop reading once limit reached
            return;
          }
          const text = row[textCol];
          const label = row[labelCol];
          if (text && label !== undefined) {
            const isPhishing =
              String(label).toLowerCase() === String(phishingVal).toLowerCase() ||
              String(label) === '1';
            this.classifier.addDocument(text, isPhishing ? 'phishing' : 'safe');
            added++;
          }
        })
        .on('end', () => resolve(added))
        .on('close', () => resolve(added)) // fires when stream.destroy() is called
        .on('error', reject);
    });
  }

  /**
   * Train from multiple CSVs with different schemas, calling classifier.train() once at the end.
   * @param {Array<object>} csvConfigs - array of { filePath, textCol, labelCol, phishingVal, maxRows }
   */
  async trainFromMultipleCSVs(csvConfigs) {
    // Reset classifier so we start fresh
    this.classifier = new natural.BayesClassifier();
    this.isTrained = false;

    let totalSamples = 0;
    for (const config of csvConfigs) {
      const count = await this._addDocumentsFromCSV(config);
      const name = path.basename(config.filePath);
      console.log(`   📊 ${count.toLocaleString()} samples loaded from ${name}`);
      totalSamples += count;
    }

    if (totalSamples === 0) {
      throw new Error('No training samples could be loaded from any CSV. Check file paths and column names.');
    }

    console.log(`\n🏋️  Training classifier on ${totalSamples.toLocaleString()} total samples...`);
    this.classifier.train();
    this.isTrained = true;
    console.log(`✅ Training complete.`);
  }

  /**
   * Auto-load a saved model if one exists; otherwise train from multiple CSVs and save.
   * @param {Array<object>} csvConfigs
   * @param {string} modelFilePath
   */
  async initializeFromCSVs(csvConfigs, modelFilePath) {
    try {
      if (fs.existsSync(modelFilePath)) {
        console.log(`🧠 Loading existing ML Model from ${path.basename(modelFilePath)}...`);
        await this.loadModel(modelFilePath);
        console.log(`✅ ML Model successfully loaded.`);
      } else {
        console.log(`🧠 No saved model found. Training from CSV datasets (this may take a minute)...`);
        await this.trainFromMultipleCSVs(csvConfigs);
        await this.saveModel(modelFilePath);
        console.log(`💾 ML Model saved to ${path.basename(modelFilePath)}.`);
      }
    } catch (error) {
      console.error(`❌ Failed to initialize ML model:`, error.message);
    }
  }

  // Train the model from a single CSV (legacy — kept for backward compatibility)
  async trainFromCSV(csvFilePath, config = {}) {
    await this._addDocumentsFromCSV({ filePath: csvFilePath, ...config });
    this.classifier.train();
    this.isTrained = true;
    console.log(`🧠 ML Model trained from ${path.basename(csvFilePath)}`);
  }

  // Train the model from one or more JSON files
  async trainFromJSON(jsonFilePaths) {
    const paths = Array.isArray(jsonFilePaths) ? jsonFilePaths : [jsonFilePaths];
    return new Promise((resolve, reject) => {
      try {
        let totalSamples = 0;
        paths.forEach(filePath => {
          if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            data.forEach(row => {
              const text = row.text || row.url;
              const isPhishing = row.label === 1;
              if (text) {
                this.classifier.addDocument(text, isPhishing ? 'phishing' : 'safe');
                totalSamples++;
              }
            });
          } else {
            console.warn(`⚠️ Dataset file not found at ${filePath}`);
          }
        });
        this.classifier.train();
        this.isTrained = true;
        console.log(`🧠 ML Model successfully trained on ${totalSamples} combined samples.`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Auto-load if exists, otherwise train from JSON files and save
  async initializeJSON(jsonFilePaths, modelFilePath) {
    try {
      if (fs.existsSync(modelFilePath)) {
        console.log(`🧠 Loading existing ML Model from ${modelFilePath.split(/[\\/]/).pop()}...`);
        await this.loadModel(modelFilePath);
        console.log(`✅ ML Model successfully loaded.`);
      } else {
        console.log(`🧠 No saved model found. Training from datasets...`);
        await this.trainFromJSON(jsonFilePaths);
        await this.saveModel(modelFilePath);
        console.log(`💾 ML Model saved to ${modelFilePath.split(/[\\/]/).pop()}.`);
      }
    } catch (error) {
      console.error(`❌ Failed to initialize ML model:`, error.message);
    }
  }

  // Save the trained model to disk
  async saveModel(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.classifier.save(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Load a pre-trained model from disk
  async loadModel(filePath) {
    return new Promise((resolve, reject) => {
      natural.BayesClassifier.load(filePath, null, (err, classifier) => {
        if (err) reject(err);
        else {
          this.classifier = classifier;
          this.isTrained = true;
          resolve();
        }
      });
    });
  }

  // Auto-load if exists, otherwise train and save
  async initialize(csvFilePath, modelFilePath, config = {}) {
    try {
      if (fs.existsSync(modelFilePath)) {
        console.log(`🧠 Loading existing ML Model from ${modelFilePath.split(/[\\/]/).pop()}...`);
        await this.loadModel(modelFilePath);
        console.log(`✅ ML Model successfully loaded.`);
      } else {
        console.log(`🧠 No saved model found. Training from ${csvFilePath.split(/[\\/]/).pop()}...`);
        await this.trainFromCSV(csvFilePath, config);
        await this.saveModel(modelFilePath);
        console.log(`💾 ML Model saved to ${modelFilePath.split(/[\\/]/).pop()}.`);
      }
    } catch (error) {
      console.error(`❌ Failed to initialize ML model:`, error.message);
    }
  }

  /**
   * Heuristic URL risk scorer derived from features in the PhiUSIIL dataset.
   * Returns a score between 0.0 (safe) and 1.0 (phishing) plus indicator reasons.
   */
  _analyzeUrl(url) {
    const reasons = [];
    let score = 0;
    const lower = url.toLowerCase();

    try {
      const parsed = new URL(url.startsWith('http') ? url : `http://${url}`);
      const hostname = parsed.hostname;
      const pathname = parsed.pathname;
      const fullUrl = url;

      // --- Suspicious TLDs (common in phishing) ---
      const badTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.club',
                       '.work', '.site', '.online', '.live', '.click', '.link',
                       '.info', '.biz', '.ru', '.co', '.pw'];
      if (badTlds.some(t => hostname.endsWith(t))) {
        score += 0.35;
        reasons.push('Uses a high-risk top-level domain commonly associated with phishing.');
      }

      // --- IP address instead of domain ---
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        score += 0.45;
        reasons.push('URL uses a raw IP address instead of a domain name.');
      }

      // --- Misleading brand in subdomain/path but not the actual domain ---
      const brands = ['paypal', 'amazon', 'google', 'microsoft', 'apple', 'netflix',
                      'facebook', 'instagram', 'ebay', 'bank', 'secure', 'login',
                      'account', 'verify', 'update', 'cbz', 'ecocash', 'zimra',
                      'econet', 'mukuru', 'safaricom', 'mpesa', 'fnb', 'barclays'];
      const domainParts = hostname.split('.');
      const apex = domainParts.slice(-2).join('.');
      brands.forEach(brand => {
        if (hostname.includes(brand) && !apex.startsWith(brand)) {
          score += 0.3;
          reasons.push(`Impersonates "${brand}" in the subdomain to appear legitimate.`);
        }
      });

      // --- Excessive subdomains ---
      if (domainParts.length > 4) {
        score += 0.2;
        reasons.push('Unusually deep subdomain structure, a common phishing trick.');
      }

      // --- Very long URL ---
      if (fullUrl.length > 100) {
        score += 0.1;
        reasons.push('Excessively long URL designed to hide the true destination.');
      }

      // --- URL shorteners ---
      const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly',
                          'is.gd', 'buff.ly', 'adf.ly', 'short.io'];
      if (shorteners.some(s => hostname === s || hostname.endsWith('.' + s))) {
        score += 0.25;
        reasons.push('Uses a URL shortener to disguise the true destination.');
      }

      // --- HTTP (no HTTPS) for sensitive-looking pages ---
      if (parsed.protocol === 'http:' &&
          /(login|account|secure|verify|bank|payment|password)/.test(lower)) {
        score += 0.3;
        reasons.push('Uses insecure HTTP for a page that requests sensitive information.');
      }

      // --- Suspicious keywords in path/query ---
      if (/(verify|confirm|secure|update|login|signin|account|password|credential|reset)/.test(lower)) {
        score += 0.15;
        reasons.push('Path contains credential-harvesting keywords.');
      }

      // --- Numeric/random-looking domain ---
      if (/[0-9]{4,}/.test(domainParts[0])) {
        score += 0.15;
        reasons.push('Domain contains suspicious numeric sequences.');
      }

      // --- Multiple redirects / query params with URLs ---
      if ((parsed.search.match(/https?%3A/i) || []).length > 0) {
        score += 0.2;
        reasons.push('URL contains an embedded redirect to another URL.');
      }

    } catch {
      // Not a parseable URL — minimal penalty
      score += 0.05;
    }

    score = Math.min(1.0, score);

    if (reasons.length === 0) {
      reasons.push('No suspicious URL patterns detected.');
    }

    const riskLevel = score >= 0.75 ? 'critical'
                    : score >= 0.5  ? 'high'
                    : score >= 0.25 ? 'medium'
                    : score >= 0.1  ? 'low'
                    : 'safe';

    return {
      riskLevel,
      riskScore: score,
      indicators: reasons,
      recommendations: score >= 0.5
        ? ['Do not visit this URL. It shows multiple phishing indicators.']
        : score >= 0.25
          ? ['Proceed with caution. Verify this URL through official channels.']
          : ['URL appears safe, but always verify before entering sensitive information.'],
    };
  }

  // Analyze text and return a risk score
  analyze(text) {
    const safeText = String(text || '').trim();

    // Detect if input is a URL
    const isUrl = /^https?:\/\//i.test(safeText) ||
                  /^(www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(safeText);

    if (isUrl) {
      return this._analyzeUrl(safeText);
    }

    // Text / email analysis via Naive Bayes
    if (!this.isTrained) {
      console.warn('⚠️ ML Model not trained yet. Returning heuristic-only analysis.');
      return this._fallbackTextAnalysis(safeText);
    }

    try {
      const predictedLabel = this.classifier.classify(safeText);
      const classifications = this.classifier.getClassifications(safeText);
      const confidence = classifications.find(c => c.label === predictedLabel)?.value || 0;

      const riskScore = predictedLabel === 'phishing'
        ? 0.7 + (confidence * 0.3)
        : Math.max(0, 0.3 - (confidence * 0.3));

      const reasons = [];
      const lower = safeText.toLowerCase();

      if (predictedLabel === 'phishing') {
        reasons.push(`AI detected known phishing patterns with ${(confidence * 100).toFixed(1)}% confidence.`);
        if (/(urgent|immediate|act now|suspended|locked|verify|alert)/.test(lower))
          reasons.push('Uses urgent or threatening language to create panic.');
        if (/(password|login|credential|ssn|credit card|bank|account|pin|otp)/.test(lower))
          reasons.push('Requests sensitive personal or financial information.');
        if (/(http|www\.|bit\.ly|tinyurl|click here)/.test(lower))
          reasons.push('Contains suspicious links directing to external sites.');
        if (/(winner|lottery|prize|gift card|won|claim|reward)/.test(lower))
          reasons.push('Contains unrealistic promises typical of prize/lottery scams.');
        if (/(ecocash|mpesa|onemoney|innbucks|mukuru|western union|moneygram)/.test(lower))
          reasons.push('Requests payment via mobile money — common in African phishing scams.');
      } else {
        reasons.push(`AI determined content is likely safe with ${(confidence * 100).toFixed(1)}% confidence.`);
        reasons.push('No significant malicious language patterns detected.');
      }

      return {
        riskLevel: predictedLabel === 'phishing' ? 'high' : 'safe',
        riskScore: Math.max(0, Math.min(1, riskScore)),
        indicators: reasons,
        recommendations: predictedLabel === 'phishing'
          ? ['High probability of phishing. Do not interact with this content.']
          : ['Content appears safe, but always remain vigilant.'],
      };
    } catch (error) {
      console.error('⚠️ ML Classification Error:', error.message);
      return this._fallbackTextAnalysis(safeText);
    }
  }

  // Basic heuristic text analysis used when model isn't trained yet
  _fallbackTextAnalysis(text) {
    const lower = text.toLowerCase();
    let score = 0;
    const reasons = [];

    if (/(urgent|suspended|locked|verify now|act immediately|account disabled)/.test(lower)) { score += 0.3; reasons.push('Uses urgent/threatening language.'); }
    if (/(password|pin|otp|credit card|bank account|ssn|social security)/.test(lower)) { score += 0.25; reasons.push('Requests sensitive financial information.'); }
    if (/(winner|you have won|claim your prize|lottery|gift card)/.test(lower)) { score += 0.3; reasons.push('Makes unrealistic prize or lottery claims.'); }
    if (/(ecocash|mpesa|western union|send money|pay.*fee|processing fee)/.test(lower)) { score += 0.25; reasons.push('Requests payment via money transfer services.'); }
    if (/(bit\.ly|tinyurl|click here|http:\/\/)/.test(lower)) { score += 0.15; reasons.push('Contains suspicious links.'); }

    score = Math.min(1.0, score);
    if (reasons.length === 0) reasons.push('No obvious phishing patterns detected. AI model still loading.');

    return {
      riskLevel: score >= 0.5 ? 'high' : score >= 0.25 ? 'medium' : 'low',
      riskScore: score,
      indicators: reasons,
      recommendations: score >= 0.5
        ? ['Exercise caution — multiple phishing indicators detected.']
        : ['Appears low risk, but AI model is still loading for full analysis.'],
    };
  }
}

module.exports = new MLService();