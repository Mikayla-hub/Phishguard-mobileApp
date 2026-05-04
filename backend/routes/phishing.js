const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mlService = require('../services/mlService');
const mlClient = require('../services/mlClient');
const db = require('../config/database');
const Tesseract = require('tesseract.js');
const { authenticate } = require('../middleware/auth');

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
            const extracted = response.data.candidates[0].content.parts[0].text.trim();
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
        console.log('⚙️ Running local Tesseract.js OCR (last resort)...');
        const { data: { text } } = await Tesseract.recognize(base64Data, 'eng');
        textToAnalyze = cleanOcrText(text);   // clean before analysis
      }
      
      console.log(`📝 Extracted Text Preview: ${textToAnalyze.substring(0, 100).replace(/\n/g, ' ')}...`);
      
      if (!textToAnalyze) {
        return res.status(400).json({ error: 'Could not extract any text from the image. Please try a clearer screenshot.' });
      }
    }

    // 2. Dual-model analysis pipeline:
    //    a) Fast Naive Bayes (Node.js, always available)
    //    b) High-accuracy Random Forest (Python FastAPI, preferred when available)
    const nbAnalysis = mlService.analyze(textToAnalyze);

    // Attempt the Python Random Forest model for higher accuracy
    let rfResult = null;
    const isUrl = /^https?:\/\//i.test(textToAnalyze) ||
                  /^(www\.|[a-z0-9-]+\.[a-z]{2,})/i.test(textToAnalyze);

    try {
      if (isUrl) {
        rfResult = await mlClient.analyzeUrl(textToAnalyze);
      } else {
        rfResult = await mlClient.analyzeEmail({ body: textToAnalyze });
      }
    } catch (rfErr) {
      console.warn('⚠️ Python RF model unavailable, using Naive Bayes only:', rfErr.message);
    }

    // Weighted ensemble: RF (70%) + NB (30%) when both are available
    let analysis;
    if (rfResult && rfResult.phishingProbability !== undefined) {
      const rfScore  = rfResult.phishingProbability;
      const nbScore  = nbAnalysis.riskScore;
      const blended  = (rfScore * 0.70) + (nbScore * 0.30);
      const rfLevel  = blended >= 0.75 ? 'critical'
                     : blended >= 0.5  ? 'high'
                     : blended >= 0.25 ? 'medium'
                     : blended >= 0.1  ? 'low'
                     : 'safe';
      analysis = {
        riskLevel: rfLevel,
        riskScore: blended,
        indicators: [
          `Ensemble model: ${(blended * 100).toFixed(1)}% phishing probability (RF ${(rfScore*100).toFixed(1)}% × 70% + NB ${(nbScore*100).toFixed(1)}% × 30%).`,
          ...nbAnalysis.indicators,
        ],
        recommendations: blended >= 0.5
          ? ['High probability of phishing. Do not interact with this content.']
          : blended >= 0.25
            ? ['Proceed with caution. Verify through official channels.']
            : ['Content appears safe, but always remain vigilant.'],
      };
      console.log(`🧠 Ensemble: RF=${(rfScore*100).toFixed(1)}% NB=${(nbScore*100).toFixed(1)}% → Blended=${(blended*100).toFixed(1)}%`);
    } else {
      // Fallback: use Naive Bayes result only; warn user model is degraded
      analysis = {
        ...nbAnalysis,
        indicators: [
          '⚠️ Random Forest model offline — result from Naive Bayes only (lower accuracy).',
          ...nbAnalysis.indicators,
        ],
      };
      console.log(`🧠 Analysis (NB only — RF offline): ${nbAnalysis.riskLevel}`);
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
