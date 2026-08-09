import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
// @ts-ignore
import sentinelaLogo from '../../assets/images/sentinela_logo_png_1786010689264.jpg';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  getDocs 
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  Clock, 
  Printer, 
  BookOpen, 
  User, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  MessageSquare, 
  Check, 
  X, 
  Shield,
  Activity,
  Award,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { Occurrence } from '../../types';

export default function OccurrenceBook() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Data State
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | null>(null);

  // Digital Book State (Open/Closed)
  const [isBookOpen, setIsBookOpen] = useState(false);

  // Digital Book Page Navigation State
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [navigationDirection, setNavigationDirection] = useState<'forward' | 'backward'>('forward');

  // Form Fields (Employee Registration)
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'injury' | 'equipment' | 'maintenance' | 'behavior' | 'general'>('general');
  const [shift, setShift] = useState('Manhã');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');
  const [signatureOccurrence, setSignatureOccurrence] = useState('');

  // Admin Resolution State
  const [feedback, setFeedback] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Load occurrences from Firestore
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    let q;

    if (isAdmin) {
      // Admins view all occurrences
      q = query(collection(db, 'occurrences'));
    } else {
      // Employees view their registered occurrences
      q = query(
        collection(db, 'occurrences'), 
        where('userId', '==', user.uid)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Occurrence[];

      // Sort chronologically (newest first)
      docs.sort((a, b) => {
        const timeA = parseFirestoreTimestamp(a.createdAt).getTime();
        const timeB = parseFirestoreTimestamp(b.createdAt).getTime();
        return isNaN(timeA) || isNaN(timeB) ? 0 : timeB - timeA;
      });

      setOccurrences(docs);
      setLoading(false);
    }, (error) => {
      console.error("Error loading occurrences:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  // Filter logic
  const filteredOccurrences = occurrences.filter(oc => {
    // Strictly filter out shift_book and shift_handover items from OccurrenceBook
    if (oc.type === 'shift_book' || oc.type === 'shift_handover') {
      return false;
    }

    const matchesSearch = 
      oc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oc.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      oc.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || oc.type === filterType;
    const matchesShift = filterShift === 'all' || oc.shift === filterShift;
    const matchesStatus = filterStatus === 'all' || oc.status === filterStatus;

    return matchesSearch && matchesType && matchesShift && matchesStatus;
  });

  // Clamp current page index if list changes
  useEffect(() => {
    if (currentPageIndex >= filteredOccurrences.length && filteredOccurrences.length > 0) {
      setCurrentPageIndex(filteredOccurrences.length - 1);
    }
  }, [filteredOccurrences.length, currentPageIndex]);

  // Page Turn Handlers
  const handleNextPage = () => {
    if (currentPageIndex < filteredOccurrences.length - 1) {
      setNavigationDirection('forward');
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setNavigationDirection('backward');
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const handleGoToPage = (index: number) => {
    if (index >= 0 && index < filteredOccurrences.length) {
      setNavigationDirection(index > currentPageIndex ? 'forward' : 'backward');
      setCurrentPageIndex(index);
    }
  };

  // Submit Handler (ONLY FOR EMPLOYEES)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAdmin) return; // Safeguard: admin cannot register
    if (!user) return;

    if (!title.trim() || !description.trim()) {
      alert("Por favor, preencha o título e a descrição da ocorrência.");
      return;
    }

    if (!signatureOccurrence.trim()) {
      alert("Por favor, preencha a sua rubrica/assinatura para validar o registro.");
      return;
    }

    try {
      if (editingOccurrence) {
        // Update existing occurrence
        const occurrenceRef = doc(db, 'occurrences', editingOccurrence.id);
        await updateDoc(occurrenceRef, {
          title,
          type,
          shift,
          date,
          description,
          signatureOccurrence: signatureOccurrence.trim(),
        });

        await createNotification(
          user.uid,
          "Ocorrência Atualizada",
          `A ocorrência "${title}" foi atualizada com sucesso.`,
          "success"
        );
        setEditingOccurrence(null);
      } else {
        // Create new occurrence
        const newOccurrence = {
          userId: user.uid,
          userName: user.name || "Colaborador",
          userRole: user.role,
          title,
          type,
          shift,
          date,
          description,
          status: 'pending' as const,
          signatureOccurrence: signatureOccurrence.trim(),
          createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, 'occurrences'), newOccurrence);

        await createNotification(
          user.uid,
          "Ocorrência Registrada",
          `Sua ocorrência "${title}" foi registrada com sucesso no Livro Digital.`,
          "info"
        );

        // Notify admins
        try {
          const adminsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
          adminsSnap.forEach((adminDoc) => {
            createNotification(
              adminDoc.id,
              "Nova Ocorrência Registrada",
              `O colaborador ${user.name} registrou uma nova ocorrência: "${title}"`,
              "warning",
              "occurrences"
            );
          });
        } catch (adminErr) {
          console.error("Error notifying admins:", adminErr);
        }
      }

      // Reset form
      setTitle('');
      setType('general');
      setShift('Manhã');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setDescription('');
      setSignatureOccurrence('');
      setShowForm(false);
      setCurrentPageIndex(0); // Go to newest occurrence page
      setIsBookOpen(true); // Open book to see the result
    } catch (err) {
      console.error("Error submitting occurrence:", err);
      alert("Erro ao salvar ocorrência. Tente novamente.");
    }
  };

  // Resolve Occurrence (Admin Only)
  const handleResolveOccurrence = async (id: string) => {
    if (!isAdmin || !user) return;

    if (!feedback.trim()) {
      alert("Por favor, digite uma justificativa ou tratativa da administração.");
      return;
    }

    try {
      const occurrenceRef = doc(db, 'occurrences', id);
      await updateDoc(occurrenceRef, {
        status: 'resolved',
        feedback: feedback.trim(),
        resolvedAt: serverTimestamp(),
        resolvedByName: user.name || 'Administrador'
      });

      // Find original author to notify
      const targetOc = occurrences.find(o => o.id === id);
      if (targetOc) {
        await createNotification(
          targetOc.userId,
          "Ocorrência Resolvida",
          `Sua ocorrência "${targetOc.title}" recebeu tratativa e foi resolvida pela administração.`,
          "success",
          "occurrences"
        );
      }

      setResolvingId(null);
      setFeedback('');
    } catch (err) {
      console.error("Error resolving occurrence:", err);
      alert("Erro ao finalizar a resolução da ocorrência.");
    }
  };

  // Delete Occurrence
  const handleDeleteOccurrence = async (id: string, titleStr: string) => {
    if (!confirm(`Tem certeza que deseja remover a ocorrência "${titleStr}"?`)) return;

    try {
      await deleteDoc(doc(db, 'occurrences', id));
      if (currentPageIndex > 0 && currentPageIndex >= filteredOccurrences.length - 1) {
        setCurrentPageIndex(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Error deleting occurrence:", err);
      alert("Erro ao remover o registro.");
    }
  };

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // Helper Labels & Badges
  const getOccurrenceTypeLabel = (typeKey: string) => {
    switch (typeKey) {
      case 'injury': return 'Acidente / Lesão';
      case 'equipment': return 'Mecânica / Módulos';
      case 'maintenance': return 'Manutenção Predial';
      case 'behavior': return 'Conduta / CLT';
      case 'shift_handover': return 'Passagem de Turno';
      case 'shift_book': return 'Ata de Plantão';
      default: return 'Ocorrência Geral';
    }
  };

  const getOccurrenceTypeBadgeStyles = (typeKey: string) => {
    switch (typeKey) {
      case 'injury': return 'bg-rose-100 text-rose-900 border-rose-300';
      case 'equipment': return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'maintenance': return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'behavior': return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'shift_handover': return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      default: return 'bg-[#eae3d2] text-[#4a3b2c] border-[#c8beaa]';
    }
  };

  const currentOccurrence = filteredOccurrences[currentPageIndex] || null;
  const totalPages = Math.max(1, filteredOccurrences.length);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* Printable CSS override */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-book-section, .printable-book-section * {
            visibility: visible;
          }
          .printable-book-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .print-hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 print-hidden">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-zinc-950 flex items-center justify-center shadow-md border border-zinc-800">
              <BookOpen className="text-amber-400 w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                Livro de Ocorrências Digital
              </h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {isAdmin 
                  ? "Livro Oficial de Registros e Atas de Ocorrências Operacionais (Modo Leitura e Impressão)" 
                  : "Registro de Ocorrências do Seu Turno de Trabalho"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Toggle Book Open/Closed Button */}
          <button
            onClick={() => setIsBookOpen(!isBookOpen)}
            className={cn(
              "px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95 uppercase tracking-wider border",
              isBookOpen
                ? "bg-zinc-900 text-amber-400 border-amber-500/40 hover:bg-zinc-800"
                : "bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 border-amber-400 hover:from-amber-400 hover:to-amber-500 font-black shadow-amber-500/20"
            )}
            title={isBookOpen ? "Fechar Livro de Ocorrências" : "Abrir Livro de Ocorrências"}
          >
            <BookOpen className="w-4 h-4 stroke-[2.5]" />
            <span>{isBookOpen ? "Fechar Livro" : "Abrir Livro"}</span>
          </button>

          {/* Print Button (Available for Admin & Employee) */}
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-xl text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 font-extrabold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:border-slate-400 active:scale-95"
            title="Imprimir Livro de Ocorrências"
          >
            <Printer className="w-4 h-4 text-zinc-800" />
            <span className="hidden sm:inline">Imprimir</span>
          </button>

          {/* New Occurrence Registration Button (STRICTLY ONLY FOR EMPLOYEES) */}
          {!isAdmin && (
            <button
              onClick={() => {
                if (!isBookOpen) setIsBookOpen(true);
                if (showForm) {
                  setEditingOccurrence(null);
                  setTitle('');
                  setDescription('');
                }
                setShowForm(!showForm);
              }}
              className="px-5 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-amber-400 border border-amber-500/40 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-zinc-950/20 transition-all cursor-pointer active:scale-95 uppercase tracking-wider"
            >
              <Plus className="w-4 h-4 text-amber-400 stroke-[3]" />
              <span>{showForm ? "Fechar Formulário" : "Registrar Ocorrência"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Registration Modal / Form (STRICTLY FOR EMPLOYEES) */}
      <AnimatePresence>
        {showForm && !isAdmin && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden print-hidden mb-4"
          >
            <div className="bg-zinc-950 p-6 md:p-8 rounded-3xl border border-zinc-800 shadow-2xl space-y-6 text-white relative">
              
              {/* Corner Ornaments */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-amber-500/50 rounded-tl-2xl pointer-events-none" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-amber-500/50 rounded-tr-2xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-wide text-amber-400">
                      {editingOccurrence ? "Editar Ocorrência" : "Nova Ocorrência - Livro Digital"}
                    </h3>
                    <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">
                      Preencha os detalhes do fato ocorrido no seu turno
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingOccurrence(null);
                  }}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Title */}
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                      Título da Ocorrência *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Falha no portão principal de acesso ou objeto deixado na recepção"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-semibold text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Category / Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                      Categoria do Fato *
                    </label>
                    <select
                      value={type}
                      onChange={(e: any) => setType(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-extrabold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="general">Geral / Observação</option>
                      <option value="injury">Acidente / Lesão Corporal</option>
                      <option value="equipment">Mecânica / Equipamento</option>
                      <option value="maintenance">Manutenção Predial</option>
                      <option value="behavior">Conduta / Ocorrência CLT</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Shift */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                      Turno *
                    </label>
                    <select
                      value={shift}
                      onChange={(e) => setShift(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-extrabold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    >
                      <option value="Manhã">Manhã (06:00 - 14:00)</option>
                      <option value="Tarde">Tarde (14:00 - 22:00)</option>
                      <option value="Noite">Noite (22:00 - 06:00)</option>
                      <option value="12x36">Plantão 12x36</option>
                      <option value="Integral">Geral / Integral</option>
                    </select>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                      Data do Ocorrido *
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-300 block">
                    Relato Detalhado do Fato *
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Descreva minunciosamente o que aconteceu, horários, pessoas envolvidas e providências imediatas tomadas..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 rounded-xl text-xs font-medium text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 leading-relaxed"
                  />
                </div>

                {/* Digital Signature / Rubrica */}
                <div className="p-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl space-y-2">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-amber-400 block flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-amber-400" />
                    Visto de Assinatura Digital do Colaborador *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Digite seu Nome Completo ou Rubrica (Ex: João Silva - Vigia)"
                    value={signatureOccurrence}
                    onChange={(e) => setSignatureOccurrence(e.target.value)}
                    className="w-full px-4 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-xs font-bold text-amber-300 placeholder-zinc-600 focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-500 uppercase font-bold">
                    * Ao assinar, você valida juridicamente a veracidade das informações inseridas neste Livro Oficial.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingOccurrence(null);
                    }}
                    className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-zinc-400 hover:text-white transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95"
                  >
                    {editingOccurrence ? "Salvar Alterações" : "Registrar no Livro Digital"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 print-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar ocorrência por título, autor ou palavra-chave..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 text-xs font-semibold text-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Filters */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            {/* Category filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                className="bg-transparent border-none text-[11px] font-bold text-slate-700 focus:outline-none w-full cursor-pointer"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">Todas Categorias</option>
                <option value="general">Geral</option>
                <option value="injury">Acidente/Lesão</option>
                <option value="equipment">Mecânica</option>
                <option value="maintenance">Manutenção</option>
                <option value="behavior">Conduta CLT</option>
              </select>
            </div>

            {/* Shift filter */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <select
                className="bg-transparent border-none text-[11px] font-bold text-slate-700 focus:outline-none w-full cursor-pointer"
                value={filterShift}
                onChange={(e) => setFilterShift(e.target.value)}
              >
                <option value="all">Todos Turnos</option>
                <option value="Manhã">Manhã</option>
                <option value="Tarde">Tarde</option>
                <option value="Noite">Noite</option>
                <option value="12x36">12x36</option>
                <option value="Integral">Integral</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <select
                className="bg-transparent border-none text-[11px] font-bold text-slate-700 focus:outline-none w-full cursor-pointer"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">Todos Status</option>
                <option value="pending">Pendentes</option>
                <option value="resolved">Resolvidas</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 text-center bg-zinc-950 rounded-3xl border border-zinc-800 shadow-xl space-y-4 text-white">
          <div className="w-10 h-10 rounded-full border-3 border-amber-400 border-t-transparent animate-spin"></div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
            Carregando Livro Digital de Ocorrências...
          </span>
        </div>
      ) : !isBookOpen ? (
        /* CLOSED BOOK COVER VIEW (CAPA DO LIVRO FECHADO) */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="printable-book-section relative w-full my-2 print-hidden"
        >
          <div 
            onClick={() => setIsBookOpen(true)}
            className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-black border-2 border-amber-500/40 rounded-3xl p-6 sm:p-12 md:p-16 shadow-2xl shadow-black/90 relative overflow-hidden text-zinc-100 cursor-pointer group hover:border-amber-400/80 transition-all transform hover:-translate-y-1"
          >
            {/* Metallic Gold Corners */}
            <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-amber-500/80 rounded-tl-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-amber-500/80 rounded-tr-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-amber-500/80 rounded-bl-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-amber-500/80 rounded-br-3xl pointer-events-none" />

            {/* Book Spine Shadow / Spine Emboss on the Left */}
            <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black via-zinc-800/40 to-transparent border-r border-amber-500/20 pointer-events-none" />

            {/* Double Gold Stamped Frame */}
            <div className="border-2 border-amber-500/30 rounded-2xl p-6 sm:p-10 md:p-12 flex flex-col items-center text-center space-y-6 relative z-10 bg-zinc-950/50 backdrop-blur-xs">
              
              {/* Emblem / Sentinela Logo Header */}
              <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-black via-zinc-900 to-zinc-950 border-2 border-amber-400/60 flex items-center justify-center p-2 shadow-2xl group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                <img 
                  src={sentinelaLogo} 
                  alt="Sentinela Serviços Logo" 
                  className="w-full h-full object-contain filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 rounded-full bg-amber-500/5 pointer-events-none" />
              </div>

              {/* Title in Gold Foil */}
              <div className="space-y-2">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-amber-500/90 block">
                  REGISTRO OFICIAL DE SEGURANÇA E PATRIMÔNIO
                </span>
                <h2 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-widest font-serif text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 drop-shadow-md">
                  LIVRO DE OCORRÊNCIAS
                </h2>
                <div className="w-36 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent mx-auto mt-2" />
              </div>

              <p className="text-xs sm:text-sm font-medium text-zinc-400 max-w-lg leading-relaxed">
                Documento oficial sigiloso para registro de atas, passagem de turno, eventos operacionais e ocorrências trabalhistas.
              </p>

              {/* Status Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/90 border border-amber-500/30 text-amber-300 text-xs font-bold tracking-wider uppercase shadow-inner">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span>{filteredOccurrences.length} Ocorrência(s) registrada(s)</span>
              </div>

              {/* Click to Open Prompt */}
              <div className="pt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBookOpen(true);
                  }}
                  className="px-8 py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-all flex items-center gap-2.5 cursor-pointer active:scale-95 animate-pulse"
                >
                  <BookOpen className="w-4 h-4 text-zinc-950 stroke-[3]" />
                  <span>Clique na Capa para Abrir o Livro Digital</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        /* SKEUOMORPHIC BLACK DIGITAL BOOK (LIVRO DIGITAL EM COR PRETA ABERTO) */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="printable-book-section relative w-full"
        >
          
          {/* External Book Container (Leather Black Texture Finish) */}
          <div className="bg-zinc-950 border-2 border-zinc-800 rounded-3xl p-4 sm:p-7 md:p-10 shadow-2xl shadow-black/80 relative overflow-hidden text-zinc-100">
            
            {/* Golden Metallic Corners */}
            <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-amber-500/60 rounded-tl-3xl pointer-events-none" />
            <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-amber-500/60 rounded-tr-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-amber-500/60 rounded-bl-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-amber-500/60 rounded-br-3xl pointer-events-none" />

            {/* Book Header / Cover Title */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-b border-zinc-800 pb-4 mb-6 gap-3 print-hidden">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-zinc-900 border border-amber-400/50 p-0.5 flex items-center justify-center shrink-0">
                  <img src={sentinelaLogo} alt="Sentinela Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-widest text-amber-400 font-serif">
                    LIVRO DE OCORRÊNCIAS - REGISTRO OFICIAL
                  </h2>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    {filteredOccurrences.length} registro(s) encontrado(s) no histórico
                  </p>
                </div>
              </div>

              {/* Book Page Controls & Indicator */}
              <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-2xl border border-zinc-800 shadow-inner">
                <button
                  onClick={() => setIsBookOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  title="Fechar Livro"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  <span>Fechar Capa</span>
                </button>
                <button
                  onClick={handlePrevPage}
                  disabled={currentPageIndex === 0}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer",
                    currentPageIndex === 0 
                      ? "text-zinc-600 bg-zinc-950 cursor-not-allowed opacity-50" 
                      : "text-amber-400 bg-zinc-800 hover:bg-zinc-700 active:scale-95"
                  )}
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4 stroke-[3]" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                <div className="px-3 py-1 text-[11px] font-black text-amber-300 font-mono tracking-widest uppercase">
                  Folha {filteredOccurrences.length > 0 ? currentPageIndex + 1 : 0} / {totalPages}
                </div>

                <button
                  onClick={handleNextPage}
                  disabled={currentPageIndex >= filteredOccurrences.length - 1}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer",
                    currentPageIndex >= filteredOccurrences.length - 1 
                      ? "text-zinc-600 bg-zinc-950 cursor-not-allowed opacity-50" 
                      : "text-amber-400 bg-zinc-800 hover:bg-zinc-700 active:scale-95"
                  )}
                  title="Próxima Página"
                >
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            </div>

            {/* Quick Bookmark Tabs (Desktop Side Navigation to Jump to Pages) */}
            {filteredOccurrences.length > 1 && (
              <div className="hidden lg:flex flex-col gap-1.5 absolute right-2 top-24 z-30 print-hidden">
                {filteredOccurrences.slice(0, 7).map((oc, idx) => {
                  const isActive = idx === currentPageIndex;
                  return (
                    <button
                      key={oc.id}
                      onClick={() => handleGoToPage(idx)}
                      className={cn(
                        "w-28 text-left px-3 py-1.5 text-[10px] font-black rounded-r-lg shadow-md transition-all border-y border-r flex items-center cursor-pointer uppercase tracking-wider",
                        isActive 
                          ? "bg-amber-400 text-zinc-950 border-amber-300 translate-x-1 font-black" 
                          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-amber-300 hover:bg-zinc-850"
                      )}
                      title={`Ir para Folha ${idx + 1}: ${oc.title}`}
                    >
                      <span className="truncate">
                        F-{idx + 1} • {oc.date ? format(new Date(oc.date + 'T12:00:00'), 'dd/MM') : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Book Pages Paper Canvas (Authentic Cream Paper Finish) */}
            <div className="relative bg-[#fbf9f4] text-slate-900 rounded-2xl border border-[#e8e2d2] min-h-[580px] shadow-2xl overflow-hidden p-6 md:p-10 flex flex-col justify-between">
              
              {/* Paper Lines / Grid Pattern Background */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-20" 
                style={{ 
                  backgroundImage: 'radial-gradient(#8c7b64 0.75px, transparent 0.75px)', 
                  backgroundSize: '16px 16px' 
                }} 
              />

              {/* Animated Page Flip Container */}
              <AnimatePresence mode="wait" custom={navigationDirection}>
                {filteredOccurrences.length === 0 ? (
                  /* BLANK PAGE / EMPTY BOOK VIEW */
                  <motion.div
                    key="empty_book"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center my-auto text-center space-y-4 py-20 relative z-10"
                  >
                    <div className="w-20 h-20 rounded-full bg-[#eee7d6] border-2 border-[#d5caaf] flex items-center justify-center text-slate-500 shadow-inner">
                      <BookOpen className="w-9 h-9 text-[#705e46]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-800 font-serif uppercase tracking-tight">
                        Folha de Rosto - Livro Sem Registros
                      </h3>
                      <p className="text-xs text-slate-600 font-medium max-w-md mx-auto mt-1 leading-relaxed">
                        {occurrences.length === 0
                          ? "Nenhuma ocorrência registrada até o momento no sistema."
                          : "Nenhuma ocorrência corresponde aos filtros de busca selecionados."}
                      </p>
                    </div>

                    {!isAdmin && (
                      <button
                        onClick={() => setShowForm(true)}
                        className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-900 text-amber-400 text-xs font-black uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer border border-amber-500/30"
                      >
                        Registrar Primeira Ocorrência
                      </button>
                    )}
                  </motion.div>
                ) : currentOccurrence ? (
                  /* ACTIVE OCCURRENCE PAGE RECORD */
                  <motion.div
                    key={currentOccurrence.id || currentPageIndex}
                    custom={navigationDirection}
                    variants={{
                      initial: (dir: 'forward' | 'backward') => ({
                        opacity: 0,
                        x: dir === 'forward' ? 40 : -40,
                        rotateY: dir === 'forward' ? 6 : -6,
                      }),
                      animate: {
                        opacity: 1,
                        x: 0,
                        rotateY: 0,
                        transition: { duration: 0.3, ease: "easeOut" }
                      },
                      exit: (dir: 'forward' | 'backward') => ({
                        opacity: 0,
                        x: dir === 'forward' ? -40 : 40,
                        rotateY: dir === 'forward' ? -6 : 6,
                        transition: { duration: 0.2, ease: "easeIn" }
                      })
                    }}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    className="relative z-10 space-y-6 flex-1 flex flex-col justify-between"
                  >
                    {/* Official Page Header Stamp */}
                    <div className="border-b-2 border-slate-900/80 pb-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase font-mono px-2.5 py-1 bg-[#eae3d2] text-slate-900 border border-[#c8beaa] rounded-md">
                            REGISTRO Nº #{currentPageIndex + 1}
                          </span>
                          <span className={cn(
                            "text-xs font-black uppercase px-3 py-1 rounded-md border shadow-xs",
                            getOccurrenceTypeBadgeStyles(currentOccurrence.type)
                          )}>
                            {getOccurrenceTypeLabel(currentOccurrence.type)}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-black uppercase tracking-wider px-3 py-1 rounded-md border flex items-center gap-1.5",
                            currentOccurrence.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                              : 'bg-amber-100 text-amber-950 border-amber-300'
                          )}>
                            {currentOccurrence.status === 'resolved' ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                                Resolvida e Arquivada
                              </>
                            ) : (
                              <>
                                <Clock className="w-4 h-4 text-amber-700 animate-pulse" />
                                Aguardando Resolução
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Main Title of Record */}
                      <h2 className="text-xl md:text-2xl font-black text-slate-950 font-serif tracking-tight pt-1">
                        {currentOccurrence.title}
                      </h2>

                      {/* Metadata Grid (Date, User, Shift) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#f2ecdc] border border-[#d8cfb8] p-3 rounded-xl text-xs font-medium text-slate-800">
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-500 block">Data do Fato</span>
                          <span className="font-extrabold font-mono text-slate-950">
                            {format(new Date(currentOccurrence.date + 'T12:00:00'), 'dd/MM/yyyy')}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-500 block">Turno</span>
                          <span className="font-extrabold text-slate-950">{currentOccurrence.shift}</span>
                        </div>

                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-500 block">Registrado Por</span>
                          <span className="font-extrabold text-slate-950">{currentOccurrence.userName}</span>
                        </div>

                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-500 block">Horário do Registro</span>
                          <span className="font-extrabold font-mono text-slate-950">
                            {currentOccurrence.createdAt 
                              ? format(parseFirestoreTimestamp(currentOccurrence.createdAt), 'HH:mm')
                              : 'Reg.'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Occurrence Description Body (Logbook Style) */}
                    <div className="space-y-3 bg-[#fdfcf9] border border-[#e3dccb] p-5 rounded-2xl shadow-inner my-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#7a6850] block select-none">
                        📝 Relato Circunstanciado da Ocorrência
                      </span>
                      <p className="text-sm font-serif leading-relaxed text-slate-900 whitespace-pre-wrap pl-1">
                        {currentOccurrence.description}
                      </p>

                      {/* Signature line */}
                      <div className="pt-4 border-t border-[#e3dccb] flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#7a6850] uppercase text-[10px]">
                            Rubrica / Assinatura do Relator:
                          </span>
                          <span className="font-serif italic font-extrabold text-slate-950 text-sm bg-[#f2ecdc] px-3 py-1 rounded-lg border border-[#d8cfb8]">
                            [{currentOccurrence.signatureOccurrence || currentOccurrence.userName}]
                          </span>
                        </div>

                        {currentOccurrence.userRole && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            Cargo: {currentOccurrence.userRole === 'admin' ? 'Administrador' : 'Colaborador Operational'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Resolution / Admin Feedback Section */}
                    {currentOccurrence.status === 'resolved' && (
                      <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                          <span className="text-xs font-black uppercase text-emerald-900 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-emerald-600" />
                            Tratativa Oficial da Administração
                          </span>
                          <span className="text-[10px] font-mono text-emerald-800 font-bold">
                            {currentOccurrence.resolvedAt ? format(parseFirestoreTimestamp(currentOccurrence.resolvedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-emerald-950 italic leading-relaxed pl-1">
                          "{currentOccurrence.feedback}"
                        </p>
                        <div className="text-[10px] text-emerald-800 font-extrabold text-right pt-1">
                          Homologado por: {currentOccurrence.resolvedByName || 'Gestão da Empresa'}
                        </div>
                      </div>
                    )}

                    {/* Admin Action: Resolve Inline Form */}
                    {isAdmin && currentOccurrence.status === 'pending' && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 print-hidden">
                        {resolvingId === currentOccurrence.id ? (
                          <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-wide text-amber-900">
                              Inserir Tratativa Administrativa para Solucionar Ocorrência
                            </h4>
                            <textarea
                              rows={3}
                              className="w-full p-3 bg-white border border-amber-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                              placeholder="Descreva as providências adotadas pela gestão para resolver este incidente..."
                              value={feedback}
                              onChange={(e) => setFeedback(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setResolvingId(null)}
                                className="px-3 py-1.5 text-xs font-extrabold text-slate-500 hover:text-slate-800 uppercase"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleResolveOccurrence(currentOccurrence.id)}
                                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer"
                              >
                                Dar Baixa e Resolver
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-amber-900">
                              Esta ocorrência aguarda parecer ou ação da administração.
                            </p>
                            <button
                              onClick={() => {
                                setResolvingId(currentOccurrence.id);
                                setFeedback('');
                              }}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Responder / Finalizar
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Page Footer Navigation Bar inside Page */}
                    <div className="pt-4 border-t border-[#d8cfb8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 print-hidden">
                      {/* Action buttons (Edit/Delete) */}
                      <div className="flex items-center gap-2">
                        {(isAdmin || currentOccurrence.userId === user?.uid) && (
                          <>
                            {!isAdmin && (
                              <button
                                onClick={() => {
                                  setEditingOccurrence(currentOccurrence);
                                  setTitle(currentOccurrence.title);
                                  setType(currentOccurrence.type as any);
                                  setShift(currentOccurrence.shift);
                                  setDate(currentOccurrence.date);
                                  setDescription(currentOccurrence.description);
                                  setSignatureOccurrence(currentOccurrence.signatureOccurrence || '');
                                  setShowForm(true);
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] uppercase flex items-center gap-1 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Editar
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteOccurrence(currentOccurrence.id, currentOccurrence.title)}
                              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] uppercase flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          </>
                        )}
                      </div>

                      {/* Next / Previous Page Flip buttons */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handlePrevPage}
                          disabled={currentPageIndex === 0}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border",
                            currentPageIndex === 0 
                              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                              : "bg-zinc-950 text-amber-400 border-zinc-800 hover:bg-zinc-900 active:scale-95"
                          )}
                        >
                          <ChevronLeft className="w-4 h-4 stroke-[3]" />
                          Folha Anterior
                        </button>

                        <button
                          onClick={handleNextPage}
                          disabled={currentPageIndex >= filteredOccurrences.length - 1}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm border",
                            currentPageIndex >= filteredOccurrences.length - 1 
                              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                              : "bg-zinc-950 text-amber-400 border-zinc-800 hover:bg-zinc-900 active:scale-95"
                          )}
                        >
                          Próxima Folha
                          <ChevronRight className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
