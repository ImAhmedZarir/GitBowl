import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBUnBVmpdN5-OPa88FaxTHrfC6UsOpedxM",
  authDomain: "gitbowl.firebaseapp.com",
  projectId: "gitbowl",
  storageBucket: "gitbowl.firebasestorage.app",
  messagingSenderId: "123682022326",
  appId: "1:123682022326:web:a3a10a0107f6d589361717",
  measurementId: "G-K7HZXXHZTJ",
};

// Initialize Firebase app safely
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

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

export { signInWithPopup, fbSignOut };
