import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Hardcoding the production Render URL to completely bypass local Expo cache issues
export const BASE_URL = "https://phishguard-mobileapp.onrender.com";

const API_BASE_URL = `${BASE_URL}/api`;

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const finalHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!authToken) {
    authToken = await AsyncStorage.getItem("token");
  }

  if (authToken) {
    finalHeaders.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: finalHeaders,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      (data && (data.error || data.message)) ||
      "Request failed. Please try again.";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function register(name, email, password) {
  return request("/auth/register", {
    method: "POST",
    body: { name, email, password },
  });
}

export function forgotPassword(email) {
  return request("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

/**
 * DEPRECATED: Firebase handles password reset via email link.
 * Users click the link in their email and reset password on Firebase's hosted page.
 * Kept for backwards compatibility in case the ResetPasswordScreen is accessed directly.
 */
export function resetPassword(email, otp, newPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { email, otp, newPassword },
  });
}

export function getProfile() {
  return request("/auth/me", { method: "GET" });
}

export function updateProfile(name, email) {
  return request("/auth/profile", {
    method: "PUT",
    body: { name, email },
  });
}

export function changePassword(currentPassword, newPassword) {
  return request("/auth/change-password", {
    method: "PUT",
    body: { currentPassword, newPassword },
  });
}

export function deleteAccount() {
  return request("/auth/account", { method: "DELETE" });
}

export function send2FACode() {
  return request("/auth/2fa/send", { method: "POST" });
}

export function verify2FACode(code, enable) {
  return request("/auth/2fa/verify", {
    method: "POST",
    body: { code, enable },
  });
}



export function analyzePhishing(content, type) {
  return request("/phishing/analyze", {
    method: "POST",
    body: { content, type },
  });
}

export function submitReport(payload) {
  return request("/reports", {
    method: "POST",
    body: payload,
  });
}

export function getLearningModules() {
  return request("/learning/modules", {
    method: "GET",
  });
}

export function generateModule({ topic, level }) {
  return request("/learning/modules/generate", {
    method: "POST",
    body: { topic, level },
  });
}

export function getLearningModule(moduleId) {
  return request(`/learning/modules/${moduleId}`, {
    method: "GET",
  });
}

export function saveLearningProgress(payload) {
  return request("/learning/progress", {
    method: "POST",
    body: payload,
  });
}

export function getIncidentProcedures() {
  return request("/incidents/procedures", {
    method: "GET",
  });
}

export function generateIncidentPlan(payload) {
  return request("/incidents", {
    method: "POST",
    body: payload,
  });
}

export function getReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  return request(`/reports${query ? `?${query}` : ""}`, { method: "GET" });
}

export function getReportStats() {
  return request("/reports/stats/summary", { method: "GET" });
}
