"""
Enhanced ML Server for Phishing Detection
Serves ensemble models with confidence scoring, feature extraction, and advanced analysis

Run from backend folder:
  pip install flask flask-cors
  python ml_server_enhanced.py

Server will run on http://localhost:5000
"""

import os
import re
import sys
from pathlib import Path
import json
import traceback
from datetime import datetime

# Flask setup
from flask import Flask, request, jsonify
from flask_cors import CORS

# ML libraries
import joblib
import numpy as np
from sklearn.metrics import pairwise_distances

# Import feature extractors
try:
    from ml_feature_extractor import (
        EmailFeatureExtractor,
        URLFeatureExtractor,
        URLReputationChecker,
        TextFeatureExtractor,
        extract_all_features
    )
except ImportError as e:
    print(f"Error importing feature extractors: {e}")
    print("Make sure ml_feature_extractor.py is in the same directory")
    sys.exit(1)

# Initialize Flask
app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

# ===== GLOBAL STATE =====
MODELS = {}
METADATA = {}
REQUEST_COUNT = 0
CACHE_PREDICTIONS = {}

def load_models():
    """Load ensemble models and vectorizers"""
    global MODELS, METADATA
    
    print("🚀 Loading ML models...")
    
    try:
        # Email model
        email_model_path = MODELS_DIR / "email_ensemble.joblib"
        email_vec_path = MODELS_DIR / "email_vectorizer.joblib"
        email_meta_path = MODELS_DIR / "email_ensemble_metadata.json"
        
        if email_model_path.exists() and email_vec_path.exists():
            MODELS['email_model'] = joblib.load(email_model_path)
            MODELS['email_vectorizer'] = joblib.load(email_vec_path)
            if email_meta_path.exists():
                with open(email_meta_path) as f:
                    METADATA['email'] = json.load(f)
            print("   ✅ Email ensemble model loaded")
        else:
            print(f"   ⚠️  Email model not found. Train with: python ml_train_ensemble.py")
        
        # URL model
        url_model_path = MODELS_DIR / "url_ensemble.joblib"
        url_vec_path = MODELS_DIR / "url_vectorizer.joblib"
        url_meta_path = MODELS_DIR / "url_ensemble_metadata.json"
        
        if url_model_path.exists() and url_vec_path.exists():
            MODELS['url_model'] = joblib.load(url_model_path)
            MODELS['url_vectorizer'] = joblib.load(url_vec_path)
            if url_meta_path.exists():
                with open(url_meta_path) as f:
                    METADATA['url'] = json.load(f)
            print("   ✅ URL ensemble model loaded")
        else:
            print(f"   ⚠️  URL model not found. Train with: python ml_train_ensemble.py")
        
        if not MODELS:
            print("\n❌ No models loaded! Please train models first:")
            print("   python ml_train_ensemble.py")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Error loading models: {e}")
        traceback.print_exc()
        sys.exit(1)


def get_risk_level(phishing_prob, confidence, content_type="email"):
    """Determine risk level based on probability, confidence, and content type.
    Emails use higher thresholds than URLs to reduce false positives on legitimate business emails.
    """
    if content_type == "url":
        # URLs: standard thresholds (structural threats are clearer)
        if phishing_prob > 0.75 and confidence > 0.3:
            return 'CRITICAL'
        elif phishing_prob > 0.60 and confidence > 0.2:
            return 'HIGH'
        elif phishing_prob > 0.40:
            return 'MEDIUM'
        else:
            return 'LOW'
    else:
        # Emails: RAISED thresholds — harder to reach HIGH/CRITICAL
        # This is the primary anti-false-positive measure for legitimate business emails
        if phishing_prob > 0.82 and confidence > 0.4:
            return 'CRITICAL'
        elif phishing_prob > 0.68 and confidence > 0.3:
            return 'HIGH'
        elif phishing_prob > 0.50:
            return 'MEDIUM'
        else:
            return 'LOW'


def classify_email_type(email_text, sender):
    """Detect the type of email to apply appropriate bias corrections.
    Returns: 'transactional', 'security_alert', 'newsletter', 'business', or 'unknown'
    """
    text_lower = email_text.lower()
    sender_lower = sender.lower()

    # Security alerts from real providers use specific, consistent language
    security_patterns = [
        r'new sign.?in',
        r'sign.?in (to|on|from) (your|a)',
        r'new device',
        r'account activity',
        r'we noticed a',
        r'someone (tried|attempted)',
        r'security (alert|warning|notification)',
        r'unusual (sign.?in|activity|access)',
        r'review (recent|your) activity',
        r'check activity',
    ]
    if any(re.search(p, text_lower) for p in security_patterns):
        return 'security_alert'

    # Transactional emails (receipts, OTPs, confirmations)
    transactional_patterns = [
        r'your (order|receipt|invoice|payment|subscription)',
        r'order (has been|was) (confirmed|shipped|placed)',
        r'(one.time|verification) (code|password|pin)',
        r'your (otp|code) is',
        r'thank you for (your purchase|ordering)',
        r'your (booking|reservation|appointment)',
    ]
    if any(re.search(p, text_lower) for p in transactional_patterns):
        return 'transactional'

    # Newsletter / marketing
    newsletter_patterns = [
        r'unsubscribe',
        r'view (in browser|online)',
        r'this email was sent to',
        r'you\'re receiving this',
        r'email preferences',
    ]
    if any(re.search(p, text_lower) for p in newsletter_patterns):
        return 'newsletter'

    return 'unknown'


def get_recommendation(phishing_prob, risk_level, content_type="email"):
    """Get actionable recommendation for user"""
    if content_type == "url":
        if phishing_prob > 0.8:
            return '🚨 DANGEROUS: Do not click or visit this website. Close it immediately.'
        elif phishing_prob > 0.65:
            return '⚠️  HIGH RISK: This link looks fake. Do not enter any passwords or personal info.'
        elif phishing_prob > 0.45:
            return '❓ SUSPICIOUS: Be very careful. Double-check the website name before clicking.'
        else:
            return '✅ SAFE: This website appears to be completely legitimate.'
    else:
        if phishing_prob > 0.8:
            return '🚨 DANGEROUS: Do not reply. Delete and report this message immediately.'
        elif phishing_prob > 0.65:
            return '⚠️  HIGH RISK: Verify who actually sent this before responding. Do NOT click any links.'
        elif phishing_prob > 0.45:
            return '❓ SUSPICIOUS: Be cautious. Look for typos or fake sender names.'
        else:
            return '✅ SAFE: This message appears to be completely legitimate.'


# ===== API ENDPOINTS =====

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models_loaded': len(MODELS) > 0,
        'request_count': REQUEST_COUNT
    })


@app.route('/api/models/stats', methods=['GET'])
def model_stats():
    """Get model statistics"""
    return jsonify({
        'email_model': METADATA.get('email', {}),
        'url_model': METADATA.get('url', {}),
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/analyze/email', methods=['POST'])
def analyze_email():
    """Analyze email for phishing - returns confidence scores and detailed features"""
    global REQUEST_COUNT
    REQUEST_COUNT += 1
    
    try:
        data = request.json or {}
        email_text = data.get('content', '')
        sender = data.get('sender', '')
        subject = data.get('subject', '')
        
        if not email_text:
            return jsonify({'error': 'No email content provided'}), 400
        
        if 'email_model' not in MODELS:
            return jsonify({'error': 'Email model not loaded'}), 503
        
        # Feature extraction
        features = EmailFeatureExtractor.extract(email_text, sender, subject)
        
        # ML prediction
        vectorizer = MODELS['email_vectorizer']
        model = MODELS['email_model']
        
        X = vectorizer.transform([email_text])
        y_pred = model.predict(X)[0]
        y_proba = model.predict_proba(X)[0]
        
        phishing_prob = float(y_proba[1])
        safe_prob = float(y_proba[0])
        raw_prob = phishing_prob  # Keep original for logging
        
        # ── STEP 1: DETECT EMAIL TYPE ────────────────────────────────────────────
        # Identifying the email type lets us apply appropriate bias correction per category.
        email_type = classify_email_type(email_text, sender)
        
        # ── STEP 2: TRUSTED SENDER SHORT-CIRCUIT ─────────────────────────────────
        # If the sender is a verified corporate domain, bypass the AI entirely.
        # Real phishing never originates from the genuine google.com / microsoft.com.
        is_trusted_sender = features.get('is_trusted_sender', False)
        has_critical_structural_threat = (
            features.get('has_ip_url', False) or
            features.get('has_form', False) or
            features.get('requests_personal_info', 0) > 0
        )
        
        if is_trusted_sender and not has_critical_structural_threat:
            phishing_prob = 0.06   # 6% — solidly "Safe"
            safe_prob = 0.94
        else:
            # ── STEP 3: EMAIL-TYPE BIAS CORRECTION ───────────────────────────────
            # Graduated dampening based on email type. Security alerts and transactional
            # emails are the most heavily penalized by TF-IDF, so they get the most relief.
            has_any_structural_threat = (
                has_critical_structural_threat or
                features.get('shortened_url_count', 0) > 0 or
                features.get('sender_suspicious_domain', False) or
                features.get('uses_authority_tactic', False) or
                features.get('has_scam_keywords', False)
            )
            if phishing_prob > 0.35 and not has_any_structural_threat:
                if email_type == 'security_alert':
                    # Security alerts are most heavily penalized by TF-IDF — max dampening
                    phishing_prob = phishing_prob * 0.25
                elif email_type == 'transactional':
                    phishing_prob = phishing_prob * 0.30
                elif email_type == 'newsletter':
                    phishing_prob = phishing_prob * 0.40
                else:
                    # Unknown/business email — moderate dampening
                    phishing_prob = phishing_prob * 0.45
                safe_prob = 1.0 - phishing_prob
            
            # ── STEP 4: MINIMUM THREAT GUARD ─────────────────────────────────────
            # Require at least ONE confirmed structural threat for MEDIUM+ risk.
            # This is the final safeguard against pure TF-IDF word-matching bias.
            threat_count = sum([
                int(features.get('has_ip_url', False)),
                int(features.get('shortened_url_count', 0) > 0),
                int(features.get('requests_personal_info', 0) > 0),
                int(features.get('has_form', False)),
                int(features.get('sender_suspicious_domain', False)),
                int(features.get('uses_authority_tactic', False)),
                int(features.get('has_broken_grammar', False)),
                int(features.get('has_scam_keywords', False)),
            ])
            if threat_count == 0 and phishing_prob > 0.45:
                # No real threats found — cap at MEDIUM floor
                phishing_prob = min(phishing_prob, 0.44)
                safe_prob = 1.0 - phishing_prob
        
        print(f"📊 Email analysis: raw={raw_prob:.2f} → adjusted={phishing_prob:.2f} | type={email_type} | trusted={is_trusted_sender}")
        
        confidence = abs(phishing_prob - safe_prob)
        risk_level = get_risk_level(phishing_prob, confidence, "email")
        
        # Build response
        response = {
            'analysis': {
                'phishing_probability': phishing_prob,
                'safe_probability': safe_prob,
                'confidence': confidence,
                'risk_level': risk_level,
                'recommendation': get_recommendation(phishing_prob, risk_level, "email"),
                'model_version': 'ensemble-v2'
            },
            'features_detected': {
                'urgency_indicators': {
                    'has_urgency': features.get('has_urgency', False),
                    'urgency_word_count': features.get('urgency_word_count', 0),
                    'uses_urgency_tactic': features.get('uses_urgency_tactic', False)
                },
                'sender_indicators': {
                    'is_generic': features.get('sender_is_generic', False),
                    'has_numbers': features.get('sender_has_numbers', False),
                    'suspicious_domain': features.get('sender_suspicious_domain', False)
                },
                'url_indicators': {
                    'url_count': features.get('url_count', 0),
                    'shortened_urls': features.get('shortened_url_count', 0),
                    'has_ip_url': features.get('has_ip_url', False)
                },
                'content_indicators': {
                    'requests_personal_info': features.get('requests_personal_info', 0),
                    'has_forms': features.get('has_form', False),
                    'broken_grammar': features.get('has_broken_grammar', False),
                    'uses_authority_tactic': features.get('uses_authority_tactic', False)
                }
            },
            'top_risks': identify_top_risks(features),
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(response)
    
    except Exception as e:
        print(f"Error in /api/analyze/email: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze/url', methods=['POST'])
def analyze_url():
    """Analyze URL for phishing"""
    global REQUEST_COUNT
    REQUEST_COUNT += 1
    
    try:
        data = request.json or {}
        url = data.get('url', '')
        
        if not url:
            return jsonify({'error': 'No URL provided'}), 400
        
        if 'url_model' not in MODELS:
            return jsonify({'error': 'URL model not loaded'}), 503
        
        # Feature extraction
        features = URLFeatureExtractor.extract(url)
        
        # Reputation check (non-blocking)
        reputation = {}
        try:
            reputation = URLReputationChecker.check_url(url, timeout=2)
        except:
            pass
        
        # ML prediction
        vectorizer = MODELS['url_vectorizer']
        model = MODELS['url_model']
        
        # Format URL for TF-IDF
        from ml_feature_extractor import enrich_url
        url_enriched = enrich_url(url)
        X = vectorizer.transform([url_enriched])
        
        y_proba = model.predict_proba(X)[0]
        phishing_prob = float(y_proba[1])
        safe_prob = float(y_proba[0])
        
        # ── TRUSTED URL SHORT-CIRCUIT ─────────────────────────────────────────────
        # If the URL is exactly a verified corporate domain (no typos), bypass the AI
        # and force the score to 1% to prevent baseline ML drift from causing false alarms.
        import urllib.parse
        parsed = urllib.parse.urlparse(url if url.startswith('http') else 'http://' + url)
        hostname_lower = (parsed.hostname or '').lower()
        
        # Strip www. for checking
        root_domain = hostname_lower[4:] if hostname_lower.startswith('www.') else hostname_lower
        
        trusted_domains = {
            'google.com', 'google.co.zw', 'gmail.com',
            'microsoft.com', 'office.com', 'live.com', 'outlook.com',
            'apple.com', 'icloud.com',
            'amazon.com', 'amazon.co.uk',
            'paypal.com', 'stripe.com',
            'facebook.com', 'instagram.com', 'whatsapp.com',
            'linkedin.com', 'twitter.com', 'x.com',
            'github.com', 'gitlab.com'
        }
        
        # Ensure it's not flagged as a typo AND matches a trusted root domain exactly
        if root_domain in trusted_domains and not features.get('looks_like_typo', False):
            phishing_prob = 0.01  # 1% Risk
            safe_prob = 0.99
            features['is_trusted_url'] = True
        else:
            features['is_trusted_url'] = False
            # TYPOSQUATTING BOOST: If typosquatting is detected, significantly increase phishing probability
            if features.get('looks_like_typo', False):
                # Boost phishing probability if typo detected
                # If model is uncertain (prob between 0.3-0.7), move towards phishing
                if phishing_prob < 0.7:
                    phishing_prob = min(0.95, phishing_prob + 0.3)  # Strong boost
                # If model thinks it's safe, override with suspicious
                if phishing_prob < 0.5:
                    phishing_prob = 0.75
        
        confidence = abs(phishing_prob - (1 - phishing_prob))
        risk_level = get_risk_level(phishing_prob, confidence)
        
        response = {
            'analysis': {
                'url': url,
                'phishing_probability': phishing_prob,
                'confidence': confidence,
                'risk_level': risk_level,
                'recommendation': get_recommendation(phishing_prob, risk_level, "url")
            },
            'structural_features': {
                'is_ip_address': features.get('is_ip_address', False),
                'has_at_symbol': features.get('has_at_symbol', False),
                'long_url': features.get('long_url', False),
                'deep_subdomain': features.get('deep_subdomain', False),
                'uses_http': features.get('uses_http', False),
                'new_tld': features.get('new_tld', False),
                'looks_like_typo': features.get('looks_like_typo', False),
                'suspicion_score': features.get('overall_suspicion_score', 0)
            },
            'reputation': reputation,
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(response)
    
    except Exception as e:
        print(f"Error in /api/analyze/url: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/analyze/text', methods=['POST'])
def analyze_text():
    """Generic text analysis"""
    global REQUEST_COUNT
    REQUEST_COUNT += 1
    
    try:
        data = request.json or {}
        text = data.get('text', '')
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # Extract generic features
        features = TextFeatureExtractor.extract(text)
        
        # If we have email model, use it as fallback
        if 'email_model' in MODELS:
            vectorizer = MODELS['email_vectorizer']
            model = MODELS['email_model']
            X = vectorizer.transform([text])
            y_proba = model.predict_proba(X)[0]
            phishing_prob = float(y_proba[1])
        else:
            phishing_prob = 0.5
        
        return jsonify({
            'analysis': {
                'phishing_probability': phishing_prob,
                'features': features
            },
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        print(f"Error in /api/analyze/text: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/batch/analyze', methods=['POST'])
def batch_analyze():
    """Batch analyze multiple items"""
    global REQUEST_COUNT
    REQUEST_COUNT += 1
    
    try:
        data = request.json or {}
        items = data.get('items', [])
        
        results = []
        for item in items:
            item_type = item.get('type', 'email')  # 'email', 'url', 'text'
            
            if item_type == 'email' and 'email_model' in MODELS:
                # Reuse email analysis
                vectorizer = MODELS['email_vectorizer']
                model = MODELS['email_model']
                X = vectorizer.transform([item.get('content', '')])
                y_proba = model.predict_proba(X)[0]
                results.append({
                    'type': 'email',
                    'phishing_prob': float(y_proba[1]),
                    'risk': get_risk_level(y_proba[1], abs(y_proba[1] - y_proba[0]))
                })
            elif item_type == 'url' and 'url_model' in MODELS:
                vectorizer = MODELS['url_vectorizer']
                model = MODELS['url_model']
                from ml_feature_extractor import enrich_url
                url_enriched = enrich_url(item.get('url', ''))
                X = vectorizer.transform([url_enriched])
                y_proba = model.predict_proba(X)[0]
                results.append({
                    'type': 'url',
                    'phishing_prob': float(y_proba[1]),
                    'risk': get_risk_level(y_proba[1], abs(y_proba[1] - y_proba[0]))
                })
        
        return jsonify({
            'batch_results': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        })
    
    except Exception as e:
        print(f"Error in /api/batch/analyze: {e}")
        return jsonify({'error': str(e)}), 500


def identify_top_risks(features):
    """Identify top phishing risk indicators from features - only show legitimate red flags"""
    risks = []
    
    # Critical red flags
    if features.get('has_ip_url'):
        risks.append({'severity': 'CRITICAL', 'indicator': 'IP-based URLs', 'description': 'Email contains direct IP address URLs instead of domain names'})
    
    if features.get('requests_personal_info', 0) > 2:  # Only flag if multiple personal info requests
        risks.append({'severity': 'HIGH', 'indicator': 'Multiple credential requests', 'description': 'Email asks for multiple sensitive details (passwords, pins, credit cards)'})
    
    # Medium red flags
    if features.get('has_shortened_url'):
        risks.append({'severity': 'MEDIUM', 'indicator': 'Shortened URLs used', 'description': 'Email uses URL shorteners which can hide the destination'})
    
    if features.get('has_form'):
        risks.append({'severity': 'MEDIUM', 'indicator': 'Embedded login form', 'description': 'Email contains embedded form to collect credentials'})
    
    if features.get('uses_authority_tactic'):
        risks.append({'severity': 'MEDIUM', 'indicator': 'Authority impersonation detected', 'description': 'Email impersonates a known company but sender domain does not match'})
    
    # Low flags (informational)
    if features.get('sender_is_generic') and features.get('requests_personal_info', 0) > 0:
        risks.append({'severity': 'LOW', 'indicator': 'Generic sender + credential request', 'description': 'Combination of generic sender and request for sensitive data'})
    
    if features.get('uses_urgency_tactic'):
        risks.append({'severity': 'LOW', 'indicator': 'Pressure/urgency language', 'description': 'Email uses multiple urgency tactics to pressure immediate action'})
    
    return risks[:3]  # Return top 3 most relevant risks


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


# ===== STARTUP =====

if __name__ == '__main__':
    print(f"""
╔═══════════════════════════════════════════════════════════════╗
║      🧠 PhishGuard ML Server (Enhanced with Ensemble)        ║
╚═══════════════════════════════════════════════════════════════╝
""")
    
    load_models()
    
    port = int(os.environ.get('PORT', 5000))
    print(f"""
🚀 Starting Flask server...

📡 Available Endpoints:
   POST /api/analyze/email          - Analyze email for phishing
   POST /api/analyze/url            - Analyze URL for phishing
   POST /api/analyze/text           - Generic text analysis
   POST /api/batch/analyze          - Batch analysis
   GET  /api/models/stats           - Model statistics
   GET  /api/health                 - Health check

🌐 Server running at: http://0.0.0.0:{port}

Press Ctrl+C to stop
""")

    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
