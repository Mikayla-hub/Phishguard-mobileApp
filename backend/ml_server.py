"""
FastAPI server that exposes the trained Random Forest models
for live phishing detection.

Prerequisites (from backend folder):
  1) node export_training_data.js
  2) pip install -r ml_requirements.txt
  3) python ml_train_random_forest.py

Run the API:
  uvicorn ml_server:app --host 0.0.0.0 --port 8000

Your Node backend will call this when ML_API_URL is set
  (defaults to http://localhost:8000).
"""

from pathlib import Path
from typing import Optional

import joblib
from fastapi import FastAPI
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"

EMAIL_MODEL_PATH = MODELS_DIR / "email_random_forest.joblib"
URL_MODEL_PATH = MODELS_DIR / "url_random_forest.joblib"


def load_model(path: Path):
  if not path.exists():
    return None
  return joblib.load(path)


email_model = load_model(EMAIL_MODEL_PATH)
url_model = load_model(URL_MODEL_PATH)

app = FastAPI(title="CyberGuardian ML API", version="1.0.0")


class EmailRequest(BaseModel):
  text: str


class UrlRequest(BaseModel):
  url: str


@app.get("/health")
def health():
  return {
    "status": "ok",
    "email_model_loaded": email_model is not None,
    "url_model_loaded": url_model is not None,
  }


@app.post("/ml/email")
def analyze_email(req: EmailRequest):
  if email_model is None:
    return {"error": "email model not loaded"}

  proba = email_model.predict_proba([req.text])[0][1]
  label = "phishing" if proba >= 0.5 else "legit"

  return {
    "phishingProbability": float(proba),
    "label": label,
  }


@app.post("/ml/url")
def analyze_url(req: UrlRequest):
  if url_model is None:
    return {"error": "url model not loaded"}

  proba = url_model.predict_proba([req.url])[0][1]
  label = "phishing" if proba >= 0.5 else "legit"

  return {
    "phishingProbability": float(proba),
    "label": label,
  }

if __name__ == "__main__":
  import uvicorn
  uvicorn.run("ml_server:app", host="0.0.0.0", port=8000, reload=True)
