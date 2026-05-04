/**
 * Test the Incident Response AI fallback chain.
 * Run:  node scripts/testIncidentFallback.js
 */

require('dotenv').config();
const axios = require('axios');

const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
const groqKey = (process.env.GROQ_API_KEY || '').trim();

const threatType = 'Suspicious Content Detection (85% Risk)';

const prompt = `You are a world-class cybersecurity incident response expert. Generate a step-by-step incident response procedure for a threat of type: "${threatType}".
  Output ONLY valid JSON strictly following this schema:
  {
    "title": "Clear Title (e.g., Phishing Email Response)",
    "severity": "low|medium|high|critical",
    "steps": [
      { "step": 1, "action": "Clear immediate action", "duration": "Immediate" },
      { "step": 2, "action": "Next step", "duration": "5 minutes" }
    ],
    "recovery": [
      "Recovery action 1",
      "Recovery action 2"
    ]
  }`;

const cleanJson = (raw) => {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) text = text.substring(start, end + 1);
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return text;
};

const PROVIDERS = [
  {
    name: 'gemini-2.5-flash',
    call: () => axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
      { timeout: 60000 }
    ),
    parse: (res) => res.data.candidates[0].content.parts[0].text,
  },
  {
    name: 'gemini-2.0-flash',
    call: () => axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
      { timeout: 60000 }
    ),
    parse: (res) => res.data.candidates[0].content.parts[0].text,
  },
  {
    name: 'gemini-2.0-flash-lite',
    call: () => axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${geminiKey}`,
      { contents: [{ parts: [{ text: prompt }] }], generationConfig: { response_mime_type: 'application/json' } },
      { timeout: 60000 }
    ),
    parse: (res) => res.data.candidates[0].content.parts[0].text,
  },
  {
    name: 'Groq / LLaMA-3.3-70B',
    call: () => axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
      {
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      }
    ),
    parse: (res) => res.data.choices[0].message.content,
  },
];

async function main() {
  console.log('========================================');
  console.log('  Incident Response Fallback Test');
  console.log('========================================');
  console.log(`  Threat: "${threatType}"`);
  console.log(`  Gemini Key: ${geminiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`  Groq Key:   ${groqKey ? '✅ Set' : '❌ Missing'}\n`);

  let successProvider = null;

  for (const provider of PROVIDERS) {
    console.log(`🤖 Testing: ${provider.name}...`);

    try {
      const response = await provider.call();
      const raw = provider.parse(response);
      const parsed = JSON.parse(cleanJson(raw));

      console.log(`   ✅ SUCCESS via ${provider.name}`);
      console.log(`   Title:    ${parsed.title}`);
      console.log(`   Severity: ${parsed.severity}`);
      console.log(`   Steps:    ${parsed.steps?.length || 0}`);
      console.log(`   Recovery: ${parsed.recovery?.length || 0}`);
      successProvider = provider.name;
      // Don't break — test ALL providers to see which ones work
    } catch (err) {
      const status = err?.response?.status;
      const apiError = err?.response?.data?.error;
      if (status === 503) {
        console.log(`   ❌ FAILED: Overloaded (503)`);
      } else if (status === 429) {
        console.log(`   ❌ FAILED: Rate-limited (429)`);
      } else if (status === 404) {
        console.log(`   ❌ FAILED: Model not found (404)`);
      } else if (apiError) {
        console.log(`   ❌ FAILED: ${apiError.message || apiError.status || JSON.stringify(apiError)}`);
      } else {
        console.log(`   ❌ FAILED: ${err.message}`);
      }
    }

    // Small delay between providers
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n========================================');
  if (successProvider) {
    console.log(`  ✅ Fallback chain WORKS. At least ${successProvider} is operational.`);
  } else {
    console.log('  ❌ ALL providers FAILED. Check API keys and quotas.');
  }
  console.log('========================================');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
