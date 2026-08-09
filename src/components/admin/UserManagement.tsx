import React, { useState, useEffect } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth, storage } from '../../lib/firebase';
import firebaseConfig from '../../../firebase-applet-config.json';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User, UserRole } from '../../types';
import { Plus, Search, Filter, Edit2, ShieldAlert, UserPlus, X, FileText, Send, Key, FileSpreadsheet, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { formatCPF, cn, parseFirestoreTimestamp } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { compressImage } from '../../lib/storageHelper';

export default function UserManagement({ 
  onViewTimecard,
  initialTab = 'ativos',
  onTabChange
}: { 
  onViewTimecard?: (user: User) => void;
  initialTab?: 'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco' | 'admins';
  onTabChange?: (tab: 'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco' | 'admins') => void;
}) {
  const { user: currentUser, switchAdminUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [emitting, setEmitting] = useState<string | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<string | null>(null);
  const [originalEmail, setOriginalEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco' | 'admins'>(initialTab);
  const [presentUserIds, setPresentUserIds] = useState<Set<string>>(new Set());
  const [userBankBalances, setUserBankBalances] = useState<Record<string, { minutes: number; formatted: string }>>({});

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (tab: 'ativos' | 'desligados' | 'sincronizados' | 'trabalhando' | 'banco' | 'admins') => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };
  
  // Form State
  const [formData, setFormData] = useState({
    cpf: '',
    employeeId: '',
    workScale: 'default' as 'default' | '12x36',
    name: '',
    email: '',
    password: '',
    role: 'employee' as UserRole,
    department: '',
    postoName: '',
    salary: 0,
    admissionDate: '',
    photoURL: '',
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const userList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      setUsers(userList);

      // Fetch today's attendance
      const attSnapshot = await getDocs(collection(db, 'attendance'));
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const presentIds = new Set<string>();

      // Group by user and day for bank balance calculations
      const groupedBalances: Record<string, any[]> = {};

      attSnapshot.docs.forEach(d => {
        const r = d.data();
        if (r.timestamp && r.userId) {
          try {
            const dateObj = parseFirestoreTimestamp(r.timestamp);
            if (!isNaN(dateObj.getTime())) {
              if (format(dateObj, 'yyyy-MM-dd') === todayStr) {
                presentIds.add(r.userId);
              }

              const dateStr = format(dateObj, 'yyyy-MM-dd');
              const groupKey = `${r.userId}_${dateStr}`;
              if (!groupedBalances[groupKey]) {
                groupedBalances[groupKey] = [];
              }
              groupedBalances[groupKey].push(r);
            }
          } catch (e) {
            console.error('Error parsing timestamp for user', r.userId, e);
          }
        }
      });
      setPresentUserIds(presentIds);

      // Now calculate the balances
      const userMinutes: Record<string, number> = {};

      Object.keys(groupedBalances).forEach(key => {
        const punches = groupedBalances[key];
        const [userId, datePart] = key.split('_');
        const parsedDate = new Date(datePart + 'T12:00:00');
        const isWeekend = parsedDate.getDay() === 0 || parsedDate.getDay() === 6; // Sunday or Saturday

        const pEntry = punches.find(p => p.type === 'entry');
        const pLunchOut = punches.find(p => p.type === 'lunch_out');
        const pLunchIn = punches.find(p => p.type === 'lunch_in');
        const pExit = punches.find(p => p.type === 'exit');

        const getTime = (p: any): Date | null => {
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

        if (workedMinutes === 0) return;

        const standardMinutes = isWeekend ? 0 : 480; // 8 hours standard workday
        const dailyBalance = workedMinutes - standardMinutes;

        if (!userMinutes[userId]) {
          userMinutes[userId] = 0;
        }
        userMinutes[userId] += dailyBalance;
      });

      const formattedBalances: Record<string, { minutes: number; formatted: string }> = {};
      Object.keys(userMinutes).forEach(uid => {
        const balanceMinutes = userMinutes[uid];
        const isPositive = balanceMinutes >= 0;
        const absMinutes = Math.round(Math.abs(balanceMinutes));
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;
        formattedBalances[uid] = {
          minutes: balanceMinutes,
          formatted: `${isPositive ? '+' : '-'}${hours}h ${mins}m`
        };
      });
      setUserBankBalances(formattedBalances);
    } catch (err: any) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        active: !user.active
      });
      setUsers(users.map(u => u.uid === user.uid ? { ...u, active: !u.active } : u));
    } catch (err) {
      console.error(err);
      alert('Erro ao alterar status do usuário');
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.uid === auth.currentUser?.uid) {
      alert('Você não pode excluir a sua própria conta de administrador.');
      return;
    }

    const confirmDelete = window.confirm(`Tem certeza de que deseja EXCLUIR permanentemente o colaborador ${user.name}? Todas as suas informações cadastrais serão perdidas.`);
    if (!confirmDelete) return;

    setLoading(true);
    try {
      // Execute deletion direct on client-side Firestore.
      await deleteDoc(doc(db, 'users', user.uid));
      
      alert('Colaborador excluído com sucesso!');
      await fetchUsers();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir colaborador: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmitSalarySlip = async (user: User) => {
    setEmitting(user.uid);
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Create Mock Salary Slip
      await setDoc(doc(collection(db, 'salarySlips')), {
        userId: user.uid,
        month,
        year,
        baseSalary: user.salary || 3000,
        taxes: [{ name: 'INSS', amount: 300, type: 'deduction' }],
        discounts: [],
        netSalary: (user.salary || 3000) - 300,
        signed: false,
        issuedAt: new Date().toISOString()
      });

      // Create Notification
      await createNotification(
        user.uid,
        'Novo Holerite Disponível',
        `Seu comprovante de rendimentos de ${month}/${year} já está disponível para assinatura.`,
        'info',
        'payroll'
      );

      alert(`Holerite emitido para ${user.name}`);
    } catch (err) {
      console.error(err);
      alert('Erro ao emitir holerite');
    } finally {
      setEmitting(null);
    }
  };

  const handleEditClick = (user: User) => {
    setModalMode('edit');
    setEditingUserId(user.uid);
    setOriginalEmail(user.email || '');
    setSelectedPhotoFile(null);
    setFormData({
      cpf: user.cpf,
      employeeId: user.employeeId || '',
      workScale: user.workScale || 'default',
      name: user.name,
      email: user.email,
      password: '', // Don't show password
      role: user.role,
      department: user.department || '',
      postoName: user.postoName || 'Portaria Principal',
      salary: user.salary || 0,
      admissionDate: user.admissionDate || '',
      photoURL: user.photoURL || '',
    });
    setIsModalOpen(true);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBlob = await compressImage(file, 400, 400, 0.82);
        const compressedFile = new File([compressedBlob as Blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
        
        setSelectedPhotoFile(compressedFile);
        // Use local blob URL for instant high-performance preview
        const previewUrl = URL.createObjectURL(compressedFile);
        setFormData({ ...formData, photoURL: previewUrl });
      } catch (err) {
        console.error("Erro ao comprimir foto:", err);
        setSelectedPhotoFile(file);
        // Fallback preview
        const previewUrl = URL.createObjectURL(file);
        setFormData({ ...formData, photoURL: previewUrl });
      }
    }
  };

  const handleSendPasswordReset = async (user: User) => {
    if (!user.email) {
      alert('Este colaborador não possui e-mail cadastrado ou associado.');
      return;
    }
    const confirmSend = window.confirm(`Deseja enviar um e-mail de redefinição de senha para ${user.name} (${user.email})?`);
    if (!confirmSend) return;

    setResettingPasswordUserId(user.uid);
    try {
      await sendPasswordResetEmail(auth, user.email);
      alert(`E-mail de redefinição de senha enviado com sucesso para ${user.email}!`);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao enviar e-mail de redefinição: ' + err.message);
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    
    setLoading(true);
    let authSyncError = null;
    try {
      // Sync auth email and password on the server ONLY if they were actually modified
      const updatePayload: any = { uid: editingUserId };
      
      const emailChanged = formData.email && formData.email !== originalEmail;
      const passChanged = formData.password && formData.password !== '';
      
      if (emailChanged) updatePayload.email = formData.email;
      if (passChanged) updatePayload.password = formData.password;

      if (emailChanged || passChanged) {
        try {
          const response = await fetch('/api/admin/update-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
          });

          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            const textResponse = await response.text();
            console.error("Non-JSON Response received from update user:", textResponse);
            let customError = "Resposta inválida do servidor backend (não é JSON).";
            if (response.status === 404) {
              customError = "O serviço de sincronização (/api/admin/update-user) não está disponível (404). Verifique se o servidor backend está ativo.";
            } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html")) {
              const matchedTitle = textResponse.match(/<title>([\s\S]*?)<\/title>/i);
              const pageTitle = matchedTitle ? matchedTitle[1].trim() : "";
              customError = `O servidor retornou uma página HTML (${response.status}${pageTitle ? ': ' + pageTitle : ''}) em vez de dados JSON. Certifique-se de que o backend esteja ativo.`;
            } else {
              customError = `Erro ${response.status} do servidor: ${textResponse.slice(0, 150)}`;
            }
            throw new Error(customError);
          }

          const result = await response.json();
          if (!result.success) {
            throw new Error(result.error || 'Erro ao sincronizar dados no Firebase Auth.');
          }
        } catch (apiErr: any) {
          console.warn('API sync error (auth):', apiErr);
          authSyncError = apiErr.message || 'Erro de sincronização';
        }
      }

      // Process profile picture via Storage if any
      let finalPhotoURL = formData.photoURL;
      if (selectedPhotoFile) {
        try {
          const fileExtension = selectedPhotoFile.name.split('.').pop() || 'jpg';
          const fileRef = ref(storage, `users/${editingUserId}/profile_${Date.now()}.${fileExtension}`);
          await uploadBytes(fileRef, selectedPhotoFile);
          finalPhotoURL = await getDownloadURL(fileRef);
        } catch (uploadErr) {
          console.error('Error uploading profile picture:', uploadErr);
        }
      }

      const userRef = doc(db, 'users', editingUserId);
      await updateDoc(userRef, {
        cpf: formData.cpf.replace(/\D/g, ''),
        employeeId: formData.employeeId,
        workScale: formData.workScale,
        name: formData.name,
        email: formData.email, // Email updated successfully in firestore
        role: formData.role,
        department: formData.department,
        postoName: formData.postoName || 'Portaria Principal',
        salary: formData.role === 'admin' ? 0 : Number(formData.salary),
        admissionDate: formData.role === 'admin' ? '' : formData.admissionDate,
        photoURL: finalPhotoURL,
      });

      setSelectedPhotoFile(null);
      setIsModalOpen(false);
      await fetchUsers();
      
      if (authSyncError) {
        alert('Perfil atualizado com sucesso no banco de dados! Nota: Não foi possível alterar o Email ou a Senha de Login no Firebase Auth devido a privilégios limitados da nuvem. Use o botão de "Resetar Senha" do respectivo colaborador para alterar pelo e-mail caso necessário.');
      } else {
        alert('Dados atualizados com sucesso!');
      }
    } catch (err: any) {
      console.error('Update user error:', err);
      alert('Erro ao atualizar usuário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    let secondaryApp = null;
    try {
      const cleanCPF = formData.cpf.replace(/\D/g, '');
      const email = formData.email || `${cleanCPF}@pontodigital.app`;
      
      // Define a secondary app instance to create the user without side-effect on current session
      const secondaryAppName = `Secondary-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      // Create Auth User using the secondary instance
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, formData.password);
      const newUserId = userCredential.user.uid;

      // Sign out from secondary instance immediately and delete reference
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
      secondaryApp = null;

      // Process profile picture via Storage if any
      let finalPhotoURL = '';
      if (selectedPhotoFile) {
        try {
          const fileExtension = selectedPhotoFile.name.split('.').pop() || 'jpg';
          const fileRef = ref(storage, `users/${newUserId}/profile_${Date.now()}.${fileExtension}`);
          await uploadBytes(fileRef, selectedPhotoFile);
          finalPhotoURL = await getDownloadURL(fileRef);
        } catch (uploadErr) {
          console.error('Error uploading profile picture:', uploadErr);
        }
      }

      // Create Firestore Doc using main db instance
      await setDoc(doc(db, 'users', newUserId), {
        cpf: cleanCPF,
        employeeId: formData.employeeId || `MAT-${Math.floor(Math.random() * 10000)}`,
        workScale: formData.workScale,
        name: formData.name,
        email: email,
        role: formData.role,
        department: formData.department,
        postoName: formData.postoName || 'Portaria Principal',
        salary: formData.role === 'admin' ? 0 : Number(formData.salary),
        admissionDate: formData.role === 'admin' ? '' : formData.admissionDate,
        photoURL: finalPhotoURL,
        active: true,
        createdAt: new Date().toISOString(),
      });

      setSelectedPhotoFile(null);
      setFormData({
        cpf: '',
        employeeId: '',
        workScale: 'default',
        name: '',
        email: '',
        password: '',
        role: 'employee',
        department: '',
        postoName: '',
        salary: 0,
        admissionDate: '',
        photoURL: '',
      });

      setIsModalOpen(false);
      await fetchUsers();
      alert('Colaborador cadastrado com sucesso!');
    } catch (err: any) {
      console.error('Create user error:', err);
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (cleanUpErr) {
          console.error('Error cleaning up secondary app', cleanUpErr);
        }
      }
      alert('Erro ao criar usuário: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.cpf.includes(searchTerm);
    if (!matchesSearch) return false;

    if (activeTab === 'ativos') {
      return u.active !== false && u.role !== 'admin';
    }
    if (activeTab === 'desligados') {
      return u.active === false && u.role !== 'admin';
    }
    if (activeTab === 'sincronizados') {
      return u.role !== 'admin';
    }
    if (activeTab === 'trabalhando') {
      return presentUserIds.has(u.uid) && u.role !== 'admin';
    }
    if (activeTab === 'banco') {
      return u.active !== false && u.role !== 'admin';
    }
    if (activeTab === 'admins') {
      return u.role === 'admin';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Colaboradores</h1>
          <p className="text-slate-500">Gerencie o acesso e dados contratuais da equipe.</p>
        </div>
        <button 
          onClick={() => {
            setModalMode('create');
            setEditingUserId(null);
            setSelectedPhotoFile(null);
            setFormData({
              cpf: '',
              employeeId: `MAT-${Math.floor(1000 + Math.random() * 9000)}`,
              workScale: 'default',
              name: '',
              email: '',
              password: '',
              role: 'employee',
              department: '',
              postoName: 'Portaria Principal',
              salary: 0,
              admissionDate: new Date().toISOString().split('T')[0],
              photoURL: '',
            });
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
        >
          <UserPlus className="w-5 h-5" />
          Novo Colaborador
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ativos', label: 'Ativos', count: users.filter(u => u.active !== false && u.role !== 'admin').length, activeColor: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' },
          { id: 'desligados', label: 'Desligados', count: users.filter(u => u.active === false && u.role !== 'admin').length, activeColor: 'bg-rose-500 text-white shadow-md shadow-rose-500/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' },
          { id: 'sincronizados', label: 'Colaboradores CLT', count: users.filter(u => u.role !== 'admin').length, activeColor: 'bg-blue-600 text-white shadow-md shadow-blue-600/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' },
          { id: 'trabalhando', label: 'Trabalhando Hoje', count: users.filter(u => presentUserIds.has(u.uid) && u.role !== 'admin').length, activeColor: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' },
          { id: 'banco', label: 'Banco de Horas', count: users.filter(u => u.active !== false && u.role !== 'admin').length, activeColor: 'bg-purple-600 text-white shadow-md shadow-purple-600/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' },
          { id: 'admins', label: 'Administradores', count: users.filter(u => u.role === 'admin').length, activeColor: 'bg-violet-600 text-white shadow-md shadow-violet-600/20', inactiveColor: 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-extrabold text-sm transition-all duration-200 cursor-pointer active:scale-95",
              activeTab === tab.id ? tab.activeColor : tab.inactiveColor
            )}
          >
            <span>{tab.label}</span>
            <span className={cn(
              "px-1.5 py-0.5 text-[10px] font-black rounded-lg leading-none",
              activeTab === tab.id ? "bg-white/20 text-white border border-white/20" : "bg-slate-100 text-slate-500 border border-slate-200"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou CPF..."
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 font-medium">
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-slate-500 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Colaborador</th>
                <th className="px-6 py-4 font-semibold">CPF</th>
                <th className="px-6 py-4 font-semibold">Departamento</th>
                <th className="px-6 py-4 font-semibold">Admissão</th>
                <th className="px-6 py-4 font-semibold">Cargo/Nível</th>
                <th className="px-6 py-4 font-semibold">Banco de Horas</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-slate-100 shrink-0">
                          <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
                          {user.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-900">{user.name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-600">
                    {formatCPF(user.cpf)}
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-medium">
                    <p className="font-extrabold text-slate-900 leading-snug">{user.department?.toUpperCase() === 'OPERADOR' ? 'VIGIA' : (user.department || 'Não definido')}</p>
                    <p className="text-[10px] text-blue-650 font-black uppercase tracking-wider">{user.postoName || 'Portaria Principal'}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600 font-mono text-xs">
                    {user.admissionDate ? (() => {
                      const parts = user.admissionDate.split('-');
                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date(user.admissionDate).toLocaleDateString('pt-BR');
                    })() : '---'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold uppercase",
                      user.role === 'admin' ? "bg-purple-100 text-purple-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {user.role === 'admin' ? 'Administrador' : 'Colaborador'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {user.role === 'admin' ? (
                      <span className="text-xs text-slate-400 font-medium whitespace-nowrap">---</span>
                    ) : userBankBalances[user.uid] ? (
                      <span className={cn(
                        "px-2.5 py-1 rounded-xl text-xs font-extrabold font-mono inline-flex items-center gap-1 whitespace-nowrap",
                        userBankBalances[user.uid].minutes >= 0 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : "bg-rose-550/10 text-rose-700 border border-rose-100"
                      )}>
                        {userBankBalances[user.uid].formatted}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono whitespace-nowrap">0h 00m</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleToggleStatus(user)}
                      className="flex items-center gap-1.5 group cursor-pointer"
                    >
                      <div className={cn(
                        "w-2 h-2 rounded-full transition-all shadow-[0_0_8px]",
                        user.active 
                          ? "bg-emerald-500 shadow-emerald-500/50 group-hover:scale-125" 
                          : "bg-red-500 shadow-red-500/50 group-hover:scale-125"
                      )} />
                      <span className={cn(
                        "text-xs font-bold uppercase transition-colors",
                        user.active ? "text-emerald-600" : "text-red-600"
                      )}>
                        {user.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </button>
                  </td>
                  <td className="px-6 py-4 text-slate-400">
                    {user.role === 'admin' && user.uid !== currentUser?.uid && (
                      <button 
                        onClick={() => {
                          switchAdminUser(user);
                          alert(`Sessão do administrador alterada para ${user.name}!`);
                        }}
                        className="hover:text-purple-600 text-purple-500 transition-colors mr-3"
                        title="Trocar/Alternar para este Administrador"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    {onViewTimecard && user.role !== 'admin' && (
                      <button 
                        onClick={() => onViewTimecard(user)}
                        className="hover:text-indigo-600 transition-colors mr-3"
                        title="Ver Folha de Ponto"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleEmitSalarySlip(user)}
                      disabled={emitting === user.uid}
                      className="hover:text-emerald-600 transition-colors mr-3 disabled:opacity-50"
                      title="Emitir Holerite"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleEditClick(user)}
                      className="hover:text-blue-600 transition-colors mr-3"
                      title="Editar Colaborador"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleSendPasswordReset(user)}
                      disabled={resettingPasswordUserId === user.uid}
                      className={cn(
                        "hover:text-amber-500 transition-colors mr-3",
                        resettingPasswordUserId === user.uid && "opacity-50 pointer-events-none"
                      )}
                      title="Enviar e-mail de redefinição de senha"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleToggleStatus(user)}
                      className={cn(
                        "transition-colors mr-3",
                        user.active ? "hover:text-red-500" : "hover:text-emerald-500"
                      )}
                      title={user.active ? "Desativar Acesso" : "Ativar Acesso"}
                    >
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(user)}
                      className="hover:text-rose-600 transition-colors"
                      title="Excluir Colaborador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && !loading && (
            <div className="p-12 text-center text-slate-400">
              Nenhum colaborador encontrado.
            </div>
          )}
        </div>
      </div>

      {/* Register Modal */}
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
              className="relative w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">
                  {modalMode === 'create' ? 'Cadastrar Colaborador' : 'Editar Colaborador'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={modalMode === 'create' ? handleCreateUser : handleUpdateUser} className="p-8 space-y-6" autoComplete="off" noValidate>
                {/* Photo Upload Section */}
                <div className="flex flex-col items-center mb-6">
                  <input 
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handlePhotoChange}
                  />
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    {formData.photoURL ? (
                      <img src={formData.photoURL} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Plus className="w-6 h-6 text-slate-300 mx-auto" />
                        <span className="text-[8px] font-black uppercase text-slate-400 mt-1">Foto</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-blue-600/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Plus className="text-white w-6 h-6" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-700">Informações Pessoais</label>
                    <input 
                      type="text" placeholder="Nome Completo" 
                      name="new_collaborator_fullname"
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                      required
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="text" placeholder="CPF" 
                        name="new_collaborator_registration_cpf_nocache"
                        autoComplete="one-time-code"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                        required
                        value={formData.cpf}
                        onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                      />
                      <input 
                        type="text" placeholder="ID (Matrícula) Manual" 
                        name="new_collaborator_registration_employee_id_nocache"
                        autoComplete="off"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                        required
                        value={formData.employeeId}
                        onChange={e => setFormData({...formData, employeeId: e.target.value})}
                      />
                    </div>
                    <input 
                      type="email" placeholder="E-mail (Opcional)" 
                      name="new_collaborator_email"
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                      value={formData.email}
                      onChange={e => setFormData({...formData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="block text-sm font-bold text-slate-700">Contratual & Acesso</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      value={formData.role}
                      onChange={e => {
                        const newRole = e.target.value as UserRole;
                        setFormData({
                          ...formData, 
                          role: newRole,
                          ...(newRole === 'admin' ? { salary: 0, admissionDate: '' } : {})
                        });
                      }}
                    >
                      <option value="employee">Colaborador Padrão</option>
                      <option value="admin">Administrador (RH)</option>
                    </select>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      value={formData.workScale}
                      onChange={e => setFormData({...formData, workScale: e.target.value as 'default' | '12x36'})}
                    >
                      <option value="default">Escala Padrão (5x2 / 6x1)</option>
                      <option value="12x36">Escala 12x36 (Vigia/Segurança)</option>
                    </select>
                    <input 
                      type="text" placeholder="Departamento" 
                      name="new_collaborator_department"
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium" 
                      value={formData.department}
                      onChange={e => setFormData({...formData, department: e.target.value})}
                    />
                    <input 
                      type="text" placeholder="Posto de Trabalho Ativo" 
                      name="new_collaborator_posto_name"
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold" 
                      value={formData.postoName}
                      onChange={e => setFormData({...formData, postoName: e.target.value})}
                    />
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 flex items-center justify-between">
                        <span>Salário Base</span>
                        {formData.role === 'admin' && (
                          <span className="text-amber-600 font-extrabold normal-case text-[11px] flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" /> Bloqueado p/ Administrador
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <span className={cn("absolute left-4 top-3 font-bold", formData.role === 'admin' ? "text-slate-300" : "text-slate-400")}>R$</span>
                        <input 
                          type="number" 
                          placeholder={formData.role === 'admin' ? "Somente para colaboradores" : "Salário Base"} 
                          name="new_collaborator_salary"
                          autoComplete="off"
                          disabled={formData.role === 'admin'}
                          className={cn(
                            "w-full pl-12 pr-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
                            formData.role === 'admin' 
                              ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none font-medium" 
                              : "bg-slate-50 border-slate-200 text-slate-900"
                          )} 
                          value={formData.role === 'admin' ? '' : (formData.salary || '')}
                          onChange={e => setFormData({...formData, salary: Number(e.target.value)})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 ml-1 flex items-center justify-between">
                        <span>Data de Admissão</span>
                        {formData.role === 'admin' && (
                          <span className="text-amber-600 font-extrabold normal-case text-[11px] flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" /> Bloqueado p/ Administrador
                          </span>
                        )}
                      </label>
                      <input 
                        type="date" 
                        name="new_collaborator_admission"
                        autoComplete="off"
                        disabled={formData.role === 'admin'}
                        className={cn(
                          "w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium transition-colors",
                          formData.role === 'admin' 
                            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none" 
                            : "bg-slate-50 border-slate-200 text-slate-900"
                        )} 
                        value={formData.role === 'admin' ? '' : formData.admissionDate}
                        onChange={e => setFormData({...formData, admissionDate: e.target.value})}
                      />
                      {formData.role === 'admin' && (
                        <p className="text-[11px] text-amber-600 font-semibold mt-1 ml-1 flex items-center gap-1">
                          Função liberada exclusivamente para colaboradores.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {modalMode === 'create' && (
                  <div className="pt-4 border-t border-slate-100">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Definir Senha de Acesso</label>
                    <input 
                      type="password" placeholder="Mínimo 6 caracteres" 
                      name="new_collaborator_secure_password"
                      autoComplete="new-password"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-blue-600 font-mono tracking-widest" 
                      required
                      minLength={6}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                    />
                  </div>
                )}

                {modalMode === 'edit' && (
                  <div className="pt-4 border-t border-slate-100 space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Definir Nova Senha Corporativa (Opcional)</label>
                      <input 
                        type="password" placeholder="Preencha apenas se desejar alterar a senha do colaborador" 
                        name="edit_collaborator_secure_password"
                        autoComplete="new-password"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-blue-600 font-mono tracking-widest text-sm" 
                        minLength={6}
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Insira uma senha de acesso para que o colaborador acesse o aplicativo. Ele poderá alterá-la depois em suas configurações.</p>
                    </div>

                    <label className="block text-sm font-bold text-slate-700">Outras Ações de Segurança</label>
                    <div className="flex items-center justify-between p-4 bg-amber-50/50 border border-slate-150 rounded-xl gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-800">Recuperação por E-mail</p>
                        <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">
                          Envia um link seguro no e-mail do colaborador para cadastrar uma nova senha.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!editingUserId) return;
                          const selectedUser = users.find(u => u.uid === editingUserId);
                          if (selectedUser) {
                            await handleSendPasswordReset(selectedUser);
                          }
                        }}
                        disabled={resettingPasswordUserId === editingUserId}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-sm hover:shadow-md disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <Key className="w-3 h-3" />
                        Resetar Senha
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" disabled={loading}
                    className="flex-[2] bg-blue-600 text-white font-bold px-6 py-4 rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {loading ? 'Processando...' : modalMode === 'create' ? 'Finalizar Cadastro' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
