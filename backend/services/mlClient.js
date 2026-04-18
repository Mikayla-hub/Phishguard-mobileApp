const axios = require("axios");

const ML_BASE_URL = process.env.ML_API_URL || "http://localhost:8000";

async function analyzeUrl(url) {
  try {
    const res = await axios.post(`${ML_BASE_URL}/ml/url`, { url });
    return res.data;
  } catch (error) {
    console.warn("ML URL analysis failed", error.message || error);
    return null;
  }
}

async function analyzeEmail({ subject = "", body = "", sender = "" }) {
  const text = `${subject}\n${body}\n${sender}`.trim();
  try {
    const res = await axios.post(`${ML_BASE_URL}/ml/email`, { text });
    return res.data;
  } catch (error) {
    console.warn("ML email analysis failed", error.message || error);
    return null;
  }
}

module.exports = {
  analyzeUrl,
  analyzeEmail,
};

