"""
Enhanced ML Server for Phishing Detection
Serves ensemble models with confidence scoring, feature extraction, and advanced analysis

Run from backend folder:
  pip install flask flask-cors
  python ml_server_enhanced.py

Server will run on http://localhost:5000
"""

import os
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


def get_risk_level(phishing_prob, confidence):
    """Determine risk level based on probability and confidence"""
    if phishing_prob > 0.75 and confidence > 0.3:
        return 'CRITICAL'
    elif phishing_prob > 0.6 and confidence > 0.2:
        return 'HIGH'
    elif phishing_prob > 0.4:
        return 'MEDIUM'
    else:
        return 'LOW'


def get_recommendation(phishing_prob, risk_level):
    """Get actionable recommendation for user"""
    if phishing_prob > 0.8:
        return '🚨 BLOCK and REPORT this message immediately'
    elif phishing_prob > 0.65:
        return '⚠️  VERIFY sender identity before responding. Do not click links or download attachments'
    elif phishing_prob > 0.45:
        return '❓ Be cautious - look for suspicious indicators before taking action'
    else:
        return '✅ This appears to be a legitimate message'


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
        confidence = abs(phishing_prob - safe_prob)
        risk_level = get_risk_level(phishing_prob, confidence)
        
        # Build response
        response = {
            'analysis': {
                'phishing_probability': phishing_prob,
                'safe_probability': safe_prob,
                'confidence': confidence,
                'risk_level': risk_level,
                'recommendation': get_recommendation(phishing_prob, risk_level),
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
        confidence = abs(phishing_prob - safe_prob)
        risk_level = get_risk_level(phishing_prob, confidence)
        
        response = {
            'analysis': {
                'url': url,
                'phishing_probability': phishing_prob,
                'confidence': confidence,
                'risk_level': risk_level,
                'recommendation': get_recommendation(phishing_prob, risk_level)
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
    
    print(f"""
🚀 Starting Flask server...

📡 Available Endpoints:
   POST /api/analyze/email          - Analyze email for phishing
   POST /api/analyze/url            - Analyze URL for phishing
   POST /api/analyze/text           - Generic text analysis
   POST /api/batch/analyze          - Batch analysis
   GET  /api/models/stats           - Model statistics
   GET  /api/health                 - Health check

🌐 Server running at: http://localhost:5000

Press Ctrl+C to stop
""")
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
