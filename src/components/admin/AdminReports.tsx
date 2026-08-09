import { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, limit, where, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Attendance, User } from '../../types';
import { 
  TrendingUp, 
  Users, 
  Clock, 
  Calendar,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  FileCheck,
  X,
  Loader2,
  FileText,
  DollarSign,
  UserCheck,
  UserX,
  MapPin,
  AlertCircle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';

const MOCK_DATA = [
  { name: 'Seg', presenca: 45 },
  { name: 'Ter', presenca: 52 },
  { name: 'Qua', presenca: 48 },
  { name: 'Qui', presenca: 61 },
  { name: 'Sex', presenca: 55 },
  { name: 'Sab', presenca: 12 },
  { name: 'Dom', presenca: 5 },
];

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return 'Agora';
  try {
    const parsedDate = parseFirestoreTimestamp(timestamp);
    if (!isNaN(parsedDate.getTime())) {
      return format(parsedDate, "HH:mm '•' dd/MM/yyyy", { locale: ptBR });
    }
    return 'Agora';
  } catch (err) {
    console.error("Error formatting timestamp in AdminReports:", err);
    return 'Agora';
  }
};

interface AdminReportsProps {
  onViewEmployeeTimecard?: (userId: string) => void;
  onViewUsersTab?: (tab: 'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco') => void;
  onViewRequests?: () => void;
}

export default function AdminReports({ onViewEmployeeTimecard, onViewUsersTab, onViewRequests }: AdminReportsProps) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [activeUserCount, setActiveUserCount] = useState(0);
  const [dismissedUserCount, setDismissedUserCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [bankHours, setBankHours] = useState('0h 00m');
  const [bankMinutes, setBankMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [datePreset, setDatePreset] = useState<'all' | 'today' | '02_08' | 'custom'>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const filteredAttendance = attendance.filter(item => {
    // Search filter
    const matchesSearch = !searchQuery || 
      (item.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.postoName || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Date preset filter
    if (!item.timestamp) return true;
    const d = parseFirestoreTimestamp(item.timestamp);
    if (isNaN(d.getTime())) return true;

    if (datePreset === 'today') {
      return format(d, 'yyyy-MM-dd') === todayStr;
    }

    if (datePreset === '02_08') {
      const aug2 = new Date(2026, 7, 2, 0, 0, 0); // 02/08/2026
      return d >= aug2;
    }

    if (datePreset === 'custom') {
      if (startDateFilter) {
        const start = new Date(startDateFilter + 'T00:00:00');
        if (!isNaN(start.getTime()) && d < start) return false;
      }
      if (endDateFilter) {
        const end = new Date(endDateFilter + 'T23:59:59');
        if (!isNaN(end.getTime()) && d > end) return false;
      }
    }

    return true;
  });
  const uniquePresentToday = new Set(
    attendance.filter(r => {
      if (!r.timestamp) return false;
      try {
        const d = parseFirestoreTimestamp(r.timestamp);
        return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === todayStr;
      } catch {
        return false;
      }
    }).map(r => r.userId)
  ).size;

  const handleExport = async (type: 'attendance' | 'users' | 'slips') => {
    setExportingType(type);
    try {
      let csvContent = "";
      
      if (type === 'attendance') {
        const snapshot = await getDocs(query(collection(db, 'attendance'), orderBy('timestamp', 'desc')));
        const records = snapshot.docs.map(doc => doc.data());
        
        const headers = ["ID Registro", "Data", "Hora", "Colaborador", "Tipo de Registro", "Assinado", "Latitude", "Longitude"];
        const rows = records.map((r: any) => {
          let dateStr = "";
          let timeStr = "";
          
          if (r.timestamp) {
            try {
              const d = parseFirestoreTimestamp(r.timestamp);
              if (!isNaN(d.getTime())) {
                dateStr = format(d, 'dd/MM/yyyy', { locale: ptBR });
                timeStr = format(d, 'HH:mm:ss', { locale: ptBR });
              }
            } catch (err) {
              console.error(err);
            }
          }
          
          const typeMap: Record<string, string> = {
            entry: 'Entrada Principal',
            lunch_out: 'Saída Almoço',
            lunch_in: 'Retorno Almoço',
            exit: 'Saída Principal'
          };
          
          return [
            r.id || "",
            dateStr,
            timeStr,
            r.userName || "Colaborador",
            typeMap[r.type] || r.type || "",
            r.signature ? "Sim" : "Não",
            r.location?.latitude || "",
            r.location?.longitude || ""
          ];
        });
        
        csvContent = [headers.join(";"), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
      } else if (type === 'users') {
        const snapshot = await getDocs(collection(db, 'users'));
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const headers = ["UID", "Nome Completo", "CPF", "E-mail", "Cargo/Perfil", "Escala de Trabalho", "Salário Base", "Telefone", "Endereço", "Data de Admissão", "Status"];
        const rows = records.map((u: any) => {
          return [
            u.id,
            u.name || "",
            u.cpf || "",
            u.email || "",
            u.role === 'admin' ? "Administrador" : "Colaborador",
            u.workScale === '12x36' ? "12x36" : "Padrão (5x2)",
            u.salary ? `R$ ${u.salary.toFixed(2)}` : "",
            u.phone || "",
            u.address || "",
            u.admissionDate || "",
            u.active ? "Ativo" : "Inativo"
          ];
        });
        
        csvContent = [headers.join(";"), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
      } else if (type === 'slips') {
        const snapshot = await getDocs(query(collection(db, 'salarySlips'), orderBy('year', 'desc'), orderBy('month', 'desc')));
        const records = snapshot.docs.map(doc => doc.data());
        
        const usersSnap = await getDocs(collection(db, 'users'));
        const userMap = new Map<string, string>();
        usersSnap.docs.forEach(doc => {
          const u = doc.data();
          userMap.set(doc.id, u.name || "");
        });
        
        const headers = ["Competência", "Colaborador", "Salário Bruto (Base)", "Salário Líquido", "Status de Assinatura", "Data de Emissão"];
        const rows = records.map((s: any) => {
          const userName = userMap.get(s.userId) || "Colaborador Desconhecido";
          const competence = `${String(s.month).padStart(2, '0')}/${s.year}`;
          const issuedAtStr = s.issuedAt ? format(new Date(s.issuedAt), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : "";
          
          return [
            competence,
            userName,
            s.baseSalary ? `R$ ${s.baseSalary.toFixed(2)}` : "R$ 0,00",
            s.netSalary ? `R$ ${s.netSalary.toFixed(2)}` : "R$ 0,00",
            s.signed ? "Assinado Digitalmente" : "Pendente",
            issuedAtStr
          ];
        });
        
        csvContent = [headers.join(";"), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
      }
      
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      
      const fileNames = {
        attendance: `relatorio_frequencia_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`,
        users: `relatorio_cadastro_funcionarios_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`,
        slips: `relatorio_financeiro_holerites_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`,
      };
      
      link.setAttribute('download', fileNames[type as keyof typeof fileNames]);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setShowExportModal(false);
    } catch (err: any) {
      console.error(err);
      alert("Erro ao exportar relatório: " + (err.message || String(err)));
    } finally {
      setExportingType(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    let localAttendance: Attendance[] = [];
    let localUsers: any[] = [];
    let pendingRequestsSize = 0;

    const processStats = (attendanceList: Attendance[], usersList: any[], pendingRequestsCountVal: number) => {
      setAttendance(attendanceList);
      setUserCount(usersList.length);
      const activeCount = usersList.filter(u => u.active !== false).length;
      const dismissedCount = usersList.filter(u => u.active === false).length;
      setActiveUserCount(activeCount);
      setDismissedUserCount(dismissedCount);
      setPendingRequestsCount(pendingRequestsCountVal);

      // Group by user and day
      const grouped: Record<string, Attendance[]> = {};
      attendanceList.forEach(item => {
        if (!item.userId || !item.timestamp) return;
        const d = parseFirestoreTimestamp(item.timestamp);
        if (isNaN(d.getTime())) return;
        
        const dateStr = format(d, 'yyyy-MM-dd');
        const groupKey = `${item.userId}_${dateStr}`;
        if (!grouped[groupKey]) {
          grouped[groupKey] = [];
        }
        grouped[groupKey].push(item);
      });

      let totalBalanceMinutes = 0;
      
      Object.keys(grouped).forEach(key => {
        const punches = grouped[key];
        const datePart = key.split('_')[1];
        const parsedDate = new Date(datePart + 'T12:00:00');
        const isWeekend = parsedDate.getDay() === 0 || parsedDate.getDay() === 6; // 0=Sunday, 6=Saturday
        
        const pEntry = punches.find(p => p.type === 'entry');
        const pLunchOut = punches.find(p => p.type === 'lunch_out');
        const pLunchIn = punches.find(p => p.type === 'lunch_in');
        const pExit = punches.find(p => p.type === 'exit');
        
        const getTime = (p: Attendance | undefined): Date | null => {
          if (!p || !p.timestamp) return null;
          const t = parseFirestoreTimestamp(p.timestamp);
          return isNaN(t.getTime()) ? null : t;
        };
        
        const tEntry = getTime(pEntry);
        const tLunchOut = getTime(pLunchOut);
        const tLunchIn = getTime(pLunchIn);
        const tExit = getTime(pExit);
        
        let workedMinutes = 0;
        if (tEntry && tExit) {
          if (tLunchOut && tLunchIn) {
            const diff1 = tLunchOut.getTime() - tEntry.getTime();
            if (diff1 > 0) workedMinutes += diff1 / 60000;
            const diff2 = tExit.getTime() - tLunchIn.getTime();
            if (diff2 > 0) workedMinutes += diff2 / 60000;
          } else {
            const diff = tExit.getTime() - tEntry.getTime();
            if (diff > 0) workedMinutes += diff / 60000;
          }
        } else if (tEntry && tLunchOut) {
          const diff = tLunchOut.getTime() - tEntry.getTime();
          if (diff > 0) workedMinutes += diff / 60000;
        } else if (tLunchIn && tExit) {
          const diff = tExit.getTime() - tLunchIn.getTime();
          if (diff > 0) workedMinutes += diff / 60000;
        }
        
        // Only calculate balance for active work days
        if (workedMinutes === 0) return;
        
        const standardMinutes = isWeekend ? 0 : 480; // 8 hours standard workday
        const dailyBalance = workedMinutes - standardMinutes;
        totalBalanceMinutes += dailyBalance;
      });

      const isPositive = totalBalanceMinutes >= 0;
      const absMinutes = Math.abs(Math.round(totalBalanceMinutes));
      const hours = Math.floor(absMinutes / 60);
      const mins = absMinutes % 60;
      const formattedBank = `${isPositive ? '+' : '-'}${hours}h ${mins}m`;
      
      setBankMinutes(totalBalanceMinutes);
      setBankHours(formattedBank);
      setLoading(false);
    };

    // 1. Attendance onSnapshot
    const qAttendance = query(collection(db, 'attendance'), limit(500));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      localAttendance = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
      localAttendance.sort((a, b) => {
        const timeA = parseFirestoreTimestamp(a.timestamp).getTime();
        const timeB = parseFirestoreTimestamp(b.timestamp).getTime();
        return timeB - timeA;
      });
      processStats(localAttendance, localUsers, pendingRequestsSize);
    }, (err) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setQuotaExceeded(true);
      } else {
        console.error("Error setting up real-time attendance in AdminReports:", err);
      }
      setLoading(false);
    });

    // 2. Users onSnapshot
    const qUsers = query(collection(db, 'users'), limit(500));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      localUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      processStats(localAttendance, localUsers, pendingRequestsSize);
    }, (err) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setQuotaExceeded(true);
      } else {
        console.error("Error setting up real-time users in AdminReports:", err);
      }
    });

    // 3. Pending requests size onSnapshot
    const qRequests = query(collection(db, 'requests'), where('status', '==', 'pending'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      pendingRequestsSize = snapshot.size;
      processStats(localAttendance, localUsers, pendingRequestsSize);
    }, (err) => {
      if (err?.code === 'resource-exhausted' || err?.message?.includes('Quota limit exceeded')) {
        setQuotaExceeded(true);
      } else {
        console.error("Error setting up real-time requests in AdminReports:", err);
      }
    });

    return () => {
      unsubAttendance();
      unsubUsers();
      unsubRequests();
    };
  }, []);

  const generateSlipsForAll = async () => {
    setGenerating(true);
    try {
      const uSnapshot = await getDocs(collection(db, 'users'));
      const users = uSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      for (const user of users) {
        const base = (user as any).salary || 2500;
        const irpf = base * 0.075;
        const inss = base * 0.09;
        
        await addDoc(collection(db, 'salarySlips'), {
          userId: user.id,
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          baseSalary: base,
          taxes: [
            { name: 'INSS', amount: inss, type: 'deduction' },
            { name: 'IRPF', amount: irpf, type: 'deduction' }
          ],
          discounts: [
            { name: 'Vale Transporte', amount: 50 },
            { name: 'Plano de Saúde', amount: 120 }
          ],
          netSalary: base - irpf - inss - 50 - 120,
          signed: false,
          issuedAt: new Date().toISOString()
        });
      }
      alert('Holerites gerados com sucesso para todos os colaboradores!');
    } catch (err) {
      alert('Erro ao gerar holerites');
    } finally {
      setGenerating(false);
    }
  };

  if (showAllActivities) {
    return (
      <div className="space-y-8 pb-12 text-left">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Todas as Atividades</h1>
            <p className="text-slate-500 font-medium">
              Histórico de registros de ponto e atividades de ponto dos colaboradores.
            </p>
          </div>
          <button 
            type="button"
            onClick={() => {
              setSearchQuery('');
              setShowAllActivities(false);
            }}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl font-bold font-sans self-start sm:self-auto cursor-pointer transition-all shadow-md shadow-slate-900/10 active:scale-95"
          >
            ← Voltar ao Painel
          </button>
        </div>

        {/* Input de Busca e Filtros de Data */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm shadow-slate-200/50 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 max-w-md">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Filtrar por Colaborador ou Posto</label>
              <input 
                type="text" 
                placeholder="Digite o nome do colaborador ou posto..." 
                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-semibold text-slate-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Date Preset Buttons */}
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Período de Seleção</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDatePreset('all')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    datePreset === 'all'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  Todos os Registros
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('02_08')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    datePreset === '02_08'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  Desde 02/08
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('today')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    datePreset === 'today'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => setDatePreset('custom')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    datePreset === 'custom'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  Personalizado
                </button>
              </div>
            </div>
          </div>

          {/* Custom Date Inputs if 'custom' selected */}
          {datePreset === 'custom' && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Data Inicial</label>
                <input 
                  type="date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Data Final</label>
                <input 
                  type="date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Listagem */}
        <div className="bg-white p-8 rounded-3xl border border-slate-205 shadow-sm">
          <div className="divide-y divide-slate-100">
            {filteredAttendance.map((record) => (
              <div 
                key={record.id} 
                className={cn(
                  "flex items-center justify-between py-4.5 transition-all rounded-2xl px-4 -mx-4 group",
                  onViewEmployeeTimecard ? "cursor-pointer hover:bg-blue-50/50" : ""
                )}
                onClick={() => {
                  if (onViewEmployeeTimecard) {
                    onViewEmployeeTimecard(record.userId);
                  }
                }}
                title={onViewEmployeeTimecard ? "Clique para gerenciar/editar a folha de ponto deste colaborador" : undefined}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "shrink-0 w-11 h-11 rounded-xl flex items-center justify-center shadow-sm",
                    record.type === 'entry' ? "bg-emerald-100 text-emerald-600" : 
                    record.type === 'lunch_out' ? "bg-amber-100 text-amber-600" :
                    record.type === 'lunch_in' ? "bg-sky-100 text-sky-600" :
                    "bg-rose-100 text-rose-600"
                  )}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-black text-slate-900 group-hover:text-blue-700 transition-colors">
                      {record.userName || 'Colaborador'}
                    </p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-0.5">
                      {record.type === 'entry' ? 'Entrada Principal' : 
                       record.type === 'lunch_out' ? 'Saída Almoço' :
                       record.type === 'lunch_in' ? 'Retorno Almoço' :
                       'Saída Principal'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {record.location?.latitude && record.location?.longitude && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${record.location.latitude},${record.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
                      title="Abrir localização exata no Google Maps para verificação anti-fraude"
                    >
                      <MapPin className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                      Ver no Mapa
                    </a>
                  )}

                  <div className="text-right">
                    <p className="text-xs font-mono font-bold text-slate-700">
                      {formatTimestamp(record.timestamp)}
                    </p>
                    {onViewEmployeeTimecard && (
                      <span className="text-[10px] text-blue-600 font-extrabold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider">
                        Ajustar Horário →
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {filteredAttendance.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-16 font-medium">
                Nenhum registro de ponto encontrado.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Visão Geral</h1>
          <p className="text-slate-500">Acompanhe as métricas globais da empresa em tempo real.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={generateSlipsForAll}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all disabled:opacity-50"
          >
            <FileCheck className="w-4 h-4" />
            {generating ? 'Gerando...' : 'Gerar Holerites Mes'}
          </button>
          <button 
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold shadow-sm hover:bg-slate-50 transition-all cursor-pointer active:scale-95"
          >
            <Download className="w-4 h-4" />
            Exportar Relatório
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {[
          { label: 'Colaboradores Ativos', value: activeUserCount, icon: UserCheck, color: 'text-blue-600', bg: 'bg-blue-100', trend: `Ativos`, tabKey: 'ativos' as const },
          { label: 'Colaboradores Desligados', value: dismissedUserCount, icon: UserX, color: 'text-red-500', bg: 'bg-rose-100/60', trend: `Desligados`, tabKey: 'desligados' as const },
          { label: 'Presentes Hoje', value: uniquePresentToday, icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-100', trend: `Sincronizado`, tabKey: 'trabalhando' as const },
          { label: 'Solicitações Pendentes', value: pendingRequestsCount, icon: Calendar, color: 'text-orange-600', bg: 'bg-orange-100', trend: pendingRequestsCount > 0 ? 'Pendente' : 'Regular', isRequests: true },
          { label: 'Banco de Horas (H)', value: bankHours, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-100', trend: bankMinutes >= 0 ? (bankMinutes === 0 ? 'Equilibrado' : 'Superavit') : 'Déficit', tabKey: 'banco' as const },
        ].map((stat, i) => {
          const isUserTabClickable = 'tabKey' in stat && stat.tabKey && onViewUsersTab;
          const isRequestsClickable = 'isRequests' in stat && stat.isRequests && onViewRequests;
          const isClickable = isUserTabClickable || isRequestsClickable;
          return (
            <div 
              key={i} 
              onClick={() => {
                if (isUserTabClickable && 'tabKey' in stat && stat.tabKey) {
                  onViewUsersTab!(stat.tabKey);
                } else if (isRequestsClickable) {
                  onViewRequests!();
                }
              }}
              className={cn(
                "bg-white p-6 rounded-3xl border border-slate-100 shadow-sm shadow-slate-200/50 transition-all duration-300 select-none",
                isClickable
                  ? "cursor-pointer hover:shadow-md hover:scale-[1.03] hover:border-blue-200 active:scale-[0.98]"
                  : ""
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-3 rounded-2xl", stat.bg)}>
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
                <div className={cn(
                  "flex items-center text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider",
                  stat.trend === 'Regular' || stat.trend === 'Ativos' || stat.trend === 'Sincronizado' || stat.trend === 'Superavit' || stat.trend === 'Equilibrado' || stat.trend.startsWith('+') 
                    ? "bg-emerald-100/70 text-emerald-700" 
                    : stat.trend === 'Desligados'
                      ? "bg-rose-100 text-rose-700"
                      : "bg-orange-100 text-orange-600"
                )}>
                  {stat.trend.startsWith && stat.trend.startsWith('+') ? (
                    <ArrowUpRight className="w-3 h-3 mr-0.5" />
                  ) : null}
                  {stat.trend}
                </div>
              </div>
              <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</h3>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm shadow-slate-200/50">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900">Fluxo de Presença Semana</h3>
            <button className="flex items-center gap-1 text-slate-500 text-sm font-medium hover:text-slate-900">
              Esta Semana <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={MOCK_DATA}>
                <defs>
                  <linearGradient id="colorPres" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="presenca" 
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorPres)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm shadow-slate-200/50 text-left">
          <h3 className="text-xl font-bold text-slate-900 mb-6 font-sans">Atividade Recente</h3>
          <div className="space-y-6">
            {attendance.slice(0, 10).map((record) => (
              <div 
                key={record.id} 
                className={cn(
                  "flex items-center justify-between gap-4 p-2 -m-2 rounded-xl transition-all",
                  onViewEmployeeTimecard ? "cursor-pointer hover:bg-blue-50/50" : ""
                )}
                onClick={() => {
                  if (onViewEmployeeTimecard) {
                    onViewEmployeeTimecard(record.userId);
                  }
                }}
                title={onViewEmployeeTimecard ? "Ver folha de ponto" : undefined}
              >
                <div className="flex gap-4 items-center overflow-hidden flex-1">
                  <div className={cn(
                    "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
                    record.type === 'entry' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                  )}>
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-600">{record.userName || 'Colaborador'}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-tighter">
                      {record.type === 'entry' ? 'Entrada Registrada' : 'Saída Registrada'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                      {formatTimestamp(record.timestamp)}
                    </p>
                  </div>
                </div>

                {record.location?.latitude && record.location?.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${record.location.latitude},${record.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs shrink-0"
                    title="Abrir localização exata no Google Maps para verificação anti-fraude"
                  >
                    <MapPin className="w-3 h-3 text-indigo-600 animate-pulse" />
                    Mapa
                  </a>
                )}
              </div>
            ))}
            {attendance.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-12">
                Nenhum registro hoje.
              </div>
            )}
          </div>
          <button 
            type="button"
            onClick={() => setShowAllActivities(true)}
            className="w-full mt-6 py-3 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm cursor-pointer shadow-sm active:scale-[0.98]"
          >
            Ver Todos os Registros
          </button>
        </div>
      </div>

      {/* Modal de Exportação */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all animate-in fade-in zoom-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl border border-slate-100 p-8 relative flex flex-col text-left">
            <button 
              type="button"
              onClick={() => setShowExportModal(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Download className="w-6 h-6 text-blue-600" />
                Exportar Relatório Geral
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Selecione o formato de relatório que deseja exportar. Todos os dados são extraídos em tempo real do banco de dados e salvos em formato CSV (compatível com Excel).
              </p>
            </div>

            <div className="space-y-4">
              {/* Option 1: Attendance */}
              <button
                type="button"
                onClick={() => handleExport('attendance')}
                disabled={exportingType !== null}
                className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/60 hover:border-blue-200/70 transition-all text-left cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">Frequência e Ponto</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Histórico completo de marcações de ponto e geolocalização.</p>
                  </div>
                </div>
                {exportingType === 'attendance' ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 -rotate-90 group-hover:translate-x-1 transition-all" />
                )}
              </button>

              {/* Option 2: Users */}
              <button
                type="button"
                onClick={() => handleExport('users')}
                disabled={exportingType !== null}
                className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/60 hover:border-blue-200/70 transition-all text-left cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">Cadastro de Colaboradores</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Listagem de funcionários com departamentos, CPFs e dados de admissão.</p>
                  </div>
                </div>
                {exportingType === 'users' ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 -rotate-90 group-hover:translate-x-1 transition-all" />
                )}
              </button>

              {/* Option 3: Slips */}
              <button
                type="button"
                onClick={() => handleExport('slips')}
                disabled={exportingType !== null}
                className="w-full flex items-center justify-between p-5 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/60 hover:border-blue-200/70 transition-all text-left cursor-pointer group disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 group-hover:bg-purple-200 transition-colors">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">Resumo de Holerites</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Histórico financeiro, remunerações líquidas e assinaturas de folha.</p>
                  </div>
                </div>
                {exportingType === 'slips' ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 -rotate-90 group-hover:translate-x-1 transition-all" />
                )}
              </button>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="px-5 py-3 rounded-xl hover:bg-slate-50 border border-slate-200 text-slate-500 font-bold text-sm cursor-pointer transition-all active:scale-95"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
