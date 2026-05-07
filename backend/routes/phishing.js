const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const MLPythonBridge = require('../services/mlPythonBridge');
const db = require('../config/database');
const Tesseract = require('tesseract.js');
const { authenticate } = require('../middleware/auth');

// Initialize ML Bridge to Python server
const mlBridge = new MLPythonBridge('http://localhost:5000');
let mlBridgeReady = false;

// Check ML server on startup
mlBridge.healthCheck().then(ready => {
  mlBridgeReady = ready;
  if (ready) {
    console.log('✅ ML Python Bridge initialized and connected');
  } else {
    console.warn('⚠️  ML Python server not available yet (will auto-reconnect on requests)');
  }
});

/**
 * Strip phone UI chrome and OCR noise from extracted screenshot text.
 * Prevents status-bar tokens ("Battery 84%", "WiFi") from polluting ML features.
 */
function cleanOcrText(raw) {
  return raw
    .replace(/\b(battery|signal|wifi|bluetooth|notifications?|\d{1,3}%|\d{1,2}:\d{2}\s*(am|pm)?)\b/gi, '')
    .replace(/[^\x20-\x7E\n]/g, ' ')   // remove non-ASCII garbage chars
    .replace(/\b\w{1}\b/g, '')          // strip isolated single-char OCR artefacts
    .replace(/\s{2,}/g, ' ')            // collapse whitespace
    .trim();
}

/**
 * Format Python ML server response to unified analysis format
 */
function formatAnalysisResponse(mlResponse, contentType) {
  if (!mlResponse || !mlResponse.analysis) {
    return null;
  }

  const analysisData = mlResponse.analysis;
  const phishingProb = analysisData.phishing_probability || 0.5;
  const confidence = analysisData.confidence || 0;

  // Map risk level to recommendation
  const riskLevel = analysisData.risk_level || 'UNCERTAIN';
  const recommendation = analysisData.recommendation || 'Manual review required';

  // Build indicators from detected features
  const indicators = [];
  
  if (contentType === 'email' && mlResponse.features_detected) {
    const features = mlResponse.features_detected;
    
    if (features.urgency_indicators?.has_urgency) {
      indicators.push(`⚠️  Urgency language detected (${features.urgency_indicators.urgency_word_count} urgency keywords)`);
    }
    if (features.sender_indicators?.is_generic) {
      indicators.push('⚠️  Generic sender name (e.g., "Admin", "Support")');
    }
    if (features.sender_indicators?.suspicious_domain) {
      indicators.push('🚨 Sender domain is suspicious or use URL shortener');
    }
    if (features.url_indicators?.has_ip_url) {
      indicators.push('🚨 Contains direct IP address URL (common in phishing)');
    }
    if (features.url_indicators?.shortened_urls > 0) {
      indicators.push(`⚠️  Contains ${features.url_indicators.shortened_urls} shortened URL(s)`);
    }
    if (features.content_indicators?.requests_personal_info > 0) {
      indicators.push(`🚨 Requests sensitive information (${features.content_indicators.requests_personal_info} fields)`);
    }
    if (features.content_indicators?.has_forms) {
      indicators.push('🚨 Contains embedded forms to collect data');
    }
    if (features.content_indicators?.broken_grammar) {
      indicators.push('⚠️  Contains broken English or poor grammar');
    }
    if (features.content_indicators?.uses_authority_tactic) {
      indicators.push('⚠️  Impersonates known authority (bank, service provider, etc.)');
    }
  } else if (contentType === 'url' && mlResponse.structural_features) {
    const features = mlResponse.structural_features;
    
    if (features.is_ip_address) {
      indicators.push('🚨 URL is direct IP address (very suspicious)');
    }
    if (features.has_at_symbol) {
      indicators.push('🚨 URL contains @ symbol (can hide real domain)');
    }
    if (features.long_url) {
      indicators.push('⚠️  Unusually long URL');
    }
    if (features.deep_subdomain) {
      indicators.push('⚠️  Multiple subdomains (may hide real domain)');
    }
    if (features.uses_http) {
      indicators.push('⚠️  Uses plain HTTP (not encrypted)');
    }
    if (features.new_tld) {
      indicators.push('⚠️  Uses suspicious TLD (.tk, .ml, .ga, etc.)');
    }
    if (features.looks_like_typo) {
      indicators.push('🚨 Domain looks like common typo (e.g., "amaz0n")');
    }
    
    // Add reputation info
    if (mlResponse.reputation?.urlhaus_blacklisted) {
      indicators.push(`🚨 Blacklisted on URLhaus (threat: ${mlResponse.reputation.urlhaus_threat})`);
    }
  }

  // Add confidence info
  if (confidence < 0.2) {
    indicators.push('⚠️  Low confidence - manual review recommended');
  }

  if (indicators.length === 0) {
    indicators.push('No major phishing indicators detected');
  }

  // Map risk level
  const mappedRiskLevel = {
    'CRITICAL': 'critical',
    'HIGH': 'high',
    'MEDIUM': 'medium',
    'LOW': 'low',
    'UNCERTAIN': 'uncertain'
  }[riskLevel] || 'low';

  return {
    riskScore: phishingProb,
    riskLevel: mappedRiskLevel,
    confidence,
    indicators,
    recommendations: [recommendation],
    modelVersion: analysisData.model_version || 'ensemble-v2',
    topRisks: mlResponse.top_risks || [],
    timestamp: mlResponse.timestamp
  };
}

router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { content, type } = req.body; // type is 'url' or 'email'
    const database = db.getDb();

    let textToAnalyze = content;

    // 1. If it's an image, perform OCR to extract text
    if (type === 'image') {
      console.log('🖼️ Extracting text from image...');
      
      // Clean base64 string
      const isDataUrl = content.startsWith('data:image');
      const base64Data = isDataUrl ? content : `data:image/jpeg;base64,${content}`;
      const base64Raw = isDataUrl ? content.split(',')[1] : content;
      const mimeType = isDataUrl ? content.split(';')[0].split(':')[1] : 'image/jpeg';
      
      const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
      let extractedSuccessfully = false;

      // ATTEMPT 1-3: Multi-model Gemini Vision fallback chain
      if (geminiKey) {
        const axios = require('axios');
        const ocrPrompt = "You are an OCR engine. Extract all the text exactly as it appears in this image. Do not add any formatting, commentary, or markdown blocks. Just return the raw text.";
        const ocrBody = {
          contents: [{
            parts: [
              { text: ocrPrompt },
              { inline_data: { mime_type: mimeType, data: base64Raw } }
            ]
          }]
        };

        const OCR_PROVIDERS = [
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-2.0-flash-lite',
        ];

        for (const model of OCR_PROVIDERS) {
          if (extractedSuccessfully) break;
          try {
            console.log(`🤖 Attempting Gemini Vision OCR via ${model}...`);
            const response = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
              ocrBody,
              { timeout: 30000 }
            );
            const extracted = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (extracted) {
              textToAnalyze = extracted;
              extractedSuccessfully = true;
              console.log(`✅ Gemini Vision OCR success via ${model}!`);
            }
          } catch (err) {
            const status = err?.response?.status;
            if (status === 429) {
              console.warn(`⚠️ ${model} rate-limited (429). Trying next model...`);
            } else if (status === 404) {
              console.warn(`⚠️ ${model} not available (404). Trying next model...`);
            } else {
              console.warn(`⚠️ ${model} OCR failed: ${err.message}. Trying next model...`);
            }
          }
        }

        if (!extractedSuccessfully) {
          console.warn('⚠️ All Gemini Vision models failed. Trying Groq Vision...');
        }
      }

      // ATTEMPT 4: Groq Llama 4 Vision (free, uses existing GROQ_API_KEY)
      if (!extractedSuccessfully) {
        const groqKey = (process.env.GROQ_API_KEY || '').trim();
        if (groqKey) {
          try {
            const axios = require('axios');
            console.log('🤖 Attempting OCR via Groq Llama 4 Vision...');
            const groqResponse = await axios.post(
              'https://api.groq.com/openai/v1/chat/completions',
              {
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'You are an OCR engine. Extract all the text exactly as it appears in this image. Do not add any formatting, commentary, or markdown blocks. Just return the raw text.'
                    },
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${base64Raw}` }
                    }
                  ]
                }],
                temperature: 0,
                max_tokens: 2048,
              },
              {
                headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
                timeout: 30000,
              }
            );
            const extracted = groqResponse.data.choices[0].message.content.trim();
            if (extracted) {
              textToAnalyze = extracted;
              extractedSuccessfully = true;
              console.log('✅ Groq Vision OCR success!');
            }
          } catch (groqErr) {
            const status = groqErr?.response?.status;
            if (status === 429) {
              console.warn('⚠️ Groq Vision rate-limited (429). Falling back to Tesseract...');
            } else {
              console.warn(`⚠️ Groq Vision OCR failed: ${groqErr.message}. Falling back to Tesseract...`);
            }
          }
        }
      }

      // ATTEMPT 5: Tesseract.js local fallback (~70% accuracy on complex screenshots)
      if (!extractedSuccessfully) {
        let worker = null;
        try {
          console.log('⚙️ Running local Tesseract.js OCR (last resort)...');
          // Create worker properly with error handling
          worker = await Tesseract.createWorker();
          
          // Use Buffer or data URL - Tesseract prefers data URLs
          const { data: { text } } = await worker.recognize(base64Data);
          textToAnalyze = cleanOcrText(text);   // clean before analysis
          console.log('✅ Tesseract OCR success!');
          extractedSuccessfully = true;
        } catch (tesseractErr) {
          console.error(`⚠️ Tesseract OCR failed: ${tesseractErr.message}`);
          textToAnalyze = ''; // Set to empty so we return proper error below
        } finally {
          // Always terminate worker to prevent process hang
          if (worker) {
            try {
              await worker.terminate();
            } catch (e) {
              console.warn('⚠️ Worker termination warning:', e.message);
            }
          }
        }
      }
      
      console.log(`📝 Extracted Text Preview: ${textToAnalyze.substring(0, 100).replace(/\n/g, ' ')}...`);
      
      if (!textToAnalyze) {
        return res.status(400).json({ error: 'Could not extract any text from the image. Please try a clearer screenshot.' });
      }
    }

    // 2. Intelligent model selection based on content type
    console.log('🧠 Invoking ML analysis (ensemble models with confidence scoring)...');
    
    let analysis = null;
    const isUrl = /^https?:\/\//i.test(textToAnalyze) ||
                  /^(www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(textToAnalyze);

    // Ensure ML bridge is connected
    if (!mlBridgeReady) {
      const connected = await mlBridge.healthCheck();
      mlBridgeReady = connected;
    }

    try {
      if (isUrl) {
        // URL analysis with reputation checks
        console.log('🔗 Analyzing as URL...');
        const urlAnalysis = await mlBridge.analyzeUrl(textToAnalyze);
        analysis = formatAnalysisResponse(urlAnalysis, 'url');
      } else {
        // Email analysis with sender/subject context
        console.log('📧 Analyzing as email...');
        const emailAnalysis = await mlBridge.analyzeEmail(
          textToAnalyze,
          req.body.sender || '',
          req.body.subject || ''
        );
        analysis = formatAnalysisResponse(emailAnalysis, 'email');
      }

      if (!analysis) {
        throw new Error('Invalid analysis response from ML server');
      }

      console.log(`✅ Analysis complete: ${analysis.riskLevel} (${(analysis.riskScore*100).toFixed(1)}% phishing probability)`);
    } catch (mlErr) {
      console.error('❌ ML Analysis Error:', mlErr.message);
      analysis = {
        riskLevel: 'uncertain',
        riskScore: 0.5,
        indicators: ['Analysis service temporarily unavailable. Manual review recommended.'],
        recommendations: ['Please verify this content through official channels before taking action.'],
        error: mlErr.message
      };
    }

    // 3. Save the results directly to Firebase Realtime Database
    const recordId = uuidv4();
    await database.ref('analysis_history').child(recordId).set({
      id: recordId,
      inputType: type || 'text',
      inputContent: type === 'image' ? '[Screenshot Data]' : (typeof textToAnalyze === 'string' ? textToAnalyze : JSON.stringify(textToAnalyze || '')),
      riskScore: analysis.riskScore || 0,
      riskLevel: analysis.riskLevel || 'safe',
      indicators: analysis.indicators || ['No indicators provided'],
      recommendations: analysis.recommendations || ['No recommendations provided'],
      createdAt: new Date().toISOString()
    });

    res.json({ analysis });
  } catch (error) {
    console.error('\n[Troubleshooting] Backend Analysis Error:');
    console.error('-> Message:', error.message);
    console.error('-> Stack:', error.stack);
    res.status(500).json({ error: 'Failed to analyze content', details: error.message });
  }
});

module.exports = router;
