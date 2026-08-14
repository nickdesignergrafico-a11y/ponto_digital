import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { messaging, db, VAPID_KEY } from './firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// 1. Função automática para ativar as notificações push e salvar no banco 'users'
async function inicializarNotificacoes(idUsuarioLogado: string) {
  if (!idUsuarioLogado) return;

  try {
    const permissao = await Notification.requestPermission();
    
    if (permissao === 'granted') {
      console.log('Permissão de notificação concedida!');
      
      const tokenfcm = await getToken(messaging, { 
        vapidKey: VAPID_KEY 
      });
      
      if (tokenfcm) {
        console.log('Endereço do dispositivo (Token FCM):', tokenfcm);
        
        // Salva direto na sua coleção correta 'users'
        const usuarioRef = doc(db, 'users', idUsuarioLogado);
        await updateDoc(usuarioRef, {
          fcmToken: tokenfcm
        });
        
        console.log('fcmToken gravado com sucesso no perfil do usuário!');
      } else {
        console.log('Nenhum token gerado. Verifique o arquivo firebase-messaging-sw.js');
      }
    } else {
      console.log('Permissão de notificação negada pelo usuário.');
    }
  } catch (erro) {
    console.error('Erro ao configurar notificações push:', erro);
  }
}

// 2. O PULO DO GATO: Espera o Firebase confirmar que o usuário fez login para rodar a função
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log('Usuário detectado no carregamento:', user.uid);
    inicializarNotificacoes(user.uid); // Passa o ID do logado na hora certa!
  }
});

// 3. Renderiza o site na tela normalmente
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
