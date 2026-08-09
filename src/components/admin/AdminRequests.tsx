import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Request } from '../../types';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Check, 
  X, 
  User, 
  ArrowRight, 
  AlertCircle,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  Info,
  Wallet,
  ArrowLeftRight,
  Activity,
  FileText
} from 'lucide-react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  isWithinInterval,
  parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { motion, AnimatePresence } from 'motion/react';

const safeFormatDate = (dateVal: any, formatString: string = 'dd/MM/yy') => {
  if (!dateVal) return '---';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '---';
    return format(d, formatString);
  } catch {
    return '---';
  }
};

export default function AdminRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [responseText, setResponseText] = useState('');
  const [respondingTo, setRespondingTo] = useState<Request | null>(null);
  const [nextStatus, setNextStatus] = useState<'approved' | 'rejected'>('approved');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Request)));
      setLoading(false);
    }, (err: any) => {
      console.error('Error loading requests in real-time:', err);
      setLoading(false);
    });

    return unsub;
  }, []);

  const fetchRequests = async () => {
    // Handled in real time via onSnapshot listener in useEffect
  };

  const handleStatusUpdate = async (request: Request, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'requests', request.id), { 
        status,
        response: responseText
      });
      
      // Update local state
      setRequests(requests.map(r => r.id === request.id ? { ...r, status, response: responseText } : r));

      // Trigger Notification
      const typeLabels: Record<string, string> = {
        vacation: 'férias',
        allowance: 'abono',
        adjustment: 'ajuste de ponto',
        per_diem: 'diária',
        shift_swap: 'troca de plantão'
      };
      
      const typeStr = typeLabels[request.type] || request.type;
      const statusStr = status === 'approved' ? 'aprovada' : 'recusada';
      
      await createNotification(
        request.userId,
        `Solicitação de ${typeStr} ${statusStr}`,
        `${statusStr.charAt(0).toUpperCase() + statusStr.slice(1)}. ${responseText ? `Feedback: ${responseText}` : `Sua solicitação de ${typeStr} para o período de ${safeFormatDate(request.startDate, 'dd/MM/yy')} foi processada.`}`,
        status === 'approved' ? 'success' : 'error',
        'requests'
      );

      setRespondingTo(null);
      setResponseText('');
    } catch (err) {
      alert('Erro ao atualizar solicitação');
    }
  };

  const openResponseModal = (request: Request, status: 'approved' | 'rejected') => {
    setRespondingTo(request);
    setNextStatus(status);
    setResponseText('');
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'vacation': return 'Férias';
      case 'allowance': return 'Abono';
      case 'per_diem': return 'Diária';
      case 'shift_swap': return 'Troca Plantão';
      case 'medical': return 'Atestado Médico';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'vacation': return <CalendarIcon className="w-4 h-4 text-orange-500" />;
      case 'allowance': return <Clock className="w-4 h-4 text-purple-500" />;
      case 'per_diem': return <Wallet className="w-4 h-4 text-emerald-500" />;
      case 'shift_swap': return <ArrowLeftRight className="w-4 h-4 text-blue-500" />;
      case 'medical': return <Activity className="w-4 h-4 text-rose-500" />;
      default: return <Info className="w-4 h-4 text-slate-500" />;
    }
  };

  // Calendar Helpers
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  });

  const getRequestsForDay = (day: Date) => {
    return requests.filter(req => {
      if (req.status === 'rejected') return false;
      const start = parseISO(req.startDate);
      const end = parseISO(req.endDate);
      return isWithinInterval(day, { start, end });
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Afastamentos e Abonos</h1>
          <p className="text-slate-500">Analise solicitações de férias e justificativas de ausência.</p>
        </div>
        
        <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex items-center">
          <button 
            onClick={() => setViewMode('list')}
            className={cn(
              "px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all",
              viewMode === 'list' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <LayoutList className="w-4 h-4" />
            Lista
          </button>
          <button 
            onClick={() => setViewMode('calendar')}
            className={cn(
              "px-4 py-2 rounded-xl flex items-center gap-2 text-xs font-bold transition-all",
              viewMode === 'calendar' ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <CalendarIcon className="w-4 h-4" />
            Calendário
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Colaborador</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Período</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Anexo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition-all group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                        {req.userName?.charAt(0) || 'U'}
                      </div>
                      <span className="font-bold text-slate-700">{req.userName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-2">
                        {getTypeIcon(req.type)}
                        <span className="text-sm font-medium capitalize">{getTypeLabel(req.type)}</span>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <span>{safeFormatDate(req.startDate, 'dd/MM/yy')}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span>{safeFormatDate(req.endDate, 'dd/MM/yy')}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">{req.reason}</p>
                  </td>
                  <td className="px-6 py-4">
                    {req.attachmentUrl ? (
                      <a 
                        href={req.attachmentUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                        title="Ver atestado médico"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Ver Atestado</span>
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium whitespace-nowrap">---</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter block w-fit mb-1",
                      req.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                      req.status === 'pending' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                    )}>
                      {req.status === 'approved' ? 'Aprovado' : req.status === 'pending' ? 'Pendente' : 'Recusado'}
                    </span>
                    {req.response && (
                      <p className="text-[10px] text-slate-400 font-medium italic truncate max-w-[150px]">
                        "{req.response}"
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {req.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openResponseModal(req, 'approved')}
                          className="px-3 py-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                          title="Aprovar com Resposta"
                        >
                          <Check className="w-4 h-4" />
                          <span>Aprovar</span>
                        </button>
                        <button 
                          onClick={() => openResponseModal(req, 'rejected')}
                          className="px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold"
                          title="Rejeitar com Resposta"
                        >
                          <X className="w-4 h-4" />
                          <span>Recusar</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-300 uppercase">Processado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && !loading && (
            <div className="p-20 text-center flex flex-col items-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <CalendarIcon className="w-10 h-10 text-slate-200" />
              </div>
              <h4 className="text-slate-900 font-bold mb-1">Nenhuma solicitação</h4>
              <p className="text-slate-500 text-sm">As solicitações de colaboradores aparecerão aqui.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-bold text-slate-900 capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
              </h3>
              <button 
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-4">
               <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <div className="w-2 h-2 rounded-full bg-blue-500" /> Pendente
               </div>
               <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" /> Aprovado
               </div>
            </div>
          </div>
          
          <div className="grid grid-cols-7 border-b border-slate-100">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day) => (
              <div key={day} className="py-4 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const dayRequests = getRequestsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              
              return (
                <div 
                  key={i} 
                  className={cn(
                    "min-h-[120px] p-2 border-r border-b border-slate-50 relative",
                    !isCurrentMonth && "bg-slate-50/30",
                    (i + 1) % 7 === 0 && "border-r-0"
                  )}
                >
                  <span className={cn(
                    "text-xs font-bold",
                    !isCurrentMonth ? "text-slate-300" : "text-slate-400"
                  )}>
                    {format(day, 'd')}
                  </span>
                  
                  <div className="mt-2 space-y-1">
                    {dayRequests.slice(0, 3).map((req) => (
                      <div 
                        key={req.id}
                        className={cn(
                          "px-2 py-1 rounded-md text-[9px] font-black uppercase truncate border",
                          req.status === 'approved' 
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                            : "bg-blue-50 text-blue-600 border-blue-100"
                        )}
                        title={`${req.userName}: ${req.type}`}
                      >
                        {req.userName?.split(' ')[0]}
                      </div>
                    ))}
                    {dayRequests.length > 3 && (
                      <div className="text-[9px] text-slate-400 font-bold px-2">
                        + {dayRequests.length - 3} outros
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="bg-slate-50 p-6 flex items-start gap-4">
             <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl">
                <Info className="w-5 h-5" />
             </div>
             <div>
                <h4 className="font-bold text-slate-900 leading-none mb-1">Visualização de Escala</h4>
                <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
                  Este calendário exibe todos os afastamentos ativos ou pendentes. 
                  Clique na aba "Lista" para aprovar ou rejeitar solicitações individuais.
                </p>
             </div>
          </div>
        </div>
      )}

      {/* Response Modal */}
      <AnimatePresence>
        {respondingTo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setRespondingTo(null)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  {nextStatus === 'approved' ? 'Aprovar Solicitação' : 'Recusar Solicitação'}
                </h2>
                <button onClick={() => setRespondingTo(null)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <p className="text-sm font-bold text-slate-500 mb-2">Solicitação de {respondingTo.userName}</p>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 italic text-slate-600 text-sm">
                    "{respondingTo.reason}"
                  </div>
                </div>

                {respondingTo.attachmentUrl && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-slate-500">Atestado Médico Anexado</p>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-slate-50 p-2 flex flex-col items-center">
                      <a 
                        href={respondingTo.attachmentUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="group relative block w-full max-h-48 overflow-hidden rounded-xl border border-slate-100 bg-white"
                      >
                        <img 
                          src={respondingTo.attachmentUrl} 
                          alt="Miniatura do Atestado" 
                          referrerPolicy="no-referrer"
                          className="w-full object-contain max-h-48 group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute inset-0 bg-slate-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="bg-white/90 backdrop-blur-sm text-slate-900 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm">Ver em tela cheia</span>
                        </div>
                      </a>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Resposta / Feedback (Opcional)</label>
                  <textarea 
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium resize-none h-32"
                    placeholder="Digite sua resposta para o colaborador..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setRespondingTo(null)}
                    className="flex-1 px-6 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleStatusUpdate(respondingTo, nextStatus)}
                    className={cn(
                      "flex-[2] text-white font-bold px-6 py-4 rounded-xl shadow-lg transition-all",
                      nextStatus === 'approved' 
                        ? "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700" 
                        : "bg-red-600 shadow-red-600/20 hover:bg-red-700"
                    )}
                  >
                    {nextStatus === 'approved' ? 'Confirmar Aprovação' : 'Confirmar Recusa'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

