import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'info',
  link?: string
) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type,
      read: false,
      link: link || '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Solicita permissão para notificações do navegador (Push local)
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        return permission;
      } catch (err) {
        console.error('Erro ao pedir permissão para notificações:', err);
        return 'default';
      }
    }
    return Notification.permission;
  }
  return 'denied';
};

// Dispara uma notificação nativa do sistema/navegador (Push)
export const sendBrowserNotification = (title: string, body: string, link?: string) => {
  // Ponte Kodular/AppInventor WebViewString para disparar o Notifier nativo no APK
  if (typeof window !== 'undefined' && (window as any).AppInventor) {
    try {
      const payload = {
        action: 'notification',
        title,
        message: body,
        link: link || ''
      };
      (window as any).AppInventor.setWebViewString(JSON.stringify(payload));
    } catch (err) {
      console.error('Erro ao enviar sinal para o Kodular/AppInventor:', err);
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const options: any = {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'ponto-digital-alert',
        renotify: true,
      };
      
      const notification = new Notification(title, options);
      
      notification.onclick = () => {
        window.focus();
        if (link) {
          // Se houver links profundos ou rotas redireciona
          window.location.hash = link;
        }
      };
    } catch (err) {
      console.error('Erro ao disparar notificação do navegador:', err);
    }
  }
};

