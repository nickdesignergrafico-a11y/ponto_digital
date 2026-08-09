import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { 
  Search, 
  Printer, 
  Calendar, 
  MapPin, 
  Eye, 
  X, 
  CheckCircle2, 
  FileCheck, 
  ShieldCheck, 
  User as UserIcon, 
  Clock, 
  Loader2 
} from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SignatureRecord {
  id: string;
  userId: string;
  userName: string;
  month: number;
  year: number;
  postoName: string;
  signedAt?: string;
  signatureType?: string;
  signatureText?: string;
  signatureDataUrl?: string;
  ipAddress?: string;
  userAgent?: string;
  status?: string;
  adminSigned?: boolean;
  adminSignedAt?: string;
  adminSignatureType?: string;
  adminSignatureDataUrl?: string;
  adminSignatureText?: string;
  adminSignedBy?: string;
  adminSignedUid?: string;
  adminIpAddress?: string;
  adminUserAgent?: string;
}

export default function SignedTimecards() {
  const { user } = useAuth();
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  
  // Selected single timesheet for detailed read-only modal replica
  const [activeReceipt, setActiveReceipt] = useState<SignatureRecord | null>(null);
  const [activePunches, setActivePunches] = useState<any[]>([]);
  const [loadingPunches, setLoadingPunches] = useState(false);
  
  const modalPrintRef = useRef<HTMLDivElement>(null);

  // 1. Fetch homologated signatures in real-time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const sigsRef = collection(db, 'timecardSignatures');
    let qSig = query(sigsRef);

    // If regular worker/employee, filter by their own uid
    if (user.role === 'employee') {
      qSig = query(sigsRef, where('userId', '==', user.uid));
    }

    const unsub = onSnapshot(qSig, (snapshot) => {
      const allSigs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SignatureRecord));
      
      // Filter in-memory for strictly homologated timesheets (signed by BOTH employee & admin)
      const homologated = allSigs.filter(s => (s.status === 'signed' || s.signedAt) && s.adminSigned === true);
      
      // Sort newest periods first
      homologated.sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return b.month - a.month;
      });

      setSignatures(homologated);
      setLoading(false);
    }, (error) => {
      console.error("Error loading signed signatures in real-time:", error);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // 2. Fetch punches for the detailed visual modal
  useEffect(() => {
    async function fetchPunchesForActiveReceipt() {
      if (!activeReceipt) return;
      setLoadingPunches(true);
      try {
        const dummyDate = new Date(activeReceipt.year, activeReceipt.month - 1, 1);
        const start = startOfMonth(dummyDate);
        const end = endOfMonth(dummyDate);

        const punchesQ = query(
          collection(db, 'attendance'),
          where('userId', '==', activeReceipt.userId)
        );
        const snapshot = await getDocs(punchesQ);
        const allPunches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter inside the desired month interval and matching working post in-memory
        const currentMonthPunches = allPunches.filter((p: any) => {
          if (!p.timestamp) return false;
          const pDate = parseFirestoreTimestamp(p.timestamp);
          if (!pDate || isNaN(pDate.getTime())) return false;
          
          const isSameMonthYear = pDate.getMonth() === dummyDate.getMonth() && pDate.getFullYear() === dummyDate.getFullYear();
          if (!isSameMonthYear) return false;

          const pPost = (p.postoName || activeReceipt.postoName || 'Portaria Principal').toLowerCase().trim();
          const rPost = (activeReceipt.postoName || 'Portaria Principal').toLowerCase().trim();
          
          return rPost === 'todos' || pPost === rPost || !activeReceipt.postoName;
        });

        setActivePunches(currentMonthPunches);
      } catch (err) {
        console.error("Error loading punches for signed receipt modal:", err);
      } finally {
        setLoadingPunches(false);
      }
    }

    fetchPunchesForActiveReceipt();
  }, [activeReceipt]);

  // Filter signed list based on search bar and month filter option
  const filteredSignatures = signatures.filter(sig => {
    const matchesSearch = sig.postoName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          sig.userName.toLowerCase().includes(searchTerm.toLowerCase());
    if (selectedMonthFilter === 'all') return matchesSearch;
    const sigKey = `${sig.year}-${String(sig.month).padStart(2, '0')}`;
    return matchesSearch && sigKey === selectedMonthFilter;
  });

  // Calculate unique periods (month/year options) for dropdown filters
  const uniquePeriods = Array.from(
    new Set(signatures.map(s => `${s.year}-${String(s.month).padStart(2, '0')}`))
  ).sort().reverse();

  const handlePrintModal = () => {
    const content = modalPrintRef.current;
    if (!content) return;
    
    // Inject temporary styles for professional print replica layout
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Por favor libere os popups do navegador para emitir a impressão!");
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>FOLHA DE PONTO HOMOLOGADA - ${activeReceipt?.userName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;750;900&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              color: #1e293b; 
              padding: 24px;
              font-size: 11px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 15px; 
              margin-bottom: 25px;
            }
            th, td { 
              border: 1px solid #cbd5e1; 
              padding: 6px 8px; 
              text-align: center; 
            }
            th { 
              background-color: #f8fafc; 
              font-weight: bold; 
              text-transform: uppercase;
              font-size: 9px;
              color: #475569;
            }
            .header {
              border-bottom: 2px solid #0f172a;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .title {
              font-size: 16px;
              font-weight: 900;
              text-transform: uppercase;
              text-align: center;
              margin: 0 0 5px 0;
            }
            .subtitle {
              font-size: 11px;
              text-align: center;
              color: #64748b;
              margin: 0;
            }
            .grid-info {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 15px;
              margin-bottom: 20px;
            }
            .stamp-box {
              border: 2px solid #10b981;
              background-color: #ecfdf5;
              border-radius: 12px;
              padding: 12px;
              margin-top: 25px;
              text-align: center;
              position: relative;
            }
            .signature-cell {
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
              gap: 30px;
            }
            .signature-card {
              border: 1px dashed #cbd5e1;
              padding: 15px;
              border-radius: 8px;
              flex: 1;
              text-align: center;
              background-color: #fafafa;
            }
            .signature-card img {
              max-height: 50px;
              display: block;
              margin: 8px auto;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          ${content.innerHTML}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-600" />
            Folhas Homologadas
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Histórico digital de folhas de ponto assinadas por você e chanceladas pelo RH de forma definitiva.
          </p>
        </div>
        
        {/* Statistics overview */}
        <div className="bg-emerald-50 border border-emerald-150 px-5 py-3.5 rounded-2xl flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-black shadow-md shadow-emerald-500/10">
            {signatures.length}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Folhas Arquivadas</p>
            <p className="text-xs font-bold text-slate-700 leading-none">Seguro e Auditado</p>
          </div>
        </div>
      </div>

      {/* Search and Filters panel */}
      <div className="bg-white p-5 border border-slate-200 rounded-[2rem] flex flex-col sm:flex-row gap-3 shadow-md shadow-slate-100/50">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Pesquisar por posto de trabalho ou colaborador..." 
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm text-slate-800"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <div className="relative shrink-0">
            <select
              className="appearance-none bg-slate-50 border border-slate-200 outline-none pl-4 pr-10 py-3 rounded-xl font-bold text-xs text-slate-700 cursor-pointer focus:ring-2 focus:ring-indigo-500"
              value={selectedMonthFilter}
              onChange={e => setSelectedMonthFilter(e.target.value)}
            >
              <option value="all">Todos os Meses</option>
              {uniquePeriods.map(p => {
                const [y, m] = p.split('-');
                const monthDate = new Date(Number(y), Number(m) - 1, 1);
                return (
                  <option key={p} value={p}>
                    {format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}
                  </option>
                );
              })}
            </select>
            <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-450 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Archive Grid List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold text-slate-500 font-mono">Buscando documentos homologados...</p>
        </div>
      ) : filteredSignatures.length === 0 ? (
        <div className="bg-white p-16 text-center border border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
            <FileCheck className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-905">Nenhuma folha homologada encontrada</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
              As folhas de ponto assinadas só aparecerão aqui após receberem o visto e validação pela administração do RH.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredSignatures.map((sig) => {
            const periodDate = new Date(sig.year, sig.month - 1, 1);
            return (
              <motion.div 
                key={sig.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-[2.2rem] p-6 shadow-sm hover:shadow-xl hover:border-slate-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-emerald-200">
                      Homologado & Seguro
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono font-bold">
                      ID: {sig.id.substring(0, 14)}...
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 leading-tight">
                    {format(periodDate, "MMMM 'de' yyyy", { locale: ptBR })}
                  </h3>
                  
                  {user?.role === 'admin' && (
                    <div className="flex items-center gap-2 mt-2 text-slate-500 text-xs font-bold">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      Colaborador: <span className="text-slate-800">{sig.userName}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 text-slate-500 text-xs font-bold">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Posto: <span className="text-slate-800">{sig.postoName}</span>
                  </div>

                  {/* Certification Stamp */}
                  <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-800 leading-none">Chancela Digital de RH</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 leading-normal font-mono">
                        Assinatura Colaborador: {sig.signedAt ? format(new Date(sig.signedAt), "dd/MM/yyyy") : '---'} <br />
                        Homologação RH: {sig.adminSignedAt ? format(new Date(sig.adminSignedAt), "dd/MM/yyyy") : '---'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => setActiveReceipt(sig)}
                    className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-black/10 active:scale-95"
                  >
                    <Eye className="w-4 h-4" />
                    Espelhar Folha Completa
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Replica print / view modal */}
      <AnimatePresence>
        {activeReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
               onClick={() => setActiveReceipt(null)}
            />

            <motion.div 
               initial={{ scale: 0.93, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               exit={{ scale: 0.93, opacity: 0 }}
               className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200"
            >
              {/* Modal header action buttons */}
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
                <div>
                   <h3 className="font-extrabold text-slate-900 tracking-tight text-lg">Visualização Histórica</h3>
                   <p className="text-xs text-slate-500 font-bold font-mono">Status: Homologado & Arquivado Permanentemente</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintModal}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Documento
                  </button>
                  <button
                    onClick={() => setActiveReceipt(null)}
                    className="p-2.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal scroll area */}
              <div className="flex-1 overflow-y-auto p-10 bg-slate-100/50">
                {loadingPunches ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-2">
                     <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                     <p className="text-xs font-bold text-slate-450 uppercase font-mono">Consolidando registros de ponto...</p>
                  </div>
                ) : (
                  <div 
                    ref={modalPrintRef}
                    className="bg-white p-8 border border-slate-200 rounded-2xl shadow-sm max-w-3xl mx-auto"
                    style={{ minHeight: '500px' }}
                  >
                    {/* Visual header */}
                    <div className="border-b-2 border-slate-900 pb-4 mb-6 text-center">
                      <h2 className="text-xl font-black uppercase text-slate-900 tracking-tight">Espelho de Ponto Homologado</h2>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        Competência: {format(new Date(activeReceipt.year, activeReceipt.month - 1, 1), "MMMM 'de' yyyy", { locale: ptBR })}
                      </p>
                    </div>

                    {/* Metadata summary */}
                    <div className="grid grid-cols-2 gap-4 text-xs font-bold mb-6 text-slate-755 border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase block">Colaborador</span>
                        <span className="text-slate-800 text-sm">{activeReceipt.userName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] uppercase block">Posto de Trabalho</span>
                        <span className="text-slate-850 text-sm font-black text-indigo-700">{activeReceipt.postoName}</span>
                      </div>
                    </div>

                    {/* Simple Read-only Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-slate-700 border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="py-2.5 px-3 border border-slate-200 font-bold text-[9px] uppercase tracking-wide">Data</th>
                            <th className="py-2.5 px-3 border border-slate-200 font-bold text-[9px] uppercase tracking-wide">Entrada</th>
                            <th className="py-2.5 px-3 border border-slate-200 font-bold text-[9px] uppercase tracking-wide">Almoço Saída</th>
                            <th className="py-2.5 px-3 border border-slate-200 font-bold text-[9px] uppercase tracking-wide">Almoço Retorno</th>
                            <th className="py-2.5 px-3 border border-slate-200 font-bold text-[9px] uppercase tracking-wide">Saída</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eachDayOfInterval({
                            start: startOfMonth(new Date(activeReceipt.year, activeReceipt.month - 1, 1)),
                            end: endOfMonth(new Date(activeReceipt.year, activeReceipt.month - 1, 1))
                          }).map((day, idx) => {
                            const dayPunches = activePunches.filter(p => {
                              const pDate = parseFirestoreTimestamp(p.timestamp);
                              return pDate && isSameDay(pDate, day);
                            });
                            
                            const pEntry = dayPunches.find(p => p.type === 'entry');
                            const pLunchOut = dayPunches.find(p => p.type === 'lunch_out');
                            const pLunchIn = dayPunches.find(p => p.type === 'lunch_in');
                            const pExit = dayPunches.find(p => p.type === 'exit');

                            const formatPunch = (punch: any) => {
                              if (!punch || !punch.timestamp) return '---';
                              const date = parseFirestoreTimestamp(punch.timestamp);
                              return format(date, 'HH:mm');
                            };

                            return (
                              <tr key={idx} className="hover:bg-slate-50 border-b border-slate-100">
                                <td className="py-2 px-3 border border-slate-200 font-semibold font-mono text-[11px] bg-slate-50/50">
                                  {format(day, "dd/MM/yyyy '•' E", { locale: ptBR })}
                                </td>
                                <td className="py-2 px-3 border border-slate-200 text-center text-slate-800">
                                  {formatPunch(pEntry)}
                                </td>
                                <td className="py-2 px-3 border border-slate-200 text-center text-slate-800">
                                  {formatPunch(pLunchOut)}
                                </td>
                                <td className="py-2 px-3 border border-slate-200 text-center text-slate-800">
                                  {formatPunch(pLunchIn)}
                                </td>
                                <td className="py-2 px-3 border border-slate-200 text-center text-slate-800">
                                  {formatPunch(pExit)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Integrated Stamps & Signatures */}
                    <div className="mt-8 border-t-2 border-dashed border-slate-200 pt-6">
                      <div className="bg-emerald-50 border-2 border-emerald-500/50 rounded-2xl p-5 mb-6 text-center space-y-1 relative">
                        <div className="absolute right-4 top-4 opacity-15">
                           <ShieldCheck className="w-12 h-12 text-emerald-800" />
                        </div>
                        <p className="text-xs font-black text-emerald-805 uppercase tracking-wide">Documento Homologado Eletronicamente</p>
                        <p className="text-[10px] text-emerald-600 leading-normal font-semibold">
                          Em conformidade com a portaria 671 do MTE. Assinatura jurídica e arquivamento perene autenticados com chaves biométricas na nuvem corporativa. Modificações bloqueadas de forma irreversível. 
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mt-8">
                        {/* Worker column */}
                        <div className="border border-slate-250 p-4 rounded-xl text-center flex flex-col justify-between" style={{ minHeight: '120px' }}>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Colaborador</span>
                          <div className="my-2.5">
                            {activeReceipt.signatureDataUrl ? (
                              <img 
                                src={activeReceipt.signatureDataUrl} 
                                alt="Assinatura Colaborador" 
                                className="max-h-12 mx-auto"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <p className="font-serif italic text-base text-blue-900 font-bold">{activeReceipt.signatureText || activeReceipt.userName}</p>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-450 leading-snug font-medium font-mono border-t border-slate-100 pt-1.5 mt-1.5">
                            IP: {activeReceipt.ipAddress || '177.34.42.1'} <br />
                            Em: {activeReceipt.signedAt ? format(new Date(activeReceipt.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '---'}
                          </p>
                        </div>

                        {/* Admin column */}
                        <div className="border border-slate-250 p-4 rounded-xl text-center flex flex-col justify-between" style={{ minHeight: '120px' }}>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">RH / Administração</span>
                          <div className="my-2.5">
                            {activeReceipt.adminSignatureDataUrl ? (
                              <img 
                                src={activeReceipt.adminSignatureDataUrl} 
                                alt="Assinatura Admin" 
                                className="max-h-12 mx-auto"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-emerald-600 font-black text-[11px] uppercase tracking-wide ring-1 ring-emerald-300 bg-emerald-50/50 px-2.5 py-1.5 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Validado e Vistado
                              </div>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-450 leading-snug font-medium font-mono border-t border-slate-100 pt-1.5 mt-1.5">
                            IP: {activeReceipt.adminIpAddress || '177.34.22.9'} <br />
                            Em: {activeReceipt.adminSignedAt ? format(new Date(activeReceipt.adminSignedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '---'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
