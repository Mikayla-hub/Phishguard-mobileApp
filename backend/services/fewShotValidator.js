/**
 * Few-Shot LLM Email Validator
 * 
 * When the Random Forest model is uncertain (25%-65% confidence range),
 * this service uses Groq's LLaMA model with carefully crafted few-shot examples
 * to provide a second-opinion classification.
 * 
 * This is a lightweight alternative to fine-tuning DistilBERT, using the
 * Groq API (which is already integrated) to capture semantic intent.
 */

const axios = require('axios');

// Carefully selected few-shot examples covering common false positive scenarios
const FEW_SHOT_EXAMPLES = `
EXAMPLE 1:
Sender: no-reply@accounts.google.com
Email: "We noticed a new sign-in to your Google Account on a Windows device. If this was you, you don't need to do anything. If not, we'll help you secure your account. Check activity: https://myaccount.google.com"
Classification: LEGITIMATE
Reason: Sent from official Google domain. Standard security notification language. Link goes to myaccount.google.com (official). No credential request.

EXAMPLE 2:
Sender: security@paypa1-support.com
Email: "URGENT: Your PayPal account has been LIMITED. Verify your identity NOW to avoid permanent suspension. Click here: http://192.168.1.45/paypal/verify"
Classification: PHISHING
Reason: Typosquatted domain (paypa1 not paypal). Raw IP address in link. Extreme urgency language. Credential request.

EXAMPLE 3:
Sender: noreply@microsoft.com
Email: "Your Microsoft account security info was recently changed. If you made this change, you can safely disregard this email. If you didn't change your security info, your account may have been compromised."
Classification: LEGITIMATE
Reason: Official Microsoft domain. Standard account security notification. No links asking for credentials. Calm, non-threatening tone.

EXAMPLE 4:
Sender: alerts@amazon-account-update.net
Email: "Dear Customer, Your Amazon account has been SUSPENDED due to suspicious billing. Update your payment method immediately to restore access: http://amaz0n-billing.com/update"
Classification: PHISHING
Reason: Non-Amazon domain (amazon-account-update.net). Typosquatted URL (amaz0n). Payment credential request. High urgency.

EXAMPLE 5:
Sender: no-reply@github.com
Email: "A new public key was added to your account. If you did not perform this action, you can remove the key and disable access for applications that may have used it."
Classification: LEGITIMATE
Reason: Official GitHub domain. Standard account activity notification. No credential request. Informational and non-threatening.

EXAMPLE 6:
Sender: support@secure-banking-update.info
Email: "Your online banking access will be terminated in 24 hours. We detected unusual activity. Please verify your full name, date of birth, account number and PIN to restore access."
Classification: PHISHING
Reason: Suspicious .info domain. Requesting extremely sensitive credentials (PIN, account number). Artificial 24-hour deadline. Multiple urgency tactics.
`.trim();

/**
 * Use Groq's LLaMA model with few-shot examples to validate borderline email classifications.
 * Only called when Random Forest confidence is in the uncertain range (25%-65%).
 * 
 * @param {string} emailText - The email body content
 * @param {string} sender - The sender's email address
 * @param {number} rfProbability - The Random Forest's phishing probability (0-1)
 * @returns {Object} { isPhishing: boolean, confidence: number, reason: string } or null on failure
 */
async function validateWithFewShot(emailText, sender, rfProbability) {
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (!groqKey) {
    console.warn('⚠️  [FewShot] GROQ_API_KEY not set — skipping few-shot validation');
    return null;
  }

  // Truncate long emails to avoid token limits
  const truncatedEmail = emailText.length > 1000
    ? emailText.substring(0, 1000) + '... [truncated]'
    : emailText;

  const prompt = `You are an expert email security analyst specializing in phishing detection for non-technical users.

Here are ${6} labeled examples to calibrate your classification:

${FEW_SHOT_EXAMPLES}

---

Now classify this new email:
Sender: ${sender || '(not provided)'}
Email body: "${truncatedEmail}"

IMPORTANT RULES:
- Security notifications from verified company domains (google.com, microsoft.com, apple.com, amazon.com, paypal.com, github.com, etc.) are ALMOST ALWAYS legitimate.
- Only classify as PHISHING if there is CLEAR evidence: typosquatted domain, raw IP address links, explicit credential harvesting, or extreme pressure tactics.
- "We noticed a new sign-in" type messages from official domains are LEGITIMATE.
- The user's Random Forest ML model gave this email a ${(rfProbability * 100).toFixed(0)}% phishing probability — use this as one data point but trust your own analysis more.

Respond ONLY with valid JSON, no explanation outside JSON:
{
  "classification": "LEGITIMATE" or "PHISHING",
  "confidence": <number 0.0-1.0 representing how sure you are>,
  "key_reason": "<one sentence explaining your decision in plain English>",
  "override_rf": <true if your classification strongly contradicts the RF model>
}`;

  try {
    console.log(`🤖 [FewShot] Running LLaMA few-shot validation (RF was ${(rfProbability * 100).toFixed(0)}%)...`);
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,  // Low temperature for consistent, deterministic output
        max_tokens: 256,
      },
      {
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const raw = response.data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Parse JSON response
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const result = {
      isPhishing: parsed.classification === 'PHISHING',
      confidence: parseFloat(parsed.confidence) || 0.5,
      reason: parsed.key_reason || 'LLM classification',
      overrideRf: !!parsed.override_rf,
    };

    console.log(`✅ [FewShot] Result: ${parsed.classification} (confidence: ${(result.confidence * 100).toFixed(0)}%) — "${result.reason}"`);
    return result;

  } catch (err) {
    // Never crash the main analysis if few-shot validation fails
    if (err?.response?.status === 429) {
      console.warn('⚠️  [FewShot] Groq rate-limited — skipping few-shot validation');
    } else {
      console.warn(`⚠️  [FewShot] Validation failed: ${err.message}`);
    }
    return null;
  }
}

module.exports = { validateWithFewShot };
