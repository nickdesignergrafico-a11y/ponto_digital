import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  FileSpreadsheet, 
  Send, 
  Trash2, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  User as UserIcon, 
  Calendar, 
  Eye, 
  ChevronLeft,
  Check,
  Plus,
  HelpCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { createNotification } from '../../lib/notifications';
import TimecardSheet from '../employee/TimecardSheet';
import { User } from '../../types';

interface BlankTimecard {
  id: string;
  userId: string;
  userName: string;
  month: number;
  year: number;
  postoName: string;
  instructions: string;
  status: 'pending' | 'filled' | 'approved';
  createdAt: string;
  filledAt?: string;
}

export default function BlankTimecardManager() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State
  const [blankSheets, setBlankSheets] = useState<BlankTimecard[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [postoName, setPostoName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Active filling/viewing session state
  const [activeRequest, setActiveRequest] = useState<BlankTimecard | null>(null);

  // Fetch Users & Real-time Blank Timecards
  useEffect(() => {
    // 1. Fetch all employees
    const fetchEmployees = async () => {
      try {
        const q = query(collection(db, 'users'), where('active', '==', true));
        const snapshot = await getDocs(q);
        const empList = snapshot.docs
          .map(d => ({ uid: d.id, ...d.data() } as User))
          .filter(u => u.role === 'employee');
        setUsers(empList);
      } catch (err) {
        console.error("Error fetching employees:", err);
      }
    };

    fetchEmployees();

    // 2. Real-time blank timecards subscription
    let sheetsQuery = query(collection(db, 'blankTimecards'));
    if (!isAdmin && user) {
      sheetsQuery = query(collection(db, 'blankTimecards'), where('userId', '==', user.uid));
    }

    const unsubscribe = onSnapshot(sheetsQuery, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BlankTimecard));
      // Sort newest first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBlankSheets(list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to blankTimecards:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setFormError("Selecione um colaborador.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const selectedUser = users.find(u => u.uid === selectedUserId);
      if (!selectedUser) throw new Error("Colaborador não encontrado.");

      const newSheet = {
        userId: selectedUserId,
        userName: selectedUser.name,
        month: Number(selectedMonth),
        year: Number(selectedYear),
        postoName: postoName.trim() || selectedUser.postoName || 'Portaria Principal',
        instructions: instructions.trim() || 'Favor realizar o preenchimento manual dos seus horários oficiais deste período.',
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'blankTimecards'), newSheet);

      // Create Notification
      const monthLabel = format(new Date(selectedYear, selectedMonth - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
      await createNotification(
        selectedUserId,
        'Folha em Branco Liberada',
        `A administração liberou uma folha de ponto em branco para preenchimento de ${monthLabel}.`,
        'warning',
        'blank_timecard'
      );

      setFormSuccess("Folha de ponto em branco enviada com sucesso para o colaborador!");
      setPostoName('');
      setInstructions('');
      setSelectedUserId('');
    } catch (err: any) {
      console.error("Error sending blank timecard:", err);
      setFormError(err.message || "Erro ao salvar solicitação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Request
  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja realmente excluir esta solicitação? Isso removerá a permissão de edição do colaborador.")) {
      try {
        await deleteDoc(doc(db, 'blankTimecards', id));
      } catch (err) {
        console.error("Error deleting blank timecard request:", err);
        alert("Erro ao excluir solicitação.");
      }
    }
  };

  // Approve Blank Timecard Manual Adjustments
  const handleApprove = async (sheet: BlankTimecard) => {
    if (window.confirm(`Deseja aprovar e homologar o preenchimento manual de ${sheet.userName}?`)) {
      try {
        await updateDoc(doc(db, 'blankTimecards', sheet.id), {
          status: 'approved'
        });

        const monthLabel = format(new Date(sheet.year, sheet.month - 1, 1), "MMMM/yyyy", { locale: ptBR });
        await createNotification(
          sheet.userId,
          'Folha Manual Homologada',
          `Sua folha de ponto em branco preenchida de ${monthLabel} foi aprovada e homologada pelo Administrador.`,
          'success',
          'signed_timecards'
        );
      } catch (err) {
        console.error("Error approving sheet:", err);
        alert("Erro ao aprovar folha.");
      }
    }
  };

  const getMonthName = (monthNum: number) => {
    const d = new Date(2026, monthNum - 1, 1);
    return format(d, 'MMMM', { locale: ptBR });
  };

  // Render filling/viewing session directly
  if (activeRequest) {
    // If Admin is viewing, pass the target employee so they can review/edit/sign as admin
    // If Employee is viewing, pass themselves so they can edit
    const targetEmployeeUser = isAdmin ? {
      uid: activeRequest.userId,
      name: activeRequest.userName,
      postoName: activeRequest.postoName,
      role: 'employee' as const,
      active: true,
      cpf: '',
      email: '',
      createdAt: ''
    } : undefined;

    return (
      <div className="p-1 sm:p-4 animate-fade-in text-slate-800">
        <TimecardSheet 
          adminSelectedUser={targetEmployeeUser}
          initialMonth={new Date(activeRequest.year, activeRequest.month - 1, 1)}
          isBlankTimecardMode={activeRequest.status === 'pending' || !isAdmin}
          blankTimecardId={activeRequest.id}
          onBackToBlankManager={() => setActiveRequest(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16 text-slate-800">
      
      {/* Page Header */}
      <div className="text-left select-none">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-550 text-white rounded-3xl shadow-lg shadow-indigo-500/10">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Folha de Ponto em Branco</h1>
            <p className="text-slate-500 font-medium text-sm sm:text-base mt-0.5">
              {isAdmin 
                ? "Envie folhas limpas para preenchimento manual do colaborador em caso de falhas ou correções extraordinárias."
                : "Consulte e preencha as folhas de ponto solicitadas pela administração para correção de dados."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Admin Form: Only visible to admins */}
        {isAdmin && (
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-slate-200/80 rounded-[2.5rem] p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-4">
                <Send className="w-5 h-5 text-indigo-550" />
                Liberar Nova Folha
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                {formError && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs font-semibold">
                    <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
                    <p>{formError}</p>
                  </div>
                )}

                {formSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-2.5 text-emerald-700 text-xs font-semibold">
                    <CheckCircle className="w-4.5 h-4.5 text-emerald-500 shrink-0 mt-0.5" />
                    <p>{formSuccess}</p>
                  </div>
                )}

                {/* Select User */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Colaborador *
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        const u = users.find(x => x.uid === e.target.value);
                        if (u) setPostoName(u.postoName || '');
                      }}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-550/20 focus:border-indigo-550 outline-none transition-all text-sm font-semibold text-slate-750 appearance-none cursor-pointer"
                    >
                      <option value="">Selecione um colaborador...</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>
                          {u.name} ({u.postoName || 'Sem Posto'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Period Selectors */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Mês de Referência
                    </label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-550/20 focus:border-indigo-550 outline-none transition-all text-sm font-semibold text-slate-750 cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {getMonthName(idx + 1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Ano
                    </label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-550/20 focus:border-indigo-550 outline-none transition-all text-sm font-semibold text-slate-750 cursor-pointer"
                    >
                      <option value={2026}>2026</option>
                      <option value={2025}>2025</option>
                      <option value={2027}>2027</option>
                    </select>
                  </div>
                </div>

                {/* PostoName overrides */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Posto de Trabalho (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Portaria Principal ou Shopping"
                    value={postoName}
                    onChange={(e) => setPostoName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-550/20 focus:border-indigo-550 outline-none transition-all text-sm font-semibold text-slate-800"
                  />
                </div>

                {/* Instructions */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Instruções para o Colaborador
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Instruções para que o vigilante preencha os horários (ex: 'O coletor biométrico falhou do dia 10 ao 15, preencha os horários corretos'.)"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-550/20 focus:border-indigo-550 outline-none transition-all text-sm font-medium text-slate-800 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3.5 rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/10 active:scale-98"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? "Enviando..." : "Enviar Solicitação"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* List of Blank Sheets (2 cols if admin, 3 cols if employee) */}
        <div className={isAdmin ? "lg:col-span-2 space-y-4" : "lg:col-span-3 space-y-4"}>
          
          <div className="bg-white border border-slate-200/80 rounded-[2.5rem] p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-4">
              <FileSpreadsheet className="w-5 h-5 text-indigo-550" />
              {isAdmin ? "Histórico de Folhas Solicitadas" : "Minhas Folhas de Ponto em Branco"}
            </h2>

            {loading ? (
              <div className="py-12 text-center text-slate-400 font-medium">Carregando histórico...</div>
            ) : blankSheets.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2 select-none">
                <HelpCircle className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="font-bold text-sm text-slate-500">Nenhuma folha de ponto em branco encontrada</p>
                <p className="text-xs text-slate-400">
                  {isAdmin 
                    ? "Utilize o formulário ao lado para liberar uma folha para preenchimento."
                    : "Você não possui solicitações pendentes de folha de ponto em branco."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {blankSheets.map((sheet) => {
                  const monthLabel = format(new Date(sheet.year, sheet.month - 1, 1), "MMMM/yyyy", { locale: ptBR });
                  
                  return (
                    <div 
                      key={sheet.id}
                      className="border border-slate-150 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-indigo-100 hover:shadow-sm transition-all text-left bg-slate-50/40"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-slate-900 capitalize text-sm">
                            {monthLabel}
                          </span>
                          
                          {/* Status badge */}
                          {sheet.status === 'pending' && (
                            <span className="text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Pendente
                            </span>
                          )}
                          {sheet.status === 'filled' && (
                            <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Preenchida
                            </span>
                          )}
                          {sheet.status === 'approved' && (
                            <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Homologada
                            </span>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            {sheet.userName}
                          </div>
                        )}

                        <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                          <span className="font-black text-slate-400 uppercase tracking-wide text-[9px]">Posto:</span>
                          {sheet.postoName}
                        </p>

                        <div className="bg-white border border-slate-100/80 rounded-2xl p-3 mt-2 text-xs font-medium text-slate-600 leading-relaxed italic border-l-4 border-l-indigo-400">
                          <p className="font-bold text-[9px] text-indigo-900 uppercase notranslate not-italic tracking-wider mb-1">Instruções:</p>
                          "{sheet.instructions}"
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                        
                        {/* Fill sheet for collaborator */}
                        {!isAdmin && sheet.status === 'pending' && (
                          <button
                            onClick={() => setActiveRequest(sheet)}
                            className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-2.5 px-4 rounded-xl text-xs shadow-md shadow-indigo-600/10 cursor-pointer w-full sm:w-auto transition-all"
                          >
                            <Plus className="w-4 h-4" />
                            Preencher Folha
                          </button>
                        )}

                        {/* View sheet for collaborator / admin */}
                        {(isAdmin || sheet.status !== 'pending') && (
                          <button
                            onClick={() => setActiveRequest(sheet)}
                            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs cursor-pointer w-full sm:w-auto transition-all shadow-sm"
                          >
                            <Eye className="w-4 h-4 text-slate-400" />
                            {sheet.status === 'pending' ? "Visualizar Folha" : "Ver Detalhes"}
                          </button>
                        )}

                        {/* Admin approval */}
                        {isAdmin && sheet.status === 'filled' && (
                          <button
                            onClick={() => handleApprove(sheet)}
                            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-4 rounded-xl text-xs cursor-pointer w-full sm:w-auto transition-all shadow-md shadow-emerald-600/10"
                          >
                            <Check className="w-4 h-4" />
                            Homologar
                          </button>
                        )}

                        {/* Delete request */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(sheet.id)}
                            className="p-2.5 text-rose-600 hover:text-white hover:bg-rose-650 border border-rose-100 hover:border-rose-600 rounded-xl transition-all cursor-pointer w-full sm:w-auto flex items-center justify-center"
                            title="Excluir solicitação"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="sm:hidden ml-2 text-xs font-bold">Excluir Solicitação</span>
                          </button>
                        )}

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
