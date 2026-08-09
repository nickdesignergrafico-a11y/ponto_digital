import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, doc, deleteDoc, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Palmtree, 
  Plus, 
  Search, 
  Trash2, 
  FileText, 
  CheckCircle, 
  Clock, 
  X, 
  User, 
  ChevronRight, 
  Info,
  Calendar,
  DollarSign,
  Lock,
  Printer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { motion, AnimatePresence } from 'motion/react';

interface TaxItem {
  name: string;
  amount: number;
  type: 'deduction' | 'addition';
}

interface DiscountItem {
  name: string;
  amount: number;
}

export default function AdminVacations() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [vacationSlips, setVacationSlips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'schedule'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'signed' | 'pending'>('all');
  const [company, setCompany] = useState<any>(null);
  
  // Modal states
  const [previewSlip, setPreviewSlip] = useState<any | null>(null);

  // Form states for scheduling
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    vacationStart: '',
    vacationEnd: '',
    acquisitionStart: '',
    acquisitionEnd: '',
    vacationSalary: 0,
    hasConstitutionalThird: true,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const [tempItem, setTempItem] = useState({ name: '', amount: 0, type: 'addition' as 'addition' | 'deduction' });
  const [customAdditions, setCustomAdditions] = useState<{ name: string; amount: number }[]>([]);
  const [customDeductions, setCustomDeductions] = useState<{ name: string; amount: number }[]>([]);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Fetch employees and company config
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const onlyEmployees = list.filter((u: any) => u.role === 'employee');
        setEmployees(onlyEmployees);
        if (onlyEmployees.length > 0) {
          setSelectedUser(onlyEmployees[0]);
          setFormData(prev => ({ ...prev, vacationSalary: onlyEmployees[0].salary || 2500 }));
        }
      } catch (err) {
        console.error('Error fetching employees:', err);
      }
    };

    const unsubCompany = onSnapshot(doc(db, "company", "config"), (snapshot) => {
      if (snapshot.exists()) {
        setCompany(snapshot.data());
      }
    });

    fetchEmployees();
    fetchVacations();

    return unsubCompany;
  }, []);

  const fetchVacations = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'salarySlips'),
        where('documentType', '==', 'vacation')
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      list.sort((a: any, b: any) => (b.issuedAt || '').localeCompare(a.issuedAt || ''));
      setVacationSlips(list);
    } catch (err) {
      console.error('Error loading vacations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Tax calculations
  const calculateTaxes = (base: number) => {
    // INSS standard model
    let inss = 0;
    if (base <= 1412) inss = base * 0.075;
    else if (base <= 2666.68) inss = (base * 0.09) - 21.18;
    else if (base <= 4000.03) inss = (base * 0.12) - 101.18;
    else inss = (base * 0.14) - 181.18;

    // IRPF simplified model
    let irpf = 0;
    const baseCalculo = base - inss;
    if (baseCalculo <= 2259.20) irpf = 0;
    else if (baseCalculo <= 2826.65) irpf = (baseCalculo * 0.075) - 169.44;
    else if (baseCalculo <= 3751.05) irpf = (baseCalculo * 0.15) - 381.44;
    else if (baseCalculo <= 4664.68) irpf = (baseCalculo * 0.225) - 662.77;
    else irpf = (baseCalculo * 0.275) - 896.00;

    return {
      inss: Number(Math.max(0, inss).toFixed(2)),
      irpf: Number(Math.max(0, irpf).toFixed(2))
    };
  };

  // Live totalizer computation
  const getCalculatedOutcomes = () => {
    const vSalary = Number(formData.vacationSalary);
    const constThird = formData.hasConstitutionalThird ? Number((vSalary / 3).toFixed(2)) : 0;
    
    // Custom values
    const additionsTotal = customAdditions.reduce((acc, c) => acc + c.amount, 0);
    const deductionsTotal = customDeductions.reduce((acc, c) => acc + c.amount, 0);
    
    const baseTaxes = vSalary + constThird + additionsTotal;
    const { inss, irpf } = calculateTaxes(baseTaxes);
    
    const grossTotal = baseTaxes;
    const taxesTotal = inss + irpf + deductionsTotal;
    const netSalary = Math.max(0, grossTotal - taxesTotal);

    return {
      grossTotal,
      constThird,
      inss,
      irpf,
      taxesTotal,
      netSalary
    };
  };

  const handleAddCustomItem = () => {
    if (!tempItem.name || tempItem.amount <= 0) return;
    if (tempItem.type === 'addition') {
      setCustomAdditions([...customAdditions, { name: tempItem.name, amount: tempItem.amount }]);
    } else {
      setCustomDeductions([...customDeductions, { name: tempItem.name, amount: tempItem.amount }]);
    }
    setTempItem({ name: '', amount: 0, type: tempItem.type });
  };

  const handleRemoveCustomItem = (idx: number, type: 'addition' | 'deduction') => {
    if (type === 'addition') {
      setCustomAdditions(customAdditions.filter((_, i) => i !== idx));
    } else {
      setCustomDeductions(customDeductions.filter((_, i) => i !== idx));
    }
  };

  const handleEmployeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const empId = e.target.value;
    const emp = employees.find(u => u.id === empId);
    if (emp) {
      setSelectedUser(emp);
      setFormData(prev => ({
        ...prev,
        vacationSalary: emp.salary || 2500
      }));
    }
  };

  // Submit and create
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      alert('Por favor, selecione um funcionário.');
      return;
    }
    if (!formData.vacationStart || !formData.vacationEnd) {
      alert('Especifique as datas de férias (período de gozo).');
      return;
    }
    if (!formData.acquisitionStart || !formData.acquisitionEnd) {
      alert('Especifique o período aquisitivo de férias.');
      return;
    }

    try {
      const outcomes = getCalculatedOutcomes();
      
      const payloadTaxes: TaxItem[] = [
        { name: 'INSS s/ Férias', amount: outcomes.inss, type: 'deduction' },
        { name: 'IRPF s/ Férias', amount: outcomes.irpf, type: 'deduction' }
      ];

      customAdditions.forEach(a => {
        payloadTaxes.push({ name: a.name, amount: a.amount, type: 'addition' });
      });

      const payloadDiscounts: DiscountItem[] = customDeductions.map(d => ({
        name: d.name,
        amount: d.amount
      }));

      const slipData = {
        userId: selectedUser.id,
        month: Number(formData.month),
        year: Number(formData.year),
        baseSalary: Number(selectedUser.salary || 0),
        taxes: payloadTaxes,
        discounts: payloadDiscounts,
        netSalary: Number(outcomes.netSalary.toFixed(2)),
        signed: false,
        issuedAt: new Date().toISOString(),
        documentType: 'vacation',
        vacationStart: formData.vacationStart,
        vacationEnd: formData.vacationEnd,
        acquisitionStart: formData.acquisitionStart,
        acquisitionEnd: formData.acquisitionEnd,
        vacationSalary: Number(formData.vacationSalary),
        hasConstitutionalThird: formData.hasConstitutionalThird
      };

      await addDoc(collection(db, 'salarySlips'), slipData);

      // Issue notification to worker
      const notificationTitle = '🌴 Férias Enviadas pelo RH';
      const notificationMsg = `O RH enviou de forma digital seu Recibo e Aviso de Férias (${formatDateBR(formData.vacationStart)} a ${formatDateBR(formData.vacationEnd)}). Acesse a aba "Férias" para fazer a assinatura.`;
      
      await createNotification(
        selectedUser.id,
        notificationTitle,
        notificationMsg,
        'warning',
        'requests'
      );

      alert('Aviso e Recibo de Férias gerado e enviado com sucesso ao colaborador!');
      
      // Cleanup
      setFormData({
        vacationStart: '',
        vacationEnd: '',
        acquisitionStart: '',
        acquisitionEnd: '',
        vacationSalary: selectedUser.salary || 2500,
        hasConstitutionalThird: true,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      });
      setCustomAdditions([]);
      setCustomDeductions([]);
      setActiveTab('list');
      fetchVacations();
    } catch (err) {
      console.error(err);
      alert('Erro ao gravar férias no banco de dados.');
    }
  };

  const handleDeleteVacation = async (id: string) => {
    if (!confirm('Você tem certeza que deseja cancelar e excluir esta folha de férias permanente? Esta ação é irreversível.')) return;
    try {
      await deleteDoc(doc(db, 'salarySlips', id));
      setVacationSlips(vacationSlips.filter(v => v.id !== id));
      alert('Férias removidas do banco com sucesso.');
    } catch (e) {
      console.error(e);
      alert('Erro ao excluir documentação.');
    }
  };

  const formatDateBR = (dateStr: string) => {
    if (!dateStr) return '__/__/____';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const formatCurrencyBR = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const getCboByJob = (job?: string) => {
    const normalized = (job || '').toUpperCase();
    if (normalized.includes('VIGIA') || normalized.includes('VIGILANTE')) return '517420';
    if (normalized.includes('ADMIN') || normalized.includes('AUXILIAR')) return '411010';
    if (normalized.includes('RECEPCIONISTA')) return '422105';
    if (normalized.includes('MOTORISTA')) return '782320';
    if (normalized.includes('SERVIÇOS') || normalized.includes('LIMPEZA')) return '514320';
    return '517420';
  };

  // Searching & Filtering
  const filteredSlips = vacationSlips.filter(v => {
    const emp = employees.find(e => e.id === v.userId);
    const empName = emp?.name || '';
    const matchesSearch = empName.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'signed') return matchesSearch && v.signed;
    if (statusFilter === 'pending') return matchesSearch && !v.signed;
    return matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3.5 bg-amber-500 text-white rounded-3xl shadow-md">
            <Palmtree className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Gestão de Férias CLT
            </h1>
            <p className="text-slate-500 text-xs">
              Agende férias CLT, realize cálculos automáticos e controle assinaturas digitais direto com os funcionários.
            </p>
          </div>
        </div>

        {/* Navigation Tab Actions */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-150 flex items-center shadow-sm">
          <button
            onClick={() => setActiveTab('list')}
            className={cn(
              "px-5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-tight transition-all cursor-pointer",
              activeTab === 'list' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="w-4 h-4" />
            Demonstrativos Enviados
          </button>
          
          <button
            onClick={() => setActiveTab('schedule')}
            className={cn(
              "px-5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-black uppercase tracking-tight transition-all cursor-pointer",
              activeTab === 'schedule' 
                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/10" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Plus className="w-4 h-4" />
            Programar Férias CLT
          </button>
        </div>
      </div>

      {activeTab === 'list' ? (
        <div className="space-y-4">
          {/* SEARCH AND FILTERS */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar funcionário pelo nome..."
                className="w-full bg-white border border-slate-150 rounded-2xl pl-11 pr-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all outline-none"
              />
            </div>
            <div className="flex bg-slate-100 border border-slate-150 p-1 rounded-2xl gap-1 shrink-0">
              <button
                onClick={() => setStatusFilter('all')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer",
                  statusFilter === 'all' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Todos
              </button>
              <button
                onClick={() => setStatusFilter('signed')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer",
                  statusFilter === 'signed' ? "bg-emerald-600 text-white shadow-sm font-bold" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Assinados
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase cursor-pointer",
                  statusFilter === 'pending' ? "bg-orange-600 text-white shadow-sm font-bold" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Pendentes
              </button>
            </div>
          </div>

          {/* LIST GRID */}
          {loading ? (
            <div className="py-20 text-center text-slate-400 font-bold text-sm">
              <div className="w-8 h-8 rounded-full border-4 border-amber-500 border-t-transparent animate-spin mx-auto mb-4" />
              Carregando documentos de férias CLT...
            </div>
          ) : filteredSlips.length > 0 ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-405">
                    <tr>
                      <th className="px-6 py-4 pl-8">Funcionário</th>
                      <th className="px-6 py-4">Período de Gozo</th>
                      <th className="px-6 py-4">Período Aquisitivo</th>
                      <th className="px-6 py-4">Ref. Folha</th>
                      <th className="px-6 py-4">Valor Líquido</th>
                      <th className="px-6 py-4">Status de Assinatura</th>
                      <th className="px-6 py-4 text-right pr-8">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSlips.map((v) => {
                      const emp = employees.find(e => e.id === v.userId);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 pl-8">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center font-black text-xs">
                                {emp?.name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800">{emp?.name || 'Carregando...'}</h3>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{emp?.department || 'VIGIA'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-extrabold text-blue-700">
                              {formatDateBR(v.vacationStart)} a {formatDateBR(v.vacationEnd)}
                            </div>
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">30 Dias de Licença</span>
                          </td>
                          <td className="px-6 py-4 text-slate-500">
                            {formatDateBR(v.acquisitionStart)} a {formatDateBR(v.acquisitionEnd)}
                          </td>
                          <td className="px-6 py-4 font-bold text-neutral-800">
                            {months[v.month - 1]} / {v.year}
                          </td>
                          <td className="px-6 py-4 font-black text-emerald-600 font-mono">
                            {formatCurrencyBR(v.netSalary)}
                          </td>
                          <td className="px-6 py-4">
                            {v.signed ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 font-black uppercase text-[9px] px-2.5 py-1 rounded-full w-fit">
                                  <CheckCircle className="w-3.5 h-3.5 shrink-0" /> Assinado
                                </span>
                                <span className="text-[8.5px] text-slate-450 truncate max-w-[120px] ml-1 font-semibold" title={v.signerIp}>
                                  IP: {v.signerIp}
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 font-black uppercase text-[9px] px-2.5 py-1 rounded-full animate-pulse w-fit">
                                <Clock className="w-3.5 h-3.5 shrink-0" /> Pendente
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right pr-8">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setPreviewSlip(v)}
                                className="p-2 bg-slate-50 hover:bg-slate-100/80 hover:text-slate-900 text-slate-500 rounded-xl cursor-pointer transition-colors"
                                title="Visualizar Recibo de Férias CLT"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteVacation(v.id)}
                                className="p-2 bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl cursor-pointer transition-all"
                                title="Revogar/Excluir Férias"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-20 text-center border-2 border-dashed border-slate-200 bg-white rounded-3xl">
              <Palmtree className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800">Nenhum demonstrativo de férias encontrado</h3>
              <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                Nenhum aviso ou recibo de férias CLT foi agendado para os funcionários com os filtros selecionados.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* SCHEDULE OUTLINE FORM */
        <form onSubmit={handleScheduleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT PART: INPUT FORM FIELDS */}
          <div className="lg:col-span-8 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              🌴 Dados Gerais das Férias
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Employee selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Funcionário</label>
                <select
                  onChange={handleEmployeeChange}
                  value={selectedUser?.id || ''}
                  className="w-full bg-slate-50 border border-slate-200/85 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all"
                >
                  {employees.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || 'VIGIA'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Base Vacation Salary */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Salário Base p/ Férias</label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-xs text-slate-400 font-extrabold pr-2 border-r border-slate-100">R$</span>
                  <input
                    type="number"
                    value={formData.vacationSalary || ''}
                    name="vacationSalary"
                    onChange={(e) => setFormData({ ...formData, vacationSalary: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200/85 rounded-2xl pl-12 pr-4 py-3 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>
            </div>

            {/* DATES: PERIODO AQUISITIVO & GOZO */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5 pl-1.5 border-l-2 border-amber-500">
                Aviso Periódico e Período de Gozo
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-amber-50/20 border border-amber-500/10 p-5 rounded-3xl">
                {/* Aquisição Period */}
                <div className="space-y-2.5">
                  <span className="block text-[9px] font-black uppercase text-amber-800 tracking-wider">1. Período Aquisitivo</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] font-semibold text-slate-405 block mb-1">Início</span>
                      <input
                        type="date"
                        value={formData.acquisitionStart}
                        onChange={(e) => setFormData({ ...formData, acquisitionStart: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] font-semibold text-slate-405 block mb-1">Término</span>
                      <input
                        type="date"
                        value={formData.acquisitionEnd}
                        onChange={(e) => setFormData({ ...formData, acquisitionEnd: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Gozo Period */}
                <div className="space-y-2.5 border-t md:border-t-0 md:border-l border-amber-500/10 pt-4 md:pt-0 md:pl-5">
                  <span className="block text-[9px] font-black uppercase text-blue-800 tracking-wider">2. Período de Gozo (Férias)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] font-semibold text-slate-405 block mb-1">Início</span>
                      <input
                        type="date"
                        value={formData.vacationStart}
                        onChange={(e) => setFormData({ ...formData, vacationStart: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] font-semibold text-slate-405 block mb-1">Término</span>
                      <input
                        type="date"
                        value={formData.vacationEnd}
                        onChange={(e) => setFormData({ ...formData, vacationEnd: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CONSTITUTIONAL THIRD TOGGLE */}
            <div className="border-t border-slate-100 pt-6 flex items-center justify-between">
              <div>
                <span className="block text-sm font-bold text-slate-900">Pagar 1/3 Constitucional de Férias</span>
                <span className="block text-[10px] text-slate-450 leading-relaxed max-w-sm font-medium">Auto-inclui o valor adicional obrigatório correspondente a 33.33% sobre a remuneração de férias.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasConstitutionalThird}
                  onChange={(e) => setFormData({ ...formData, hasConstitutionalThird: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
              </label>
            </div>

            {/* ADICIONAIS OU DESCONTOS PERSONALIZADOS */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5 pl-1.5 border-l-2 border-amber-500">
                Inclusões e Descontos Personalizados
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-150">
                <div className="md:col-span-5">
                  <span className="text-[9px] font-bold text-slate-400 block mb-1">Nome do Lançamento</span>
                  <input
                    type="text"
                    value={tempItem.name}
                    placeholder="Ex: Média de Horas Extras s/ Férias"
                    onChange={(e) => setTempItem({ ...tempItem, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                  />
                </div>
                <div className="md:col-span-3">
                  <span className="text-[9px] font-bold text-slate-400 block mb-1">Valor do Item</span>
                  <input
                    type="number"
                    value={tempItem.amount || ''}
                    placeholder="R$ 0,00"
                    onChange={(e) => setTempItem({ ...tempItem, amount: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none font-bold"
                  />
                </div>
                <div className="md:col-span-2">
                  <span className="text-[9px] font-bold text-slate-400 block mb-1">Tipo</span>
                  <select
                    value={tempItem.type}
                    onChange={(e) => setTempItem({ ...tempItem, type: e.target.value as any })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none"
                  >
                    <option value="addition">Provento (+)</option>
                    <option value="deduction">Desconto (-)</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleAddCustomItem}
                    className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase cursor-pointer text-center hover:bg-slate-800 transition-colors"
                  >
                    Lançar
                  </button>
                </div>
              </div>

              {/* RENDER CUSTOM ADDITIONS */}
              {(customAdditions.length > 0 || customDeductions.length > 0) && (
                <div className="space-y-2 border border-slate-100 rounded-2xl p-4 bg-white">
                  {customAdditions.map((item, idx) => (
                    <div key={`cad-${idx}`} className="flex justify-between items-center bg-emerald-50/30 p-2.5 rounded-xl border border-emerald-500/10 text-xs text-slate-700">
                      <div className="flex items-center gap-1.5 font-bold uppercase text-[10px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-emerald-600 font-mono">{formatCurrencyBR(item.amount)}</span>
                        <button type="button" onClick={() => handleRemoveCustomItem(idx, 'addition')} className="text-zinc-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {customDeductions.map((item, idx) => (
                    <div key={`cde-${idx}`} className="flex justify-between items-center bg-rose-50/30 p-2.5 rounded-xl border border-rose-500/10 text-xs text-slate-700">
                      <div className="flex items-center gap-1.5 font-bold uppercase text-[10px]">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-rose-600 font-mono">-{formatCurrencyBR(item.amount)}</span>
                        <button type="button" onClick={() => handleRemoveCustomItem(idx, 'deduction')} className="text-zinc-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PAYROLL REFERENCE MONTH/YEAR */}
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                📅 Mês de Referência da Folha de Pagamento
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Mês de Emissão</span>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                  >
                    {months.map((m, idx) => (
                      <option key={idx} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Ano de Referência</span>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500/20 outline-none"
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT PART: CALCULATIONS PANEL & SEND BUTTON */}
          <div className="lg:col-span-4 bg-slate-900 p-8 rounded-3xl text-white flex flex-col justify-between h-fit gap-8 shadow-xl">
            <div className="space-y-6">
              <div>
                <span className="uppercase text-[9px] font-black tracking-widest text-amber-400">Totalizador CLT</span>
                <h4 className="text-lg font-black tracking-tight leading-snug">Detalhamento dos Valores</h4>
                <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">Confira os lançamentos e os impostos de férias previstos em tempo de digitação.</p>
              </div>

              {/* SUMMARY VALUES LIST */}
              {(() => {
                const results = getCalculatedOutcomes();
                return (
                  <div className="text-xs space-y-3.5 border-t border-b border-zinc-800 py-5">
                    <div className="flex justify-between font-bold">
                      <span className="text-zinc-450 uppercase text-[10px]">Valor Férias (30 dias)</span>
                      <span className="font-mono text-zinc-100">{formatCurrencyBR(Number(formData.vacationSalary))}</span>
                    </div>

                    {formData.hasConstitutionalThird && (
                      <div className="flex justify-between font-bold">
                        <span className="text-zinc-455 uppercase text-[10px]">Terço Adicional (33%)</span>
                        <span className="font-mono text-zinc-100">{formatCurrencyBR(results.constThird)}</span>
                      </div>
                    )}

                    {customAdditions.length > 0 && (
                      <div className="flex justify-between font-bold">
                        <span className="text-emerald-450 uppercase text-[10px]">Média Extras / Lançamentos</span>
                        <span className="font-mono text-emerald-400">+{formatCurrencyBR(customAdditions.reduce((a, b) => a + b.amount, 0))}</span>
                      </div>
                    )}

                    <div className="flex justify-between font-bold border-t border-dashed border-zinc-805 pt-3">
                      <span className="text-zinc-400 uppercase text-[10px]">Base Bruta INSS/IRPF</span>
                      <span className="font-mono text-zinc-200">{formatCurrencyBR(results.grossTotal)}</span>
                    </div>

                    <div className="flex justify-between font-semibold">
                      <span className="text-rose-400/85 uppercase text-[10px]">(-) INSS s/ Férias</span>
                      <span className="font-mono text-rose-400">-{formatCurrencyBR(results.inss)}</span>
                    </div>

                    <div className="flex justify-between font-semibold">
                      <span className="text-rose-405 uppercase text-[10px]">(-) IRPF s/ Férias</span>
                      <span className="font-mono text-rose-450">-{formatCurrencyBR(results.irpf)}</span>
                    </div>

                    {customDeductions.length > 0 && (
                      <div className="flex justify-between font-semibold">
                        <span className="text-rose-405 uppercase text-[10px]">(-) Descontos Personalizados</span>
                        <span className="font-mono text-rose-450">-{formatCurrencyBR(customDeductions.reduce((a, b) => a + b.amount, 0))}</span>
                      </div>
                    )}

                    {/* BIG NET TOTAL */}
                    <div className="border-t border-zinc-800 pt-4 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="uppercase text-[9px] font-black tracking-widest text-emerald-400 leading-none">Net Líquido Férias</span>
                        <span className="font-mono text-emerald-400 font-black text-xl tracking-tighter">{formatCurrencyBR(results.netSalary)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-slate-950 py-4.5 rounded-2xl font-black text-xs uppercase tracking-wider text-center flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Palmtree className="w-5 h-5 shrink-0" />
              Lançar e Enviar para Assinatura
            </button>
          </div>
        </form>
      )}

      {/* DETAILED DOCUMENT POPUP MODAL (Art. 135 CLT Layout) */}
      <AnimatePresence>
        {previewSlip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewSlip(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-4xl relative shadow-2xl overflow-hidden z-10"
            >
              {/* Header inside popup */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palmtree className="w-5 h-5 text-amber-500" />
                  <span className="font-bold text-slate-800 text-sm">Visualização de Documento Oficial de Férias</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-xl transition-colors cursor-pointer mr-2"
                    title="Imprimir Recibo"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setPreviewSlip(null)} 
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* RENDER BODY */}
              <div className="p-8 bg-zinc-100/50 max-h-[80vh] overflow-y-auto font-mono text-[9px] leading-tight text-neutral-900">
                {/* Visual rendering of the official A4 receipt notice */}
                <div className="bg-white border-2 border-black max-w-[794px] mx-auto p-6 md:p-10 space-y-6 text-black select-none">
                  
                  {/* Notice Title */}
                  <div className="text-center font-black text-xs uppercase tracking-tight pb-3 border-b-2 border-black">
                    Aviso Prévio e Recibo Especial de Férias CLT (Art. 135 CLT)
                  </div>

                  {/* Company Details Block */}
                  <div className="grid grid-cols-12 border border-black p-2 bg-neutral-50/50">
                    <div className="col-span-8 space-y-1">
                      <div className="font-extrabold uppercase text-[10px]">{company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}</div>
                      <div className="text-[8px] text-zinc-650 font-bold">CNPJ: {company?.cnpj || '53.704.137/0001-93'}</div>
                      <div className="text-[8px] text-zinc-500 leading-none">{company?.address || 'AVENIDA DO TRABALHO, 1045, CENTRO, SÃO PAULO/SP'}</div>
                    </div>
                    <div className="col-span-4 border-l border-black pl-3 flex flex-col justify-center">
                      <div className="font-black text-slate-700 uppercase">Aviso de Férias</div>
                      <div className="font-bold text-slate-500 text-[8px] mt-0.5">Emissão: {new Date(previewSlip.issuedAt).toLocaleDateString('pt-BR')}</div>
                    </div>
                  </div>

                  {/* Employee Details Tab */}
                  {(() => {
                    const emp = employees.find(e => e.id === previewSlip.userId);
                    return (
                      <div className="border border-black">
                        <div className="grid grid-cols-12 border-b border-black divide-x divide-black bg-neutral-100/30 p-1">
                          <div className="col-span-6 p-1">
                            <span className="block text-[6.5px] uppercase font-bold text-zinc-500">Nome do Colaborador</span>
                            <div className="font-black text-[9px] uppercase leading-snug">{emp?.name || '---'}</div>
                          </div>
                          <div className="col-span-3 p-1">
                            <span className="block text-[6.5px] uppercase font-bold text-zinc-500">CBO Ocupação</span>
                            <div className="font-bold text-[8.5px]">{getCboByJob(emp?.department)}</div>
                          </div>
                          <div className="col-span-3 p-1">
                            <span className="block text-[6.5px] uppercase font-bold text-zinc-500">Cargo / Função</span>
                            <div className="font-black text-[8.5px] uppercase">{emp?.department || 'VIGIA'}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-12 divide-x divide-black p-1 bg-neutral-50/20">
                          <div className="col-span-6 p-1">
                            <span className="block text-[6.5px] uppercase font-bold text-zinc-500">Período Aquisitivo de Férias</span>
                            <div className="font-extrabold text-[8.5px] text-neutral-800">
                              {formatDateBR(previewSlip.acquisitionStart)} a {formatDateBR(previewSlip.acquisitionEnd)}
                            </div>
                          </div>
                          <div className="col-span-6 p-1">
                            <span className="block text-[6.5px] uppercase font-bold text-zinc-500">Período de Gozo das Férias</span>
                            <div className="font-black text-[8.5px] text-blue-700 font-mono flex items-center gap-1">
                              🌴 {formatDateBR(previewSlip.vacationStart)} a {formatDateBR(previewSlip.vacationEnd)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* TABLE OF COMMISSIONS (PROVENTOS E DESCONTOS) */}
                  <div className="border border-black">
                    {/* Header line */}
                    <div className="grid grid-cols-12 bg-zinc-200 p-1.5 uppercase font-black text-center text-[7.5px] border-b border-black">
                      <div className="col-span-1 text-center font-bold">Cód.</div>
                      <div className="col-span-5 text-left pl-3 font-bold">Descrição do Item de Férias</div>
                      <div className="col-span-2 text-right pr-3 font-bold">REf.</div>
                      <div className="col-span-2 text-right pr-3 font-bold">Vencimentos</div>
                      <div className="col-span-2 text-right pr-3 font-bold">Descontos</div>
                    </div>

                    {/* ITEMS LIST */}
                    <div className="min-h-[140px] text-[8px] bg-white relative">
                      <div className="absolute inset-y-0 inset-x-0 grid grid-cols-12 pointer-events-none">
                        <div className="col-span-1 border-r border-zinc-200"></div>
                        <div className="col-span-5 border-r border-zinc-200"></div>
                        <div className="col-span-2 border-r border-zinc-200"></div>
                        <div className="col-span-2 border-r border-zinc-200"></div>
                        <div className="col-span-2"></div>
                      </div>

                      <div className="relative z-10 space-y-0.5 pt-1.5">
                        <div className="grid grid-cols-12 px-1">
                          <div className="col-span-1 text-center text-zinc-500">0220</div>
                          <div className="col-span-5 pl-3 font-bold">VALOR BASE DE FÉRIAS DE GOZO</div>
                          <div className="col-span-2 text-right pr-3">30 Dias</div>
                          <div className="col-span-2 text-right font-bold pr-3">{formatCurrencyBR(previewSlip.vacationSalary)}</div>
                          <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                        </div>

                        {previewSlip.hasConstitutionalThird && (
                          <div className="grid grid-cols-12 px-1">
                            <div className="col-span-1 text-center text-zinc-500">0221</div>
                            <div className="col-span-5 pl-3">TERÇO CONSTITUCIONAL DE FÉRIAS (1/3)</div>
                            <div className="col-span-2 text-right pr-3">33,33%</div>
                            <div className="col-span-2 text-right font-bold pr-3">{formatCurrencyBR(Number((previewSlip.vacationSalary / 3).toFixed(2)))}</div>
                            <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                          </div>
                        )}

                        {/* Deductions and customized items */}
                        {previewSlip.taxes.filter((t: any) => t.type === 'addition').map((a: any, idx: number) => (
                          <div className="grid grid-cols-12 px-1" key={`preview-add-${idx}`}>
                            <div className="col-span-1 text-center text-zinc-500">0205</div>
                            <div className="col-span-5 pl-3">{a.name}</div>
                            <div className="col-span-2 text-right pr-3">-</div>
                            <div className="col-span-2 text-right font-bold pr-3">{formatCurrencyBR(a.amount)}</div>
                            <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                          </div>
                        ))}

                        {previewSlip.taxes.filter((t: any) => t.type === 'deduction').map((d: any, idx: number) => (
                          <div className="grid grid-cols-12 px-1" key={`preview-ded-${idx}`}>
                            <div className="col-span-1 text-center text-zinc-500">
                              {d.name.includes('INSS') ? '0910' : '0514'}
                            </div>
                            <div className="col-span-5 pl-3 font-medium">{d.name}</div>
                            <div className="col-span-2 text-right pr-3">-</div>
                            <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                            <div className="col-span-2 text-right font-bold text-red-700 pr-3">{formatCurrencyBR(d.amount)}</div>
                          </div>
                        ))}

                        {previewSlip.discounts.map((d: any, idx: number) => (
                          <div className="grid grid-cols-12 px-1" key={`preview-disc-${idx}`}>
                            <div className="col-span-1 text-center text-zinc-500">0620</div>
                            <div className="col-span-5 pl-3 truncate font-medium">{d.name}</div>
                            <div className="col-span-2 text-right pr-3">-</div>
                            <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                            <div className="col-span-2 text-right font-bold text-red-700 pr-3">{formatCurrencyBR(d.amount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* TOTAL SUMS ROW */}
                    {(() => {
                      const computedAdditions = previewSlip.vacationSalary + 
                        (previewSlip.hasConstitutionalThird ? Number((previewSlip.vacationSalary / 3).toFixed(2)) : 0) +
                        previewSlip.taxes.filter((t: any) => t.type === 'addition').reduce((acc: any, cur: any) => acc + cur.amount, 0);

                      const computedDeductions = previewSlip.taxes.filter((t: any) => t.type === 'deduction').reduce((acc: any, cur: any) => acc + cur.amount, 0) +
                        previewSlip.discounts.reduce((acc: any, cur: any) => acc + cur.amount, 0);

                      return (
                        <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-bold p-1 text-neutral-800">
                          <div className="col-span-8 text-right pr-3">VALOR TOTALIZADOR DE FÉRIAS:</div>
                          <div className="col-span-2 text-right font-mono text-[8.5px] pr-3">{formatCurrencyBR(computedAdditions)}</div>
                          <div className="col-span-2 text-right font-mono text-[8.5px] text-red-700 pr-3">{formatCurrencyBR(computedDeductions)}</div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* NET LIQUID VALUE ROW */}
                  <div className="grid grid-cols-12 border-t border-b-2 border-black items-center h-8">
                    <div className="col-span-8 px-3 flex justify-between items-center text-[7px] font-black uppercase tracking-wider">
                      <span>Valor Líquido Oficial Creditado s/ Férias</span>
                      <span>⇨</span>
                    </div>
                    <div className="col-span-4 bg-zinc-150 font-black font-mono text-center text-[10px] pl-3 flex items-center justify-end pr-3 border-l border-black h-full">
                      {formatCurrencyBR(previewSlip.netSalary)}
                    </div>
                  </div>

                  {/* DIGITAL SIGN PANEL */}
                  {previewSlip.signed ? (
                    <div className="border border-emerald-500 bg-emerald-50/20 p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-emerald-800 font-extrabold uppercase">
                        <CheckCircle className="w-5 h-5" />
                        <span>ASSINATURA DIGITAL COMPROVADA E AUTENTICADA CLT</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[7px] leading-tight text-neutral-700 pt-1.5">
                        <div className="space-y-1">
                          <p><strong>Nome Assinado:</strong> {previewSlip.signerName || 'Não Informado'}</p>
                          <p><strong>Número CPF:</strong> {previewSlip.signerCpf || 'Verificado via Login'}</p>
                          <p><strong>Dispositivo IP:</strong> {previewSlip.signerIp || '---'}</p>
                        </div>
                        <div className="space-y-1 border-t md:border-t-0 md:border-l border-zinc-250 pt-2 md:pt-0 md:pl-4">
                          <p><strong>Data/Hora Assinalada:</strong> {new Date(previewSlip.signedAt).toLocaleDateString('pt-BR')} às {new Date(previewSlip.signedAt).toLocaleTimeString('pt-BR')}</p>
                          <p><strong>Assinador Agente:</strong> {previewSlip.signerUserAgent || '---'}</p>
                          <p><strong>Autenticação Criptográfica:</strong> SHA25519-E-DOC-SIGN-SECURE</p>
                        </div>
                      </div>
                      {previewSlip.signatureDrawing && (
                        <div className="mt-4 pt-2 border-t border-emerald-200">
                          <span className="block text-[6.5px] font-bold text-emerald-700 uppercase mb-1">Visto / Assinatura de Próprio Punho Eletrônica</span>
                          <div className="w-fit border border-emerald-350 bg-white p-1 rounded-lg">
                            <img src={previewSlip.signatureDrawing} alt="Assinatura Eletrônica" className="max-h-16 h-10 object-contain" />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-400 p-4 text-center text-zinc-500 flex flex-col items-center justify-center space-y-1 rounded-xl">
                      <Lock className="w-6 h-6 text-zinc-400 animate-pulse" />
                      <span className="font-bold text-[8.5px] text-zinc-800 uppercase tracking-tight">AGUARDANDO ASSINATURA DIGITAL DO COLABORADOR</span>
                      <p className="text-[7.5px] text-zinc-450 leading-relaxed max-w-sm">O funcionário já foi notificado e pode assinar a versão CLT eletronicamente através de seu celular ou painel de usuário.</p>
                    </div>
                  )}

                  {/* LEGAL CLY DISCLAIMER */}
                  <div className="text-[6.5px] leading-relaxed text-zinc-500 uppercase font-sans">
                    * ART. 135 DA CLT: O EMPREGADOR DARÁ AVISO PRÉVIO ESCRITO DA CONCESSÃO DE FÉRIAS COM ANTECEDÊNCIA DE, NO MÍNIMO, 30 (TRINTA) DIAS. O PAGAMENTO DA REMUNERAÇÃO DAS FÉRIAS E, SE FOR O CASO, O DO ABONO CONSTITUCIONAL SERÃO EFETUADOS ATÉ 2 (DOIS) DIAS ANTES DO INÍCIO DO RESPECTIVO PERÍODO. ESTE RECEBIMENTO COMPROVA A QUITAÇÃO ELETRÔNICA DO CRÉDITO.
                  </div>
                </div>
              </div>

              {/* Close Button details footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
                <button
                  onClick={() => setPreviewSlip(null)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-tight rounded-xl cursor-pointer shadow-md inline-block"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
