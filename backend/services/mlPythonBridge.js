/**
 * ML Python Bridge Service
 * Connects Node.js backend to Python ML server
 * Provides high-level API for phishing analysis with confidence scoring
 */

const axios = require('axios');

class MLPythonBridge {
  constructor(pythonServerUrl = 'http://localhost:5000', retries = 3, timeout = 10000) {
    this.baseUrl = pythonServerUrl;
    this.retries = retries;
    this.timeout = timeout;
    this.isConnected = false;
    this.requestCache = new Map();
    this.cacheExpiry = 0; // Disabled cache entirely for debugging
  }

  /**
   * Check if ML server is running
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`, {
        timeout: 5000
      });
      this.isConnected = response.status === 200;
      console.log('🔗 ML Server connected:', this.isConnected ? '✅' : '❌');
      return this.isConnected;
    } catch (error) {
      this.isConnected = false;
      console.warn('⚠️  ML Server unavailable:', error.message);
      return false;
    }
  }

  /**
   * Analyze email for phishing with confidence scores
   * @param {string} emailText - Email body content
   * @param {string} sender - Sender email address
   * @param {string} subject - Email subject
   * @returns {Object} Analysis result with probabilities and risk level
   */
  async analyzeEmail(emailText, sender = '', subject = '') {
    try {
      if (!emailText) throw new Error('Email text is required');

      // Create cache key
      const cacheKey = `email:${this.hashString(emailText + sender + subject)}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log('📦 Using cached email analysis');
        return cached.data;
      }

      // Send request with retries
      let lastError;
      for (let attempt = 0; attempt < this.retries; attempt++) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/api/analyze/email`,
            {
              content: emailText,
              sender,
              subject
            },
            { timeout: this.timeout }
          );

          const result = response.data;

          // Cache result
          this.requestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });

          return result;
        } catch (err) {
          lastError = err;
          if (attempt < this.retries - 1) {
            console.warn(`⚠️  Attempt ${attempt + 1} failed, retrying...`);
            await this.sleep(1000 * (attempt + 1));
          }
        }
      }

      throw lastError || new Error('Email analysis failed after retries');
    } catch (error) {
      console.error('Error analyzing email:', error.message);
      return this.getFallbackResponse('email', 0.5, 'Analysis service unavailable');
    }
  }

  /**
   * Analyze URL for phishing
   * @param {string} url - URL to analyze
   * @returns {Object} Analysis with reputation and risk
   */
  async analyzeUrl(url) {
    try {
      if (!url) throw new Error('URL is required');

      // Cache check
      const cacheKey = `url:${url}`;
      const cached = this.requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        console.log('📦 Using cached URL analysis');
        return cached.data;
      }

      // Request with retries
      let lastError;
      for (let attempt = 0; attempt < this.retries; attempt++) {
        try {
          const response = await axios.post(
            `${this.baseUrl}/api/analyze/url`,
            { url },
            { timeout: this.timeout }
          );

          const result = response.data;

          this.requestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });

          return result;
        } catch (err) {
          lastError = err;
          if (attempt < this.retries - 1) {
            await this.sleep(1000 * (attempt + 1));
          }
        }
      }

      throw lastError;
    } catch (error) {
      console.error('Error analyzing URL:', error.message);
      return this.getFallbackResponse('url', 0.5, 'URL analysis unavailable');
    }
  }

  /**
   * Analyze generic text (email or URL)
   * @param {string} text - Text to analyze
   * @returns {Object} Analysis result
   */
  async analyzeText(text) {
    try {
      if (!text) throw new Error('Text is required');

      const response = await axios.post(
        `${this.baseUrl}/api/analyze/text`,
        { text },
        { timeout: this.timeout }
      );

      return response.data;
    } catch (error) {
      console.error('Error analyzing text:', error.message);
      return this.getFallbackResponse('text', 0.5, 'Text analysis unavailable');
    }
  }

  /**
   * Batch analyze multiple items
   * @param {Array} items - Array of { type, content/url }
   * @returns {Object} Batch results
   */
  async batchAnalyze(items) {
    try {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Items array is required');
      }

      const response = await axios.post(
        `${this.baseUrl}/api/batch/analyze`,
        { items },
        { timeout: this.timeout * items.length }
      );

      return response.data;
    } catch (error) {
      console.error('Error in batch analysis:', error.message);
      return { batch_results: [], error: error.message };
    }
  }

  /**
   * Get model statistics
   * @returns {Object} Model info, accuracy, training samples
   */
  async getModelStats() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/models/stats`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      console.error('Error getting model stats:', error.message);
      return {};
    }
  }

  /**
   * Parse analysis result into standardized format
   * @param {Object} analysis - Raw analysis response
   * @returns {Object} Standardized result
   */
  parseAnalysisResult(analysis) {
    if (!analysis || !analysis.analysis) {
      return null;
    }

    const data = analysis.analysis;

    return {
      phishingProbability: data.phishing_probability || 0,
      safeProbability: data.safe_probability || 1,
      confidence: data.confidence || 0,
      riskLevel: data.risk_level || 'LOW',
      recommendation: data.recommendation || 'Unable to analyze',
      topRisks: analysis.top_risks || [],
      features: {
        email: analysis.features_detected,
        url: analysis.structural_features
      },
      modelVersion: data.model_version || 'unknown',
      timestamp: data.timestamp || new Date().toISOString()
    };
  }

  /**
   * Get fallback response when ML server is unavailable
   * Uses simple heuristics
   */
  getFallbackResponse(type, defaultProb, message) {
    return {
      analysis: {
        phishing_probability: defaultProb,
        safe_probability: 1 - defaultProb,
        confidence: 0,
        risk_level: 'UNCERTAIN',
        recommendation: `⚠️  ${message}. Manual review recommended.`,
        model_version: 'fallback-heuristic',
        error: message
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Calculate simple string hash for caching
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.requestCache.clear();
    console.log('🧹 Cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.requestCache.size,
      maxEntries: this.requestCache.size,
      expiry: this.cacheExpiry
    };
  }
}

module.exports = MLPythonBridge;
