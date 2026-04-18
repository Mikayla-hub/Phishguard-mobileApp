"""
Train Random Forest classifiers directly on the 3 CSV phishing datasets.

Datasets used:
  1. Phishing_Email.csv           (~18,000+ emails)
  2. PhiUSIIL_Phishing_URL_Dataset.csv (~235,000+ URLs)
  3. zimbabwe_phishing_dataset.csv (local, ~20 rows)

Run from the backend folder:
  python ml_train_random_forest.py
"""

import csv
import os
import sys
from pathlib import Path

# Some email text fields exceed Python's default CSV field limit
csv.field_size_limit(sys.maxsize)

from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
import joblib


BASE_DIR = Path(__file__).resolve().parent
DATASETS_DIR = BASE_DIR / "data" / "datasets"
MODELS_DIR = BASE_DIR / "models"


def load_email_datasets():
    """Load email samples from Phishing_Email.csv + zimbabwe_phishing_dataset.csv"""
    texts = []
    labels = []

    # Dataset 1: Phishing_Email.csv  (columns: "Email Text", "Email Type")
    email_csv = DATASETS_DIR / "Phishing_Email.csv"
    if email_csv.exists():
        print(f"Reading {email_csv.name} ...")
        with open(email_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                text = (row.get("Email Text") or "").strip()
                email_type = (row.get("Email Type") or "").strip().lower()
                if text and email_type:
                    texts.append(text)
                    labels.append(1 if "phishing" in email_type else 0)
        print(f"  -> {len(texts)} samples from {email_csv.name}")

    # Dataset 3: zimbabwe_phishing_dataset.csv  (columns: "text", "label")
    zw_csv = DATASETS_DIR / "zimbabwe_phishing_dataset.csv"
    if zw_csv.exists():
        before = len(texts)
        print(f"Reading {zw_csv.name} ...")
        with open(zw_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                text = (row.get("text") or "").strip()
                label = (row.get("label") or "").strip().lower()
                if text and label:
                    texts.append(text)
                    labels.append(1 if label == "phishing" else 0)
        print(f"  -> {len(texts) - before} samples from {zw_csv.name}")

    return texts, labels


def load_url_dataset():
    """Load URL samples from PhiUSIIL_Phishing_URL_Dataset.csv"""
    urls = []
    labels = []

    url_csv = DATASETS_DIR / "PhiUSIIL_Phishing_URL_Dataset.csv"
    if url_csv.exists():
        print(f"Reading {url_csv.name} ...")
        with open(url_csv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = (row.get("URL") or "").strip()
                label = (row.get("label") or "").strip()
                if url and label in ("0", "1"):
                    urls.append(url)
                    labels.append(int(label))
        print(f"  -> {len(urls)} samples from {url_csv.name}")

    return urls, labels


def train_email_model():
    texts, labels = load_email_datasets()
    if len(texts) == 0:
        print("⚠️  No email samples found. Skipping email model.")
        return

    print(f"\nTotal email samples: {len(texts)} "
          f"({labels.count(1)} phishing, {labels.count(0)} legit)")

    X_train, X_test, y_train, y_test = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            max_features=10000,
            ngram_range=(1, 2),
            stop_words="english",
        )),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            n_jobs=-1,
            random_state=42,
        )),
    ])

    print("Training RandomForest for EMAIL samples...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print("\n=== EMAIL MODEL REPORT ===")
    print(classification_report(y_test, y_pred, target_names=["legit", "phishing"]))

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = MODELS_DIR / "email_random_forest.joblib"
    joblib.dump(pipeline, out_path)
    print(f"Saved email model to: {out_path}")


def train_url_model():
    urls, labels = load_url_dataset()
    if len(urls) == 0:
        print("⚠️  No URL samples found. Skipping URL model.")
        return

    print(f"\nTotal URL samples: {len(urls)} "
          f"({labels.count(1)} phishing, {labels.count(0)} legit)")

    X_train, X_test, y_train, y_test = train_test_split(
        urls, labels, test_size=0.2, random_state=42, stratify=labels
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            max_features=10000,
            ngram_range=(1, 3),
            analyzer="char_wb",
        )),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=None,
            n_jobs=-1,
            random_state=42,
        )),
    ])

    print("Training RandomForest for URL samples...")
    pipeline.fit(X_train, y_train)

    y_pred = pipeline.predict(X_test)
    print("\n=== URL MODEL REPORT ===")
    print(classification_report(y_test, y_pred, target_names=["legit", "phishing"]))

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = MODELS_DIR / "url_random_forest.joblib"
    joblib.dump(pipeline, out_path)
    print(f"Saved URL model to: {out_path}")


def main():
    print(f"BASE_DIR:     {BASE_DIR}")
    print(f"DATASETS_DIR: {DATASETS_DIR}")
    print(f"MODELS_DIR:   {MODELS_DIR}\n")

    train_email_model()
    print("\n" + "-" * 50 + "\n")
    train_url_model()
    print("\nTraining complete.")


if __name__ == "__main__":
    main()
