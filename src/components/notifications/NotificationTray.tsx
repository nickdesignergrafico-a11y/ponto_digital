import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { Notification as DbNotification } from '../../types';
import { Bell, BellOff, CheckCircle2, Info, AlertTriangle, AlertCircle, Trash2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { sendBrowserNotification, requestNotificationPermission } from '../../lib/notifications';

export default function NotificationTray({ onNavigate }: { onNavigate?: (view: any) => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    let isFirstLoad = true;

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DbNotification));
      fetched.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(fetched);

      if (!isFirstLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as DbNotification;
            if (!data.read) {
              sendBrowserNotification(data.title, data.message, data.link);
            }
          }
        });
      }
      isFirstLoad = false;
    });

    return () => unsubscribe();
  }, [user]);

  // Handle requesting permission inside the tray
  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermissionStatus(perm);
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const markAllAsRead = async () => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
            >
              <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  Notificações
                  {unreadCount > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">{unreadCount} novas</span>}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-700"
                    >
                      Ler todas
                    </button>
                  )}
                  <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-900">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {permissionStatus === 'default' && (
                <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-b border-blue-100 p-4 shrink-0">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-500/20">
                      <Bell className="w-4 h-4 animate-pulse" />
                    </div>
                    <div className="text-left flex-1">
                      <h4 className="text-xs font-black text-slate-900">Alertas em tempo real?</h4>
                      <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-0.5">
                        Permita notificações no navegador para saber instantaneamente quando o RH fizer alterações na sua folha ou aprovar férias.
                      </p>
                      <button 
                        onClick={handleRequestPermission}
                        className="mt-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black px-3.5 py-1.5 rounded-xl text-[9px] uppercase tracking-wider transition-all shadow-md shadow-blue-600/15 active:scale-95 cursor-pointer inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Ativar Notificações
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-50">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={cn(
                        "p-4 flex gap-3 group transition-colors cursor-pointer",
                        !n.read ? "bg-blue-50/30" : "hover:bg-slate-50"
                      )}
                      onClick={async () => {
                        if (!n.read) {
                          await markAsRead(n.id);
                        }
                        if (onNavigate && n.link) {
                          const sanitizedLink = n.link.startsWith('#') ? n.link.substring(1) : n.link;
                          onNavigate(sanitizedLink);
                          setIsOpen(false);
                        }
                      }}
                    >
                      <div className="mt-1 shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-sm font-bold", !n.read ? "text-slate-900" : "text-slate-600")}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                            {n.createdAt ? format(parseFirestoreTimestamp(n.createdAt), 'HH:mm', { locale: ptBR }) : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-3 pt-1">
                          {!n.read && (
                            <button 
                              onClick={() => markAsRead(n.id)}
                              className="text-[10px] font-bold text-blue-600 flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" /> Marcar como lida
                            </button>
                          )}
                          <button 
                            onClick={() => deleteNotification(n.id)}
                            className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" /> Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <BellOff className="w-6 h-6 text-slate-200" />
                    </div>
                    <p className="text-slate-400 text-sm font-medium">Nenhuma notificação por aqui.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
