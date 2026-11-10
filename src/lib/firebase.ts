import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  fetchSignInMethodsForEmail,
  linkWithCredential,
} from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : ({} as any);

const firebaseConfig = {
  apiKey: env["VITE_FIREBASE_API_KEY"] || "AIzaSyBUnBVmpdN5-OPa88FaxTHrfC6UsOpedxM",
  authDomain: env["VITE_FIREBASE_AUTH_DOMAIN"] || "gitbowl.firebaseapp.com",
  projectId: env["VITE_FIREBASE_PROJECT_ID"] || "gitbowl",
  storageBucket: env["VITE_FIREBASE_STORAGE_BUCKET"] || "gitbowl.firebasestorage.app",
  messagingSenderId: env["VITE_FIREBASE_MESSAGING_SENDER_ID"] || "123682022326",
  appId: env["VITE_FIREBASE_APP_ID"] || "1:123682022326:web:a3a10a0107f6d589361717",
  measurementId: env["VITE_FIREBASE_MEASUREMENT_ID"] || "G-K7HZXXHZTJ",
};

// Initialize Firebase app safely
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const githubProvider = new GithubAuthProvider();
githubProvider.addScope("repo");
githubProvider.addScope("read:user");

// Safe client-side analytics
if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        getAnalytics(app);
      }
    })
    .catch(() => {});
}

export {
  signInWithPopup,
  fbSignOut,
  GithubAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithCredential,
};
