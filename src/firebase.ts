import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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

// Exporta apenas o banco de dados principal
export const db = getFirestore(app);
