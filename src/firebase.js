import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCgAsF-ya4cgtpSWpoaLAnVsSA5zHXnLCU",
  authDomain: "ran-ep7-90428.firebaseapp.com",
  projectId: "ran-ep7-90428",
  storageBucket: "ran-ep7-90428.firebasestorage.app",
  messagingSenderId: "1019107926870",
  appId: "1:1019107926870:web:d5fbfc8240405222a06cf7",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);