"""
Train Ensemble Models (RandomForest + GradientBoosting + XGBoost) for Phishing Detection
Much better accuracy than single models

Run from backend folder:
  python ml_train_ensemble.py
"""

import csv
import os
import sys
import json
from pathlib import Path

csv.field_size_limit(sys.maxsize)

from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.utils import resample
import joblib
import numpy as np

try:
    from xgboost import XGBClassifier
    HAS_XGBOOST = True
except ImportError:
    print("⚠️  XGBoost not installed. Install with: pip install xgboost")
    HAS_XGBOOST = False

BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "data" / "datasets"
MODELS_DIR = BASE_DIR / "models"

def enrich_url(url):
    """Append structural signal tokens to URL"""
    tokens = [url]
    try:
        from urllib.parse import urlparse
        import re
        p = urlparse(url if '://' in url else 'http://' + url)
        host = p.hostname or ''
        if re.match(r'^\d+\.\d+\.\d+\.\d+$', host):
            tokens.append('__FEAT_IP_ADDR__')
        if host.count('.') > 3:
            tokens.append('__FEAT_DEEP_SUBDOMAIN__')
        if '@' in url:
            tokens.append('__FEAT_AT_SYMBOL__')
        if len(url) > 100:
            tokens.append('__FEAT_LONG_URL__')
        if host.count('-') > 2:
            tokens.append('__FEAT_MANY_HYPHENS__')
        if len(re.findall(r'[=&]', url)) > 5:
            tokens.append('__FEAT_MANY_PARAMS__')
        if p.scheme == 'http' and any(k in url.lower() for k in ['login','account','verify','secure']):
            tokens.append('__FEAT_HTTP_SENSITIVE__')
    except Exception:
        pass
    return ' '.join(tokens)


def load_email_datasets():
    """Load email samples from both CSV files"""
    texts = []
    labels = []

    email_csv = DATASETS_DIR / "Phishing_Email.csv"
    if email_csv.exists():
        print(f"📧 Reading {email_csv.name}...")
        with open(email_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                text = (row.get("Email Text") or "").strip()
                email_type = (row.get("Email Type") or "").strip().lower()
                if text and email_type:
                    texts.append(text)
                    labels.append(1 if "phishing" in email_type else 0)
        print(f"   ✅ {len(texts)} samples loaded")

    zw_csv = DATASETS_DIR / "zimbabwe_phishing_dataset.csv"
    zw_texts, zw_labels = [], []
    if zw_csv.exists():
        print(f"📧 Reading {zw_csv.name}...")
        with open(zw_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                text = (row.get("text") or "").strip()
                label = (row.get("label") or "").strip().lower()
                if text and label:
                    zw_texts.append(text)
                    zw_labels.append(1 if label == "phishing" else 0)
        print(f"   ✅ {len(zw_texts)} raw samples loaded")

    if zw_texts:
        target_zw = max(500, len(texts) // 20)
        zw_texts, zw_labels = resample(
            zw_texts, zw_labels,
            replace=True, n_samples=target_zw, random_state=42
        )
        texts += zw_texts
        labels += zw_labels
        print(f"   📊 Zimbabwe data oversampled to {len(zw_texts)} samples")

    return texts, labels


def load_url_dataset():
    """Load URL samples"""
    urls = []
    labels = []

    url_csv = DATASETS_DIR / "PhiUSIIL_Phishing_URL_Dataset.csv"
    if url_csv.exists():
        print(f"🔗 Reading {url_csv.name}...")
        with open(url_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = (row.get("URL") or "").strip()
                label = (row.get("label") or "").strip()
                if url and label in ("0", "1"):
                    urls.append(url)
                    labels.append(int(label))
        print(f"   ✅ {len(urls)} samples loaded")

    return urls, labels


def train_email_ensemble():
    """Train ensemble for email detection"""
    print("\n" + "="*60)
    print("🧠 TRAINING EMAIL ENSEMBLE MODEL")
    print("="*60)
    
    texts, labels = load_email_datasets()
    if len(texts) == 0:
        print("⚠️  No email samples found. Skipping.")
        return

    print(f"\n📊 Dataset: {len(texts)} samples ({labels.count(1)} phishing, {labels.count(0)} legit)")
    
    # Train-test split
    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    print(f"📏 Train: {len(X_train)}, Test: {len(X_test)}")
    
    # TF-IDF vectorization
    print("🔤 Computing TF-IDF features...")
    tfidf = TfidfVectorizer(
        max_features=15000,
        ngram_range=(1, 2),
        stop_words="english",
        sublinear_tf=True,
        max_df=0.95,
        min_df=2
    )
    X_train_tfidf = tfidf.fit_transform(X_train)
    X_test_tfidf = tfidf.transform(X_test)
    
    print(f"   ✅ {X_train_tfidf.shape[1]} features")
    
    # Calculate class weight for imbalance
    n_phishing = labels.count(1)
    n_legit = labels.count(0)
    class_weight_ratio = n_legit / n_phishing
    
    # Component models
    print("🏗️  Building ensemble components...")
    
    rf = RandomForestClassifier(
        n_estimators=500,
        max_depth=25,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        n_jobs=-1,
        random_state=42,
        verbose=0
    )
    print("   • RandomForest (500 trees, depth=25)")
    
    gb = GradientBoostingClassifier(
        n_estimators=300,
        learning_rate=0.08,
        max_depth=7,
        min_samples_split=5,
        min_samples_leaf=2,
        subsample=0.8,
        random_state=42,
        verbose=0
    )
    print("   • GradientBoosting (300 trees, lr=0.08)")
    
    ensemble_models = [('rf', rf), ('gb', gb)]
    ensemble_weights = [2, 2]
    
    if HAS_XGBOOST:
        xgb = XGBClassifier(
            n_estimators=300,
            learning_rate=0.08,
            max_depth=6,
            min_child_weight=2,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=class_weight_ratio,
            random_state=42,
            verbosity=0,
            n_jobs=-1
        )
        ensemble_models.append(('xgb', xgb))
        ensemble_weights.append(2)
        print("   • XGBoost (300 trees, lr=0.08)")
    
    # Voting ensemble
    print("\n🎯 Training ensemble (soft voting)...")
    voting_clf = VotingClassifier(
        estimators=ensemble_models,
        voting='soft',
        weights=ensemble_weights
    )
    voting_clf.fit(X_train_tfidf, y_train)
    
    # Evaluation
    print("\n📊 EVALUATION ON TEST SET")
    print("-" * 60)
    
    y_pred = voting_clf.predict(X_test_tfidf)
    y_pred_proba = voting_clf.predict_proba(X_test_tfidf)[:, 1]
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["Legitimate", "Phishing"]))
    
    # ROC-AUC
    try:
        auc = roc_auc_score(y_test, y_pred_proba)
        print(f"ROC-AUC Score: {auc:.4f}")
    except:
        pass
    
    # Confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    print(f"\nConfusion Matrix:")
    print(f"  True Negatives:  {tn}")
    print(f"  False Positives: {fp}")
    print(f"  False Negatives: {fn}")
    print(f"  True Positives:  {tp}")
    
    # Cross-validation score
    cv_scores = cross_val_score(voting_clf, X_train_tfidf, y_train, cv=5, scoring='f1_weighted')
    print(f"\nCross-Validation F1 (5-fold): {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    
    # Save models
    print("\n💾 Saving models...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(voting_clf, MODELS_DIR / "email_ensemble.joblib")
    print(f"   ✅ Ensemble: models/email_ensemble.joblib")
    
    joblib.dump(tfidf, MODELS_DIR / "email_vectorizer.joblib")
    print(f"   ✅ Vectorizer: models/email_vectorizer.joblib")
    
    # Save metadata
    metadata = {
        'model_type': 'voting_ensemble',
        'components': list(dict(ensemble_models).keys()),
        'n_features': X_train_tfidf.shape[1],
        'test_samples': len(y_test),
        'test_accuracy': float(np.mean(y_pred == y_test)),
        'training_samples': len(y_train),
        'phishing_samples': n_phishing,
        'legitimate_samples': n_legit
    }
    with open(MODELS_DIR / "email_ensemble_metadata.json", 'w') as f:
        json.dump(metadata, f, indent=2)


def train_url_ensemble():
    """Train ensemble for URL detection"""
    print("\n" + "="*60)
    print("🧠 TRAINING URL ENSEMBLE MODEL")
    print("="*60)
    
    urls, labels = load_url_dataset()
    if len(urls) == 0:
        print("⚠️  No URL samples found. Skipping.")
        return

    print(f"\n📊 Dataset: {len(urls)} samples ({labels.count(1)} phishing, {labels.count(0)} legit)")
    
    # Enrich URLs with structural features
    print("🔗 Enriching URLs with structural features...")
    urls_enriched = [enrich_url(u) for u in urls]
    
    X_train, X_test, y_train, y_test = train_test_split(
        urls_enriched, labels, test_size=0.2, random_state=42, stratify=labels
    )
    
    print(f"📏 Train: {len(X_train)}, Test: {len(X_test)}")
    
    # TF-IDF with character n-grams (better for URLs)
    print("🔤 Computing character-level TF-IDF features...")
    tfidf = TfidfVectorizer(
        max_features=12000,
        ngram_range=(2, 4),
        analyzer='char_wb',
        sublinear_tf=True,
        max_df=0.95,
        min_df=2
    )
    X_train_tfidf = tfidf.fit_transform(X_train)
    X_test_tfidf = tfidf.transform(X_test)
    
    print(f"   ✅ {X_train_tfidf.shape[1]} features")
    
    # Class weight
    n_phishing = labels.count(1)
    n_legit = labels.count(0)
    class_weight_ratio = n_legit / n_phishing
    
    # Component models
    print("🏗️  Building ensemble components...")
    
    rf = RandomForestClassifier(
        n_estimators=500,
        max_depth=30,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        n_jobs=-1,
        random_state=42
    )
    print("   • RandomForest (500 trees, depth=30)")
    
    gb = GradientBoostingClassifier(
        n_estimators=300,
        learning_rate=0.1,
        max_depth=8,
        min_samples_split=5,
        subsample=0.8,
        random_state=42
    )
    print("   • GradientBoosting (300 trees, lr=0.1)")
    
    ensemble_models = [('rf', rf), ('gb', gb)]
    ensemble_weights = [2, 2]
    
    if HAS_XGBOOST:
        xgb = XGBClassifier(
            n_estimators=300,
            learning_rate=0.1,
            max_depth=7,
            scale_pos_weight=class_weight_ratio,
            random_state=42,
            verbosity=0,
            n_jobs=-1
        )
        ensemble_models.append(('xgb', xgb))
        ensemble_weights.append(2)
        print("   • XGBoost (300 trees, lr=0.1)")
    
    print("\n🎯 Training ensemble...")
    voting_clf = VotingClassifier(
        estimators=ensemble_models,
        voting='soft',
        weights=ensemble_weights
    )
    voting_clf.fit(X_train_tfidf, y_train)
    
    # Evaluation
    print("\n📊 EVALUATION ON TEST SET")
    print("-" * 60)
    
    y_pred = voting_clf.predict(X_test_tfidf)
    y_pred_proba = voting_clf.predict_proba(X_test_tfidf)[:, 1]
    
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=["Legitimate", "Phishing"]))
    
    try:
        auc = roc_auc_score(y_test, y_pred_proba)
        print(f"ROC-AUC Score: {auc:.4f}")
    except:
        pass
    
    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    print(f"\nConfusion Matrix:")
    print(f"  True Negatives:  {tn}")
    print(f"  False Positives: {fp}")
    print(f"  False Negatives: {fn}")
    print(f"  True Positives:  {tp}")
    
    # Save
    print("\n💾 Saving models...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    
    joblib.dump(voting_clf, MODELS_DIR / "url_ensemble.joblib")
    print(f"   ✅ Ensemble: models/url_ensemble.joblib")
    
    joblib.dump(tfidf, MODELS_DIR / "url_vectorizer.joblib")
    print(f"   ✅ Vectorizer: models/url_vectorizer.joblib")


def main():
    print(f"\n🚀 ML ENSEMBLE TRAINING PIPELINE")
    print(f"BASE_DIR:     {BASE_DIR}")
    print(f"DATASETS_DIR: {DATASETS_DIR}")
    print(f"MODELS_DIR:   {MODELS_DIR}")
    
    if not DATASETS_DIR.exists():
        print(f"\n❌ Datasets directory not found: {DATASETS_DIR}")
        return
    
    train_email_ensemble()
    print("\n" + "="*60 + "\n")
    train_url_ensemble()
    
    print("\n✅ TRAINING COMPLETE!")
    print("Models saved to: backend/models/")
    print("\nNext: Start ML server with: python ml_server_enhanced.py")


if __name__ == "__main__":
    main()
