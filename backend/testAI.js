const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const topic = 'Phishing test';

const prompt = `You are an expert, empathetic cybersecurity educator designing courses for absolute beginners with ZERO prior knowledge of phishing. Generate a **highly unique, specific, and creative** interactive learning module about "${topic}". DO NOT use overly technical jargon. Use extremely simple, clear, user-friendly language focusing on the direct dangers and how everyday people can avoid them. Invent a specific, relatable real-world scenario for this session.
Output ONLY valid JSON. It MUST strictly follow this exact schema:
{
  "id": "generate-a-kebab-case-id",
  "title": "Unique Beginner Module",
  "description": "Extremely simple, relatable short description",
  "duration": "15 min",
  "difficulty": "beginner",
  "icon": "shield",
  "lessons": [
    {
      "id": "lesson-1",
      "type": "info",
      "title": "Educational Concept",
      "content": "- STRICTLY output 4-5 concise bullet points (using hyphens and newlines ONLY, absolutely no paragraphs) explaining what this specific threat actually is in user-friendly language."
    },
    {
      "id": "lesson-2",
      "type": "info",
      "title": "Real-World Example",
      "content": "- STRICTLY output 4-5 concise bullet points (using hyphens and newlines ONLY, absolutely no paragraphs) providing exactly how this scenario happens to everyday people giving real world examples."
    },
    {
      "id": "lesson-3",
      "type": "quiz",
      "title": "Performance Check: Q1",
      "question": "First performance check question?",
      "options": [
        { "id": "opt1", "text": "Option A", "correct": true },
        { "id": "opt2", "text": "Option B", "correct": false },
        { "id": "opt3", "text": "Option C", "correct": false },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Explanation for Q1"
    },
    {
      "id": "lesson-4",
      "type": "quiz",
      "title": "Performance Check: Q2",
      "question": "Second performance check question?",
      "options": [
        { "id": "opt1", "text": "Option A", "correct": true },
        { "id": "opt2", "text": "Option B", "correct": false },
        { "id": "opt3", "text": "Option C", "correct": false },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Explanation for Q2"
    },
    {
      "id": "lesson-5",
      "type": "quiz",
      "title": "Performance Check: Q3",
      "question": "Third performance check question?",
      "options": [
        { "id": "opt1", "text": "Option A", "correct": true },
        { "id": "opt2", "text": "Option B", "correct": false },
        { "id": "opt3", "text": "Option C", "correct": false },
        { "id": "opt4", "text": "Option D", "correct": false }
      ],
      "explanation": "Explanation for Q3"
    }
  ]
}`;

async function run() {
  try {
    const response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { response_mime_type: "application/json" }
    });
    const text = response.data.candidates[0].content.parts[0].text;
    console.log("RAW RESPONSE:");
    console.log(text);
    console.log("PARSED:");
    const testParse = JSON.parse(text);
    console.log(testParse.lessons.length);
  } catch(e) {
    console.error("FAILED", e.response ? e.response.data : e.message);
  }
}

run();
