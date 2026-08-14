import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

// Suas credenciais oficiais do banco dos EUA
const firebaseConfig = {
  apiKey: "AIzaSyA9rZGkNSJ6gUzM1AYIuwSOEDA72V9Qo40",
  authDomain: "://firebaseapp.com",
  databaseURL: "https://firebaseio.com",
  projectId: "ponto-digital-1b9c2",
  storageBucket: "ponto-digital-1b9c2.firebasestorage.app",
  messagingSenderId: "214648846167",
  appId: "1:214648846167:web:fee694e6a41fa82898b012"
};

// Inicializa o Firebase no aplicativo
const app = initializeApp(firebaseConfig);

// Exporta os serviços para usar nas outras telas do site
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// Sua chave pública VAPID das notificações
export const VAPID_KEY = "BCuavZLOVZ0klFre7PP0DicFs-rEOkm6Y0HyBVDQ0L4cJYnvCewgPHO0eVqHnG-Td0llQzaeAs8arvC4_Z_HrlI";

import { doc, updateDoc } from 'firebase/firestore';
import { getToken } from 'firebase/messaging';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Função definitiva para gerar o Token e salvar na coleção 'users'
export async function inicializarNotificacoes(idUsuarioLogado: string) {
  if (!idUsuarioLogado) return;

  try {
    const permissao = await Notification.requestPermission();
    
    if (permissao === 'granted') {
      const tokenfcm = await getToken(messaging, { vapidKey: VAPID_KEY });
      
      if (tokenfcm) {
        console.log('Endereço do dispositivo (Token FCM):', tokenfcm);
        
        // Atualiza direto na sua coleção correta 'users'
        const usuarioRef = doc(db, 'users', idUsuarioLogado);
        await updateDoc(usuarioRef, {
          fcmToken: tokenfcm
        });
        console.log('fcmToken gravado com sucesso no perfil do usuário!');
      }
    }
  } catch (erro) {
    console.error('Erro ao configurar notificações push:', erro);
  }
}

// O VIGIA SEGURO: Escuta o login uma única vez sem dar loop na tela branca
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Roda a gravação em segundo plano sem travar o carregamento do React
    inicializarNotificacoes(user.uid);
  }
});
