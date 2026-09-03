import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/*
  Replace ONLY these values with the Firebase Web App configuration
  from Firebase Console -> Project settings -> Your apps.
*/
// export const firebaseConfig = {
//   apiKey: "PASTE_YOUR_FIREBASE_API_KEY_HERE",
//   authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
//   projectId: "PASTE_YOUR_PROJECT_ID_HERE",
//   storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
//   messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID_HERE",
//   appId: "PASTE_YOUR_APP_ID_HERE"
// };


export const firebaseConfig = {
  apiKey: "AIzaSyCgAsF-ya4cgtpSWpoaLAnVsSA5zHXnLCU",
  authDomain: "ran-ep7-90428.firebaseapp.com",
  projectId: "ran-ep7-90428",
  storageBucket: "ran-ep7-90428.firebasestorage.app",
  messagingSenderId: "1019107926870",
  appId: "1:1019107926870:web:d5fbfc8240405222a06cf7",
  measurementId: "G-5SKL6F04QC",
};

export const firebaseConfigured =
  Boolean(firebaseConfig.apiKey) &&
  !String(firebaseConfig.apiKey).includes("PASTE_YOUR_") &&
  Boolean(firebaseConfig.projectId) &&
  !String(firebaseConfig.projectId).includes("PASTE_YOUR_");

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };