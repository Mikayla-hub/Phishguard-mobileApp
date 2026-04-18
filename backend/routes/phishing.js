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
      console.log('🖼️ Extracting text from image using OCR...');
      const base64Data = content.startsWith('data:image') ? content : `data:image/jpeg;base64,${content}`;
      
      const { data: { text } } = await Tesseract.recognize(base64Data, 'eng');
      textToAnalyze = text.trim();
      
      console.log(`📝 Extracted Text: ${textToAnalyze.substring(0, 100)}...`);
      
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
