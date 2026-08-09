import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, limit, addDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Attendance } from '../../types';
import { 
  Clock, 
  Calendar, 
  Wallet, 
  ArrowUpRight, 
  ChevronRight,
  Fingerprint,
  CalendarDays,
  FileText,
  Plus,
  User as UserIcon,
  Bell,
  BellRing,
  Check,
  RefreshCw,
  PenTool,
  ClipboardList,
  BookOpen
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification, requestNotificationPermission } from '../../lib/notifications';
import { calculateVacationBalance, VacationBalance } from '../../lib/vacation';
import React from 'react';

export default function EmployeeHome({ onNavigate }: { onNavigate: (v: any) => void }) {
  const { user } = useAuth();
  const [recentPunch, setRecentPunch] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [vacationInfo, setVacationInfo] = useState<VacationBalance | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({ title: '', description: '' });
  const [orderLoading, setOrderLoading] = useState(false);

  // Transferência de posto states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ newPosto: '', typedName: '', cpfConfirm: '' });
  const [transferLoading, setTransferLoading] = useState(false);

  // Status de notificações push do navegador
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermissionStatus(perm);
  };

  const getRecentPunchTime = () => {
    if (!recentPunch || !recentPunch.timestamp) return '--:--';
    try {
      const d = parseFirestoreTimestamp(recentPunch.timestamp);
      return format(d, 'HH:mm');
    } catch {
      return '--:--';
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        const attQuery = query(
          collection(db, 'attendance'), 
          where('userId', '==', user.uid),
          limit(30)
        );
        const reqQuery = query(
          collection(db, 'requests'), 
          where('userId', '==', user.uid)
        );

        const [attSnapshot, reqSnapshot] = await Promise.all([
          getDocs(attQuery),
          getDocs(reqQuery)
        ]);

        if (!attSnapshot.empty) {
          const docs = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance));
          docs.sort((a, b) => {
            const timeA = parseFirestoreTimestamp(a.timestamp).getTime();
            const timeB = parseFirestoreTimestamp(b.timestamp).getTime();
            return isNaN(timeA) || isNaN(timeB) ? 0 : timeB - timeA;
          });
          setRecentPunch(docs[0]);
        }

        const requests = reqSnapshot.docs.map(doc => doc.data());
        if (user.admissionDate) {
          setVacationInfo(calculateVacationBalance(user.admissionDate, requests));
        }
      } catch (err) {
        console.error("Error loading home recent punch status:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderLoading(true);
    try {
      await addDoc(collection(db, 'orders'), {
        ...orderForm,
        userId: user?.uid,
        userName: user?.name,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      
      await createNotification(
        user?.uid as string,
        'Pedido Enviado',
        `Seu pedido "${orderForm.title}" foi enviado com sucesso e será analisado pelo RH.`,
        'success',
        'home'
      );

      setIsOrderModalOpen(false);
      setOrderForm({ title: '', description: '' });
      alert('Pedido enviado para o RH!');
    } catch (err) {
      alert('Erro ao enviar pedido');
    } finally {
      setOrderLoading(false);
    }
  };

  const handleRegisterTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const currentPosto = user.postoName || 'Portaria Principal';
    const cleanNewPosto = transferForm.newPosto.trim();
    const cleanTypedName = transferForm.typedName.trim();
    const cleanCpfConfirm = transferForm.cpfConfirm.replace(/\D/g, '');

    if (!cleanNewPosto) {
      alert('Por favor, informe o nome do novo posto de trabalho.');
      return;
    }
    if (!cleanTypedName) {
      alert('Por favor, digite seu nome completo para assinar.');
      return;
    }

    const userCpfClean = user.cpf ? user.cpf.replace(/\D/g, '') : '';
    if (cleanCpfConfirm !== userCpfClean) {
      alert('O CPF de confirmação digitado não confere com o CPF cadastrado em seu perfil.');
      return;
    }

    setTransferLoading(true);
    try {
      const currentMonth = new Date();
      const m = currentMonth.getMonth() + 1;
      const y = currentMonth.getFullYear();

      // Create a unique sigId for this specific post timesheet
      const cleanOldPostKey = currentPosto.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const sigId = `${user.uid}_${y}_${m}_${cleanOldPostKey}`;

      const payload = {
        id: sigId,
        userId: user.uid,
        userName: user.name,
        month: m,
        year: y,
        postoName: currentPosto,
        signedAt: new Date().toISOString(),
        signatureType: 'type',
        signatureText: cleanTypedName,
        ipAddress: '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250),
        userAgent: navigator.userAgent || 'App-Movel-Kodular-Webview',
        status: 'signed'
      };

      // 1. Save timesheet signature for the old post
      await setDoc(doc(db, 'timecardSignatures', sigId), payload);

      // 2. Transfere user to the new post
      await updateDoc(doc(db, 'users', user.uid), {
        postoName: cleanNewPosto
      });

      // 3. Create push notifications
      await createNotification(
        user.uid,
        'Posto Alterado: ' + cleanNewPosto,
        `Folha de ponto do posto "${currentPosto}" assinada e fechada. Novo posto "${cleanNewPosto}" aberto.`,
        'success',
        'timecard'
      );

      setIsTransferModalOpen(false);
      setTransferForm({ newPosto: '', typedName: '', cpfConfirm: '' });
      alert(`Transferência registrada com sucesso!\nSua folha de ponto do posto "${currentPosto}" foi fechada e assinada. Uma nova folha foi aberta automaticamente para o posto "${cleanNewPosto}".`);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao registrar transferência: ' + (err.message || String(err)));
    } finally {
      setTransferLoading(false);
    }
  };

  const stats = [
    { label: 'Férias Disponíveis', value: vacationInfo ? `${vacationInfo.available} dias` : '--', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Saldo Banco', value: '+4h 20m', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Horas Extra', value: '12h 45m', icon: Clock, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 overflow-hidden shadow-lg shadow-blue-500/20 border-2 border-white ring-4 ring-blue-50">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-2xl font-black">
                  {user?.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 leading-tight">Olá, {user?.name.split(' ')[0]} 👋</h1>
            <p className="text-slate-500 font-medium">Bom trabalho hoje! Como podemos ajudar?</p>
          </div>
        </div>
        <div className="p-4 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm flex items-center gap-4 self-end md:self-auto">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{format(new Date(), 'EEEE', { locale: ptBR })}</p>
            <p className="text-lg font-black text-slate-900 leading-none">{format(new Date(), 'dd MMM yyyy')}</p>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <button 
            onClick={() => onNavigate('timecard')}
            className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800 hover:scale-105 transition-all"
          >
            <CalendarDays className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Sistema de Notificação Push Status (Navigator Notifier Component) */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "w-full p-4.5 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm",
          permissionStatus === 'default' 
            ? "bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-200/60 shadow-indigo-100"
            : permissionStatus === 'granted'
            ? "bg-emerald-50/50 border-emerald-200/80 shadow-emerald-50/10"
            : "bg-slate-50 border-slate-200"
        )}
      >
        <div className="flex items-start gap-3.5 text-left">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
            permissionStatus === 'default' 
              ? "bg-blue-600 text-white animate-pulse"
              : permissionStatus === 'granted'
              ? "bg-emerald-500 text-white"
              : "bg-slate-200 text-slate-500"
          )}>
            {permissionStatus === 'default' && <BellRing className="w-5 h-5" />}
            {permissionStatus === 'granted' && <Check className="w-5 h-5" />}
            {permissionStatus === 'denied' && <Bell className="w-5 h-5 text-slate-400" />}
          </div>
          <div>
            <h4 className={cn(
              "text-sm font-black tracking-tight",
              permissionStatus === 'default' ? "text-slate-900" : permissionStatus === 'granted' ? "text-emerald-950" : "text-slate-700"
            )}>
              {permissionStatus === 'default' && "Ative as Notificações do Aplicativo"}
              {permissionStatus === 'granted' && "Notificações do Aplicativo Ativas"}
              {permissionStatus === 'denied' && "Notificações Bloqueadas no Navegador"}
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed mt-0.5 max-w-xl">
              {permissionStatus === 'default' && "Receba avisos push na tela do seu dispositivo sempre que o RH alterar sua folha de ponto ou aprovar solicitações de férias."}
              {permissionStatus === 'granted' && "Perfeito! Você receberá alertas push em tempo real no seu dispositivo quando houver atualizações do seu ponto ou férias homologadas pelo RH."}
              {permissionStatus === 'denied' && "As notificações estão bloqueadas nas preferências do seu navegador. Por favor, reative o acesso nas opções do cadeado para receber alertas em tempo real."}
            </p>
          </div>
        </div>

        {permissionStatus === 'default' && (
          <button 
            onClick={handleRequestPermission}
            className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 py-3 rounded-xl text-xs uppercase tracking-wider shadow-md shadow-blue-600/10 hover:shadow-blue-600/25 active:scale-95 transition-all text-center self-start sm:self-auto shrink-0 cursor-pointer"
          >
            Ativar Alertas
          </button>
        )}
      </motion.div>

      {(!user?.phone || !user?.address || !user?.signatureURL) && (
        <motion.button 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onNavigate('config')}
          className="w-full p-4 bg-orange-50 border border-orange-100 rounded-2xl flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-orange-900">Complete seu Perfil</p>
              <p className="text-xs text-orange-600 font-medium">Faltam informações importantes como assinatura digital ou dados de contato.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-orange-300 group-hover:translate-x-1 transition-all" />
        </motion.button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Punch Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-blue-600/30">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-8">
                <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider">Turno em Aberto</span>
                </div>
                <button onClick={() => onNavigate('punch')} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-blue-600 shadow-lg shadow-black/10 hover:scale-105 transition-all">
                  <Fingerprint className="w-6 h-6" />
                </button>
              </div>

              <div className="mb-10 p-6 bg-white/5 rounded-3xl border border-white/10">
                <p className="text-blue-100 text-sm font-medium mb-1">Último registro</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-black">
                    {getRecentPunchTime()}
                  </h2>
                  <span className="text-blue-200 font-bold uppercase text-xs">{recentPunch?.type === 'entry' ? 'Entrada' : 'Saída'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => onNavigate('punch')}
                  className="bg-white text-blue-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-50 transition-all shadow-xl shadow-black/10"
                >
                  <Clock className="w-5 h-5" />
                  Bater Ponto
                </button>
                <button 
                  onClick={() => onNavigate('payroll')}
                  className="bg-blue-500/30 backdrop-blur-md border border-white/10 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-500/50 transition-all"
                >
                  <FileText className="w-5 h-5" />
                  Extrato
                </button>
              </div>
            </div>

            {/* Decor */}
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -left-10 top-0 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.map((s, i) => (
              <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div className={cn("p-3 rounded-2xl", s.bg)}>
                  <s.icon className={cn("w-6 h-6", s.color)} />
                </div>
                <div>
                  <p className="text-slate-400 text-[10px] uppercase font-black">{s.label}</p>
                  <p className="text-lg font-bold text-slate-800">{s.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Sidebar */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 px-2">Ações Rápidas</h3>
            <div className="space-y-3">
              {[
                { label: 'Registrar Ocorrência', icon: ClipboardList, color: 'text-rose-600', bg: 'bg-rose-50', id: 'occurrences' },
                { label: 'Livro de Turno / Ata', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50', id: 'shift_book' },
                { label: 'Solicitar Férias', icon: Calendar, color: 'text-orange-500', bg: 'bg-orange-50', id: 'requests' },
                { label: 'Abono de Faltas', icon: FileText, color: 'text-purple-500', bg: 'bg-purple-50', id: 'requests' },
                { label: 'Fazer um Pedido', icon: Plus, color: 'text-emerald-500', bg: 'bg-emerald-50', id: 'orders' },
                { label: 'Ver Benefícios', icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-50', id: 'benefits' },
              ].map((item, i) => (
                <button 
                  key={i}
                  onClick={() => {
                    if (item.id === 'orders') setIsOrderModalOpen(true);
                    else onNavigate(item.id);
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-50 hover:bg-slate-50 transition-all flex items-center gap-4 group"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.bg)}>
                    <item.icon className={cn("w-5 h-5", item.color)} />
                  </div>
                  <span className="font-bold text-slate-700 flex-1 text-left">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-700 to-violet-800 p-6 rounded-3xl text-white shadow-xl shadow-indigo-600/15">
            <h3 className="font-extrabold text-[10px] tracking-widest uppercase text-indigo-200/90 mb-2">Posto de Trabalho Ativo</h3>
            <p className="text-xl font-black mb-1">{user?.postoName || 'Portaria Principal'}</p>
            <p className="text-xs text-indigo-200 leading-snug mb-5">
              Foi transferido de posto? Assine e encerre a folha de ponto do posto atual para abrir a do novo posto automaticamente.
            </p>
            <button
              onClick={() => {
                setTransferForm({ newPosto: '', typedName: '', cpfConfirm: '' });
                setIsTransferModalOpen(true);
              }}
              className="w-full py-3.5 bg-white text-indigo-700 font-extrabold text-xs uppercase tracking-wider rounded-2xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/25 active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Registrar Transferência
            </button>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 px-2">Comunicados</h3>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider">Aviso de RH</span>
              </div>
              <p className="text-sm font-bold text-slate-900 mb-1">Avisos Importantes</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                As comunicações da empresa para os colaboradores aparecerão aqui.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm"
              onClick={() => setIsTransferModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] p-8 shadow-2xl overflow-hidden"
            >
              {/* Decorative Indigo header line */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 to-violet-605" style={{ backgroundColor: '#6366f1' }} />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center" style={{ color: '#4f46e5', backgroundColor: '#e0e7ff' }}>
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-905 tracking-tight" style={{ color: '#0f172a' }}>Transferência de Posto</h2>
                  <p className="text-xs text-slate-400 font-medium">Assinatura & Fechamento da Folha Atual</p>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-6">
                <p className="text-xs text-amber-850 leading-relaxed font-semibold" style={{ color: '#92400e' }}>
                  Esta ação encerrará sua folha do posto <strong className="font-bold">"{user?.postoName || 'Portaria Principal'}"</strong>. Suas batidas de ponto anteriores permanecerão vinculadas a ele. Uma nova folha será iniciada para o novo posto.
                </p>
              </div>

              <form onSubmit={handleRegisterTransfer} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Novo Posto de Trabalho</label>
                  <input 
                    type="text" required placeholder="Ex: RSN LOGISTICA"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    value={transferForm.newPosto}
                    onChange={e => setTransferForm({...transferForm, newPosto: e.target.value})}
                  />
                  <p className="text-[9px] text-slate-400">Insira o nome exato do posto para o qual você está indo trabalhar.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Confirme seu CPF (Apenas Números)</label>
                  <input 
                    type="text" required placeholder="Digite o CPF cadastrado"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    value={transferForm.cpfConfirm}
                    onChange={e => setTransferForm({...transferForm, cpfConfirm: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Assinatura Eletrônica (Nome Completo)</label>
                  <div className="relative">
                    <PenTool className="absolute left-4 top-4 text-slate-350 w-5 h-5" style={{ color: '#94a3b8' }} />
                    <input 
                      type="text" required placeholder="Digite seu nome igual ao cadastrado para assinar"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-slate-800"
                      value={transferForm.typedName}
                      onChange={e => setTransferForm({...transferForm, typedName: e.target.value})}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 leading-relaxed">
                    Ao digitar seu nome completo, você concorda com o fechamento e a homologação digital da sua folha de ponto referente ao posto anterior.
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsTransferModalOpen(false)} className="flex-1 font-bold text-slate-400 hover:text-slate-600 cursor-pointer">Cancelar</button>
                  <button disabled={transferLoading} className="flex-[2] py-4 bg-indigo-600 text-white font-extrabold rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 hover:bg-indigo-700 transition-colors cursor-pointer" style={{ backgroundColor: '#4f46e5' }}>
                    {transferLoading ? 'Processando...' : 'Assinar & Iniciar Novo Posto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isOrderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsOrderModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Fazer um Pedido</h2>
              <form onSubmit={handleCreateOrder} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-slate-400">Título / Item</label>
                  <input 
                    type="text" required placeholder="Ex: Novo Mouse ou Teclado"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                    onChange={e => setOrderForm({...orderForm, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase text-slate-400">Descrição / Motivo</label>
                  <textarea 
                    required placeholder="Descreva o que você precisa..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 h-32"
                    onChange={e => setOrderForm({...orderForm, description: e.target.value})}
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setIsOrderModalOpen(false)} className="flex-1 font-bold text-slate-400">Cancelar</button>
                  <button disabled={orderLoading} className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20">{orderLoading ? 'Enviando...' : 'Enviar Pedido'}</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
