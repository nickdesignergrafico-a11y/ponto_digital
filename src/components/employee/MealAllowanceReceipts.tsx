import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  FileText, 
  Printer, 
  ShieldCheck, 
  Trash2, 
  Plus, 
  ChevronRight, 
  X, 
  Send, 
  FileCheck,
  Building,
  UserCheck,
  Search,
  CheckCircle2,
  Info,
  Calendar,
  DollarSign,
  AlertCircle,
  RotateCw
} from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../../lib/notifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BenefitReceipt } from '../../types';
import { uploadBase64ToStorage } from '../../lib/storageHelper';

export default function MealAllowanceReceipts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Core list states
  const [receipts, setReceipts] = useState<BenefitReceipt[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);

  // Filter/Selection States
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<BenefitReceipt | null>(null);

  // New Receipt states
  const [showAddModal, setShowAddModal] = useState(false);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [newReceiptAmount, setNewReceiptAmount] = useState<string>('');
  const [newReceiptMonth, setNewReceiptMonth] = useState<number>(new Date().getMonth() + 1);
  const [newReceiptYear, setNewReceiptYear] = useState<number>(new Date().getFullYear());

  // Signature States
  const [showSignModal, setShowSignModal] = useState(false);
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [signingState, setSigningState] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Load Company Config safely
  useEffect(() => {
    let unsub2: (() => void) | null = null;
    const unsub1 = onSnapshot(doc(db, "config", "company"), (snap) => {
      if (snap.exists()) {
        setCompany(snap.data());
      } else if (!unsub2) {
        unsub2 = onSnapshot(doc(db, "company", "config"), (snap2) => {
          if (snap2.exists()) {
            setCompany(snap2.data());
          }
        });
      }
    });

    return () => {
      unsub1();
      if (unsub2) unsub2();
    };
  }, []);

  const [lastAutoOpenedReceiptId, setLastAutoOpenedReceiptId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin && selectedReceipt && selectedReceipt.status === 'signed' && !selectedReceipt.adminSigned) {
      if (lastAutoOpenedReceiptId !== selectedReceipt.id) {
        setLastAutoOpenedReceiptId(selectedReceipt.id);
        setTypedName(user ? (user.name || '') : '');
        setShowSignModal(true);
      }
    }
  }, [isAdmin, selectedReceipt, lastAutoOpenedReceiptId, user]);

  // Fetch Employees (excluindo administradores) in real time
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snapshot) => {
      const employeeList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((u: any) => u.role !== 'admin'); // EXCLUDE admins
      setEmployees(employeeList);
      setSelectedEmployee(current => {
        if (current) {
          const stillExists = employeeList.find((u: any) => u.id === current.id);
          if (stillExists) return stillExists;
        }
        return employeeList.length > 0 ? employeeList[0] : null;
      });
    }, (error) => {
      console.error('Erro ao buscar funcionários em tempo real:', error);
    });

    return unsub;
  }, [isAdmin]);

  // Fetch receipts dependent on roles and selected employee in real time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let unsub = () => {};

    if (isAdmin) {
      if (selectedEmployee) {
        const q = query(
          collection(db, 'benefitReceipts'),
          where('userId', '==', selectedEmployee.id)
        );
        unsub = onSnapshot(q, (snap) => {
          const loadedReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as BenefitReceipt));
          loadedReceipts.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return b.month - a.month;
          });
          setReceipts(loadedReceipts);
          setSelectedReceipt(currentSelected => {
            if (!currentSelected) {
              return loadedReceipts.length > 0 ? loadedReceipts[0] : null;
            }
            const updated = loadedReceipts.find(r => r.id === currentSelected.id);
            return updated || (loadedReceipts.length > 0 ? loadedReceipts[0] : null);
          });
          setLoading(false);
        }, (error) => {
          console.error('Erro de recibos em tempo real (Admin):', error);
          setLoading(false);
        });
      } else {
        setReceipts([]);
        setSelectedReceipt(null);
        setLoading(false);
      }
    } else {
      const q = query(
        collection(db, 'benefitReceipts'),
        where('userId', '==', user.uid)
      );
      unsub = onSnapshot(q, (snap) => {
        const loadedReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as BenefitReceipt));
        loadedReceipts.sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return b.month - a.month;
        });
        setReceipts(loadedReceipts);
        setSelectedReceipt(currentSelected => {
          if (!currentSelected) {
            const firstPending = loadedReceipts.find(r => r.status === 'pending');
            return firstPending || (loadedReceipts.length > 0 ? loadedReceipts[0] : null);
          }
          const updated = loadedReceipts.find(r => r.id === currentSelected.id);
          return updated || (loadedReceipts.length > 0 ? loadedReceipts[0] : null);
        });
        setLoading(false);
      }, (error) => {
        console.error('Erro de recibos em tempo real (Colaborador):', error);
        setLoading(false);
      });
    }

    return unsub;
  }, [user, selectedEmployee, isAdmin]);

  const fetchReceipts = async () => {
    // Receipts list is handled by the real-time listeners above
  };

  // Canvas Handlers for Signature Drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const pos = getCoordinates(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(pos.x - 1, pos.y - 1, 2, 2);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getCoordinates(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getCoordinates = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      return {
        x: (ry / rect.height) * canvas.width,
        y: canvas.height - (rx / rect.width) * canvas.height
      };
    }
    
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  };

  // Handle Create VR Receipt (Admin Only)
  const handleCreateReceipt = async () => {
    if (!selectedEmployee) return;
    const amt = parseFloat(newReceiptAmount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) {
      alert('Por favor, informe um valor de recibo válido.');
      return;
    }

    setSubmittingReceipt(true);
    try {
      const companyName = company?.name || 'Sua Empresa Ltda';
      const companyCnpj = company?.cnpj || '53.704.137/0001-93';

      const payload = {
        userId: selectedEmployee.id,
        userName: selectedEmployee.name,
        userCpf: selectedEmployee.cpf || '',
        companyName,
        companyCnpj,
        amount: amt,
        month: Number(newReceiptMonth),
        year: Number(newReceiptYear),
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'benefitReceipts'), payload);

      // Trigger user push or real-time application notification
      await createNotification(
        selectedEmployee.id,
        'Novo Recibo de Vale Refeição',
        `Você recebeu o recibo de vale refeição de ${months[Number(newReceiptMonth) - 1]}/${newReceiptYear} no valor de R$ ${amt.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} para assinar.`,
        'info',
        'benefit_receipts' // points employee to benefit_receipts tab
      );

      // Reset states
      setNewReceiptAmount('');
      setShowAddModal(false);
      fetchReceipts();
      alert('Recibo de Vale Refeição enviado com sucesso para assinatura do colaborador!');

    } catch (err) {
      console.error('Erro ao gerar recibo:', err);
      alert('Erro ao processar criação de recibo. Verifique a conexão com o banco.');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Delete Receipt (Admin Only)
  const handleDeleteReceipt = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir este recibo de benefício?')) return;
    try {
      await deleteDoc(doc(db, 'benefitReceipts', id));
      fetchReceipts();
      if (selectedReceipt?.id === id) {
        setSelectedReceipt(null);
      }
    } catch (err) {
      console.error('Erro ao excluir recibo:', err);
      alert('Erro ao excluir recibo.');
    }
  };

  // Handle Employee Signature Submission
  const handleSignatureSubmit = async () => {
    if (!selectedReceipt) return;
    setSigningState(true);
    try {
      let dataUrl = '';
      if (signMode === 'draw' && canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/png');
      } else if (signMode === 'type' && typedName.trim()) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#1e3a8a'; // Blue ink
          ctx.font = 'italic bold 44px "Caveat", "Dancing Script", "Brush Script MT", cursive';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-0.035);
          ctx.fillText(typedName.trim(), 0, 0);
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      if (!dataUrl) {
        alert('Assinatura vazia. Desenhe ou digite o seu nome para prosseguir.');
        setSigningState(false);
        return;
      }

      const uploadPath = `signatures/benefits/${user?.uid || 'anonymous'}_${selectedReceipt.id}_${Date.now()}.png`;
      const downloadURL = await uploadBase64ToStorage(dataUrl, uploadPath);

      const isAdminSign = user?.role === 'admin';
      const dummyIp = '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250);

      const payload = isAdminSign ? {
        adminSigned: true,
        adminSignatureURL: downloadURL,
        adminSignatureText: `Vistado digitalmente por Administrador ${user?.name || ''} - IP: ${dummyIp} - ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`,
        adminSignedAt: new Date().toISOString()
      } : {
        status: 'signed',
        signatureURL: downloadURL,
        signatureText: `Assinado digitalmente por ${selectedReceipt.userName} - CPF: ${selectedReceipt.userCpf || '***.***.***-**'} - IP: ${dummyIp} - ${format(new Date(), "dd/MM/yyyy HH:mm:ss")}`,
        signedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'benefitReceipts', selectedReceipt.id), payload);

      if (isAdminSign) {
        await createNotification(
          selectedReceipt.userId, // goes to the employee
          'Recibo de VR Homologado',
          `Seu Recibo de Vale Refeição de ${months[selectedReceipt.month - 1]}/${selectedReceipt.year} foi vistado e homologado pelo RH/Administração.`,
          'success'
        );
      } else {
        const notifyMessage = `O colaborador ${selectedReceipt.userName} assinou o recibo de vale refeição de ${months[selectedReceipt.month - 1]}/${selectedReceipt.year}.`;
        await createNotification(
          'admin', // goes to notification center for admins or matched users
          'Recibo de VR Assinado',
          notifyMessage,
          'success'
        );
      }

      // Local update
      const updatedReceipt: BenefitReceipt = { ...selectedReceipt, ...payload as any };
      setReceipts(receipts.map(r => r.id === selectedReceipt.id ? updatedReceipt : r));
      setSelectedReceipt(updatedReceipt);
      setShowSignModal(false);
      
      if (isAdminSign) {
        alert('Recibo homologado com sucesso pelo Administrador!');
      } else {
        alert('Recibo assinado e reenviado com sucesso para o RH!');
      }

    } catch (err) {
      console.error('Erro ao enviar assinatura:', err);
      alert('Erro ao enviar assinatura.');
    } finally {
      setSigningState(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (emp.cpf && emp.cpf.includes(searchTerm)) ||
    (emp.department && emp.department.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Page Header (Print Hidden) */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-150 leading-tight flex items-center gap-3">
            <span className="p-2 bg-blue-600/10 text-blue-600 rounded-2xl">
              <FileCheck className="w-8 h-8" />
            </span>
            Vale Refeição
          </h1>
          <p className="text-slate-500 font-medium">
            {isAdmin 
              ? 'Gestão de recibos e assinaturas eletrônicas para fornecimento de VA/VR.' 
              : 'Verifique e assine digitalmente seus recibos de benefício de alimentação.'}
          </p>
        </div>

        {isAdmin && selectedEmployee && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-sm"
          >
            <Plus className="w-5 h-5" />
            Enviar Novo Recibo
          </button>
        )}
      </header>

      {/* Main Workspace Frame */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start h-full">
        
        {/* LEFT COLUMN: Admin Employee Selector (Print Hidden) */}
        {isAdmin && (
          <div className="lg:col-span-4 space-y-4 print:hidden">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50">
              <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-widest mb-4">Escolha o Colaborador</h3>
              
              {/* Search Bar */}
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
                <input
                  type="text"
                  placeholder="Buscar funcionário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-xl border-y border-slate-100 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm transition-all focus:outline-none"
                />
              </div>

              {/* Employee Scrollable List */}
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-8 text-slate-450 text-xs">
                    Nenhum colaborador encontrado.
                  </div>
                ) : (
                  filteredEmployees.map(emp => {
                    const isSelected = selectedEmployee?.id === emp.id;
                    return (
                      <button
                        key={emp.id}
                        onClick={() => setSelectedEmployee(emp)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3.5 rounded-2xl transition-all text-left",
                          isSelected 
                            ? "bg-slate-900 text-white shadow-xl shadow-slate-900/10" 
                            : "hover:bg-slate-50 text-slate-700"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-bold overflow-hidden text-sm shrink-0",
                          isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                        )}>
                          {emp.photoURL ? (
                            <img src={emp.photoURL} alt={emp.name} className="w-full h-full object-cover" />
                          ) : (
                            emp.name?.charAt(0)
                          )}
                        </div>
                        <div className="overflow-hidden min-w-0 flex-1">
                          <p className="font-bold text-sm truncate leading-tight">{emp.name}</p>
                          <p className={cn("text-[10px] truncate", isSelected ? "text-slate-400" : "text-slate-450")}>
                            {emp.department || 'Operações'}
                          </p>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 shrink-0 transition-all", isSelected ? "text-blue-500 max-w-full opacity-100" : "text-slate-300 opacity-50")} />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: Receipts Management + Model Preview */}
        <div className={cn(
          "lg:col-span-8 print:col-span-12 space-y-6",
          !isAdmin && "lg:col-span-12"
        )}>
          
          {/* List of Sent Receipts (Table/Grid) */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 print:hidden">
            <h3 className="font-extrabold text-xs text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
              <span>Recibos Disponíveis</span>
              {isAdmin && selectedEmployee && (
                <span className="text-blue-600 normal-case font-bold">Colaborador: {selectedEmployee.name}</span>
              )}
            </h3>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-slate-400 text-xs">Carregando recibos de alimentação...</span>
              </div>
            ) : receipts.length === 0 ? (
              <div className="text-center py-12 text-slate-450 text-sm flex flex-col items-center justify-center gap-2">
                <FileText className="w-12 h-12 text-slate-300 stroke-1" />
                <p className="font-bold text-slate-600">Nenhum recibo de Vale Refeição enviado ainda.</p>
                <p className="text-xs">
                  {isAdmin 
                    ? 'Clique em "Enviar Novo Recibo" no topo direito para registrar um valor.' 
                    : 'Aguarde o envio de recibos de vale refeição para sua assinatura.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      <th className="py-3 px-4">Referência</th>
                      <th className="py-3 px-4">Valor Total</th>
                      <th className="py-3 px-4">Criado em</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((rec) => {
                      const isSelected = selectedReceipt?.id === rec.id;
                      return (
                        <tr 
                          key={rec.id}
                          className={cn(
                            "group hover:bg-slate-50 transition-colors border-b border-slate-50/60",
                            isSelected && "bg-blue-50/40 hover:bg-blue-50/50"
                          )}
                        >
                          <td className="py-3.5 px-4 font-extrabold text-slate-900 text-sm">
                            {months[rec.month - 1]} e {rec.year}
                          </td>
                          <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                            {formatCurrency(rec.amount)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-xs">
                            {rec.createdAt ? format(new Date(rec.createdAt), "dd/MM/yyyy") : '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            {rec.status === 'signed' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-600 rounded-lg">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Assinado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-600 rounded-lg animate-pulse">
                                <AlertCircle className="w-3.5 h-3.5" /> Pendente
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedReceipt(rec);
                                  setTimeout(() => {
                                    document.getElementById('receipt-preview-container')?.scrollIntoView({ behavior: 'smooth' });
                                  }, 100);
                                }}
                                className={cn(
                                  "p-2 rounded-lg transition-all border",
                                  isSelected 
                                    ? "bg-slate-900 text-white border-slate-900" 
                                    : "bg-slate-50 text-slate-650 hover:bg-slate-100 border-slate-100"
                                )}
                                title="Abrir Documento"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteReceipt(rec.id)}
                                  className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all"
                                  title="Deletar Recibo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* PDF/Screen Interactive Model Render Block (A4 Proportion) */}
          {selectedReceipt ? (
            <div id="receipt-preview-container" className="space-y-4">
              
              {/* Receipt Control Panel bar */}
              <div className="flex items-center justify-between p-4 bg-slate-900 text-white rounded-3xl shadow-lg shadow-slate-900/10 print:hidden gap-4">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-2.5 bg-blue-500/10 rounded-lg text-blue-400 font-extrabold text-xs uppercase tracking-wider">
                    {months[selectedReceipt.month - 1]}/{selectedReceipt.year}
                  </span>
                  <span className="text-slate-400 text-xs hidden sm:inline">Visualização do Recibo</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold rounded-xl transition-all cursor-pointer text-xs"
                  >
                    <Printer className="w-4 h-4" /> Imprimir / PDF
                  </button>

                  {!isAdmin && selectedReceipt.status === 'pending' && (
                    <button
                      onClick={() => {
                        setTypedName(user ? user.name : '');
                        setShowSignModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl transition-all text-xs"
                    >
                      <ShieldCheck className="w-4 h-4" /> Assinar Digitalmente
                    </button>
                  )}

                  {isAdmin && selectedReceipt.status === 'signed' && !selectedReceipt.adminSigned && (
                    <button
                      onClick={() => {
                        setTypedName(user ? user.name : '');
                        setShowSignModal(true);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 font-bold rounded-xl transition-all text-xs animate-pulse"
                    >
                      <ShieldCheck className="w-4 h-4" /> Homologar Refeição
                    </button>
                  )}
                  
                  <button
                    onClick={() => setSelectedReceipt(null)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all text-slate-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Exact Model Container matching user's image rules */}
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 p-4 md:p-8 overflow-hidden print:border-0 print:shadow-none print:p-0">
                
                {/* Physical boundary representing A4 bounds */}
                <div id="print-section" className="border-4 border-slate-950 p-8 md:p-12 relative bg-white text-slate-950 font-sans min-h-[420px] flex flex-col justify-between max-w-3xl mx-auto rounded-xs my-1 shadow-sm">
                  
                  {/* Top Centered Title */}
                  <div className="text-center font-extrabold text-2xl tracking-wide uppercase border-b-2 border-slate-950 pb-5 mb-8">
                    Recibo de Vale Refeição
                  </div>

                  {/* Employee Name details */}
                  <div className="mb-10 text-base font-bold leading-relaxed">
                    Funcionário: <span className="underline ml-1 font-extrabold text-slate-900">{selectedReceipt.userName}</span>
                  </div>

                  {/* Legal Term Text */}
                  <div className="text-sm font-semibold text-justify leading-loose mb-12 text-slate-900">
                    Recebi da empresa <span className="font-extrabold uppercase">{selectedReceipt.companyName}</span>, 
                    CNPJ/CEI nº <span className="font-mono font-bold">{selectedReceipt.companyCnpj}</span>, 1 vales Refeição, 
                    no valor total de <span className="font-black text-slate-950 underline decoration-slate-950">R$ {selectedReceipt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>, 
                    referente a <span className="font-bold underline">{String(selectedReceipt.month).padStart(2, '0')}/{selectedReceipt.year}</span>.
                  </div>

                  {/* Signature Spot */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12 pt-8 max-w-xl mx-auto items-end">
                    {/* Employee Signature */}
                    <div className="border-t border-slate-900 text-center relative flex flex-col items-center pt-2 min-h-[90px] w-full">
                      {selectedReceipt.status === 'signed' ? (
                        <div className="absolute bottom-6 flex flex-col items-center text-center select-none w-full animate-fade-in">
                          {selectedReceipt.signatureURL && (
                            <img 
                              src={selectedReceipt.signatureURL} 
                              alt="Assinatura Eletrônica" 
                              className="h-10 max-w-[180px] object-contain mb-1 mix-blend-multiply origin-center -rotate-1 select-none"
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <p className="text-[6.5px] text-emerald-700 font-extrabold uppercase font-mono tracking-tighter bg-emerald-50 border border-emerald-100 p-0.5 px-1 rounded-sm max-w-[180px] break-words">
                            {selectedReceipt.signatureText || 'Assinado Eletronicamente'}
                          </p>
                        </div>
                      ) : (
                        <div className="absolute bottom-6 font-mono text-[9px] text-slate-400 font-bold tracking-widest uppercase select-none">
                          Aguardando Assinatura
                        </div>
                      )}
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wide">Assinatura do Funcionário</span>
                    </div>

                    {/* Admin Signature */}
                    <div className="border-t border-slate-900 text-center relative flex flex-col items-center pt-2 min-h-[90px] w-full">
                      {selectedReceipt.adminSigned ? (
                        <div className="absolute bottom-6 flex flex-col items-center text-center select-none w-full animate-fade-in">
                          {selectedReceipt.adminSignatureURL ? (
                            <img 
                              src={selectedReceipt.adminSignatureURL} 
                              alt="Visto Administrador" 
                              className="h-10 max-w-[180px] object-contain mb-1 mix-blend-multiply origin-center select-none"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="signature-font text-[12px] text-zinc-700 font-bold italic block select-none mb-1">
                              {selectedReceipt.adminSignatureText || 'Administrador'}
                            </span>
                          )}
                          <p className="text-[6.5px] text-indigo-700 font-extrabold uppercase font-mono tracking-tighter bg-indigo-50 border border-indigo-100 p-0.5 px-1 rounded-sm max-w-[180px] break-words">
                            Vistado pela Administração • {selectedReceipt.adminSignedAt ? format(new Date(selectedReceipt.adminSignedAt), "dd/MM/yyyy") : ''}
                          </p>
                        </div>
                      ) : (
                        <div className="absolute bottom-6 font-mono text-[9px] text-slate-450 font-semibold tracking-widest uppercase select-none">
                          Pendente de Homologação
                        </div>
                      )}
                      <span className="text-[10px] font-black uppercase text-slate-800 tracking-wide">Visto do Administrador (RH)</span>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          ) : (
            // No receipt selected visual prompt
            <div className="bg-slate-100/50 rounded-[2rem] border border-dashed border-slate-200/80 p-12 text-center text-slate-450 text-sm flex flex-col items-center justify-center gap-3 print:hidden">
              <FileCheck className="w-16 h-16 text-slate-300 stroke-1" />
              <div>
                <p className="font-bold text-slate-600">Nenhum Recibo Aberto</p>
                <p className="text-xs max-w-sm mt-1">Selecione um dos recibos da lista acima para visualizar o documento oficial, imprimir, realizar o download ou assinar digitalmente.</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* MODAL 1: ADD RECEIPT FORM MODAL (Admin Only, Print Hidden) */}
      <AnimatePresence>
        {showAddModal && isAdmin && selectedEmployee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h4 className="font-black text-lg">Novo Recibo de Vale Refeição</h4>
                  <p className="text-xs text-slate-400 font-medium">Os dados da empresa e do colaborador são automáticos.</p>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                
                {/* Auto Field Info Box */}
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-2">
                  <div className="flex gap-2 items-start">
                    <Building className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-extrabold text-blue-950 uppercase tracking-wider text-[10px]">Emitente (Empresa)</p>
                      <p className="font-bold text-slate-850">{company?.name || 'Sua Empresa Ltda'}</p>
                      <p className="text-slate-450 font-mono">CNPJ: {company?.cnpj || '53.704.137/0001-93'}</p>
                    </div>
                  </div>
                  <div className="border-t border-blue-100/60 my-2 pt-2 flex gap-2 items-start">
                    <UserCheck className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-extrabold text-blue-950 uppercase tracking-wider text-[10px]">Beneficiário (Colaborador)</p>
                      <p className="font-bold text-slate-850">{selectedEmployee.name}</p>
                      <p className="text-slate-450 font-mono">CPF: {selectedEmployee.cpf || '***.***.***-**'}</p>
                    </div>
                  </div>
                </div>

                {/* Form fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Mês</label>
                    <select
                      value={newReceiptMonth}
                      onChange={(e) => setNewReceiptMonth(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 rounded-2xl text-slate-800 text-sm transition-all focus:outline-none"
                    >
                      {months.map((m, idx) => (
                        <option key={idx} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Ano</label>
                    <select
                      value={newReceiptYear}
                      onChange={(e) => setNewReceiptYear(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border-0 focus:ring-2 focus:ring-blue-100 rounded-2xl text-slate-800 text-sm transition-all focus:outline-none"
                    >
                      {[2025, 2026, 2027, 2028].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Valor Total a Receber (Contado p/ dias trabalhados)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-slate-450 text-sm font-bold">R$</span>
                    <input
                      type="text"
                      placeholder="350,00"
                      value={newReceiptAmount}
                      onChange={(e) => setNewReceiptAmount(e.target.value.replace(/[^0-9,.]/g, ''))}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-0 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm font-extrabold transition-all focus:outline-none"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-1">Insira somente os números e vírgula/ponto para separar centavos.</span>
                </div>

                <div className="pt-4 border-t border-slate-50 flex gap-4">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateReceipt}
                    disabled={submittingReceipt}
                    className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                  >
                    {submittingReceipt ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> Registrar e Enviar
                      </>
                    )}
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: INTERACTIVE DIGITAL SIGNATURE PANEL (Employee Only, Print Hidden) */}
      <AnimatePresence>
        {showSignModal && selectedReceipt && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 print:hidden">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-base">Assinatura Eletrônica e Registro de Recebimento</h4>
                  <p className="text-[10px] text-slate-400">Certificação e validade digital do vale refeição para {months[selectedReceipt.month - 1]}/{selectedReceipt.year}</p>
                </div>
                <button 
                  onClick={() => setShowSignModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                
                {/* Tab selector mode */}
                <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-150">
                  <button
                    onClick={() => setSignMode('draw')}
                    className={cn(
                      "flex-1 py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer",
                      signMode === 'draw' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Desenhar Assinatura
                  </button>
                  <button
                    onClick={() => {
                      setSignMode('type');
                      setTypedName(user ? user.name : '');
                    }}
                    className={cn(
                      "flex-1 py-2.5 font-bold rounded-xl text-xs transition-all cursor-pointer",
                      signMode === 'type' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Digitar Nome
                  </button>
                </div>

                {signMode === 'draw' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-wider">Painel de Desenho</span>
                        <button 
                          type="button"
                          onClick={() => setIsRotated(!isRotated)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer text-[10px]"
                        >
                          <RotateCw className="w-3 h-3 animate-spin-slow" />
                          {isRotated ? "Girar Normal" : "Girar Tela (90°)"}
                        </button>
                      </div>
                      <button 
                        onClick={clearCanvas}
                        className="text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                      >
                        Limpar Tela
                      </button>
                    </div>
                    
                    <div className={cn(
                      "bg-slate-50 rounded-2xl border border-slate-200/60 overflow-hidden relative flex items-center justify-center transition-all duration-300",
                      isRotated ? "h-72" : "h-40"
                    )}>
                      <canvas 
                        ref={canvasRef}
                        width={600}
                        height={200}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                        className={cn(
                          "w-full h-full bg-transparent cursor-crosshair touch-none origin-center transition-all duration-300",
                          isRotated ? "rotate-90 scale-125" : ""
                        )}
                      />
                      {!isRotated && (
                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-350 select-none text-[10px] font-bold uppercase tracking-widest opacity-35">
                          Assine de forma livre aqui
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Nome Completo</label>
                      <input 
                        type="text"
                        placeholder="Nome completo do assinante"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-y border-slate-100 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm transition-all focus:outline-none"
                      />
                    </div>

                    <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-2xl flex flex-col items-center justify-center h-28 text-center relative overflow-hidden select-none">
                      <span className="absolute top-1.5 text-[8px] uppercase tracking-wider font-extrabold text-slate-400">Cursive Signature Preview</span>
                      <p className="text-[26px] text-blue-900 leading-none italic block whitespace-nowrap mt-2 animate-pulse" style={{ fontFamily: '"Caveat", cursive, "Dancing Script", serif' }}>
                        {typedName.trim() || 'Sua Assinatura Cursiva'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Legal disclaimer */}
                <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl text-[10px] text-slate-500 leading-relaxed space-y-1">
                  <p className="font-extrabold text-slate-700 uppercase tracking-wide">Declaração de Consentimento</p>
                  <p>Ao assinar eletronicamente este recibo, dou fé e declaro que recebi os créditos correspondentes ao meu Vale Refeição referente à data e valores indicados no modelo, anuindo com a comprovação e idoneidade digital desta transação para fins trabalhistas e de recursos humanos.</p>
                </div>

                <div className="pt-4 border-t border-slate-50 flex gap-4">
                  <button
                    onClick={() => setShowSignModal(false)}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all"
                  >
                    Retornar
                  </button>
                  <button
                    onClick={handleSignatureSubmit}
                    disabled={signingState}
                    className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {signingState ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" /> Confirmar e Assinar
                      </>
                    )}
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Styled Print Rules for physical paper A4 outputs */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-section, #print-section * {
            visibility: visible;
          }
          #print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
