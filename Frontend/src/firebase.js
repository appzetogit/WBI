import { initializeApp } from 'firebase/app';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase app initialized successfully');
} catch (error) {
  console.error('❌ Firebase app initialization failed:', error);
}

export { app };

// Lazy Firebase Services Getters to avoid startup delays
let messaging = null;
let db = null;
let auth = null;
let authModule = null;

export const getFirebaseMessaging = async () => {
  if (!messaging && app) {
    try {
      const { getMessaging } = await import('firebase/messaging');
      messaging = getMessaging(app);
    } catch (error) {
      console.warn('⚠️ Firebase Messaging not supported in this environment:', error);
    }
  }
  return messaging;
};

export const getFirebaseDb = async () => {
  if (!db && app) {
    try {
      const { getDatabase } = await import('firebase/database');
      db = getDatabase(app);
    } catch (error) {
      console.error('Failed to initialize Firebase Database:', error);
    }
  }
  return db;
};

export const getFirebaseAuth = async () => {
  if (app) {
    try {
      if (!authModule) {
        authModule = await import('firebase/auth');
      }
      if (!auth) {
        auth = authModule.getAuth(app);
      }
      return {
        auth,
        GoogleAuthProvider: authModule.GoogleAuthProvider,
        OAuthProvider: authModule.OAuthProvider,
        signInWithPopup: authModule.signInWithPopup
      };
    } catch (error) {
      console.error('Failed to initialize Firebase Auth:', error);
    }
  }
  // Fallback if failed/unsupported
  return { auth: null, GoogleAuthProvider: null, OAuthProvider: null, signInWithPopup: null };
};
