const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mlService = require('../services/mlService');
const db = require('../config/database');
const Tesseract = require('tesseract.js');

// You can add your authenticate middleware here if you want to protect this route
// const { authenticate } = require('../middleware/auth');

router.post('/analyze', async (req, res) => {
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

      // ATTEMPT 1: Gemini Vision AI (99.9% accuracy, handles SMS bubbles, logos, colored backgrounds)
      if (geminiKey) {
        try {
          console.log('🤖 Attempting high-accuracy OCR via Gemini Vision...');
          const axios = require('axios');
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
            {
              contents: [{
                parts: [
                  { text: "You are an OCR engine. Extract all the text exactly as it appears in this image. Do not add any formatting, commentary, or markdown blocks. Just return the raw text." },
                  { inline_data: { mime_type: mimeType, data: base64Raw } }
                ]
              }]
            },
            { timeout: 15000 }
          );
          
          textToAnalyze = response.data.candidates[0].content.parts[0].text.trim();
          console.log('✅ Gemini Vision OCR Success!');
          extractedSuccessfully = true;
        } catch (geminiError) {
          console.warn('⚠️ Gemini Vision OCR failed or rate-limited. Falling back to local Tesseract...');
        }
      }

      // ATTEMPT 2: Fallback to local Tesseract.js (~70% accuracy on complex screenshots)
      if (!extractedSuccessfully) {
        console.log('⚙️ Running local Tesseract.js OCR...');
        const { data: { text } } = await Tesseract.recognize(base64Data, 'eng');
        textToAnalyze = text.trim();
      }
      
      console.log(`📝 Extracted Text Preview: ${textToAnalyze.substring(0, 100).replace(/\n/g, ' ')}...`);
      
      if (!textToAnalyze) {
        return res.status(400).json({ error: 'Could not extract any text from the image. Please try a clearer screenshot.' });
      }
    }

    // 2. Ask our newly trained ML Model to analyze the text
    const analysis = mlService.analyze(textToAnalyze);

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
