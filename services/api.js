import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// IMPORTANT: Verify this is still your current IPv4 address!
const YOUR_LOCAL_IP = "192.168.1.17"; 

const API_BASE_URL =
  Platform.OS === "web"
    ? "http://localhost:3001/api"
    : `http://${YOUR_LOCAL_IP}:3001/api`;

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

export function generateUniqueModule() {
  return request("/learning/modules/generate-unique", {
    method: "POST",
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
