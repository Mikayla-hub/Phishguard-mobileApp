// Firebase client SDK initialization for React Native (Expo)
// 1. Install core packages:
//      npx expo install firebase @react-native-async-storage/async-storage
// 2. Replace firebaseConfig with your project values from the Firebase console
//    (Project settings → General → Your apps → Web app).

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// TODO: paste your real config here from Firebase console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Initialize Firebase app (ensure singleton across reloads)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth:
// - Web: default getAuth (browser persistence)
// - Native: initializeAuth with AsyncStorage persistence
let firebaseAuth;
if (Platform.OS === "web") {
  firebaseAuth = getAuth(app);
} else {
  firebaseAuth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { firebaseAuth };
export const firestore = getFirestore(app);
export default app;
