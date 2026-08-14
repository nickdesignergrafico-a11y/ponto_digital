import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
import { messaging, db, VAPID_KEY } from './firebase';
import { getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';

// Função automática para ativar as notificações push e salvar no banco
async function inicializarNotificacoes(idUsuarioLogado: string) {
  if (!idUsuarioLogado) return; // Só roda se o funcionário estiver logado

  try {
    // 1. Pede permissão ao celular/navegador do usuário
    const permissao = await Notification.requestPermission();
    
    if (permissao === 'granted') {
      console.log('Permissão de notificação concedida!');
      
      // 2. Busca o Token exclusivo usando sua VAPID_KEY
      const tokenfcm = await getToken(messaging, { 
        vapidKey: VAPID_KEY 
      });
      
      if (tokenfcm) {
        console.log('Endereço do dispositivo (Token FCM):', tokenfcm);
        
        // 3. SALVA AUTOMATICAMENTE NO FIRESTORE DO COLABORADOR
        // Procura o documento dele na coleção 'funcionarios' e atualiza o campo fcmToken
        const funcionarioRef = doc(db, 'funcionarios', idUsuarioLogado);
        await updateDoc(funcionarioRef, {
          fcmToken: tokenfcm
        });
        
        console.log('fcmToken gravado com sucesso no perfil do colaborador!');
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


