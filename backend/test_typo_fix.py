#!/usr/bin/env python3
"""Test if the new URL model catches typosquatting patterns like paypa1.com"""

import joblib
from ml_feature_extractor import enrich_url

# Load the retrained URL model
model = joblib.load('models/url_random_forest.joblib')

# Test URLs
test_urls = [
    'https://paypa1.com',           # Typosquat - should be PHISHING
    'https://paypal.com',            # Legit PayPal
    'https://amaz0n.com',            # Typosquat - should be PHISHING
    'https://amazon.com',            # Legit Amazon
    'https://g00gle.com',            # Typosquat - should be PHISHING
    'https://google.com',            # Legit Google
]

print("🧪 Testing URL Model with Typosquatting Detection\n")
print("-" * 70)

for url in test_urls:
    enriched = enrich_url(url)
    prediction = model.predict([enriched])[0]
    proba = model.predict_proba([enriched])[0]
    
    label = "🚨 PHISHING" if prediction == 1 else "✅ LEGIT"
    phishing_score = proba[1] * 100
    
    print(f"\nURL: {url}")
    print(f"Result: {label}")
    print(f"Phishing Score: {phishing_score:.1f}%")
    print(f"Model Confidence: {max(proba) * 100:.1f}%")

print("\n" + "-" * 70)
