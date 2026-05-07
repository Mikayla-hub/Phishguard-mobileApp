#!/usr/bin/env python3
"""
Diagnostic test to identify system issues
"""
import joblib
from pathlib import Path
from ml_feature_extractor import URLFeatureExtractor, enrich_url, EmailFeatureExtractor

# Test paths
BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

print("=" * 70)
print("DIAGNOSTICS: Phishing Detection System Issues")
print("=" * 70)

# 1. Check if models exist
print("\n1. Checking model files...")
email_model_path = MODELS_DIR / "email_ensemble.joblib"
url_model_path = MODELS_DIR / "url_ensemble.joblib"

if email_model_path.exists():
    print(f"   ✅ Email model found")
    email_model = joblib.load(email_model_path)
    print(f"      Classes: {email_model.classes_}")
else:
    print(f"   ❌ Email model NOT found")

if url_model_path.exists():
    print(f"   ✅ URL model found")
    url_model = joblib.load(url_model_path)
    print(f"      Classes: {url_model.classes_}")
else:
    print(f"   ❌ URL model NOT found")

# 2. Test URL feature extraction
print("\n2. Testing URL feature extraction...")
test_urls = [
    "https://www.google.com",
    "https://www.paypa1.com",
    "http://192.168.1.1/login",
    "https://amaz0n.com/verify"
]

for test_url in test_urls:
    features = URLFeatureExtractor.extract(test_url)
    suspicion = features.get('overall_suspicion_score', 0)
    print(f"\n   URL: {test_url}")
    print(f"   Suspicion Score: {suspicion}")
    
    suspicious_flags = [k for k, v in features.items() if v == True or (isinstance(v, (int, float)) and v > 0 and k != 'overall_suspicion_score')]
    if suspicious_flags:
        print(f"   Red Flags: {suspicious_flags}")
    else:
        print(f"   Red Flags: NONE (appears clean)")

# 3. Test model predictions
print("\n3. Testing model predictions...")
if url_model_path.exists():
    url_vectorizer_path = MODELS_DIR / "url_vectorizer.joblib"
    if url_vectorizer_path.exists():
        url_vectorizer = joblib.load(url_vectorizer_path)
        
        for test_url in test_urls:
            url_enriched = enrich_url(test_url)
            X = url_vectorizer.transform([url_enriched])
            
            prediction = url_model.predict(X)[0]
            proba = url_model.predict_proba(X)[0]
            
            class_phishing = proba[1] if len(proba) > 1 else None
            class_safe = proba[0] if len(proba) > 0 else None
            
            print(f"\n   URL: {test_url}")
            print(f"   Model Prediction: {url_model.classes_[prediction]}")
            print(f"   Probabilities: {url_model.classes_[0]}={class_safe:.4f}, {url_model.classes_[1]}={class_phishing:.4f}")
            
            # Check if prediction seems backwards
            if test_url == "https://www.google.com":
                if class_phishing > 0.5:
                    print(f"   ⚠️  WARNING: google.com scored as {class_phishing*100:.1f}% phishing!")
                    print(f"   This suggests MODEL INVERSION or TRAINING ERROR")
            elif "paypa1" in test_url or "amaz0n" in test_url or "192" in test_url:
                if class_phishing < 0.5:
                    print(f"   ⚠️  WARNING: Suspicious URL scored as {class_phishing*100:.1f}% phishing!")
                    print(f"   This suggests MODEL INVERSION or TRAINING ERROR")

# 4. Test email features  
print("\n\n4. Testing email feature extraction...")
test_emails = [
    ("Update", "Google Cloud", "Hello, we're updating our API on January 15. https://cloud.google.com"),
    ("Urgent!!", "support@paypa1.com", "URGENT: VERIFY YOUR PAYPAL ACCOUNT! Click now! Enter password: https://192.168.1.1"),
]

for subject, sender, content in test_emails:
    features = EmailFeatureExtractor.extract(content, sender, subject)
    print(f"\n   Subject: {subject}")
    print(f"   Sender: {sender}")
    print(f"   Urgency Tactic: {features.get('uses_urgency_tactic', False)} (word count: {features.get('urgency_word_count', 0)})")
    print(f"   Authority Tactic: {features.get('uses_authority_tactic', False)}")
    print(f"   Personal Info Requests: {features.get('requests_personal_info', 0)}")

print("\n" + "=" * 70)
print("END DIAGNOSTICS")
print("=" * 70)
