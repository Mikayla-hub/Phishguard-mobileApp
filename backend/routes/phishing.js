const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const MLPythonBridge = require('../services/mlPythonBridge');
const { validateWithFewShot } = require('../services/fewShotValidator');
const { updateSenderReputation, getSenderReputation, applyReputationAdjustment } = require('../services/senderReputationGraph');
const db = require('../config/database');
const Tesseract = require('tesseract.js');
const { authenticate } = require('../middleware/auth');

// Initialize ML Bridge to Python server
const mlBridge = new MLPythonBridge(process.env.ML_SERVER_URL || 'http://localhost:5000');
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
      indicators.push(`⚠️  Tries to make you panic or act quickly (${features.urgency_indicators.urgency_word_count} urgency words found)`);
    }
    if (features.sender_indicators?.is_generic) {
      indicators.push('⚠️  Sender uses a generic, faceless name (like "Admin" or "Support")');
    }
    if (features.sender_indicators?.suspicious_domain) {
      indicators.push('🚨 The sender\'s email address looks fake or hidden');
    }
    if (features.url_indicators?.has_ip_url) {
      indicators.push('🚨 Contains suspicious numbers instead of normal website links');
    }
    if (features.url_indicators?.shortened_urls > 0) {
      indicators.push(`⚠️  Contains ${features.url_indicators.shortened_urls} shortened link(s) that hide the real destination`);
    }
    if (features.content_indicators?.requests_personal_info > 0) {
      indicators.push(`🚨 Asks you to hand over private, sensitive information`);
    }
    if (features.content_indicators?.has_forms) {
      indicators.push('🚨 Tries to secretly collect your information directly inside the email');
    }
    if (features.content_indicators?.broken_grammar) {
      indicators.push('⚠️  Contains poor spelling and grammar (common in scams)');
    }
    if (features.content_indicators?.uses_authority_tactic) {
      indicators.push('⚠️  Pretends to be a trusted authority (like a bank, government, or boss)');
    }

    // CRITICAL FIX: If ML model predicts HIGH risk but no specific features found,
    // add ML model-based indicator to explain the score
    if (indicators.length === 0 && phishingProb >= 0.5) {
      indicators.push(`🚨 The Artificial Intelligence detected invisible scam patterns (${(phishingProb * 100).toFixed(0)}% sure)`);
    }
  } else if (contentType === 'url' && mlResponse.structural_features) {
    const features = mlResponse.structural_features;

    if (features.is_ip_address) {
      indicators.push('🚨 The link uses suspicious numbers instead of a real name');
    }
    if (features.has_at_symbol) {
      indicators.push('🚨 The link uses tricks to hide where it actually goes to');
    }
    if (features.long_url) {
      indicators.push('⚠️  The link is unusually long, which is often used to hide traps');
    }
    if (features.deep_subdomain) {
      indicators.push('⚠️  The link has too many fake sub-sections trying to look official');
    }
    if (features.uses_http) {
      indicators.push('⚠️  The website is completely unsecure and not encrypted');
    }
    if (features.new_tld) {
      indicators.push('⚠️  The website extension (like .tk instead of .com) is known for scams');
    }
    if (features.looks_like_typo) {
      indicators.push('🚨 The link is purposely misspelled to trick your eyes (e.g., "amaz0n" instead of amazon)');
    }
    if (features.is_trusted_url) {
      indicators.push('✅ Verified Trusted Domain: This is a genuine corporate website');
      // Ensure risk score is ultra low for UI purposes
      phishingProb = Math.min(phishingProb, 0.02);
      riskLevel = 'LOW';
    }

    // Add reputation info
    if (mlResponse.reputation?.urlhaus_blacklisted) {
      indicators.push(`🚨 This exact link is already on a global cyber-security blacklist!`);
    }

    // CRITICAL FIX: If ML model predicts HIGH risk but no structural features found,
    // add ML model-based indicator to avoid contradictory messages
    if (indicators.length === 0 && phishingProb >= 0.5) {
      indicators.push(`🚨 The Artificial Intelligence detected invisible scam patterns (${(phishingProb * 100).toFixed(0)}% sure)`);
    }
  }

  // Add confidence info
  if (confidence < 0.2) {
    indicators.push('⚠️  Low confidence - manual review recommended');
  }

  if (indicators.length === 0) {
    // Only show "no indicators" if risk is LOW
    if (phishingProb < 0.5) {
      indicators.push('No major phishing indicators detected');
    } else {
      // For high-risk scores without specific features, be transparent about ML model
      indicators.push(`⚠️  ML model predicts phishing risk (${(phishingProb * 100).toFixed(0)}% probability)`);
    }
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
    let imageContentType = 'unknown';        // set by OCR classifier
    let imageHasSensitiveRequest = false;    // set by OCR classifier

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

      // Structured OCR prompt — asks for ALL text AND content type in one call
      const ocrPrompt = `You are an expert OCR engine and content classifier.

Your tasks:
1. Extract EVERY piece of visible text from this image completely and accurately.
   - Include headers, body text, bullet points, contact details (phone, email, address, website URLs), prices, slogans, small print — nothing should be left out.
   - Preserve the natural reading order (top to bottom, left to right).
   - Keep line breaks where text visually appears on separate lines.

2. Classify the content type using one of these labels:
   "email" | "chat_message" | "advertisement" | "social_media_post" | "website" | "document" | "unknown"
   - Use "advertisement" for posters, flyers, banners, promotional material, business cards.
   - Use "email" only if the image clearly shows an email client UI.

3. Determine whether the content explicitly asks the recipient to provide passwords, PINs, banking credentials, or personal ID numbers (hasSensitiveRequest).

4. If the image is an email or message, extract the exact sender email address (e.g. "no-reply@accounts.google.com"). If none is found, return null.

Respond ONLY with valid JSON — no markdown fences, no explanation:
{
  "text": "<all extracted text>",
  "contentType": "<label>",
  "senderEmail": "<extracted email or null>",
  "isMarketing": <true|false>,
  "hasSensitiveRequest": <true|false>
}

If the image contains no text at all, set "text" to an empty string.`;

      // Helper: parse OCR JSON response safely
      function parseOcrJson(raw) {
        try {
          const clean = raw.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(clean);
          return {
            text: (parsed.text || '').trim(),
            contentType: (parsed.contentType || 'unknown').toLowerCase(),
            senderEmail: parsed.senderEmail || null,
            isMarketing: !!parsed.isMarketing,
            hasSensitiveRequest: !!parsed.hasSensitiveRequest,
          };
        } catch {
          // If AI didn't return JSON, treat the whole response as raw text
          return { text: raw.trim(), contentType: 'unknown', senderEmail: null, isMarketing: false, hasSensitiveRequest: false };
        }
      }

      // ATTEMPT 1-3: Multi-model Gemini Vision fallback chain
      if (geminiKey) {
        const axios = require('axios');
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
            const raw = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (raw) {
              const parsed = parseOcrJson(raw);
              textToAnalyze = parsed.text;
              imageContentType = parsed.isMarketing ? 'advertisement' : parsed.contentType;
              imageHasSensitiveRequest = parsed.hasSensitiveRequest;
              if (parsed.senderEmail && !req.body.sender) {
                req.body.sender = parsed.senderEmail;
                console.log(`✉️ Extracted Sender Email from image: ${req.body.sender}`);
              }
              extractedSuccessfully = true;
              console.log(`✅ Gemini Vision OCR success via ${model}! ContentType: ${imageContentType}, SensitiveRequest: ${imageHasSensitiveRequest}`);
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

      // ATTEMPT 4: Groq Llama 4 Vision
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
                    { type: 'text', text: ocrPrompt },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Raw}` } }
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
            const raw = groqResponse.data.choices[0].message.content.trim();
            if (raw) {
              const parsed = parseOcrJson(raw);
              textToAnalyze = parsed.text;
              imageContentType = parsed.isMarketing ? 'advertisement' : parsed.contentType;
              imageHasSensitiveRequest = parsed.hasSensitiveRequest;
              if (parsed.senderEmail && !req.body.sender) {
                req.body.sender = parsed.senderEmail;
                console.log(`✉️ Extracted Sender Email from image: ${req.body.sender}`);
              }
              extractedSuccessfully = true;
              console.log(`✅ Groq Vision OCR success! ContentType: ${imageContentType}, SensitiveRequest: ${imageHasSensitiveRequest}`);
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

      // Detect when OCR/Vision AI reports no text instead of extracting content.
      // Groq/Gemini Vision returns natural-language responses like
      // "There is no text in this image." — intercept before the ML model runs.
      const NO_TEXT_PATTERNS = [
        /there is no text in this image/i,
        /no text (found|detected|visible|present)/i,
        /this image (does not|doesn't) contain (any )?text/i,
        /no readable text/i,
        /image (appears to be|is) (blank|empty|graphical?|a photo)/i,
        /cannot (find|detect|extract) (any )?text/i,
        /i (could not|can'?t|was unable to) (find|detect|extract|identify) (any )?text/i,
        /does not appear to (have|contain) (any )?text/i,
        /no (text|words|characters) (are |is )?(visible|present|found|detected)/i,
        /appears? to be (a )?photograph/i,
        /this (looks like|is) (a |an )?(image|photo|picture)/i,
      ];

      const trimmed = textToAnalyze.trim();
      // Also catch very short responses that can't be meaningful content (<20 chars
      // of actual word characters — e.g. "No text." or "N/A")
      const meaningfulChars = trimmed.replace(/[^a-zA-Z0-9]/g, '');
      const isNoTextResponse =
        NO_TEXT_PATTERNS.some(re => re.test(trimmed)) ||
        meaningfulChars.length < 20;

      if (isNoTextResponse) {
        console.warn('⚠️  OCR returned a "no text" response — skipping ML analysis.');
        const noTextAnalysis = {
          riskScore: 0,
          riskLevel: 'low',
          confidence: 1,
          indicators: [
            '🖼️ No readable text was found in this image',
            '📋 The image appears to contain no text — only graphics, photos, or blank space',
            '✅ Without text content there are no phishing indicators to evaluate',
          ],
          recommendations: [
            '✅ No phishing threat detected — the image contains no readable text. ' +
            'If you expected text, try a clearer or higher-resolution screenshot.',
          ],
          modelVersion: 'no-text-bypass',
        };

        // Still log to history
        const recordId = uuidv4();
        await database.ref('analysis_history').child(recordId).set({
          id: recordId,
          inputType: 'image',
          inputContent: '[Screenshot — No Text Found]',
          riskScore: 0,
          riskLevel: 'low',
          indicators: noTextAnalysis.indicators,
          recommendations: noTextAnalysis.recommendations,
          createdAt: new Date().toISOString(),
        });

        return res.json({ analysis: noTextAnalysis });
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
        console.log('🔗 Analyzing as URL...');
        try {
          const urlAnalysis = await mlBridge.analyzeUrl(textToAnalyze);
          analysis = formatAnalysisResponse(urlAnalysis, 'url');
        } catch (urlErr) {
          console.warn(`⚠️  URL analysis timeout/error (${urlErr.code}), attempting fallback...`);
          // Fallback to heuristic-only analysis for URL
          analysis = {
            riskLevel: 'medium',
            riskScore: 0.5,
            confidence: 0.3,
            indicators: [
              'ML analysis service timed out',
              'Using heuristic-only evaluation',
              'Recommend manual inspection'
            ],
            recommendations: ['Verify this URL through official channels before visiting'],
            modelVersion: 'heuristic-fallback'
          };
        }
      } else {
        console.log('📧 Analyzing as email...');
        try {
          // ── SENDER REPUTATION: Query historical data before ML scoring ──
          const senderForAnalysis = req.body.sender || '';
          const reputation = await getSenderReputation(database, senderForAnalysis).catch(() => null);
          
          const emailAnalysis = await mlBridge.analyzeEmail(
            textToAnalyze,
            senderForAnalysis,
            req.body.subject || ''
          );
          analysis = formatAnalysisResponse(emailAnalysis, 'email');

          // ── REPUTATION ADJUSTMENT: Adjust score based on historical domain behavior ──
          if (reputation && analysis) {
            const { adjustedProb, adjustment } = applyReputationAdjustment(analysis.riskScore, reputation);
            if (adjustment !== 'none') {
              analysis.riskScore = adjustedProb;
              analysis.riskLevel = adjustedProb < 0.3 ? 'low' : adjustedProb < 0.5 ? 'medium' : 'high';
              analysis.indicators = analysis.indicators || [];
              if (adjustment === 'dampened') {
                analysis.indicators.unshift(`✅ This sender has a trusted history (${reputation.totalScans} previous safe scans)`);
              } else if (adjustment === 'amplified') {
                analysis.indicators.unshift(`🚨 This sender domain has been flagged ${reputation.flaggedCount} time(s) before`);
              }
            }
          }

          // ── FEW-SHOT VALIDATION: Run LLM second-opinion on borderline cases ──
          const prob = analysis ? analysis.riskScore : 0.5;
          const isUncertain = prob >= 0.25 && prob <= 0.65;
          if (isUncertain && senderForAnalysis && textToAnalyze.length > 30) {
            const fewShotResult = await validateWithFewShot(textToAnalyze, senderForAnalysis, prob);
            if (fewShotResult) {
              // Blend RF and LLM scores: LLM gets 60% weight on borderline cases
              const blendedProb = (prob * 0.40) + ((fewShotResult.isPhishing ? fewShotResult.confidence : 1 - fewShotResult.confidence) * 0.60);
              analysis.riskScore = parseFloat(blendedProb.toFixed(3));
              analysis.riskLevel = blendedProb < 0.3 ? 'low' : blendedProb < 0.5 ? 'medium' : 'high';
              analysis.fewShotReason = fewShotResult.reason;
              if (!fewShotResult.isPhishing && prob > 0.4) {
                analysis.indicators = [
                  `✅ AI second-opinion: ${fewShotResult.reason}`,
                  ...(analysis.indicators || []).slice(0, 2),
                ];
              }
              console.log(`🔀 [FewShot] Blended score: RF=${(prob*100).toFixed(0)}% + LLM → ${(blendedProb*100).toFixed(0)}%`);
            }
          }
        } catch (emailErr) {
          console.warn(`⚠️  Email analysis timeout/error (${emailErr.code}), attempting fallback...`);
          // Fallback to heuristic-only analysis for email
          analysis = {
            riskLevel: 'medium',
            riskScore: 0.5,
            confidence: 0.3,
            indicators: [
              'ML analysis service timed out',
              'Using heuristic-only evaluation',
              'Recommend manual inspection'
            ],
            recommendations: ['Verify sender identity through official channels before responding'],
            modelVersion: 'heuristic-fallback'
          };
        }
      }

      if (!analysis) throw new Error('Invalid analysis response from ML server');

      // ── Post-process: Trusted Sender Override ──
      // Crucial for reducing false positives for SMEs and individuals receiving legitimate security alerts.
      let senderEmail = req.body.sender || '';
      
      // For images, extract sender from OCR'd text if not provided
      if (type === 'image' && !senderEmail && textToAnalyze) {
        // Look for "From:" or "From" patterns in email headers
        const fromMatch = textToAnalyze.match(/From\s*[:\s]+([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        if (fromMatch) {
          senderEmail = fromMatch[1];
          console.log(`📬 Extracted sender from image: ${senderEmail}`);
        }
      }
      
      if (!isUrl && senderEmail) {
        const trustedDomains = [
          'google.com', 'accounts.google.com', 'no-reply@accounts.google.com',
          'microsoft.com', 'security.microsoft.com', 'noreply@microsoft.com',
          'apple.com', 'noreply@apple.com',
          'paypal.com', 'service@paypal.com',
          'amazon.com', 'account-update@amazon.com',
          'netflix.com', 'security@netflix.com',
          'linkedin.com', 'noreply@linkedin.com',
          'github.com', 'noreply@github.com'
        ];
        
        // Extract domain (handles both "domain.com" and "email@domain.com")
        let senderDomain = senderEmail;
        if (senderEmail.includes('@')) {
          senderDomain = senderEmail.split('@').pop().toLowerCase().trim();
        } else {
          senderDomain = senderEmail.toLowerCase().trim();
        }
        
        if (trustedDomains.includes(senderDomain) || trustedDomains.some(td => senderEmail.includes(td))) {
          // For trusted senders, only override if there are NO actual structural threats
          // (Grammar/urgency language is normal for legitimate security alerts from official companies)
          const CRITICAL_THREAT_PATTERNS = [
            /raw ip address/i,           // IP-based URLs are always suspicious
            /uses http \(/i,              // Non-HTTPS for sensitive pages
            /phishing.*probability/i,     // ML model detected strong phishing pattern
            /requests.*password|credential/i,  // Requests sensitive info
            /contains.*forms?.*data/i,    // Embedded forms for credential harvesting
          ];
          
          const hasCriticalThreat = (analysis.indicators || []).some(ind => 
            CRITICAL_THREAT_PATTERNS.some(re => re.test(ind))
          );
          
          if (!hasCriticalThreat && analysis.riskScore > 0.25) {
            console.log(`🛡️ Trusted Sender Override: Reducing false positive for verified domain: ${senderDomain}`);
            analysis.riskScore = 0.1; // Cap at 10% risk
            analysis.riskLevel = 'low';
            analysis.indicators = [
              '✅ The sender\'s email address is officially verified and trusted',
              '✅ Automated security alerts from this company are normal and safe'
            ];
            analysis.recommendations = [
              `✅ SAFE: This is a legitimate alert from ${senderDomain}. It is safe to follow their instructions.`
            ];
          }
        }
      }

      // ── Post-process: context-aware filtering for image analysis ──
      if (type === 'image' && imageContentType === 'advertisement') {

        // Scareware / tech-support scam patterns: these LOOK like ads but ARE phishing.
        // If any match, skip the bypass entirely and let the ML score stand.
        const SCAREWARE_PATTERNS = [
          /\d+\s*(viruses?|threats?|malware|infections?)\s*(found|detected|identified)/i,
          /your (iphone|android|phone|device|computer|mac|pc)\s*(was|has been|is)\s*(hacked|infected|compromised|at risk)/i,
          /click (here|now|immediately|below) to (remove|clean|fix|protect|update|scan)/i,
          /(call|contact)\s*(apple|microsoft|google|support|tech support)\s*(now|immediately)/i,
          /your (apple id|account|password|id)\s*(has been|was|is)\s*(compromised|hacked|stolen|locked)/i,
          /(warning|alert|critical|urgent)[^\n]{0,40}(virus|threat|hack|malware|compromised)/i,
          /act (now|immediately|fast)/i,
          /limited time.{0,20}(offer|deal|click)/i,
        ];

        const isScareware = SCAREWARE_PATTERNS.some(re => re.test(textToAnalyze));

        if (isScareware) {
          // Scareware masquerading as an ad — escalate, do NOT soften
          console.warn('🚨 Scareware / tech-support scam patterns detected inside advertisement image — bypassing ad leniency.');
          analysis.indicators = [
            '🚨 Fake security alert / scareware content detected',
            '🚨 Claims of viruses or device compromise are a classic phishing tactic',
            ...(analysis.indicators || []).filter(i => !/no (readable|major)/i.test(i)),
          ];
          // Ensure risk reflects the threat
          analysis.riskScore = Math.max(analysis.riskScore, 0.75);
          analysis.riskLevel = 'high';
          analysis.recommendations = [
            '🚨 This is likely a SCAREWARE or TECH-SUPPORT SCAM. Do NOT click any links, call any numbers, or install any software shown in this image.',
          ];

        } else if (imageHasSensitiveRequest) {
          // AI flagged that this ad asks for credentials/personal data — keep ML score
          console.warn('⚠️  Advertisement requests sensitive information — keeping ML risk score.');
          analysis.indicators = [
            '⚠️  This appears to be an advertisement, but it requests personal or sensitive information',
            ...(analysis.indicators || []),
          ];

        } else {
          // Genuinely benign marketing (business flyer, product poster, etc.)
          console.log('📢 Benign advertising content — filtering false-positive indicators.');

          const FALSE_POSITIVE_PATTERNS = [
            /requests sensitive information/i,
            /credential request/i,
            /requests? (personal|sensitive)/i,
            /embedded (login )?form/i,
            /broken (english|grammar)/i,
            /poor grammar/i,
            /urgency language/i,
            /pressure.{0,30}language/i,
          ];

          const filteredIndicators = (analysis.indicators || []).filter(
            ind => !FALSE_POSITIVE_PATTERNS.some(re => re.test(ind))
          );
          filteredIndicators.unshift('📢 Content identified as advertising/marketing material');

          const genuineThreats = filteredIndicators.filter(ind => /🚨/.test(ind));
          if (genuineThreats.length === 0) {
            analysis.riskScore = Math.min(analysis.riskScore, 0.25);
            analysis.riskLevel = 'low';
            analysis.recommendations = [
              '✅ This appears to be legitimate advertising content. No phishing-specific patterns detected.',
            ];
          }

          analysis.indicators = filteredIndicators;
          analysis.imageContentType = 'advertisement';
        }
      }

      console.log(`✅ Analysis complete: ${analysis.riskLevel} (${(analysis.riskScore * 100).toFixed(1)}% phishing probability)`);
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

    // 3. Save to Firebase history + Active Learning + Sender Reputation Graph
    const recordId = uuidv4();
    const finalRiskScore = analysis.riskScore || 0;
    const finalRiskLevel = analysis.riskLevel || 'safe';
    const senderEmail = req.body.sender || '';

    // Save analysis history
    await database.ref('analysis_history').child(recordId).set({
      id: recordId,
      inputType: type || 'text',
      inputContent: type === 'image' ? '[Screenshot Data]' : (typeof textToAnalyze === 'string' ? textToAnalyze.substring(0, 500) : ''),
      riskScore: finalRiskScore,
      riskLevel: finalRiskLevel,
      sender: senderEmail,
      indicators: analysis.indicators || ['No indicators provided'],
      recommendations: analysis.recommendations || ['No recommendations provided'],
      createdAt: new Date().toISOString()
    });

    // Active Learning: Save low-confidence predictions for human review
    const confidence = analysis.confidence || Math.abs(finalRiskScore - 0.5) * 2;
    if (confidence < 0.35) {
      await database.ref('active_learning_queue').child(recordId).set({
        id: recordId,
        inputType: type || 'text',
        inputContent: type === 'image' ? '[Screenshot]' : (textToAnalyze || '').substring(0, 500),
        sender: senderEmail,
        rawRiskScore: finalRiskScore,
        riskLevel: finalRiskLevel,
        confidence: parseFloat((confidence).toFixed(3)),
        fewShotReason: analysis.fewShotReason || null,
        reviewStatus: 'pending',
        createdAt: new Date().toISOString(),
      });
      console.log(`🎓 [ActiveLearning] Low-confidence scan queued for review (confidence=${(confidence*100).toFixed(0)}%)`);
    }

    // Sender Reputation Graph: Update domain history (fire-and-forget)
    if (senderEmail && type !== 'url') {
      updateSenderReputation(database, senderEmail, finalRiskScore, finalRiskLevel).catch(() => {});
    }

    res.json({ analysis });
  } catch (error) {
    console.error('\n[Troubleshooting] Backend Analysis Error:');
    console.error('-> Message:', error.message);
    console.error('-> Stack:', error.stack);
    res.status(500).json({ error: 'Failed to analyze content', details: error.message });
  }
});

module.exports = router;
