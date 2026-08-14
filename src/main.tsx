import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
import { messaging, VAPID_KEY } from './firebase';
import { getToken } from 'firebase/messaging';

// Função automática para ativar as notificações push
async function inicializarNotificacoes() {
  try {
    // 1. Pede permissão ao navegador do usuário
    const permissao = await Notification.requestPermission();
    
    if (permissao === 'granted') {
      console.log('Permissão de notificação concedida!');
      
      // 2. Registra o Service Worker e busca o Token exclusivo usando sua VAPID_KEY
      const tokenfcm = await getToken(messaging, { 
        vapidKey: VAPID_KEY 
      });
      
      if (tokenfcm) {
        console.log('Endereço do dispositivo (Token FCM):', tokenfcm);
        // IMPORTANTE: Esse token que aparece no console é o que salva no cadastro do funcionário
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

// Executa a função assim que o sistema inicia
inicializarNotificacoes();

