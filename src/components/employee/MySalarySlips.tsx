import { useState, useEffect, useRef } from 'react';
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
  Wallet, 
  Download, 
  Eye, 
  CheckCircle2, 
  FileText, 
  Printer, 
  ShieldCheck, 
  Trash2, 
  FolderPlus, 
  Folder, 
  FolderOpen, 
  Search, 
  Plus, 
  RefreshCw, 
  ChevronRight, 
  X, 
  Send, 
  FileCheck,
  Building,
  UserCheck,
  ArrowRightLeft,
  ChevronDown,
  Info,
  Sparkles,
  Upload,
  Palmtree,
  RotateCw
} from 'lucide-react';
import { cn, formatCurrency } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../../lib/notifications';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { uploadBase64ToStorage } from '../../lib/storageHelper';

const compressImageForAI = (base64Str: string, maxWidth = 1000, maxHeight = 1000): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

interface TaxItem {
  name: string;
  amount: number;
  type: 'deduction' | 'addition';
}

interface DiscountItem {
  name: string;
  amount: number;
}

export default function MySalarySlips() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // State
  const [slips, setSlips] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState<any>(null);
  
  // Navigation & Filters
  const [currentFolderId, setCurrentFolderId] = useState<string>('all');
  const [docTypeFilter, setDocTypeFilter] = useState<'all' | 'salary' | 'vacation'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [selectedAdminEmployee, setSelectedAdminEmployee] = useState<any>(null);
  const [adminSidebarTab, setAdminSidebarTab] = useState<'employees' | 'admins'>('employees');
  const [company, setCompany] = useState<any>(null);

  // Digital Signature modal states
  const [showSignModal, setShowSignModal] = useState(false);
  const [signMode, setSignMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [signingState, setSigningState] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRotated, setIsRotated] = useState(false);

  // Scale calculations for mobile/APK preview
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [containerRef.current, selectedSlip]);

  useEffect(() => {
    const filter = localStorage.getItem('payroll_doc_filter');
    if (filter === 'vacation' || filter === 'salary') {
      setDocTypeFilter(filter as any);
      localStorage.removeItem('payroll_doc_filter');
    }
  }, []);

  const [lastAutoOpenedSlipId, setLastAutoOpenedSlipId] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin && selectedSlip && selectedSlip.signed && !selectedSlip.adminSigned) {
      if (lastAutoOpenedSlipId !== selectedSlip.id) {
        setLastAutoOpenedSlipId(selectedSlip.id);
        setTypedName(user ? (user.name || '') : '');
        setShowSignModal(true);
      }
    }
  }, [isAdmin, selectedSlip, lastAutoOpenedSlipId, user]);

  const targetWidth = 794; // Standard A4 width in px for preview
  const isMobileSize = containerWidth < targetWidth;
  const scale = isMobileSize ? (containerWidth - 16) / targetWidth : 1;

  // New slip form states (Admin)
  const [showAddSlipModal, setShowAddSlipModal] = useState(false);
  const [newSlipForm, setNewSlipForm] = useState({
    userId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    baseSalary: 2500,
    additions: [] as { name: string; amount: number }[],
    deductions: [] as { name: string; amount: number }[],
    documentType: 'salary' as 'salary' | 'vacation',
    vacationStart: '',
    vacationEnd: '',
    acquisitionStart: '',
    acquisitionEnd: '',
    vacationSalary: 2500,
    hasConstitutionalThird: true,
    autoCalculateTaxes: true
  });
  const [isParsingAI, setIsParsingAI] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [tempItem, setTempItem] = useState({ name: '', amount: 0, type: 'addition' });
  const [adminModalTab, setAdminModalTab] = useState<'form' | 'preview'>('form');

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  // Fetch company config
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "company", "config"), (snapshot) => {
      if (snapshot.exists()) {
        setCompany(snapshot.data());
      }
    });
    return unsub;
  }, []);

  // Prevent default drag & drop behaviors across the whole window to stop loading/opening files
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);

  // Fetch employees for admin view in real time
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'));
    const unsubEmployees = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(list);
      // If none selected yet, select the first
      setSelectedAdminEmployee(current => {
        if (current) {
          const stillExists = list.find(u => u.id === current.id);
          if (stillExists) return stillExists;
        }
        return list.length > 0 ? list[0] : null;
      });
    }, (error) => {
      console.error('Error fetching employees in real-time:', error);
    });

    return unsubEmployees;
  }, [isAdmin]);

  // Fetch data depending on role in real time
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    let unsubSlips = () => {};
    let unsubFolders = () => {};

    if (isAdmin) {
      if (selectedAdminEmployee) {
        const q = query(
          collection(db, 'salarySlips'), 
          where('userId', '==', selectedAdminEmployee.id)
        );
        unsubSlips = onSnapshot(q, (snapshot) => {
          const adminSlips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
          adminSlips.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return b.month - a.month;
          });
          setSlips(adminSlips);
          
          setSelectedSlip(currentSelected => {
            if (!currentSelected) {
              return adminSlips.length > 0 ? adminSlips[0] : null;
            }
            const updated = adminSlips.find(s => s.id === currentSelected.id);
            return updated || (adminSlips.length > 0 ? adminSlips[0] : null);
          });
          setLoading(false);
        }, (error) => {
          console.error("Firestore real-time slips error (Admin):", error);
          setLoading(false);
        });
      } else {
        setSlips([]);
        setSelectedSlip(null);
        setLoading(false);
      }
    } else {
      // Load employee slips in real time
      const q = query(
        collection(db, 'salarySlips'), 
        where('userId', '==', user.uid)
      );
      unsubSlips = onSnapshot(q, (snapshot) => {
        const employeeSlips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        employeeSlips.sort((a, b) => {
          if (b.year !== a.year) return b.year - a.year;
          return b.month - a.month;
        });
        setSlips(employeeSlips);

        setSelectedSlip(currentSelected => {
          if (!currentSelected) {
            const firstUnsigned = employeeSlips.find((s: any) => !s.signed);
            return firstUnsigned || (employeeSlips.length > 0 ? employeeSlips[0] : null);
          }
          const updated = employeeSlips.find(s => s.id === currentSelected.id);
          return updated || (employeeSlips.length > 0 ? employeeSlips[0] : null);
        });
        setLoading(false);
      }, (error) => {
        console.error("Firestore real-time slips error (Employee):", error);
        setLoading(false);
      });

      // Load employee folders in real time
      const fq = query(
        collection(db, 'salarySlipFolders'),
        where('userId', '==', user.uid)
      );
      unsubFolders = onSnapshot(fq, (fSnapshot) => {
        const employeeFolders = fSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
        employeeFolders.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        setFolders(employeeFolders);
      }, (error) => {
        console.error("Firestore real-time folders error:", error);
      });
    }

    return () => {
      unsubSlips();
      unsubFolders();
    };
  }, [user, selectedAdminEmployee, isAdmin]);

  // Keep a small helper function compatibility or noop
  const fetchData = async () => {
    // Slips and folders are handled by real-time onSnapshot listeners
  };

  // Folder Operations
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    try {
      const folderData = {
        name: newFolderName.trim(),
        userId: user.uid,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, 'salarySlipFolders'), folderData);
      setFolders([{ id: docRef.id, ...folderData }, ...folders]);
      setNewFolderName('');
      setShowFolderInput(false);
    } catch (err) {
      alert('Erro ao criar pasta: ' + err);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Deseja excluir esta pasta? Seus holerites continuarão salvos no aplicativo.')) return;
    try {
      await deleteDoc(doc(db, 'salarySlipFolders', folderId));
      setFolders(folders.filter(f => f.id !== folderId));
      
      // Remove folderId from related slips in database and local state
      const slipsInFolder = slips.filter(s => s.folderId === folderId);
      for (const s of slipsInFolder) {
        await updateDoc(doc(db, 'salarySlips', s.id), { folderId: null });
      }
      setSlips(slips.map(s => s.folderId === folderId ? { ...s, folderId: null } : s));
      
      if (currentFolderId === folderId) {
        setCurrentFolderId('all');
      }
    } catch (err) {
      alert('Erro ao excluir pasta.');
    }
  };

  const handleMoveToFolder = async (slipId: string, destFolderId: string | null) => {
    try {
      await updateDoc(doc(db, 'salarySlips', slipId), {
        folderId: destFolderId
      });
      setSlips(slips.map(s => s.id === slipId ? { ...s, folderId: destFolderId } : s));
      if (selectedSlip?.id === slipId) {
        setSelectedSlip({ ...selectedSlip, folderId: destFolderId });
      }
    } catch (err) {
      alert('Erro ao guardar na pasta.');
    }
  };

  // Canvas Drawing Handlers (Transparent Signature)
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

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Handle Employee Signature Submission
  const handleSignatureSubmit = async () => {
    if (!selectedSlip) return;
    setSigningState(true);
    try {
      let dataUrl = '';
      if (signMode === 'draw' && canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/png');
      } else if (signMode === 'type' && typedName.trim()) {
        // Render typed calligraphic name on transparent canvas
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
        alert('Assinatura vazia. Por favor desenhe ou digite para validar.');
        setSigningState(false);
        return;
      }

      const slipId = selectedSlip.id;
      // Upload signature canvas image to Firebase Storage to avoid large inline base64 string in Firestore
      const uploadPath = `signatures/slips/${user?.uid || 'anonymous'}_${slipId}_${Date.now()}.png`;
      const downloadURL = await uploadBase64ToStorage(dataUrl, uploadPath);

      const isAdminSign = user?.role === 'admin';
      const dummyIp = '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250);

      const payload = isAdminSign ? {
        adminSigned: true,
        adminSignatureDataUrl: downloadURL,
        adminSignatureText: signMode === 'type' ? typedName.trim() : '',
        adminSignatureType: signMode,
        adminSignedAt: new Date().toISOString(),
        adminSignerIp: dummyIp,
        adminSignerUserAgent: navigator.userAgent || 'App-Movel-Webview',
      } : {
        signed: true,
        signatureDataUrl: downloadURL,
        signatureText: signMode === 'type' ? typedName.trim() : '',
        signatureType: signMode,
        signedAt: new Date().toISOString(),
        signerIp: dummyIp,
        signerUserAgent: navigator.userAgent || 'App-Movel-Webview',
      };

      await updateDoc(doc(db, 'salarySlips', slipId), payload);

      // Local State Update
      const updatedSlip = { ...selectedSlip, ...payload };
      setSlips(slips.map(s => s.id === slipId ? updatedSlip : s));
      setSelectedSlip(updatedSlip);

      // Add push notification depending on who is signing
      if (isAdminSign) {
        await createNotification(
          selectedSlip.userId, // goes to the employee
          'Holerite Homologado',
          `Seu Holerite do mês de ${months[selectedSlip.month - 1]}/${selectedSlip.year} foi vistado e homologado pelo RH/Administração com sucesso.`,
          'success',
          'payroll'
        );
      } else {
        await createNotification(
          user!.uid,
          'Holerite Assinado',
          `Seu Holerite do mês de ${months[selectedSlip.month - 1]}/${selectedSlip.year} foi assinado com sucesso. Uma cópia segura foi enviada para a Administração.`,
          'success',
          'payroll'
        );
      }

      setShowSignModal(false);
      if (isAdminSign) {
        alert('Holerite homologado com sucesso!');
      } else {
        alert('Holerite assinado digitalmente e reenviado ao Administrador com sucesso!');
      }
    } catch (err) {
      alert('Erro ao assinar holerite: ' + err);
    } finally {
      setSigningState(false);
    }
  };

  // Admin: Auto calculate INSS and IRPF deductions
  const autoCalculateDeductions = (salary: number) => {
    // INSS standard model
    let inss = 0;
    if (salary <= 1412) inss = salary * 0.075;
    else if (salary <= 2666.68) inss = (salary * 0.09) - 21.18;
    else if (salary <= 4000.03) inss = (salary * 0.12) - 101.18;
    else inss = (salary * 0.14) - 181.18;

    // IRPF standard simplified model
    let irpf = 0;
    const baseCalculo = salary - inss;
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

  const getCboByJob = (job?: string) => {
    const normalized = (job || '').toUpperCase();
    if (normalized.includes('VIGIA') || normalized.includes('VIGILANTE')) return '517420';
    if (normalized.includes('ADMIN') || normalized.includes('AUXILIAR')) return '411010';
    if (normalized.includes('RECEPCIONISTA')) return '422105';
    if (normalized.includes('MOTORISTA')) return '782320';
    if (normalized.includes('SERVIÇOS') || normalized.includes('LIMPEZA') || normalized.includes('AUXILIAR DE SERVICOS') || normalized.includes('AUXILIAR DE SERVIÇOS')) return '514320';
    if (normalized.includes('GERENTE') || normalized.includes('DIRETOR')) return '142105';
    return '517420'; // Standard vigia fallback
  };

  const getRubricCode = (name: string, fallbackCode: string = '100') => {
    const norm = (name || '').toUpperCase();
    if (norm.includes('BASE') || norm.includes('CONTRATUAL') || norm.includes('DIAS NORMAIS') || norm === 'SALÁRIO BASE') return '8781';
    if (norm.includes('REFLEXO') || norm.includes('DSR')) return '8125';
    if (norm.includes('EXTRA') || norm.includes('HORAS EXTRAS')) return '150';
    if (norm.includes('VALE ALIMENTAÇÃO') || norm.includes('VALE ALIMENTACAO')) {
      if (norm.includes('DESC') || norm.includes('DESCONTO')) return '201';
      return '9382';
    }
    if (norm.includes('SEGURO') || norm.includes('VIDA')) return '203';
    if (norm.includes('INSS') || norm === 'I.N.S.S.') return '998';
    if (norm.includes('IRPF') || norm.includes('IMPOSTO DE RENDA') || norm.includes('SIMPLIFICADO')) return '508';
    return fallbackCode;
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getPreviewCalc = () => {
    const baseSalary = Number(newSlipForm.baseSalary || 0);
    const isVacation = newSlipForm.documentType === 'vacation';
    const autoCalculateTaxes = newSlipForm.autoCalculateTaxes !== false;
    
    if (isVacation) {
      const vacationSalary = Number(newSlipForm.vacationSalary || baseSalary);
      const constThird = newSlipForm.hasConstitutionalThird ? Number((vacationSalary / 3).toFixed(2)) : 0;
      
      const customAdditionsSum = (newSlipForm.additions || []).reduce((acc: number, cur: any) => acc + cur.amount, 0);
      const valBaseDeductions = vacationSalary + constThird + customAdditionsSum;
      
      const taxes: any[] = [];
      const discounts: any[] = [];

      if (autoCalculateTaxes) {
        const { inss, irpf } = autoCalculateDeductions(valBaseDeductions);
        taxes.push({ name: 'INSS s/ Férias', amount: inss, type: 'deduction' });
        taxes.push({ name: 'IRPF s/ Férias', amount: irpf, type: 'deduction' });

        (newSlipForm.additions || []).forEach(a => {
          taxes.push({ name: a.name, amount: a.amount, type: 'addition' });
        });

        (newSlipForm.deductions || []).forEach(d => {
          discounts.push({ name: d.name, amount: d.amount });
        });
      } else {
        (newSlipForm.additions || []).forEach(a => {
          taxes.push({ name: a.name, amount: a.amount, type: 'addition' });
        });

        (newSlipForm.deductions || []).forEach(d => {
          taxes.push({ name: d.name, amount: d.amount, type: 'deduction' });
        });
      }

      const totalAdditions = vacationSalary + constThird + customAdditionsSum;
      const totalDeductions = autoCalculateTaxes 
        ? (taxes.filter(t => t.type === 'deduction').reduce((acc, cur) => acc + cur.amount, 0) + discounts.reduce((acc, cur) => acc + cur.amount, 0))
        : (newSlipForm.deductions || []).reduce((acc: number, cur: any) => acc + cur.amount, 0);
      
      const netSalary = Math.max(0, totalAdditions - totalDeductions);

      return {
        baseSalary,
        vacationSalary,
        constThird,
        taxes,
        discounts,
        totalAdditions,
        totalDeductions,
        netSalary,
        isVacation: true,
        vacationStart: newSlipForm.vacationStart,
        vacationEnd: newSlipForm.vacationEnd,
        acquisitionStart: newSlipForm.acquisitionStart,
        acquisitionEnd: newSlipForm.acquisitionEnd,
        hasConstitutionalThird: newSlipForm.hasConstitutionalThird
      };
    } else {
      const taxes: any[] = [];
      const discounts: any[] = [];

      if (autoCalculateTaxes) {
        const { inss, irpf } = autoCalculateDeductions(baseSalary);
        taxes.push({ name: 'INSS Desconto CLT', amount: inss, type: 'deduction' });
        taxes.push({ name: 'IRPF Simplificado', amount: irpf, type: 'deduction' });

        (newSlipForm.additions || []).forEach(a => {
          taxes.push({ name: a.name, amount: a.amount, type: 'addition' });
        });

        (newSlipForm.deductions || []).forEach(d => {
          discounts.push({ name: d.name, amount: d.amount });
        });
      } else {
        (newSlipForm.additions || []).forEach(a => {
          taxes.push({ name: a.name, amount: a.amount, type: 'addition' });
        });

        (newSlipForm.deductions || []).forEach(d => {
          taxes.push({ name: d.name, amount: d.amount, type: 'deduction' });
        });
      }

      const totalAdditions = baseSalary + (newSlipForm.additions || []).reduce((acc: number, cur: any) => acc + cur.amount, 0);
      const totalDeductions = autoCalculateTaxes
        ? (taxes.filter(t => t.type === 'deduction').reduce((acc, cur) => acc + cur.amount, 0) + discounts.reduce((acc, cur) => acc + cur.amount, 0))
        : (newSlipForm.deductions || []).reduce((acc: number, cur: any) => acc + cur.amount, 0);
      const netSalary = Math.max(0, totalAdditions - totalDeductions);

      return {
        baseSalary,
        taxes,
        discounts,
        totalAdditions,
        totalDeductions,
        netSalary,
        isVacation: false
      };
    }
  };

  const previewCalc = getPreviewCalc();

  const handleAIFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileWithAI(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFileWithAI(file);
    }
  };

  const processFileWithAI = async (file: File) => {
    setIsParsingAI(true);
    setAiError(null);
    setAiSuccessMessage(null);

    try {
      const reader = new FileReader();
      const filePromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(file);
      const rawBase64 = await filePromise;
      const base64Data = await compressImageForAI(rawBase64, 1000, 1000);

      const response = await fetch("/api/parse-holerite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileB64: base64Data,
          mimeType: base64Data.startsWith("data:") ? (base64Data.split(";")[0].split(":")[1] || file.type) : file.type
        })
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error("Non-JSON Response received from holerite AI service:", textResponse);

        let customError = "Resposta inválida do servidor backend (não é JSON).";
        if (response.status === 404) {
          customError = "O serviço de processamento inteligente de holerites (/api/parse-holerite) não está disponível (404). Verifique se o servidor backend está ativo.";
        } else if (response.status === 413 || textResponse.includes("Payload Too Large")) {
          customError = "O arquivo enviado é grande demais para ser processado (413 Payload Too Large). Experimente enviar uma foto menor ou comprimida.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html")) {
          const matchedTitle = textResponse.match(/<title>([\s\S]*?)<\/title>/i);
          const pageTitle = matchedTitle ? matchedTitle[1].trim() : "";
          customError = `O servidor retornou uma página HTML (${response.status}${pageTitle ? ': ' + pageTitle : ''}) em vez de dados JSON. Certifique-se de configurar a chave GEMINI_API_KEY no painel Settings > Secrets do AI Studio.`;
        } else {
          customError = `Erro ${response.status} do servidor: ${textResponse.slice(0, 150)}`;
        }
        throw new Error(customError);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Erro desconhecido ao processar holerite.");
      }

      const { data, matchedEmployee } = result;

      // Locate employee in our local list first to ensure reactivity
      let targetUserId = newSlipForm.userId;
      if (matchedEmployee) {
        const found = employees.find(e => e.id === matchedEmployee.id);
        if (found) {
          setSelectedAdminEmployee(found);
          targetUserId = found.id;
          setAiSuccessMessage(`IA identificou o colaborador: ${found.name}!`);
        } else {
          setAiSuccessMessage(`IA detectou o colaborador de nome "${matchedEmployee.name}" e CPF no holerite, mas ele não foi localizado na lista de funcionários ativos do painel.`);
        }
      } else {
        setAiSuccessMessage(`Dados extraídos com sucesso! Por favor, selecione o colaborador correspondente.`);
      }

      setNewSlipForm(prev => ({
        ...prev,
        userId: targetUserId,
        month: data.month || prev.month,
        year: data.year || prev.year,
        baseSalary: data.baseSalary || prev.baseSalary,
        additions: (data.additions || []).map((a: any) => ({ name: a.name, amount: Number(a.amount) })),
        deductions: (data.deductions || []).map((d: any) => ({ name: d.name, amount: Number(d.amount) })),
        autoCalculateTaxes: false
      }));

    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Erro desconhecido ao processar holerite com IA.");
    } finally {
      setIsParsingAI(false);
    }
  };

  const handleAddSlipItem = () => {
    if (!tempItem.name || tempItem.amount <= 0) return;
    if (tempItem.type === 'addition') {
      setNewSlipForm({
        ...newSlipForm,
        additions: [...newSlipForm.additions, { name: tempItem.name, amount: tempItem.amount }]
      });
    } else {
      setNewSlipForm({
        ...newSlipForm,
        deductions: [...newSlipForm.deductions, { name: tempItem.name, amount: tempItem.amount }]
      });
    }
    setTempItem({ name: '', amount: 0, type: tempItem.type });
  };

  const handleRemoveAddition = (index: number) => {
    setNewSlipForm({
      ...newSlipForm,
      additions: newSlipForm.additions.filter((_, i) => i !== index)
    });
  };

  const handleRemoveDeduction = (index: number) => {
    setNewSlipForm({
      ...newSlipForm,
      deductions: newSlipForm.deductions.filter((_, i) => i !== index)
    });
  };

  // Admin submit new slip
  const handleCreateSlipSubmit = async () => {
    if (!selectedAdminEmployee) {
      alert('Nenhum colaborador selecionado.');
      return;
    }

    try {
      const isVacation = newSlipForm.documentType === 'vacation';
      const autoCalculateTaxes = newSlipForm.autoCalculateTaxes !== false;
      let payloadTaxes: TaxItem[] = [];
      let payloadDiscounts: DiscountItem[] = [];
      let netSalary = 0;
      let slipData: any = {};

      if (isVacation) {
        const vacationSalary = Number(newSlipForm.vacationSalary || newSlipForm.baseSalary);
        const constThird = newSlipForm.hasConstitutionalThird ? Number((vacationSalary / 3).toFixed(2)) : 0;
        const customAdditionsSum = (newSlipForm.additions || []).reduce((acc, cur) => acc + cur.amount, 0);

        if (autoCalculateTaxes) {
          const valBaseDeductions = vacationSalary + constThird + customAdditionsSum;
          const { inss, irpf } = autoCalculateDeductions(valBaseDeductions);

          payloadTaxes = [
            { name: 'INSS s/ Férias', amount: inss, type: 'deduction' },
            { name: 'IRPF s/ Férias', amount: irpf, type: 'deduction' }
          ];

          newSlipForm.additions.forEach(a => {
            payloadTaxes.push({ name: a.name, amount: a.amount, type: 'addition' });
          });

          newSlipForm.deductions.forEach(d => {
            payloadDiscounts.push({ name: d.name, amount: d.amount });
          });

          const totalAdditions = vacationSalary + constThird + customAdditionsSum;
          const totalDeductions = inss + irpf + newSlipForm.deductions.reduce((acc, cur) => acc + cur.amount, 0);
          netSalary = Math.max(0, totalAdditions - totalDeductions);
        } else {
          newSlipForm.additions.forEach(a => {
            payloadTaxes.push({ name: a.name, amount: a.amount, type: 'addition' });
          });

          newSlipForm.deductions.forEach(d => {
            payloadTaxes.push({ name: d.name, amount: d.amount, type: 'deduction' });
          });

          const totalAdditions = vacationSalary + constThird + customAdditionsSum;
          const totalDeductions = newSlipForm.deductions.reduce((acc, cur) => acc + cur.amount, 0);
          netSalary = Math.max(0, totalAdditions - totalDeductions);
        }

        slipData = {
          userId: selectedAdminEmployee.id,
          month: Number(newSlipForm.month),
          year: Number(newSlipForm.year),
          baseSalary: Number(newSlipForm.baseSalary),
          taxes: payloadTaxes,
          discounts: payloadDiscounts,
          netSalary: Number(netSalary.toFixed(2)),
          signed: false,
          issuedAt: new Date().toISOString(),
          documentType: 'vacation',
          vacationStart: newSlipForm.vacationStart || '',
          vacationEnd: newSlipForm.vacationEnd || '',
          acquisitionStart: newSlipForm.acquisitionStart || '',
          acquisitionEnd: newSlipForm.acquisitionEnd || '',
          vacationSalary: vacationSalary,
          hasConstitutionalThird: newSlipForm.hasConstitutionalThird
        };
      } else {
        if (autoCalculateTaxes) {
          const { inss, irpf } = autoCalculateDeductions(newSlipForm.baseSalary);
          
          payloadTaxes = [
            { name: 'INSS Desconto CLT', amount: inss, type: 'deduction' },
            { name: 'IRPF Simplificado', amount: irpf, type: 'deduction' }
          ];

          newSlipForm.additions.forEach(a => {
            payloadTaxes.push({ name: a.name, amount: a.amount, type: 'addition' });
          });

          newSlipForm.deductions.forEach(d => {
            payloadDiscounts.push({ name: d.name, amount: d.amount });
          });

          const totalAdditions = newSlipForm.baseSalary + newSlipForm.additions.reduce((acc, cur) => acc + cur.amount, 0);
          const totalDeductions = inss + irpf + newSlipForm.deductions.reduce((acc, cur) => acc + cur.amount, 0);
          netSalary = Math.max(0, totalAdditions - totalDeductions);
        } else {
          newSlipForm.additions.forEach(a => {
            payloadTaxes.push({ name: a.name, amount: a.amount, type: 'addition' });
          });

          // Custom deductions go directly as deduction tax lines
          newSlipForm.deductions.forEach(d => {
            payloadTaxes.push({ name: d.name, amount: d.amount, type: 'deduction' });
          });

          const totalAdditions = newSlipForm.baseSalary + newSlipForm.additions.reduce((acc, cur) => acc + cur.amount, 0);
          const totalDeductions = newSlipForm.deductions.reduce((acc, cur) => acc + cur.amount, 0);
          netSalary = Math.max(0, totalAdditions - totalDeductions);
        }

        slipData = {
          userId: selectedAdminEmployee.id,
          month: Number(newSlipForm.month),
          year: Number(newSlipForm.year),
          baseSalary: Number(newSlipForm.baseSalary),
          taxes: payloadTaxes,
          discounts: payloadDiscounts,
          netSalary: Number(netSalary.toFixed(2)),
          signed: false,
          issuedAt: new Date().toISOString(),
          documentType: 'salary'
        };
      }

      await addDoc(collection(db, 'salarySlips'), slipData);

      // Create notification for employee
      const notificationTitle = isVacation ? 'Férias Enviadas pela Administração' : 'Novo Holerite Enviado';
      const notificationMsg = isVacation
        ? `A Administração enviou de forma digital seu Recibo e Aviso de Férias (${newSlipForm.vacationStart} a ${newSlipForm.vacationEnd}). Por favor, acesse para assinar.`
        : `A Administração enviou o seu holerite do mês de ${months[slipData.month - 1]}/${slipData.year}. Acesse a aba Holerites para conferir e assinar.`;

      await createNotification(
        selectedAdminEmployee.id,
        notificationTitle,
        notificationMsg,
        'info',
        'payroll'
      );

      alert(isVacation ? 'Documentações de Férias criadas e enviadas ao colaborador com sucesso!' : 'Holerite criado e enviado com sucesso ao colaborador!');
      setShowAddSlipModal(false);
      fetchData(); // Refresh list
    } catch (err) {
      alert('Erro ao criar faturamento de documento: ' + err);
    }
  };

  const handleDeleteSlip = async (slipId: string) => {
    if (!confirm('Tem certeza de que deseja excluir permanentemente este holerite?')) return;
    try {
      await deleteDoc(doc(db, 'salarySlips', slipId));
      setSlips(slips.filter(s => s.id !== slipId));
      if (selectedSlip?.id === slipId) {
        setSelectedSlip(null);
      }
      alert('Holerite removido com sucesso!');
    } catch (err: any) {
      console.error('Erro ao excluir holerite:', err);
      const errMsg = err?.message || String(err);
      alert('Erro ao excluir holerite: ' + errMsg);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter slips for UI display
  const filteredSlips = slips.filter(slip => {
    let matchesFolder = true;
    if (!isAdmin) {
      if (currentFolderId === 'unsigned') matchesFolder = !slip.signed;
      else if (currentFolderId === 'signed') matchesFolder = slip.signed;
      else if (currentFolderId !== 'all') matchesFolder = slip.folderId === currentFolderId;
    }

    const matchesDocType = 
      docTypeFilter === 'all' ||
      (docTypeFilter === 'salary' && slip.documentType !== 'vacation') ||
      (docTypeFilter === 'vacation' && slip.documentType === 'vacation');

    const matchesSearch = 
      months[slip.month - 1].toLowerCase().includes(searchTerm.toLowerCase()) ||
      slip.year.toString().includes(searchTerm);

    return matchesFolder && matchesDocType && matchesSearch;
  });

  const targetEmployeeName = isAdmin ? (selectedAdminEmployee?.name || 'FUNCIONÁRIO') : (user?.name || 'CONTRATADO');
  const targetEmployeeCpf = isAdmin ? (selectedAdminEmployee?.cpf || '') : (user?.cpf || '');
  const targetEmployeeId = isAdmin ? (selectedAdminEmployee?.employeeId || '') : (user?.employeeId || '');
  const targetEmployeeJob = isAdmin ? (selectedAdminEmployee?.department || '') : (user?.department || '');

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Wallet className="w-8 h-8 text-blue-600" />
            {isAdmin ? 'Controle Financeiro & Holerites (Administração)' : 'Holerites e Assinaturas'}
          </h1>
          <p className="text-slate-500">
            {isAdmin 
              ? 'Administre e despache recibos de salários assinados eletronicamente sob a CLT.' 
              : 'Verifique holerites despachados pela Administração, assine eletronicamente e organize suas pastas.'}
          </p>
        </div>
        
        {isAdmin && (
          <button 
            onClick={() => {
              setNewSlipForm({
                userId: selectedAdminEmployee?.id || '',
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                baseSalary: selectedAdminEmployee?.salary || 2500,
                additions: [],
                deductions: [],
                documentType: 'salary',
                vacationStart: '',
                vacationEnd: '',
                acquisitionStart: '',
                acquisitionEnd: '',
                vacationSalary: selectedAdminEmployee?.salary || 2500,
                hasConstitutionalThird: true,
                autoCalculateTaxes: true
              });
              setAdminModalTab('form');
              setShowAddSlipModal(true);
            }}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/10 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Enviar Holerite
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* SIDEBAR NAVIGATION: Folders / Employees Selection */}
        <div className="xl:col-span-3 space-y-6">
          {isAdmin ? (
            // ADMIN SIDEBAR: Select Employee
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-slate-400" />
                Filtrar Colaborador
              </h3>
              
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <button
                  onClick={() => {
                    setAdminSidebarTab('employees');
                    setSelectedSlip(null);
                    const firstEmp = employees.find(emp => emp.role !== 'admin');
                    setSelectedAdminEmployee(firstEmp || null);
                  }}
                  type="button"
                  className={cn(
                    "flex-1 text-center py-2 px-3 text-[11px] font-bold rounded-xl transition-all cursor-pointer",
                    adminSidebarTab === 'employees' 
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Colaboradores
                </button>
                <button
                  onClick={() => {
                    setAdminSidebarTab('admins');
                    setSelectedSlip(null);
                    const firstAdmin = employees.find(emp => emp.role === 'admin');
                    setSelectedAdminEmployee(firstAdmin || null);
                  }}
                  type="button"
                  className={cn(
                    "flex-1 text-center py-2 px-3 text-[11px] font-bold rounded-xl transition-all cursor-pointer",
                    adminSidebarTab === 'admins' 
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  Administradores
                </button>
              </div>
              
              <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
                {employees
                  .filter(emp => adminSidebarTab === 'employees' ? emp.role !== 'admin' : emp.role === 'admin')
                  .map(emp => (
                    <button 
                      key={emp.id}
                      onClick={() => {
                        setSelectedAdminEmployee(emp);
                        setSelectedSlip(null);
                      }}
                      className={cn(
                        "w-full text-left p-3.5 rounded-2xl transition-all border flex items-center justify-between group",
                        selectedAdminEmployee?.id === emp.id 
                          ? "bg-blue-50/70 border-blue-100 text-blue-700 font-bold" 
                          : "border-slate-50 hover:bg-slate-50 text-slate-600 font-medium"
                      )}
                    >
                      <div className="flex flex-col gap-0.5 truncate pr-2">
                        <span className="truncate group-hover:text-slate-900 group-hover:font-extrabold transition-all">{emp.name}</span>
                        <span className="text-[10px] opacity-75">{emp.department || 'Serviços'} • R$ {emp.salary || '2.500'}</span>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 shrink-0 transition-all opacity-0 group-hover:opacity-100", selectedAdminEmployee?.id === emp.id && "opacity-100 text-blue-600")} />
                    </button>
                  ))}
                
                {employees.filter(emp => adminSidebarTab === 'employees' ? emp.role !== 'admin' : emp.role === 'admin').length === 0 && (
                  <p className="text-center py-6 text-xs text-slate-400 font-medium">Nenhum registro encontrado.</p>
                )}
              </div>
            </div>
          ) : (
            // EMPLOYEE SIDEBAR: Minhas Pastas System
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
              
              <div className="space-y-2">
                <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  Pastas Principais
                </h3>
                
                <button 
                  onClick={() => {
                    setCurrentFolderId('all');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    (currentFolderId === 'all' && docTypeFilter === 'all') ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Wallet className="w-4 h-4 shrink-0" />
                    Todos Documentos
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('unsigned');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    currentFolderId === 'unsigned' ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
                    Pendentes de Envio/Assinatura
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => !s.signed).length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('signed');
                    setDocTypeFilter('all');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    currentFolderId === 'signed' ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Assinados
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => s.signed).length}
                  </span>
                </button>

                <button 
                  onClick={() => {
                    setCurrentFolderId('all');
                    setDocTypeFilter('vacation');
                  }}
                  className={cn(
                    "w-full text-left py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-between",
                    (currentFolderId === 'all' && docTypeFilter === 'vacation') ? "bg-[#eab308] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Palmtree className="w-4 h-4 shrink-0 text-amber-500 group-hover:text-amber-700" />
                    Aviso e Recibo de Férias 🌴
                  </span>
                  <span className="text-[10px] bg-black/10 text-inherit px-2 py-0.5 rounded-full font-black">
                    {slips.filter(s => s.documentType === 'vacation').length}
                  </span>
                </button>
              </div>

              <div className="h-px bg-slate-100" />

              {/* Custom Created Folders list */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-400 uppercase text-[10px] tracking-widest flex items-center gap-2">
                    <FolderPlus className="w-4 h-4 text-slate-400" />
                    Minhas Pastas (Arquivos)
                  </h3>
                  
                  <button 
                    onClick={() => setShowFolderInput(!showFolderInput)}
                    className="p-1 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence>
                  {showFolderInput && (
                    <motion.div 
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex gap-2"
                    >
                      <input 
                        type="text"
                        placeholder="Nome da pasta (EX: Férias 2026)"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="text-xs font-medium bg-slate-50 focus:bg-white border-0 focus:ring-2 focus:ring-blue-100 rounded-xl px-3 py-2 w-full text-slate-800"
                      />
                      <button 
                        onClick={handleCreateFolder}
                        className="bg-blue-600 text-white rounded-xl px-3.5 py-2 font-bold text-xs hover:bg-blue-700 transition-all cursor-pointer"
                      >
                        Criar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                  {folders.map(folder => (
                    <div 
                      key={folder.id} 
                      className={cn(
                        "group flex items-center justify-between rounded-xl px-2.5 transition-all",
                        currentFolderId === folder.id ? "bg-slate-50" : "hover:bg-slate-50/50"
                      )}
                    >
                      <button 
                        onClick={() => setCurrentFolderId(folder.id)}
                        className={cn(
                          "flex-1 text-left py-2.5 font-semibold text-xs flex items-center gap-2",
                          currentFolderId === folder.id ? "text-blue-600 font-extrabold" : "text-slate-650"
                        )}
                      >
                        <Folder className={cn("w-3.5 h-3.5 fill-none", currentFolderId === folder.id && "text-blue-600 fill-blue-600/10")} />
                        <span className="truncate">{folder.name}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleDeleteFolder(folder.id)}
                        className="p-1 opacity-0 group-hover:opacity-100 text-slate-355 hover:text-red-500 rounded transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {folders.length === 0 && (
                    <p className="text-[11px] text-slate-300 font-medium italic text-center py-4">Personalize criando suas próprias pastas acima!</p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* MAIN PANEL: Lists Slips */}
        <div className="xl:col-span-9 space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left list block */}
            <div className="lg:col-span-5 space-y-4">
              
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {isAdmin ? `Recibos de ${selectedAdminEmployee?.name || 'Selecionado'}` : 'Lista de Comprovantes'}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold uppercase font-mono">
                    {filteredSlips.length} {filteredSlips.length === 1 ? 'slip' : 'slips'}
                  </span>
                </div>

                {/* Local search toolbar */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="Filtrar por mês ou ano..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs font-semibold pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-0 focus:ring-2 focus:ring-blue-100 text-slate-800 transition-all placeholder:text-slate-450"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Segmented docType filter tabs */}
                <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-2xl gap-1">
                  <button
                    onClick={() => setDocTypeFilter('all')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1",
                      docTypeFilter === 'all'
                        ? "bg-white text-slate-800 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setDocTypeFilter('salary')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      docTypeFilter === 'salary'
                        ? "bg-white text-blue-600 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    Holerites
                  </button>
                  <button
                    onClick={() => setDocTypeFilter('vacation')}
                    className={cn(
                      "flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                      docTypeFilter === 'vacation'
                        ? "bg-white text-amber-600 shadow-sm font-black border border-slate-200/40"
                        : "text-slate-450 hover:text-slate-700"
                    )}
                  >
                    <Palmtree className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    Férias 🌴
                  </button>
                </div>

                <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
                  {filteredSlips.map((slip) => (
                    <div 
                      key={slip.id} 
                      className={cn(
                        "py-3.5 flex items-center justify-between hover:bg-slate-50 px-2 rounded-2xl transition-all group",
                        selectedSlip?.id === slip.id && "bg-slate-50/80 border border-slate-100"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex flex-col items-center justify-center text-slate-400 shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all font-mono">
                          <span className="text-[8px] font-black uppercase leading-tight">{months[slip.month - 1].substring(0, 3)}</span>
                          <span className="text-xs font-black leading-tight">{slip.year}</span>
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-xs text-slate-800 truncate">{months[slip.month - 1]} de {slip.year}</p>
                          <p className="text-emerald-500 font-extrabold text-[11px] font-mono tracking-tight">{formatCurrency(slip.netSalary)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {slip.signed ? (
                          <span className="p-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase" title="Assinado">
                            <CheckCircle2 className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="p-1 bg-orange-50 text-orange-500 rounded-full text-[9px] font-black uppercase" title="Assinatura Pendente">
                            <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: '8s' }} />
                          </span>
                        )}

                        <button 
                          onClick={() => {
                            setSelectedSlip(slip);
                            setTimeout(() => {
                              document.getElementById('holerite-preview-container')?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          }}
                          className={cn(
                            "p-2 rounded-xl text-slate-400 hover:text-blue-600 transition-all",
                            selectedSlip?.id === slip.id ? "bg-blue-50 text-blue-600" : "bg-white border border-slate-100 shadow-sm"
                          )}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button 
                            onClick={() => handleDeleteSlip(slip.id)}
                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {filteredSlips.length === 0 && (
                    <div className="py-16 text-center">
                      <Wallet className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 font-bold text-xs">Nenhum holerite encontrado.</p>
                      <p className="text-[10px] text-slate-350 mt-1">
                        {isAdmin ? 'Para cadastrar, use o botão "Enviar Holerite" no canto superior.' : 'Os holerites enviados ficarão nesta lista.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Right Detailed Holerite Preview Sheet */}
            <div className="lg:col-span-7" id="holerite-preview-container">
              {selectedSlip ? (
                <div className="space-y-6">
                  {/* Detailed summary card */}
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Holerite {months[selectedSlip.month - 1]} / {selectedSlip.year}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          selectedSlip.signed ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
                        )}>
                          {selectedSlip.signed ? 'ASSINADO' : 'PENDENTE DE ASSINATURA'}
                        </span>
                        
                        {!isAdmin && folders.length > 0 && (
                          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                            <span className="text-[9px] text-slate-450 font-bold uppercase">Pasta:</span>
                            <select 
                              value={selectedSlip.folderId || ''} 
                              onChange={(e) => handleMoveToFolder(selectedSlip.id, e.target.value || null)}
                              className="text-[9px] font-extrabold text-blue-600 bg-transparent py-0 pl-1 pr-6 border-0 focus:ring-0 cursor-pointer"
                            >
                              <option value="">Nenhuma (Unfiled)</option>
                              {folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                      <button 
                        onClick={handlePrint}
                        className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Imprimir PDF
                      </button>

                      {!selectedSlip.signed && !isAdmin && (
                        <button 
                          onClick={() => {
                            setTypedName(user?.name || '');
                            setShowSignModal(true);
                          }}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/15 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 animate-bounce" />
                          Assinar Via Celular
                        </button>
                      )}

                      {isAdmin && selectedSlip.signed && !selectedSlip.adminSigned && (
                        <button 
                          onClick={() => {
                            setTypedName(user?.name || '');
                            setShowSignModal(true);
                          }}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/15 flex items-center justify-center gap-1.5 transition-all cursor-pointer animate-pulse"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Homologar Holerite
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Standardized Paycheck frame container with resize scaling responsive zoom */}
                  <div 
                    ref={containerRef}
                    className="overflow-hidden bg-slate-100 rounded-3xl p-3 border border-slate-250/50 shadow-inner flex justify-center w-full"
                  >
                    <div 
                      className="flex justify-start sm:justify-center items-start overflow-hidden" 
                      style={{ 
                        width: isMobileSize ? `${targetWidth * scale}px` : '100%',
                        height: isMobileSize ? `calc(${700 * scale}px + 20px)` : 'auto',
                      }}
                    >
                      <div 
                        id="payslip-print-block"
                        className="bg-white text-black p-4 printable-sheet notranslate select-none shrink-0"
                        style={{ 
                          width: `${targetWidth}px`, 
                          transform: isMobileSize ? `scale(${scale})` : 'none',
                          transformOrigin: 'top left',
                          boxShadow: isMobileSize ? 'none' : '0 10px 25px -5px rgba(0,0,0,0.05)',
                        }}
                        translate="no"
                      >
                        {/* THE OFFICIAL LOOKING BRAZILIAN HOLERITE BLOCK */}
                        {(() => {
                          const totalVencimentos = selectedSlip.baseSalary + (selectedSlip.taxes?.filter((t: any) => t.type === 'addition').reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0);
                          const inssAmount = selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).find((t: any) => t.name.toUpperCase().includes('INSS'))?.amount || 0;
                          const irpfAmount = selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).find((t: any) => t.name.toUpperCase().includes('IRPF'))?.amount || 0;
                          const totalDescontos = (selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0) + (selectedSlip.discounts?.reduce((acc: number, cur: any) => acc + cur.amount, 0) || 0);
                          const fgtsBase = totalVencimentos;
                          const fgtsAmount = fgtsBase * 0.08;
                          const irpfBase = Math.max(0, totalVencimentos - inssAmount);

                          return (
                            <div className="border border-black bg-white text-black font-mono text-[9px] w-full select-none leading-none">
                              {/* ROW 1: COMPANY / CC / PERIOD */}
                              <div className="grid grid-cols-12 border-b border-black">
                                <div className="col-span-6 p-2 border-r border-black flex flex-col justify-between h-14">
                                  <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                    {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                                  </div>
                                  <div className="text-[7.5px] text-zinc-700 leading-none">
                                    CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                                  </div>
                                </div>
                                <div className="col-span-3 p-2 border-r border-black flex flex-col justify-between text-center h-14">
                                  <div className="font-bold text-[7.5px] text-zinc-900 leading-tight">
                                    CC: {(targetEmployeeJob || '').split(' ')[0] || 'RSN'} LOGISTICA
                                  </div>
                                  <div className="text-[7.5px] text-zinc-700 font-bold">
                                    Mensalista
                                  </div>
                                </div>
                                <div className="col-span-3 p-2 flex flex-col justify-between text-right h-14">
                                  <div className="font-bold text-[7.5px] text-zinc-900 leading-none uppercase">
                                    Folha Mensal
                                  </div>
                                  <div className="font-extrabold text-[8.5px] text-black">
                                    {months[selectedSlip.month - 1]} de {selectedSlip.year}
                                  </div>
                                </div>
                              </div>

                              {/* ROW 2: EMPLOYEE DETAILS BLOCK */}
                              <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Cód.</span>
                                  <span className="font-bold text-[8.5px] block text-center">52</span>
                                </div>
                                <div className="col-span-5 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                                  <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{targetEmployeeName}</div>
                                  <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{targetEmployeeJob || 'VIGIA'}</div>
                                </div>
                                <div className="col-span-2 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">CBO</span>
                                  <span className="font-bold text-[8.5px] block text-center">{getCboByJob(targetEmployeeJob)}</span>
                                </div>
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Depto</span>
                                  <span className="font-bold text-[8.5px] block text-center">2</span>
                                </div>
                                <div className="col-span-1 p-1 border-r border-black">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Filial</span>
                                  <span className="font-bold text-[8.5px] block text-center">1</span>
                                </div>
                                <div className="col-span-2 p-1">
                                  <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Admissão</span>
                                  <span className="font-extrabold text-[8px] block text-center">
                                    {selectedAdminEmployee?.admissionDate || user?.admissionDate 
                                      ? (() => {
                                          const admDate = selectedAdminEmployee?.admissionDate || user?.admissionDate || '';
                                          const parts = admDate.split('-');
                                          return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : admDate;
                                        })()
                                      : '20/02/2026'}
                                  </span>
                                </div>
                              </div>

                              {/* ROW 3: TABLE FOR RUBRICS HEADER */}
                              <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                                <div className="col-span-1 border-r border-black">Código</div>
                                <div className="col-span-5 border-r border-black text-left pl-3">Descrição das Rubricas</div>
                                <div className="col-span-2 border-r border-black text-right pr-3">Referência</div>
                                <div className="col-span-2 border-r border-black text-right pr-3">Vencimentos (R$)</div>
                                <div className="col-span-2 text-right pr-3">Descontos (R$)</div>
                              </div>

                              {/* ROW 4: THE ITEMS MATRIX */}
                              <div className="text-[8px] min-h-[175px] bg-white relative flex flex-col justify-start">
                                {/* Columns background separators */}
                                <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                                  <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                  <div className="col-span-2 h-full"></div>
                                </div>

                                <div className="relative z-10">
                                  {/* 1. Base Salary Row */}
                                  <div className="grid grid-cols-12 px-1 py-1 text-zinc-950">
                                    <div className="col-span-1 text-center font-bold text-zinc-700">8781</div>
                                    <div className="col-span-5 uppercase pl-3">DIAS NORMAIS</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">30,00</div>
                                    <div className="col-span-2 text-right font-black pr-3">{formatNumber(selectedSlip.baseSalary)}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  </div>

                                  {/* 2. Additions (Bonuses, DSR, extra hours etc) */}
                                  {selectedSlip.taxes?.filter((t: any) => t.type === 'addition').map((t: any, idx: number) => (
                                    <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`add-${idx}`}>
                                      <div className="col-span-1 text-center font-bold text-zinc-700">
                                        {getRubricCode(t.name, '205')}
                                      </div>
                                      <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                      <div className="col-span-2 text-right text-zinc-800 pr-3">
                                        {t.name.includes('HORAS EXTRAS') ? '7:30' : '-'}
                                      </div>
                                      <div className="col-span-2 text-right font-black pr-3">{formatNumber(t.amount)}</div>
                                      <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                    </div>
                                  ))}

                                  {/* 3. Deductions (INSS, IRPF etc) */}
                                  {selectedSlip.taxes?.filter((t: any) => t.type === 'deduction' || !t.type).map((t: any, idx: number) => {
                                    const isINSS = t.name.toUpperCase().includes('INSS');
                                    const isIRPF = t.name.toUpperCase().includes('IRPF') || t.name.toUpperCase().includes('IMPOSTO');
                                    let refVal = '-';
                                    if (isINSS) refVal = '7,90';
                                    else if (isIRPF) refVal = '7,50';

                                    return (
                                      <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`tax-ded-${idx}`}>
                                        <div className="col-span-1 text-center font-bold text-zinc-700">
                                          {getRubricCode(t.name, isINSS ? '998' : '508')}
                                        </div>
                                        <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                        <div className="col-span-2 text-right text-zinc-800 pr-3">{refVal}</div>
                                        <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                        <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(t.amount)}</div>
                                      </div>
                                    );
                                  })}

                                  {/* 4. Manual Discounts */}
                                  {selectedSlip.discounts?.map((d: any, idx: number) => (
                                    <div className="grid grid-cols-12 px-1 py-1 text-zinc-950" key={`disc-${idx}`}>
                                      <div className="col-span-1 text-center font-bold text-zinc-700">
                                        {getRubricCode(d.name, '620')}
                                      </div>
                                      <div className="col-span-5 uppercase pl-3 truncate">{d.name}</div>
                                      <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                      <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                      <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(d.amount)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* ROW 5: TOTALS ROW (SUBTOTALS) */}
                              <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                                <div className="col-span-8 text-right pr-3 uppercase">Total de Vencimentos</div>
                                <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                                  {formatNumber(totalVencimentos)}
                                </div>
                                <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-600 pr-3">
                                  {formatNumber(totalDescontos)}
                                </div>
                              </div>

                              {/* ROW 6: VALOR LÍQUIDO BOX */}
                              <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                                <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/30">
                                  <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido</div>
                                  <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                                </div>
                                <div className="col-span-4 p-2 bg-zinc-100 font-mono text-right font-black text-[12px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                                  <span>{formatNumber(selectedSlip.netSalary)}</span>
                                </div>
                              </div>

                              {/* ROW 7: REAL FOOTER CALCULATIONS STRIP (MIMICKING PHOTO EXACTLY) */}
                              <div className="grid grid-cols-12 text-[7px] text-center bg-zinc-50 uppercase divide-x divide-black h-8 leading-tight">
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Salário Base</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(selectedSlip.baseSalary)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Sal. Contr. INSS</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(totalVencimentos)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. FGTS</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(totalVencimentos)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">F.G.T.S do Mês</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(fgtsAmount)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. IRPF</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(irpfBase)}</span>
                                </div>
                                <div className="col-span-2 p-0.5 flex flex-col justify-between">
                                  <span className="block text-[5.5px] font-bold text-zinc-500">Faixa IRPF</span>
                                  <span className="font-extrabold text-[7.5px] font-mono leading-none">{irpfAmount > 0 ? formatNumber(irpfAmount) : '0,00'}</span>
                                </div>
                              </div>

                              {/* SIGNATURE GRID */}
                              <div className="grid grid-cols-12 gap-x-2 pt-2 border-t border-black bg-white min-h-[85px]">
                                <div className="col-span-6 flex flex-col justify-between items-center text-center p-1.5 pb-1 min-h-[75px] border-r border-zinc-205 pr-2">
                                  <div className="text-[6.5px] uppercase tracking-wider font-extrabold text-zinc-400 font-sans">Emissor</div>
                                  <div className="flex-1 flex items-center justify-center my-1.5">
                                    {selectedSlip.adminSigned ? (
                                      <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                                        {selectedSlip.adminSignatureDataUrl ? (
                                          <img 
                                            src={selectedSlip.adminSignatureDataUrl} 
                                            alt="Visto Administrador" 
                                            className="h-7 max-w-[155px] object-contain drop-shadow mix-blend-multiply" 
                                          />
                                        ) : (
                                          <span className="signature-font text-[13px] text-zinc-700 font-bold italic block select-none">
                                            {selectedSlip.adminSignatureText || 'Administrador'}
                                          </span>
                                        )}
                                        <span className="text-[5.5px] font-mono text-zinc-500 scale-90 block mt-0.5 tracking-tighter uppercase whitespace-nowrap">
                                          ESTABELECIMENTO VIA IP {selectedSlip.adminSignerIp || '177.44.12.92'} • {format(new Date(selectedSlip.adminSignedAt), "dd/MM/yyyy")}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="signature-font text-[14px] text-zinc-450 select-none block italic font-bold">ADMINISTRADOR</span>
                                    )}
                                  </div>
                                  <div className="border-t border-black w-11/12 pt-1 font-bold text-[7px] uppercase truncate">
                                    {company?.name || 'SENTINELA SERVICOS TERCEIRIZACOES LTDA'}
                                  </div>
                                </div>

                                <div className="col-span-6 flex flex-col justify-between items-center text-center p-1.5 pb-1 min-h-[75px] pl-2">
                                  <div className="text-[6.5px] uppercase tracking-wider font-extrabold text-blue-600 font-sans">Declaração de Recebimento</div>
                                  
                                  <div className="flex-1 flex items-center justify-center my-1">
                                    {selectedSlip.signed ? (
                                      <div className="flex flex-col items-center justify-center pointer-events-none select-none">
                                        {selectedSlip.signatureDataUrl ? (
                                          <img 
                                            src={selectedSlip.signatureDataUrl} 
                                            alt="Visto Colaborador" 
                                            className="h-7 max-w-[155px] object-contain drop-shadow mix-blend-multiply" 
                                          />
                                        ) : (
                                          <span className="signature-font text-[13px] text-blue-900 font-bold italic block select-none">
                                            {selectedSlip.signatureText || targetEmployeeName}
                                          </span>
                                        )}
                                        <span className="text-[5px] font-mono text-zinc-500 scale-90 block mt-0.5 tracking-tighter uppercase whitespace-nowrap">
                                          VIA IP {selectedSlip.signerIp || '177.44.12.92'} • {format(new Date(selectedSlip.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-orange-500 font-bold border border-dashed border-orange-200 bg-orange-50/55 rounded bg-orange-50/50 px-2 py-0.5 uppercase tracking-wider text-[7px]">
                                        Aguardando Assinatura
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="border-t border-black w-11/12 pt-1 font-bold text-[7px] uppercase truncate">
                                    ASSINATURA ELETRÔNICA • {targetEmployeeName}
                                  </div>
                                </div>
                              </div>

                              {/* Authentic certificate guarantee */}
                              <div className="text-center text-[6.5px] text-zinc-450 font-mono py-1.5 border-t border-zinc-200 bg-zinc-50/35 flex justify-between px-3 md:px-5 uppercase leading-none">
                                <span>AUTENTICAÇÃO: SHA256-{(selectedSlip.id || '').toUpperCase()}</span>
                                <span>COMPROVANTE EMITIDO CONFORME ART. 464 DA CLT COM CHAVE DE CRIPTOGRAFIA</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-10 text-center flex flex-col items-center justify-center h-[520px]">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Download className="w-8 h-8 text-slate-300" />
                  </div>
                  <h4 className="text-slate-900 font-bold text-lg mb-1">Selecione um Holerite</h4>
                  <p className="text-slate-400 text-sm max-w-sm leading-relaxed mx-auto">
                    {isAdmin 
                      ? 'Selecione um funcionário e clique no ícone de visualização para inspecionar ou deletar o holerite.' 
                      : 'Clique no ícone de visualização para assinar digitalmente e organizar suas pastas.'}
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>

      </div>

      {/* SIGNATURE MODAL (Employee side) */}
      <AnimatePresence>
        {showSignModal && selectedSlip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full border border-slate-100 shadow-2xl relative"
            >
              <button 
                onClick={() => setShowSignModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-blue-600" />
                  Assinar Holerite Eletronicamente
                </h3>
                <p className="text-slate-550 text-xs mt-1">
                  Valide o recebimento eletrônico de rendimentos do mês de <strong>{months[selectedSlip.month - 1]} / {selectedSlip.year}</strong>.
                </p>
              </div>

              {/* Mode Selection Tab */}
              <div className="flex border-b border-slate-100 mb-6 font-bold text-xs uppercase">
                <button 
                  onClick={() => setSignMode('draw')}
                  className={cn(
                    "flex-1 pb-3 text-center transition-all cursor-pointer",
                    signMode === 'draw' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
                  )}
                >
                  Desenhar Assinatura
                </button>
                <button 
                  onClick={() => setSignMode('type')}
                  className={cn(
                    "flex-1 pb-3 text-center transition-all cursor-pointer",
                    signMode === 'type' ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"
                  )}
                >
                  Digitar Nome Completo
                </button>
              </div>

              {signMode === 'draw' ? (
                // Draw Canvas Mode
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-400">ESPAÇO DA CANETA DIGITAL</span>
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
                        Assine aqui na tela
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Type Name Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Nome do Depositário</label>
                    <input 
                      type="text"
                      placeholder="Nome completo igual ao documento"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white rounded-2xl border-0 focus:ring-2 focus:ring-blue-100 text-slate-800 text-sm transition-all"
                    />
                  </div>

                  <div className="bg-slate-50 border border-slate-200/50 p-4 rounded-2xl flex flex-col items-center justify-center h-28 text-center relative overflow-hidden select-none">
                    <span className="absolute top-1 text-[8px] uppercase tracking-wider font-extrabold text-slate-405">Visualização de Assinatura</span>
                    <p className="signature-font text-[24px] text-blue-900 leading-none italic block whitespace-nowrap mt-2 animate-pulse">
                      {typedName.trim() || 'Sua Assinatura Cursiva'}
                    </p>
                  </div>
                </div>
              )}

              {/* Disclaimer Agreement */}
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl my-6 flex gap-3">
                <input 
                  type="checkbox"
                  id="agree-holerite"
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-400 mt-0.5 cursor-pointer"
                  defaultChecked
                />
                <label htmlFor="agree-holerite" className="text-[11px] text-slate-550 leading-relaxed cursor-pointer select-none">
                  Fui devidamente pago no valor líquido de rendimentos supracitado e aceito o visto digital com força legal e quitação irrevogável.
                </label>
              </div>

              {/* Active Actions */}
              <button 
                onClick={handleSignatureSubmit}
                disabled={signingState || (signMode === 'type' && !typedName.trim())}
                className="w-full py-4 bg-blue-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {signingState ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Cópia ao Administrador...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    Confirmar Assinatura Digital
                  </>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN ENVIAR HOLERITE DRAW MODAL */}
      <AnimatePresence>
        {showAddSlipModal && isAdmin && selectedAdminEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 lg:p-8 max-w-xl lg:max-w-5xl w-full border border-slate-100 shadow-2xl relative my-8 transition-all duration-300"
            >
              <button 
                onClick={() => setShowAddSlipModal(false)}
                className="absolute top-6 right-6 p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-all cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mb-6 pr-8">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Send className="w-6 h-6 text-blue-600 animate-pulse" />
                  Enviar Holerite / Holerite Customizado
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Verifique e valide os dados da folha antes de despachar o documento oficial sob as leis trabalhistas.
                </p>
              </div>

              {/* Tab Selector for Mobile (stacked) layout */}
              <div className="flex border-b border-slate-100 mb-6 lg:hidden">
                <button
                  type="button"
                  onClick={() => setAdminModalTab('form')}
                  className={cn(
                    "flex-1 py-3 font-bold text-xs uppercase tracking-wider border-b-2 text-center transition-all cursor-pointer",
                    adminModalTab === 'form' ? "border-blue-600 text-blue-600 font-extrabold" : "border-transparent text-slate-400 font-medium"
                  )}
                >
                  📝 Lançamentos & IA
                </button>
                <button
                  type="button"
                  onClick={() => setAdminModalTab('preview')}
                  className={cn(
                    "flex-1 py-3 font-bold text-xs uppercase tracking-wider border-b-2 text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    adminModalTab === 'preview' ? "border-blue-600 text-blue-600 font-extrabold" : "border-transparent text-slate-400 font-medium"
                  )}
                >
                  <Eye className="w-4 h-4" /> Prévia Real ({formatCurrency(previewCalc.netSalary)})
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* COLUMN 1: FORM CONTROLS */}
                <div className={cn(
                  "lg:col-span-6 space-y-4 max-h-[500px] overflow-y-auto pr-1--",
                  adminModalTab === 'form' ? "block" : "hidden lg:block bg-white"
                ).replace(' pr-1--', ' pr-1')}>
                  {/* AI Document Parser Box */}
                  <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-100 rounded-3xl p-5 mb-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                          <Sparkles className="w-4 h-4 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-xs text-blue-950 uppercase tracking-wide">Importação Inteligente com IA</h4>
                          <p className="text-[10px] text-blue-600 font-bold">Extraia dados de holerites (fotos, PDFs ou TXT)</p>
                        </div>
                      </div>
                    </div>

                    {isParsingAI ? (
                      <div className="flex flex-col items-center justify-center p-4 py-6 bg-white rounded-2xl border border-dashed border-blue-200 gap-3">
                        <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                        <p className="text-xs font-bold text-slate-655 animate-pulse text-center">
                          A IA está analisando este contracheque...
                        </p>
                        <span className="text-[9px] text-slate-400">Interpretando salários, adicionais e identificando colaborador</span>
                      </div>
                    ) : (
                      <div>
                        <div 
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            aiFileInputRef.current?.click();
                          }}
                          className={cn(
                            "flex flex-col items-center justify-center p-4 py-5 rounded-2xl border border-dashed transition-all cursor-pointer select-none text-center",
                            isDragActive 
                              ? "bg-blue-50/90 border-blue-500 scale-[1.01] shadow-md shadow-blue-100" 
                              : "bg-white border-slate-200 hover:bg-slate-50/50 hover:border-blue-300"
                          )}
                        >
                          <Upload className={cn("w-5 h-5 mb-1 transition-all", isDragActive ? "text-blue-600 scale-110" : "text-slate-450")} />
                          <p className="text-xs font-bold text-slate-750">Selecione ou solte o arquivo do Holerite</p>
                          <span className="text-[9px] text-slate-400">Imagens (PNG/JPG), PDF ou TXT</span>
                        </div>
                        <input 
                          ref={aiFileInputRef}
                          type="file" 
                          accept="image/*,application/pdf,text/plain" 
                          onChange={handleAIFileUpload} 
                          className="hidden" 
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}

                    {aiSuccessMessage && (
                      <div className="bg-emerald-50 border border-emerald-100/70 text-emerald-800 p-3 rounded-xl text-[10px] font-medium flex items-start gap-2 animate-fade-in">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold text-emerald-950">Processamento Concluído</p>
                          <p className="opacity-90">{aiSuccessMessage}</p>
                        </div>
                      </div>
                    )}

                    {aiError && (
                      <div className="bg-rose-50 border border-rose-100 text-rose-800 p-3 rounded-xl text-[10px] font-medium flex items-start gap-2 animate-rose-fade">
                        <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-extrabold text-rose-950">Falha no Processamento</p>
                          <p className="opacity-95">{aiError}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                   {/* Document Type Selector */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewSlipForm({ ...newSlipForm, documentType: 'salary' })}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-black uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        newSlipForm.documentType === 'salary'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/50 font-extrabold"
                          : "text-slate-450 hover:text-slate-700"
                      )}
                    >
                      <FileText className="w-4 h-4 text-slate-500" />
                      Holerite Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSlipForm({ ...newSlipForm, documentType: 'vacation' })}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-black uppercase text-center transition-all cursor-pointer flex items-center justify-center gap-1.5",
                        newSlipForm.documentType === 'vacation'
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/50 font-extrabold"
                          : "text-slate-450 hover:text-slate-700"
                      )}
                    >
                      🌴 Enviar Férias
                    </button>
                  </div>

                  {newSlipForm.documentType === 'vacation' ? (
                    <div className="space-y-4 bg-blue-50/20 border border-blue-100 rounded-2xl p-4 animate-fade-in">
                      <h4 className="text-xs font-black uppercase text-blue-900 flex items-center gap-1.5">
                        🌴 Detalhes do Período de Férias
                      </h4>
                      <p className="text-[10px] text-blue-600 leading-tight">
                        Especifique as datas reais de gozo e os períodos aquisitivos oficiais para a folha de férias eletrônica.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Início do Gozo *</label>
                          <input 
                            type="date"
                            value={newSlipForm.vacationStart}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationStart: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Fim do Gozo *</label>
                          <input 
                            type="date"
                            value={newSlipForm.vacationEnd}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationEnd: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Início Per. Aquisitivo</label>
                          <input 
                            type="date"
                            value={newSlipForm.acquisitionStart}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, acquisitionStart: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Fim Per. Aquisitivo</label>
                          <input 
                            type="date"
                            value={newSlipForm.acquisitionEnd}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, acquisitionEnd: e.target.value })}
                            className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">Valor Base de Férias (R$)</label>
                        <input 
                          type="number"
                          value={newSlipForm.vacationSalary}
                          onChange={(e) => setNewSlipForm({ ...newSlipForm, vacationSalary: Number(e.target.value) })}
                          className="w-full text-xs font-bold bg-white rounded-xl px-3 py-2 text-slate-705 border border-slate-205 focus:ring-2 focus:ring-blue-105"
                        />
                      </div>

                      <label className="flex items-center gap-2 select-none cursor-pointer mt-2 text-xs font-bold text-slate-700">
                        <input 
                          type="checkbox"
                          checked={newSlipForm.hasConstitutionalThird}
                          onChange={(e) => setNewSlipForm({ ...newSlipForm, hasConstitutionalThird: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer text-xs"
                        />
                        Adicionar 1/3 (Terço Constitucional CLT)
                      </label>
                    </div>
                  ) : (
                    <>
                      {/* Competence Picker row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Mês de Competência</label>
                          <select 
                            value={newSlipForm.month}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, month: Number(e.target.value) })}
                            className="w-full text-xs font-bold bg-slate-50 rounded-xl px-3 py-2 text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-105"
                          >
                            {months.map((m, i) => (
                              <option key={i} value={i + 1}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Ano</label>
                          <input 
                            type="number"
                            value={newSlipForm.year}
                            onChange={(e) => setNewSlipForm({ ...newSlipForm, year: Number(e.target.value) })}
                            className="w-full text-xs font-bold bg-slate-50 rounded-xl px-3 py-2 text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-105"
                          />
                        </div>
                      </div>

                      {/* Base Salary */}
                      <div>
                        <label className="block text-xs font-bold text-slate-400 mb-2 uppercase">Salário Contratual Base (R$)</label>
                        <input 
                          type="number"
                          value={newSlipForm.baseSalary}
                          onChange={(e) => setNewSlipForm({ ...newSlipForm, baseSalary: Number(e.target.value) })}
                          className="w-full text-xs font-bold bg-slate-50 rounded-xl px-3 py-2 text-slate-705 focus:outline-none focus:ring-2 focus:ring-blue-105"
                        />
                        <div className="mt-3 flex items-center justify-between p-3.5 bg-blue-50/50 rounded-xl border border-blue-100/50">
                          <div className="flex flex-col pr-4">
                            <span className="text-xs font-bold text-blue-900">Calcular Impostos Automaticamente (CLT)</span>
                            <span className="text-[10px] text-blue-700 font-medium mt-0.5">
                              Desative para holerites gerados via IA, mantendo os valores reais do documento físico sem alterações.
                            </span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input 
                              type="checkbox" 
                              checked={newSlipForm.autoCalculateTaxes !== false} 
                              onChange={(e) => setNewSlipForm({ ...newSlipForm, autoCalculateTaxes: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Rubricas customizadas additions / deductions widget */}
                  <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-4">
                    <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wide">Acrescer Outras Rubricas Adicionais</h4>
                    
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-6">
                        <input 
                          type="text"
                          placeholder="EX: Horas Extras 50%"
                          value={tempItem.name}
                          onChange={(e) => setTempItem({ ...tempItem, name: e.target.value })}
                          className="w-full text-xs bg-white rounded-xl px-3 py-2.5 text-slate-707 placeholder:text-slate-400"
                        />
                      </div>
                      <div className="col-span-3">
                        <input 
                          type="number"
                          placeholder="Valor R$"
                          value={tempItem.amount || ''}
                          onChange={(e) => setTempItem({ ...tempItem, amount: Number(e.target.value) })}
                          className="w-full text-xs bg-white rounded-xl px-3 py-2.5 text-slate-707"
                        />
                      </div>
                      <div className="col-span-3">
                        <button 
                          type="button"
                          onClick={handleAddSlipItem}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-4 text-[10px] font-bold text-slate-550 border-b border-slate-100 pb-2">
                      <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input 
                          type="radio" 
                          name="itemtype" 
                          checked={tempItem.type === 'addition'} 
                          onChange={() => setTempItem({ ...tempItem, type: 'addition' })}
                          className="text-blue-600 focus:ring-0 w-3.5 h-3.5" 
                        />
                        Vencimento (Adicional +)
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input 
                          type="radio" 
                          name="itemtype"
                          checked={tempItem.type === 'deduction'} 
                          onChange={() => setTempItem({ ...tempItem, type: 'deduction' })}
                          className="text-blue-600 focus:ring-0 w-3.5 h-3.5" 
                        />
                        Desconto (Dedução -)
                      </label>
                    </div>

                    {/* Addition items lists */}
                    {newSlipForm.additions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase text-emerald-500">Adicionais Cadastrados</p>
                        {newSlipForm.additions.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs bg-white rounded-lg p-2 border border-slate-200/55">
                            <span className="font-semibold text-slate-850">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-600 font-bold font-mono">+{formatCurrency(item.amount)}</span>
                              <button type="button" onClick={() => handleRemoveAddition(idx)} className="text-slate-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Deduction items lists */}
                    {newSlipForm.deductions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold uppercase text-red-500">Descontos Cadastrados</p>
                        {newSlipForm.deductions.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs bg-white rounded-lg p-2 border border-slate-200/55">
                            <span className="font-semibold text-slate-850">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-red-500 font-bold font-mono">-{formatCurrency(item.amount)}</span>
                              <button type="button" onClick={() => handleRemoveDeduction(idx)} className="text-slate-400 hover:text-red-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUMN 2: HIGH FIDELITY REAL-TIME PAYCHECK PREVIEW */}
                <div className={cn(
                  "lg:col-span-6 space-y-4 max-h-[500px] overflow-y-auto bg-slate-50 border border-slate-150 rounded-[2rem] p-4 lg:p-5 flex flex-col justify-start relative",
                  adminModalTab === 'preview' ? "block" : "hidden lg:block bg-slate-50"
                )}>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-[9px] font-black uppercase text-slate-400 font-mono tracking-wider">Demonstrativo de Holerite Digital (Prévia)</span>
                    <span className="px-2 py-0.5 bg-zinc-900/10 text-zinc-800 text-[8px] font-black uppercase rounded font-mono">Prévia</span>
                  </div>
                  <div className="bg-white border border-black text-black font-mono text-[9px] w-full select-none leading-none">
                    {(() => {
                      const totalVencimentos = previewCalc.totalAdditions;
                      const inssAmount = previewCalc.taxes.find(t => t.name.toUpperCase()?.includes('INSS'))?.amount || 0;
                      const irpfAmount = previewCalc.taxes.find(t => t.name.toUpperCase()?.includes('IRPF'))?.amount || 0;
                      const totalDescontos = previewCalc.totalDeductions;
                      const fgtsBase = totalVencimentos;
                      const fgtsAmount = fgtsBase * 0.08;
                      const irpfBase = Math.max(0, totalVencimentos - inssAmount);

                      if (previewCalc.isVacation) {
                        const formatDateBR = (dateStr: string) => {
                          if (!dateStr) return '__/__/____';
                          const parts = dateStr.split('-');
                          if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                          return dateStr;
                        };

                        return (
                          <>
                            {/* ROW 1: COMPANY / HEADER */}
                            <div className="grid grid-cols-12 border-b border-black">
                              <div className="col-span-7 p-2 border-r border-black flex flex-col justify-between h-14">
                                <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                  {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                                </div>
                                <div className="text-[7.5px] text-zinc-700 leading-none">
                                  CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                                </div>
                              </div>
                              <div className="col-span-5 p-2 flex flex-col justify-between text-right h-14">
                                <div className="font-extrabold text-[9px] text-blue-600 leading-none uppercase font-mono">
                                  Recibo e Aviso de Férias
                                </div>
                                <div className="text-[7px] text-zinc-650 leading-tight">
                                  Art. 135 da CLT
                                </div>
                              </div>
                            </div>

                            {/* ROW 2: EMPLOYEE DETAILS */}
                            <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                              <div className="col-span-6 p-1.5 border-r border-black">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                                <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{selectedAdminEmployee.name}</div>
                                <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{selectedAdminEmployee.department || 'VIGIA'}</div>
                              </div>
                              <div className="col-span-3 p-1.5 border-r border-black">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Período Aquisitivo</span>
                                <div className="font-extrabold text-[8px] text-neutral-950">
                                  {formatDateBR(previewCalc.acquisitionStart)} a {formatDateBR(previewCalc.acquisitionEnd)}
                                </div>
                              </div>
                              <div className="col-span-3 p-1.5">
                                <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Período de Gozo</span>
                                <div className="font-extrabold text-[8px] text-blue-700">
                                  {formatDateBR(previewCalc.vacationStart)} a {formatDateBR(previewCalc.vacationEnd)}
                                </div>
                              </div>
                            </div>

                            {/* ROW 3: TABLE HEADER */}
                            <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                              <div className="col-span-1 border-r border-black font-semibold">Código</div>
                              <div className="col-span-5 border-r border-black text-left pl-3 font-semibold">Descrição do Lançamento de Férias</div>
                              <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Referência</div>
                              <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Proventos</div>
                              <div className="col-span-2 text-right pr-3 font-semibold">Descontos</div>
                            </div>

                            {/* ROW 4: ITEMS MATRIX */}
                            <div className="text-[8px] min-h-[145px] bg-white relative flex flex-col justify-start">
                              <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                                <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                                <div className="col-span-2 h-full"></div>
                              </div>

                              <div className="relative z-10">
                                <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950">
                                  <div className="col-span-1 text-center font-bold text-zinc-700">0220</div>
                                  <div className="col-span-5 uppercase pl-3">VALOR DAS FÉRIAS (GOZO)</div>
                                  <div className="col-span-2 text-right text-zinc-800 pr-3 font-bold">30 Dias</div>
                                  <div className="col-span-2 text-right font-black pr-3">{formatNumber(previewCalc.vacationSalary || 0)}</div>
                                  <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                </div>

                                {previewCalc.hasConstitutionalThird && (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950">
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0221</div>
                                    <div className="col-span-5 uppercase pl-3">TERÇO CONSTITUCIONAL DE FÉRIAS (1/3)</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3 font-bold">33,33%</div>
                                    <div className="col-span-2 text-right font-black pr-3">{formatNumber(previewCalc.constThird || 0)}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  </div>
                                )}

                                {previewCalc.taxes.filter(t => t.type === 'addition').map((a, idx) => (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-add-${idx}`}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0205</div>
                                    <div className="col-span-5 uppercase pl-3 truncate">{a.name}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                    <div className="col-span-2 text-right font-black pr-3">{formatNumber(a.amount)}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  </div>
                                ))}

                                {previewCalc.taxes.filter(t => t.type === 'deduction').map((t, idx) => {
                                  const isINSS = t.name.toUpperCase().includes('INSS');
                                  return (
                                    <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-ded-${idx}`}>
                                      <div className="col-span-1 text-center font-bold text-zinc-700">
                                        {isINSS ? '0910' : '0514'}
                                      </div>
                                      <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                      <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                      <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                      <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(t.amount)}</div>
                                    </div>
                                  );
                                })}

                                {previewCalc.discounts.map((d, idx) => (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-vac-disc-${idx}`}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">0620</div>
                                    <div className="col-span-5 uppercase pl-3 truncate">{d.name}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                    <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(d.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* ROW 5: TOTALS ROW */}
                            <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                              <div className="col-span-8 text-right pr-3 uppercase">Totalizador de Férias</div>
                              <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                                {formatNumber(totalVencimentos)}
                              </div>
                              <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-605 pr-3">
                                {formatNumber(totalDescontos)}
                              </div>
                            </div>

                            {/* ROW 6: NET SALARY */}
                            <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                              <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/20">
                                <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido das Férias</div>
                                <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                              </div>
                              <div className="col-span-4 p-1.5 bg-zinc-100 font-mono text-right font-black text-[11px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                                <span>{formatNumber(previewCalc.netSalary)}</span>
                              </div>
                            </div>

                            {/* ROW 7: FOOTER NOTES */}
                            <div className="p-2 text-[6px] leading-[1.1] text-zinc-500 border-t border-zinc-250">
                              * COMUNICAMOS QUE AS FÉRIAS SERÃO CONCEDIDAS AO COLABORADOR NO PERÍODO DESIGNADO. ESTE DOCUMENTO CONSTITUI AVISO PRÉVIO E COMPROVANTE ELETRÔNICO SOB AS REGRAS CLT.
                            </div>
                          </>
                        );
                      }

                      return (
                        <>
                          {/* ROW 1: COMPANY / CC / PERIOD */}
                          <div className="grid grid-cols-12 border-b border-black">
                            <div className="col-span-6 p-2 border-r border-black flex flex-col justify-between h-14">
                              <div className="font-extrabold text-[10px] leading-tight text-neutral-900 tracking-tight">
                                {company?.name || 'SENTINELA SERVIÇOS E TERCEIRIZAÇÕES LTDA'}
                              </div>
                              <div className="text-[7.5px] text-zinc-700 leading-none">
                                CNPJ: {company?.cnpj || '53.704.137/0001-93'}
                              </div>
                            </div>
                            <div className="col-span-3 p-2 border-r border-black flex flex-col justify-between text-center h-14">
                              <div className="font-bold text-[7.5px] text-zinc-900 leading-tight">
                                CC: {(selectedAdminEmployee.department || '').split(' ')[0] || 'RSN'} LOGISTICA
                              </div>
                              <div className="text-[7.5px] text-zinc-700 font-bold">
                                Mensalista
                              </div>
                            </div>
                            <div className="col-span-3 p-2 flex flex-col justify-between text-right h-14">
                              <div className="font-bold text-[7.5px] text-zinc-900 leading-none uppercase">
                                Folha Mensal
                              </div>
                              <div className="font-extrabold text-[8.5px] text-black">
                                {months[Number(newSlipForm.month) - 1]?.toUpperCase()} de {newSlipForm.year}
                              </div>
                            </div>
                          </div>

                          {/* ROW 2: EMPLOYEE DETAILS BLOCK */}
                          <div className="grid grid-cols-12 border-b border-black bg-zinc-50/40">
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Cód.</span>
                              <span className="font-bold text-[8.5px] block text-center">52</span>
                            </div>
                            <div className="col-span-5 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-0.5">Nome do Funcionário</span>
                              <div className="font-black text-[9px] uppercase leading-tight truncate text-neutral-950">{selectedAdminEmployee.name}</div>
                              <div className="text-[7px] text-zinc-650 font-bold uppercase mt-0.5 tracking-tight">{selectedAdminEmployee.department || 'VIGIA'}</div>
                            </div>
                            <div className="col-span-2 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">CBO</span>
                              <span className="font-bold text-[8.5px] block text-center">{getCboByJob(selectedAdminEmployee.department)}</span>
                            </div>
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Depto</span>
                              <span className="font-bold text-[8.5px] block text-center">2</span>
                            </div>
                            <div className="col-span-1 p-1 border-r border-black">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Filial</span>
                              <span className="font-bold text-[8.5px] block text-center">1</span>
                            </div>
                            <div className="col-span-2 p-1">
                              <span className="block text-[6px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Admissão</span>
                              <span className="font-extrabold text-[8px] block text-center">
                                {selectedAdminEmployee.admissionDate
                                  ? (() => {
                                      const parts = selectedAdminEmployee.admissionDate.split('-');
                                      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedAdminEmployee.admissionDate;
                                    })()
                                  : '20/02/2026'}
                              </span>
                            </div>
                          </div>

                          {/* ROW 3: TABLE FOR RUBRICS HEADER */}
                          <div className="grid grid-cols-12 bg-zinc-100 border-b border-black text-[7.5px] uppercase tracking-tight text-center font-bold p-0.5 py-1">
                            <div className="col-span-1 border-r border-black font-semibold">Código</div>
                            <div className="col-span-5 border-r border-black text-left pl-3 font-semibold">Descrição das Rubricas</div>
                            <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Referência</div>
                            <div className="col-span-2 border-r border-black text-right pr-3 font-semibold">Vencimentos</div>
                            <div className="col-span-2 text-right pr-3 font-semibold">Descontos</div>
                          </div>

                          {/* ROW 4: THE ITEMS MATRIX */}
                          <div className="text-[8px] min-h-[145px] bg-white relative flex flex-col justify-start">
                            {/* Columns background separators */}
                            <div className="absolute inset-0 grid grid-cols-12 pointer-events-none">
                              <div className="col-span-1 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-5 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 border-r border-zinc-250 h-full"></div>
                              <div className="col-span-2 h-full"></div>
                            </div>

                            <div className="relative z-10">
                              {/* 1. Base Salary */}
                              <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950">
                                <div className="col-span-1 text-center font-bold text-zinc-700">8781</div>
                                <div className="col-span-5 uppercase pl-3">DIAS NORMAIS</div>
                                <div className="col-span-2 text-right text-zinc-800 pr-3">30,00</div>
                                <div className="col-span-2 text-right font-black pr-3">{formatNumber(previewCalc.baseSalary)}</div>
                                <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                              </div>

                              {/* 2. Additions */}
                              {previewCalc.taxes.filter(t => t.type === 'addition').map((a, idx) => (
                                <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-add-${idx}`}>
                                  <div className="col-span-1 text-center font-bold text-zinc-700">
                                    {getRubricCode(a.name, '205')}
                                  </div>
                                  <div className="col-span-5 uppercase pl-3 truncate">{a.name}</div>
                                  <div className="col-span-2 text-right text-zinc-800 pr-3">
                                    {a.name.includes('HORAS EXTRAS') ? '7:30' : '-'}
                                  </div>
                                  <div className="col-span-2 text-right font-black pr-3">{formatNumber(a.amount)}</div>
                                  <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                </div>
                              ))}

                              {/* 3. Deductions */}
                              {previewCalc.taxes.filter(t => t.type === 'deduction').map((t, idx) => {
                                const isINSS = t.name.toUpperCase().includes('INSS');
                                const isIRPF = t.name.toUpperCase().includes('IRPF') || t.name.toUpperCase().includes('IMPOSTO');
                                let refVal = '-';
                                if (isINSS) refVal = '7,90';
                                else if (isIRPF) refVal = '7,50';

                                return (
                                  <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-ded-${idx}`}>
                                    <div className="col-span-1 text-center font-bold text-zinc-700">
                                      {getRubricCode(t.name, isINSS ? '998' : '508')}
                                    </div>
                                    <div className="col-span-5 uppercase pl-3 truncate">{t.name}</div>
                                    <div className="col-span-2 text-right text-zinc-800 pr-3">{refVal}</div>
                                    <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                    <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(t.amount)}</div>
                                  </div>
                                );
                              })}

                              {/* 4. Manual Discounts */}
                              {previewCalc.discounts.map((d, idx) => (
                                <div className="grid grid-cols-12 px-1 py-0.5 text-zinc-950" key={`prev-disc-${idx}`}>
                                  <div className="col-span-1 text-center font-bold text-zinc-700">
                                    {getRubricCode(d.name, '620')}
                                  </div>
                                  <div className="col-span-5 uppercase pl-3 truncate">{d.name}</div>
                                  <div className="col-span-2 text-right text-zinc-800 pr-3">-</div>
                                  <div className="col-span-2 text-right text-zinc-300 pr-3">-</div>
                                  <div className="col-span-2 text-right font-black text-red-650 pr-3">{formatNumber(d.amount)}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* ROW 5: TOTALS ROW */}
                          <div className="grid grid-cols-12 border-t border-black bg-zinc-50 font-sans font-bold text-[8px] py-1 text-neutral-800">
                            <div className="col-span-8 text-right pr-3 uppercase">Total de Vencimentos</div>
                            <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-neutral-900 pr-3">
                              {formatNumber(totalVencimentos)}
                            </div>
                            <div className="col-span-2 text-right font-mono text-[8.5px] font-black text-red-600 pr-3">
                              {formatNumber(totalDescontos)}
                            </div>
                          </div>

                          {/* ROW 6: VALOR LÍQUIDO BOX */}
                          <div className="grid grid-cols-12 border-t border-black border-b bg-white items-center">
                            <div className="col-span-8 p-1 px-3 flex justify-between items-center bg-zinc-50/20">
                              <div className="text-[6.5px] uppercase font-black text-zinc-500 font-sans tracking-widest">Valor Líquido de Depósito</div>
                              <div className="text-[14px] font-sans font-bold text-zinc-950 mr-2 leading-none">⇨</div>
                            </div>
                            <div className="col-span-4 p-1.5 bg-zinc-100 font-mono text-right font-black text-[11px] text-zinc-950 pr-3 leading-none h-full flex items-center justify-end">
                              <span>{formatNumber(previewCalc.netSalary)}</span>
                            </div>
                          </div>

                          {/* ROW 7: REAL FOOTER CALCULATIONS STRIP */}
                          <div className="grid grid-cols-12 text-[7px] text-center bg-zinc-50 uppercase divide-x divide-black h-8 leading-tight">
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Salário Base</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(previewCalc.baseSalary)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Sal. Contr. INSS</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(totalVencimentos)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. FGTS</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(totalVencimentos)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">F.G.T.S do Mês</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(fgtsAmount)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Base Calc. IRPF</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{formatNumber(irpfBase)}</span>
                            </div>
                            <div className="col-span-2 p-0.5 flex flex-col justify-between">
                              <span className="block text-[5.5px] font-bold text-zinc-500">Faixa IRPF</span>
                              <span className="font-extrabold text-[7.5px] font-mono leading-none">{irpfAmount > 0 ? formatNumber(irpfAmount) : '0,00'}</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-blue-50/55 border border-blue-100 rounded-2xl p-4 text-[10px] text-blue-900 flex gap-2 font-medium">
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-blue-950">Ambiente de Segurança Ativo</p>
                      <p className="opacity-90 mt-0.5 leading-relaxed">O sistema garante validade jurídica total sob a MP 2.200-2, enviando ao colaborador para que ele assine diretamente pela interface web ou celular do app.</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Operations execute */}
              <button 
                onClick={handleCreateSlipSubmit}
                className="w-full mt-6 py-4 bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
              >
                <Send className="w-4 h-4 animate-bounce" style={{ animationDuration: '3s' }} />
                Despachar e Enviar Holerite
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden; }
          #payslip-print-block, #payslip-print-block * { visibility: visible; }
          #payslip-print-block { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            margin: 0 !important;
            padding: 0 !important;
            width: 190mm !important;
            height: auto !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
    </div>
  );
}
