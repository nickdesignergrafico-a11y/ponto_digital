import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { 
  BarChart3, 
  Users, 
  Clock, 
  Briefcase, 
  Settings, 
  LogOut, 
  ChevronRight,
  Home,
  FileSpreadsheet,
  FileText,
  Wallet,
  Menu,
  X,
  Plus,
  MessageSquare,
  FileCheck,
  Palmtree,
  Smartphone,
  Download,
  ClipboardList,
  ShieldCheck,
  BookOpen,
  User as UserIcon,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { CompanyConfig as CompanyType, User } from '../../types';

// Admin Views
import UserManagement from '../admin/UserManagement';
import AdminReports from '../admin/AdminReports';
import CompanyConfig from '../admin/CompanyConfig';
import OrdersManagement from '../admin/OrdersManagement';
import AdminRequests from '../admin/AdminRequests';
import TimecardReceipts from '../admin/TimecardReceipts';
import AdminVacations from '../admin/AdminVacations';
import BlankTimecardManager from '../admin/BlankTimecardManager';
import ServicePostsManagement from '../admin/ServicePostsManagement';

// Employee Views
import TimeClock from '../employee/TimeClock';
import MyRequests from '../employee/MyRequests';
import MySalarySlips from '../employee/MySalarySlips';
import EmployeeHome from '../employee/EmployeeHome';
import MyProfile from '../employee/MyProfile';
import MyBenefits from '../employee/MyBenefits';
import MealAllowanceReceipts from '../employee/MealAllowanceReceipts';
import NotificationTray from '../notifications/NotificationTray';
import TimecardSheet from '../employee/TimecardSheet';
import ChatManager from '../chat/ChatManager';
import OccurrenceBook from '../occurrences/OccurrenceBook';
import ShiftBook from '../occurrences/ShiftBook';
import SignedTimecards from '../employee/SignedTimecards';

type View = 'home' | 'users' | 'punch' | 'requests' | 'payroll' | 'reports' | 'orders' | 'config' | 'timecard' | 'benefits' | 'chat' | 'timecard_receipts' | 'benefit_receipts' | 'admin_vacations' | 'occurrences' | 'signed_timecards' | 'shift_book' | 'service_posts' | 'blank_timecard' | 'profile';

export default function Dashboard() {
  const { user, switchAdminUser } = useAuth();
  const [currentView, setCurrentView] = useState<View>('home');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [companyConfig, setCompanyConfig] = useState<CompanyType | null>(null);
  const [selectedEmployeeForTimecard, setSelectedEmployeeForTimecard] = useState<User | null>(null);
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date | null>(null);
  const [userFilterTab, setUserFilterTab] = useState<'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco' | 'admins'>('ativos');

  // Switch Admin states
  const [showSwitchAdminModal, setShowSwitchAdminModal] = useState(false);
  const [adminList, setAdminList] = useState<User[]>([]);
  const [loadingAdminList, setLoadingAdminList] = useState(false);

  const handleOpenSwitchAdminModal = async () => {
    setShowSwitchAdminModal(true);
    setLoadingAdminList(true);
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'admin'));
      const snapshot = await getDocs(q);
      const admins = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      setAdminList(admins);
    } catch (err) {
      console.error("Erro ao buscar administradores:", err);
    } finally {
      setLoadingAdminList(false);
    }
  };

  const handleConfirmSwitchAdmin = (targetAdmin: User) => {
    if (targetAdmin.uid === user?.uid) {
      setShowSwitchAdminModal(false);
      return;
    }
    switchAdminUser(targetAdmin);
    setShowSwitchAdminModal(false);
  };

  // States to hold counts of pending documents for alignment indicators
  const [pendingSlipsCount, setPendingSlipsCount] = useState<number>(0);
  const [pendingBenefitsCount, setPendingBenefitsCount] = useState<number>(0);

  // PWA states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [showPwaModal, setShowPwaModal] = useState(false);

  const isAdmin = user?.role === 'admin';

  // Listen to PWA install event
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Initial check (already running in standalone?)
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsInstallable(false);
    } else {
      // Show install option generally as compatibility fallback/instructions
      setIsInstallable(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerNativeInstall = async () => {
    if (!deferredPrompt) {
      setShowPwaModal(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'company'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyConfig(docSnap.data() as CompanyType);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to global custom events for view switching
  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setCurrentView(customEvent.detail as View);
        // On mobile, minimize sidebar automatically
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('switch-dashboard-view', handleSwitch);
    return () => window.removeEventListener('switch-dashboard-view', handleSwitch);
  }, []);

  // Listen to pending documents for current employee
  useEffect(() => {
    if (!user || isAdmin) {
      setPendingSlipsCount(0);
      setPendingBenefitsCount(0);
      return;
    }

    const slipsQuery = query(
      collection(db, 'salarySlips'),
      where('userId', '==', user.uid),
      where('signed', '==', false)
    );
    const unsubscribeSlips = onSnapshot(slipsQuery, (snapshot) => {
      setPendingSlipsCount(snapshot.size);
    }, (error) => {
      console.error("Error listening to pending salary slips:", error);
    });

    const benefitsQuery = query(
      collection(db, 'benefitReceipts'),
      where('userId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubscribeBenefits = onSnapshot(benefitsQuery, (snapshot) => {
      setPendingBenefitsCount(snapshot.size);
    }, (error) => {
      console.error("Error listening to pending benefit receipts:", error);
    });

    return () => {
      unsubscribeSlips();
      unsubscribeBenefits();
    };
  }, [user, isAdmin]);

  const menuItems = isAdmin ? [
    { id: 'home', label: 'Painel', icon: BarChart3 },
    { id: 'users', label: 'Colaboradores', icon: Users },
    { id: 'timecard_receipts', label: 'Recebimento de Folhas', icon: FileSpreadsheet },
    { id: 'blank_timecard', label: 'Folha em Branco', icon: FileText },
    { id: 'payroll', label: 'Gestão de Holerites', icon: Wallet },
    { id: 'admin_vacations', label: 'Gestão de Férias CLT', icon: Palmtree },
    { id: 'benefit_receipts', label: 'Recibo de Vale Refeição', icon: FileCheck },
    { id: 'requests', label: 'Solicitações', icon: Briefcase },
    { id: 'chat', label: 'Chat Interno', icon: MessageSquare },
    { id: 'occurrences', label: 'Livro de Ocorrência', icon: ClipboardList },
    { id: 'shift_book', label: 'Livro de Turno', icon: BookOpen },
    { id: 'service_posts', label: 'Postos de Serviço', icon: ShieldCheck },
    { id: 'signed_timecards', label: 'Folhas Homologadas', icon: ShieldCheck },
    { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
    { id: 'orders', label: 'Pedidos', icon: Briefcase },
    { id: 'profile', label: 'Meu Perfil', icon: UserIcon },
    { id: 'config', label: 'Configuração', icon: Settings },
  ] : [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'punch', label: 'Registrar Ponto', icon: Clock },
    { id: 'timecard', label: 'Folha de Ponto', icon: FileSpreadsheet },
    { id: 'blank_timecard', label: 'Folha em Branco', icon: FileText },
    { id: 'requests', label: 'Férias e Abonos', icon: Briefcase },
    { id: 'chat', label: 'Chat Interno', icon: MessageSquare },
    { id: 'occurrences', label: 'Livro de Ocorrência', icon: ClipboardList },
    { id: 'shift_book', label: 'Livro de Turno', icon: BookOpen },
    { id: 'signed_timecards', label: 'Folhas Homologadas', icon: ShieldCheck },
    { id: 'benefits', label: 'Meus Benefícios', icon: Wallet },
    { id: 'payroll', label: 'Holerites', icon: Wallet },
    { id: 'benefit_receipts', label: 'Recibo de Vale Refeição', icon: FileCheck },
    { id: 'profile', label: 'Meu Perfil', icon: UserIcon },
  ];

  const renderView = () => {
    // Permission guard
    const isAllowed = (view: View) => {
      const adminOnly: View[] = ['users', 'reports', 'orders', 'timecard_receipts', 'admin_vacations', 'service_posts'];
      const employeeOnly: View[] = ['punch'];
      if (isAdmin && employeeOnly.includes(view)) return false;
      if (!isAdmin && adminOnly.includes(view)) return false;
      return true;
    };

    if (!isAllowed(currentView)) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <X className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Acesso Restrito</h2>
          <p className="text-slate-500">Você não tem permissão para visualizar esta seção.</p>
        </div>
      );
    }

    switch (currentView) {
      case 'home':
        return isAdmin ? (
          <AdminReports 
            onViewUsersTab={(tab) => {
              setUserFilterTab(tab);
              setCurrentView('users');
            }}
            onViewRequests={() => {
              setCurrentView('requests');
            }}
            onViewEmployeeTimecard={async (userId) => {
              try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists()) {
                  setSelectedEmployeeForTimecard({ uid: userDoc.id, ...userDoc.data() } as User);
                  setSelectedMonthDate(null);
                  setCurrentView('timecard');
                } else {
                  console.error("Colaborador não encontrado!");
                }
              } catch (err) {
                console.error("Erro ao buscar colaborador:", err);
              }
            }}
          />
        ) : (
          <EmployeeHome onNavigate={setCurrentView} />
        );
      case 'users':
        return (
          <UserManagement 
            initialTab={userFilterTab}
            onTabChange={setUserFilterTab}
            onViewTimecard={(emp) => {
              setSelectedEmployeeForTimecard(emp);
              setSelectedMonthDate(null);
              setCurrentView('timecard');
            }} 
          />
        );
      case 'punch':
        return <TimeClock />;
      case 'timecard':
        return (
          <TimecardSheet 
            onNavigate={setCurrentView} 
            adminSelectedUser={selectedEmployeeForTimecard || undefined}
            initialMonth={selectedMonthDate || undefined}
            onBackToUsers={() => {
              setSelectedEmployeeForTimecard(null);
              const cameFromReceipts = selectedMonthDate !== null;
              setSelectedMonthDate(null);
              if (cameFromReceipts) {
                setCurrentView('timecard_receipts');
              } else {
                setCurrentView('users');
              }
            }}
          />
        );
      case 'timecard_receipts':
        return (
          <TimecardReceipts 
            onViewTimecard={(emp, monthDate) => {
              setSelectedEmployeeForTimecard(emp);
              setSelectedMonthDate(monthDate);
              setCurrentView('timecard');
            }} 
          />
        );
      case 'requests':
        return isAdmin ? <AdminRequests /> : <MyRequests />;
      case 'admin_vacations':
        return <AdminVacations />;
      case 'payroll':
        return <MySalarySlips />;
      case 'signed_timecards':
        return <SignedTimecards />;
      case 'benefit_receipts':
        return <MealAllowanceReceipts />;
      case 'benefits':
        return <MyBenefits />;
      case 'reports':
        return (
          <AdminReports 
            onViewUsersTab={(tab) => {
              setUserFilterTab(tab);
              setCurrentView('users');
            }}
            onViewRequests={() => {
              setCurrentView('requests');
            }}
            onViewEmployeeTimecard={async (userId) => {
              try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists()) {
                  setSelectedEmployeeForTimecard({ uid: userDoc.id, ...userDoc.data() } as User);
                  setSelectedMonthDate(null);
                  setCurrentView('timecard');
                } else {
                  console.error("Colaborador não encontrado!");
                }
              } catch (err) {
                console.error("Erro ao buscar colaborador:", err);
              }
            }}
          />
        );
      case 'orders':
        return <OrdersManagement />;
      case 'chat':
        return <ChatManager />;
      case 'occurrences':
        return <OccurrenceBook />;
      case 'shift_book':
        return <ShiftBook />;
      case 'service_posts':
        return <ServicePostsManagement />;
      case 'blank_timecard':
        return <BlankTimecardManager />;
      case 'profile':
        return <MyProfile />;
      case 'config':
        return isAdmin ? <CompanyConfig /> : <MyProfile />;
      default:
        return <div>View em desenvolvimento</div>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          {companyConfig?.logoUrl ? (
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center p-1 bg-slate-50">
              <img src={companyConfig.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xs">{companyConfig?.name?.charAt(0) || 'PD'}</span>
            </div>
          )}
          <span className="font-bold text-slate-900 truncate max-w-[120px]">
            {companyConfig?.name || 'PontoDigital'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isInstallable && (
            <button 
              onClick={() => setShowPwaModal(true)} 
              className="p-2 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center relative cursor-pointer"
              title="Instalar Aplicativo"
            >
              <Smartphone className="w-5 h-5 text-emerald-600 animate-pulse" />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            </button>
          )}
          <NotificationTray onNavigate={setCurrentView} />
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-0 z-40 bg-slate-900 md:relative md:translate-x-0 transition-transform duration-300 md:w-72 flex flex-col pt-20 md:pt-0 border-r border-slate-800",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg overflow-hidden shrink-0",
            companyConfig?.logoUrl ? "bg-white p-2" : (isAdmin ? "bg-blue-600 shadow-blue-500/20" : "bg-indigo-600 shadow-indigo-500/20")
          )}>
            {companyConfig?.logoUrl ? (
              <img src={companyConfig.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              isAdmin ? <BarChart3 className="text-white w-6 h-6" /> : <Home className="text-white w-6 h-6" />
            )}
          </div>
          <div className="overflow-hidden">
            <h2 className="text-white font-bold text-lg leading-tight truncate">
              {companyConfig?.name || 'PontoDigital'}
            </h2>
            <p className={cn(
              "text-[10px] font-black uppercase tracking-widest",
              isAdmin ? "text-blue-400" : "text-indigo-400"
            )}>
              {isAdmin ? 'Gestão de RH' : 'Minha Jornada'}
            </p>
          </div>
        </div>

        <div className="px-4 py-6 md:py-2 flex-1 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            const showBadge = !isAdmin && (
              (item.id === 'payroll' && pendingSlipsCount > 0) ||
              (item.id === 'benefit_receipts' && pendingBenefitsCount > 0)
            );
            const badgeCount = item.id === 'payroll' ? pendingSlipsCount : pendingBenefitsCount;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id as View);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative",
                  currentView === item.id 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="font-medium">{item.label}</span>
                {showBadge && (
                  <span className="ml-auto mr-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white leading-none shadow-md shadow-rose-500/40 animate-pulse">
                    {badgeCount}
                  </span>
                )}
                {currentView === item.id && !showBadge && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </button>
            );
          })}
        </div>

        {/* PWA Direct Download Banner */}
        {isInstallable && (
          <div className="mx-4 mb-3 p-4 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/20 rounded-2xl flex flex-col gap-3 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-emerald-500/20 overflow-hidden">
                <img src="/pwa-icon.png" alt="App Icon" className="w-full h-full object-cover" />
              </div>
              <div className="overflow-hidden">
                <p className="text-white font-semibold text-sm">Instalar Aplicativo</p>
                <p className="text-slate-400 text-xs truncate">Acesso na tela de início</p>
              </div>
            </div>
            <button
              onClick={() => {
                if (deferredPrompt) {
                  triggerNativeInstall();
                } else {
                  setShowPwaModal(true);
                }
              }}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-600/10 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Instalar Sentinela</span>
            </button>
          </div>
        )}

        <div className="p-4 border-t border-slate-800">
          <div className="mb-3 px-4 py-3 bg-slate-800/50 rounded-2xl flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold overflow-hidden border border-slate-700 shrink-0">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user?.name.charAt(0)
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-white font-medium truncate text-sm">{user?.name}</p>
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-tight truncate">
                  {user?.role === 'admin' ? 'Administrador do Sistema' : 'Colaborador'}
                </p>
              </div>
            </div>

            {user?.role === 'admin' && (
              <button 
                onClick={handleOpenSwitchAdminModal}
                className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 active:bg-indigo-600/70 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Trocar Administrador</span>
              </button>
            )}
          </div>
          <button 
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-400/10 transition-all font-medium text-sm"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="hidden md:flex justify-end mb-6">
            <NotificationTray onNavigate={setCurrentView} />
          </div>
          {renderView()}
        </div>
      </main>

      {/* PWA Instructions Modal */}
      <AnimatePresence>
        {showPwaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPwaModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative bg-slate-900 border border-slate-800 text-white w-full max-w-md rounded-3xl p-6 shadow-2xl overflow-hidden"
            >
              {/* Glow accent */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex justify-between items-start relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 p-0.5 shadow-xl shadow-emerald-500/20 overflow-hidden border border-emerald-500/40">
                    <img src="/pwa-icon.png" alt="Sentinela Icon" className="w-full h-full object-cover rounded-[14px]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-100">Instalar o Sentinela</h3>
                    <p className="text-xs text-slate-400">Controle de Ponto Inteligente</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPwaModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-6 space-y-4 relative z-10">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Adicione o aplicativo à tela inicial do seu celular ou computador para bater o ponto e ver seus holerites com apenas um toque, sem precisar digitar o site toda vez.
                </p>

                {deferredPrompt ? (
                  <div className="bg-slate-850 border border-slate-800/40 p-4 rounded-2xl flex flex-col gap-3">
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Disponível para Instalação</span>
                    <button
                      onClick={triggerNativeInstall}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Instalar Agora</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 pt-2">
                    {/* iOS Specific */}
                    <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-full">iOS (iPhone Safari)</span>
                      </div>
                      <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
                        <li>Toque no botão de <strong className="text-slate-100 font-medium">Compartilhar</strong> (ícone do quadrado com flecha pra cima) na barra do Safari.</li>
                        <li>Role a lista e clique em <strong className="text-slate-100 font-medium">Adicionar à Tela de Início</strong>.</li>
                        <li>Toque em <strong className="text-emerald-400 font-semibold">Adicionar</strong> no canto superior direito para confirmar.</li>
                      </ol>
                    </div>

                    {/* Android/Chrome Manual */}
                    <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-full">Android / Chrome</span>
                      </div>
                      <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
                        <li>Toque nos <strong className="text-slate-100 font-medium">três pontinhos</strong> no canto superior direito do Chrome.</li>
                        <li>Selecione <strong className="text-slate-100 font-medium">Adicionar à tela de início</strong> ou <strong className="text-slate-100 font-medium">Instalar aplicativo</strong>.</li>
                        <li>Confirme no botão e pronto!</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/60 flex justify-end relative z-10">
                <button
                  onClick={() => setShowPwaModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 text-slate-200 hover:text-white font-semibold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Switch Administrator Modal */}
      <AnimatePresence>
        {showSwitchAdminModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSwitchAdminModal(false)}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative bg-slate-900 border border-slate-800 text-white w-full max-w-lg rounded-3xl p-6 shadow-2xl overflow-hidden z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-extrabold text-white leading-tight">Trocar Administrador do Sistema</h3>
                    <p className="text-xs text-slate-400">Alterne para outro administrador mantendo a mesma tela</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSwitchAdminModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Admin List */}
              {loadingAdminList ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm font-medium">Carregando lista de administradores...</p>
                </div>
              ) : adminList.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  <p className="text-sm">Nenhum administrador cadastrado no sistema.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {adminList.map((admin) => {
                    const isCurrent = admin.uid === user?.uid;
                    return (
                      <div 
                        key={admin.uid}
                        className={cn(
                          "p-4 rounded-2xl border transition-all flex items-center justify-between gap-3",
                          isCurrent 
                            ? "bg-indigo-950/40 border-indigo-500/50 shadow-md shadow-indigo-500/10" 
                            : "bg-slate-800/50 border-slate-700/60 hover:border-slate-600 hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold overflow-hidden border border-slate-600 shrink-0">
                            {admin.photoURL ? (
                              <img src={admin.photoURL} alt={admin.name} className="w-full h-full object-cover" />
                            ) : (
                              admin.name.charAt(0)
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-bold text-sm truncate">{admin.name}</p>
                              {isCurrent && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500 text-white tracking-wider">
                                  Ativo
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400 text-xs truncate">{admin.email}</p>
                            <p className="text-slate-500 text-[10px] uppercase font-semibold truncate mt-0.5">
                              {admin.postoName || 'Portaria Principal'} • {admin.department || 'RH / ADMIN'}
                            </p>
                          </div>
                        </div>

                        {isCurrent ? (
                          <span className="text-indigo-400 text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 whitespace-nowrap">
                            Sessão Atual
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmSwitchAdmin(admin)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap cursor-pointer active:scale-95 flex items-center gap-1.5"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Alternar</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setShowSwitchAdminModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
