import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

// Credenciais oficiais do banco novo dos EUA
const firebaseConfig = {
  apiKey: "AIzaSyA9rZGkNSJ6gUzM1AYIuwSOEDA72V9Qo40",
  authDomain: "://firebaseapp.com",
  databaseURL: "https://firebaseio.com",
  projectId: "ponto-digital-1b9c2",
  storageBucket: "ponto-digital-1b9c2.firebasestorage.app",
  messagingSenderId: "214648846167",
  appId: "1:214648846167:web:fee694e6a41fa82898b012"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const VAPID_KEY = "BCuavZLOVZ0klFre7PP0DicFs-rEOkm6Y0HyBVDQ0L4cJYnvCewgPHO0eVqHnG-Td0llQzaeAs8arvC4_Z_HrlI";

