import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Calendar, Plus, Clock, Check, X, FileText, ChevronRight, AlertCircle, Wallet, ArrowLeftRight, Fingerprint, Activity, Palmtree } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../../lib/notifications';
import { calculateVacationBalance, VacationBalance } from '../../lib/vacation';
import { compressImage } from '../../lib/storageHelper';

export default function MyRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [officialVacations, setOfficialVacations] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vacationInfo, setVacationInfo] = useState<VacationBalance | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    type: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
  });

  useEffect(() => {
    if (!user) return;

    // 1. Requests Real-time
    const q = query(collection(db, 'requests'), where('userId', '==', user.uid));
    const unsubRequests = onSnapshot(q, (snapshot) => {
      const fetchedRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      fetchedRequests.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
      setRequests(fetchedRequests);

      if (user.admissionDate) {
        setVacationInfo(calculateVacationBalance(user.admissionDate, fetchedRequests));
      }
    }, (error) => {
      console.error('Error fetching requests in real-time:', error);
    });

    // 2. Official Vacation Documentations Real-time
    const oq = query(
      collection(db, 'salarySlips'),
      where('userId', '==', user.uid),
      where('documentType', '==', 'vacation')
    );
    const unsubO = onSnapshot(oq, (osnapshot) => {
      const fetchedO = osnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      fetchedO.sort((a, b) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
      setOfficialVacations(fetchedO);
    }, (error) => {
      console.error('Error fetching official vacations in real-time:', error);
    });

    return () => {
      unsubRequests();
      unsubO();
    };
  }, [user]);

  const fetchRequests = async () => {
    // Handled in real time via onSnapshot listeners in useEffect
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLoading(true);
      try {
        if (file.type.startsWith('image/')) {
          // Compress the image to avoid "out of memory" errors on client-side state
          const compressedBlob = await compressImage(file, 1200, 1200, 0.75);
          
          // Convert Blob back to a File so filename is preserved and upload doesn't lack extensions
          const compressedFile = new File([compressedBlob as Blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          
          setSelectedFile(compressedFile);
          
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachmentPreview(reader.result as string);
          };
          reader.readAsDataURL(compressedFile);
        } else {
          // If it isn't an image (e.g., pdf), load directly
          setSelectedFile(file);
          const reader = new FileReader();
          reader.onloadend = () => {
            setAttachmentPreview(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
      } catch (err) {
        console.error("Erro ao comprimir imagem de anexo:", err);
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setAttachmentPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let attachmentUrl = '';
      if (formData.type === 'medical') {
        if (!selectedFile) {
          alert('Por favor, selecione a imagem do atestado médico.');
          setLoading(false);
          return;
        }
        const fileExtension = selectedFile.name.split('.').pop() || 'jpg';
        const fileRef = ref(storage, `medical_certificates/${user?.uid}_${Date.now()}.${fileExtension}`);
        await uploadBytes(fileRef, selectedFile);
        attachmentUrl = await getDownloadURL(fileRef);
      }

      await addDoc(collection(db, 'requests'), {
        ...formData,
        userId: user?.uid,
        userName: user?.name,
        status: 'pending',
        createdAt: serverTimestamp(),
        attachmentUrl: attachmentUrl || null,
      });
      
      const typeLabels: Record<string, string> = {
        vacation: 'férias',
        allowance: 'abono',
        per_diem: 'diária',
        shift_swap: 'troca de plantão',
        medical: 'atestado médico'
      };

      await createNotification(
        user?.uid as string,
        'Solicitação Recebida',
        `Sua solicitação de ${typeLabels[formData.type] || formData.type} foi enviada para análise do RH.`,
        'info',
        'requests'
      );

      setSelectedFile(null);
      setAttachmentPreview(null);
      setIsModalOpen(false);
      fetchRequests();
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'vacation': return 'Férias';
      case 'allowance': return 'Abono';
      case 'adjustment': return 'Ajuste de Ponto';
      case 'per_diem': return 'Diária';
      case 'shift_swap': return 'Troca Plantão';
      case 'medical': return 'Atestado Médico';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'vacation': return <Calendar className="w-4 h-4" />;
      case 'allowance': return <Clock className="w-4 h-4" />;
      case 'adjustment': return <Fingerprint className="w-4 h-4" />;
      case 'per_diem': return <Wallet className="w-4 h-4" />;
      case 'shift_swap': return <ArrowLeftRight className="w-4 h-4" />;
      case 'medical': return <Activity className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'vacation': return 'bg-orange-100 text-orange-600';
      case 'allowance': return 'bg-purple-100 text-purple-600';
      case 'adjustment': return 'bg-blue-100 text-blue-600';
      case 'per_diem': return 'bg-emerald-100 text-emerald-600';
      case 'shift_swap': return 'bg-blue-100 text-blue-600';
      case 'medical': return 'bg-rose-100 text-rose-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Férias e Abonos</h1>
          <p className="text-slate-500">Solicite e acompanhe seus pedidos de afastamento.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold shadow-xl hover:bg-black transition-all"
        >
          <Plus className="w-5 h-5" />
          Nova Solicitação
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-slate-500 font-medium text-sm">Disponível para Gozo</p>
              <h4 className="text-3xl font-black text-slate-900">{vacationInfo?.available ?? '--'} Dias</h4>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Proporcional</p>
              <p className="text-sm font-bold text-slate-600">+{vacationInfo?.proportional ?? '--'} dias</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-4 pt-4 border-t border-slate-50 tracking-wider">
            Período Atual: {vacationInfo ? `${format(new Date(vacationInfo.currentPeriodStart), 'dd/MM/yyyy')} — ${format(new Date(vacationInfo.currentPeriodEnd), 'dd/MM/yyyy')}` : '--'}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <Clock className="w-6 h-6" />
          </div>
          <p className="text-slate-500 font-medium text-sm">Abonos Solicitados</p>
          <h4 className="text-3xl font-black text-slate-900">02</h4>
          <p className="text-[10px] text-slate-400 font-bold uppercase mt-2 tracking-wider">Últimos 12 meses</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-900/10 text-white flex flex-col justify-between">
           <div>
             <AlertCircle className="w-6 h-6 text-blue-400 mb-2" />
             <p className="font-bold text-lg">Atenção</p>
             <p className="text-xs text-slate-400 leading-relaxed">Solicite suas férias com no mínimo 30 dias de antecedência.</p>
           </div>
           <button className="text-xs font-black uppercase tracking-widest text-blue-400 flex items-center gap-1 hover:text-white transition-all">
             Ver Política de RH <ChevronRight className="w-3 h-3" />
           </button>
        </div>
      </div>

      {/* SEÇÃO PRINCIPAL DE FÉRIAS ENVIADAS PELO RH */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Palmtree className="w-5 h-5 text-amber-500" />
              Recibos de Férias para Assinatura (Enviados pelo RH)
            </h2>
            <p className="text-xs text-slate-500">
              Visualize, responda e assine digitalmente seus Avisos e Recibos de Férias CLT oficiais.
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.setItem('payroll_doc_filter', 'vacation');
              window.dispatchEvent(new CustomEvent('switch-dashboard-view', { detail: 'payroll' }));
            }}
            className="text-xs font-black uppercase text-amber-600 hover:text-amber-800 transition-colors flex items-center gap-1 shrink-0 p-1 bg-amber-50 px-2.5 py-1.5 rounded-xl cursor-pointer"
          >
            Abrir Central de Assinaturas <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {officialVacations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {officialVacations.map((vac) => {
              const formatDateBR = (dateStr: string) => {
                if (!dateStr) return '__/__/____';
                const parts = dateStr.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return dateStr;
              };

              return (
                <div key={vac.id} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative flex flex-col justify-between hover:bg-slate-100/50 transition-all gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start gap-1">
                      <span className="text-[9px] bg-amber-100 text-amber-700 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                        Aviso de Férias
                      </span>
                      {vac.signed ? (
                        <span className="text-[10px] text-emerald-600 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Assinado
                        </span>
                      ) : (
                        <span className="text-[10px] text-orange-650 font-extrabold flex items-center gap-1 bg-orange-50 px-2 py-0.5 rounded-full animate-pulse">
                          <Clock className="w-3 h-3" /> Assinar Online
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Período de Gozo</p>
                      <p className="text-[14px] font-black text-slate-800 tracking-tight leading-zero">
                        {formatDateBR(vac.vacationStart)} <span className="text-zinc-400 font-semibold text-xs">a</span> {formatDateBR(vac.vacationEnd)}
                      </p>
                    </div>

                    <div className="text-[11px] text-slate-650 font-semibold grid grid-cols-2 gap-2 border-t border-slate-200/65 pt-2">
                      <div>
                        <span className="block text-[8px] text-slate-400 font-bold uppercase leading-none">Aquisitivo</span>
                        <span className="text-slate-700 font-bold text-[10px]">{formatDateBR(vac.acquisitionStart)} - {formatDateBR(vac.acquisitionEnd)}</span>
                      </div>
                      <div>
                        <span className="block text-[8px] text-slate-400 font-bold uppercase leading-none">Líquido</span>
                        <span className="text-emerald-600 font-black font-mono text-[10.5px]">R$ {Number(vac.netSalary || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      localStorage.setItem('payroll_doc_filter', 'vacation');
                      window.dispatchEvent(new CustomEvent('switch-dashboard-view', { detail: 'payroll' }));
                    }}
                    className={cn(
                      "w-full text-xs font-black uppercase py-2.5 rounded-xl cursor-pointer text-center transition-all flex items-center justify-center gap-1.5 shadow-sm",
                      vac.signed 
                        ? "bg-slate-100 hover:bg-slate-200 text-slate-600" 
                        : "bg-amber-500 hover:bg-amber-600 text-white font-extrabold shadow-amber-500/10"
                    )}
                  >
                    <Palmtree className="w-4 h-4" />
                    {vac.signed ? 'Visualizar Recibo' : 'Ver e Assinar Agora'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 border-2 border-dashed border-slate-200 rounded-3xl text-center bg-slate-50/20">
            <Palmtree className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-extrabold text-xs">Nenhum recibo de férias enviado no momento.</p>
            <p className="text-[10.5px] text-slate-400 mt-1">
              Assim que o RH programar e preparar suas férias, o recibo oficial CLT aparecerá aqui para você assinar digitalmente.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50">
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Histórico de Pedidos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-wider">
                <th className="px-6 py-4">Tipo</th>
                <th className="px-6 py-4">Período</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Documentação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        getTypeColor(req.type)
                      )}>
                        {getTypeIcon(req.type)}
                      </div>
                      <span className="font-bold text-slate-700 capitalize">{getTypeLabel(req.type)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900">
                      {format(new Date(req.startDate), 'dd/MM/yy')} — {format(new Date(req.endDate), 'dd/MM/yy')}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">Cadastrado em {format(req.createdAt ? parseFirestoreTimestamp(req.createdAt) : new Date(), 'dd/MM/yy')}</p>
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
                  <td className="px-6 py-4">
                    {req.attachmentUrl ? (
                      <a 
                        href={req.attachmentUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Ver Atestado
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">Sem anexo</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-sm italic">
              Nenhuma solicitação registrada.
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-8 py-6 bg-slate-800 text-white flex items-center justify-between">
                <h2 className="text-xl font-bold">Nova Solicitação</h2>
                <X onClick={() => setIsModalOpen(false)} className="w-6 h-6 cursor-pointer opacity-70 hover:opacity-100" />
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="space-y-4">
                  <label className="block text-sm font-bold text-slate-700">Tipo de Solicitação</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'vacation'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'vacation' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <Calendar className="w-6 h-6" />
                      <span className="text-xs font-black uppercase">Férias</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'allowance'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'allowance' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <Clock className="w-6 h-6" />
                      <span className="text-xs font-black uppercase">Abono</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'adjustment'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'adjustment' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <Fingerprint className="w-6 h-6" />
                      <span className="text-xs font-black uppercase">Ajuste</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'per_diem'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'per_diem' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <Wallet className="w-6 h-6" />
                      <span className="text-xs font-black uppercase tracking-tighter">Diária</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'shift_swap'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'shift_swap' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <ArrowLeftRight className="w-6 h-6" />
                      <span className="text-xs font-black uppercase tracking-tighter">Troca de Plantão</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, type: 'medical'})}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all",
                        formData.type === 'medical' ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-100 text-slate-400"
                      )}
                    >
                      <Activity className="w-6 h-6" />
                      <span className="text-xs font-black uppercase tracking-tighter">Atestado Médico</span>
                    </button>
                  </div>
                </div>

                {formData.type === 'medical' && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Imagem do Atestado Médico</label>
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 hover:bg-slate-100/50 transition-all cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept="image/*" 
                        required 
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileChange}
                      />
                      {attachmentPreview ? (
                        <div className="text-center space-y-2 pointer-events-none">
                          <img src={attachmentPreview} alt="Atestado Pré-visualização" referrerPolicy="no-referrer" className="max-h-32 mx-auto rounded-lg shadow-sm" />
                          <p className="text-xs font-bold text-slate-600">{selectedFile?.name}</p>
                          <p className="text-[10px] text-blue-505 font-bold">Clique para alterar</p>
                        </div>
                      ) : (
                        <div className="text-center space-y-2 pointer-events-none">
                          <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                            <Plus className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-slate-600">Selecionar Imagem do Atestado</p>
                          <p className="text-[10px] text-slate-400 font-medium font-sans">JPEG, PNG ou outros formatos de imagem</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Início</label>
                    <input 
                      type="date" required 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
                      onChange={e => setFormData({...formData, startDate: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fim</label>
                    <input 
                      type="date" required 
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600"
                      onChange={e => setFormData({...formData, endDate: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Motivo / Justificativa</label>
                  <textarea 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-600 h-32"
                    placeholder="Descreva brevemente o motivo da solicitação..."
                    onChange={e => setFormData({...formData, reason: e.target.value})}
                    required
                  />
                </div>

                <button 
                  disabled={loading}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2"
                >
                  {loading ? 'Enviando...' : 'Confirmar Solicitação'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
