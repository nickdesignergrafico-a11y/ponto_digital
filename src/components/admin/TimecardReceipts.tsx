import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { User } from '../../types';
import { 
  Search, 
  Filter, 
  Check, 
  X, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  PenTool, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  FileCheck 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TimecardReceiptsProps {
  onViewTimecard: (user: User, monthDate: Date) => void;
}

export default function TimecardReceipts({ onViewTimecard }: TimecardReceiptsProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_employee' | 'pending_admin' | 'signed'>('all');

  useEffect(() => {
    setLoading(true);

    // 1. Fetch all employees in real time
    const usersQuery = query(collection(db, 'users'), where('role', '==', 'employee'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const employees = snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as User));
      setUsers(employees);
    }, (error) => {
      console.error('Error fetching users in real-time:', error);
    });

    // 2. Fetch all signatures for this specific month / year in real time
    const m = currentMonth.getMonth() + 1;
    const y = currentMonth.getFullYear();
    
    const sigQuery = query(
      collection(db, 'timecardSignatures'),
      where('month', '==', m),
      where('year', '==', y)
    );

    const unsubSigs = onSnapshot(sigQuery, (sigSnapshot) => {
      const sigList = sigSnapshot.docs.map(d => d.data());
      setSignatures(sigList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching timecardSignatures in real-time:', error);
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubSigs();
    };
  }, [currentMonth]);

  const fetchData = async () => {
    // Handled by the real-time listeners in useEffect
  };

  const getEmployeeStatus = (uid: string) => {
    const user = users.find(u => u.uid === uid);
    const userSigs = signatures.filter(s => s.userId === uid);
    
    // Determine all posts this employee is associated with this month
    const userPostsSet = new Set<string>();
    if (user) {
      userPostsSet.add(user.postoName || 'Portaria Principal');
    } else {
      userPostsSet.add('Portaria Principal');
    }
    userSigs.forEach(s => {
      userPostsSet.add(s.postoName || 'Portaria Principal');
    });
    
    const allUserPosts = Array.from(userPostsSet);
    
    // Check if there are any unsigned posts by the employee
    const unsignedPosts = allUserPosts.filter(post => {
      return !userSigs.some(s => {
        const sName = s.postoName || 'Portaria Principal';
        return sName.toLowerCase().trim() === post.toLowerCase().trim();
      });
    });
    
    if (unsignedPosts.length > 0) {
      return {
        code: 'pending_employee',
        label: 'Aguardando Funcionário',
        badgeClass: 'bg-amber-50 text-amber-600 border border-amber-200/60',
        icon: Clock,
        signature: null,
        postsCount: allUserPosts.length,
        signedCount: allUserPosts.length - unsignedPosts.length
      };
    }
    
    // All are signed by the employee. Now check admin signatures (homologation)
    const unhomologatedSigs = userSigs.filter(s => !s.adminSigned);
    
    if (unhomologatedSigs.length > 0) {
      return {
        code: 'pending_admin',
        label: 'Novo Recebimento (RH Pendente)',
        badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200/60 animate-pulse',
        icon: PenTool,
        signature: userSigs[0], // fallback signature to show
        postsCount: allUserPosts.length,
        signedCount: allUserPosts.length
      };
    }
    
    // Both employee and admin have signed everything
    return {
      code: 'signed',
      label: 'Folha Homologada',
      badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60',
      icon: FileCheck,
      signature: userSigs[0],
      postsCount: allUserPosts.length,
      signedCount: allUserPosts.length
    };
  };

  // Metrics
  const totalEmployees = users.length;
  const signedByEmployee = users.filter(u => {
    const status = getEmployeeStatus(u.uid);
    return status.code === 'pending_admin' || status.code === 'signed';
  }).length;
  const homologatedByRH = users.filter(u => getEmployeeStatus(u.uid).code === 'signed').length;
  const pendingEmployeeCount = totalEmployees - signedByEmployee;

  // Filter & Search
  const filteredUsers = users.filter(user => {
    const status = getEmployeeStatus(user.uid);
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (user.department || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && status.code === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Container */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Recebimento de Folhas</h1>
          <p className="text-slate-500 font-medium">Controle mensal e homologação das folhas de ponto assinadas digitais.</p>
        </div>

        {/* Month Selector */}
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm shrink-0">
          <button 
            type="button"
            onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
            className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-4 font-bold text-slate-700 min-w-[140px] text-center capitalize text-sm">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button 
            type="button"
            onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
            className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total de Colaboradores</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900">{totalEmployees}</span>
            <span className="text-xs font-semibold text-slate-400">vigias ativos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider text-amber-600">Pendente Funcionário</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-amber-600">{pendingEmployeeCount}</span>
            <span className="text-xs font-semibold text-slate-400">restantes</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between p-gradient animate-pulse bg-gradient-to-tr from-blue-50/20 to-indigo-50/20">
          <span className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Aguardando Visto RH</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-indigo-600">{signedByEmployee - homologatedByRH}</span>
            <span className="text-xs font-semibold text-indigo-400 font-bold">novas folhas</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Homologadas pelo RH</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-emerald-600">{homologatedByRH}</span>
            <span className="text-xs font-semibold text-slate-400">concluídas</span>
          </div>
        </div>
      </div>

      {/* Search and Filter Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar colaborador ou setor..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-blue-500 rounded-2xl font-semibold outline-none text-sm transition-all shadow-inner"
          />
        </div>

        {/* Filter Badges */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'all' 
                ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Todos ({totalEmployees})
          </button>
          
          <button
            onClick={() => setStatusFilter('pending_employee')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'pending_employee' 
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Pendente Funcionário ({pendingEmployeeCount})
          </button>

          <button
            onClick={() => setStatusFilter('pending_admin')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'pending_admin' 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Pendente Visto RH ({signedByEmployee - homologatedByRH})
          </button>

          <button
            onClick={() => setStatusFilter('signed')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer",
              statusFilter === 'signed' 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/10" 
                : "bg-slate-50 text-slate-500 hover:text-slate-800"
            )}
          >
            Homologados ({homologatedByRH})
          </button>
        </div>
      </div>

      {/* Main List Table Container */}
      <div className="bg-white border border-slate-200/60 rounded-[2.5rem] shadow-sm overflow-hidden p-2">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-medium space-y-3">
            <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-800 animate-spin mx-auto" />
            <p className="text-xs uppercase tracking-widest font-bold">Buscando folhas de ponto...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-16 text-center text-slate-400 space-y-2">
            <FileSpreadsheet className="w-12 h-12 text-slate-200 mx-auto" />
            <p className="text-sm font-bold">Nenhum colaborador encontrado com os filtros informados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                  <th className="px-6 py-4">Colaborador</th>
                  <th className="px-6 py-4">Setor / Função</th>
                  <th className="px-6 py-4">Status da Assinatura</th>
                  <th className="px-6 py-4">Assinatura Func.</th>
                  <th className="px-6 py-4">Visto RH</th>
                  <th className="px-6 py-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredUsers.map((user) => {
                  const status = getEmployeeStatus(user.uid);
                  const Icon = status.icon;

                  return (
                    <tr key={user.uid} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-700 overflow-hidden border border-slate-200/40">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                              user.name.charAt(0)
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">ID: {user.employeeId || '---'}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        <p className="text-sm font-semibold text-slate-700">{user.department?.toUpperCase() || 'VIGIA'}</p>
                        <p className="text-xs text-slate-400 font-medium">
                          {user.role === 'admin' ? 'RH/ADMINISTRADOR' : 'VIGIA'}
                        </p>
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wide",
                            status.badgeClass
                          )}>
                            <Icon className="w-3.5 h-3.5" />
                            {status.label}
                          </span>
                          {status.postsCount > 1 && (
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              ( {status.signedCount} de {status.postsCount} postos assinados )
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-5">
                        {status.signature ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-800">Assinado</p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {format(new Date(status.signature.signedAt), "dd/MM/yy 'às' HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">Pendente</span>
                        )}
                      </td>

                      <td className="px-6 py-5">
                        {status.signature && status.signature.adminSigned ? (
                          <div className="space-y-0.5 text-emerald-600">
                            <p className="text-xs font-black uppercase flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-500" />
                              Homologado
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono font-bold">
                              {format(new Date(status.signature.adminSignedAt), "dd/MM/yy 'às' HH:mm")}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">Pendente visto</span>
                        )}
                      </td>

                      <td className="px-6 py-5 text-right">
                        <button
                          type="button"
                          onClick={() => onViewTimecard(user, currentMonth)}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer inline-flex items-center gap-1.5",
                            status.code === 'pending_admin'
                              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/15"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                          )}
                        >
                          {status.code === 'pending_admin' ? (
                            <>
                              <PenTool className="w-3.5 h-3.5" />
                              Verificar & Vistar
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                              Revisar Folha
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
