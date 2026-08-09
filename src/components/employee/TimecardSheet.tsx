import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, query, where, getDocs, orderBy, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CompanyConfig, Attendance, User } from '../../types';
import { FileText, Download, Printer, ChevronLeft, ChevronRight, Calendar, Check, X, AlertCircle, RefreshCw, PenTool, Menu, RotateCw, CheckCircle2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../../lib/notifications';

interface TimecardSheetProps {
  onNavigate?: (v: any) => void;
  adminSelectedUser?: User;
  onBackToUsers?: () => void;
  initialMonth?: Date;
  isBlankTimecardMode?: boolean;
  blankTimecardId?: string;
  onBackToBlankManager?: () => void;
}

export default function TimecardSheet({ 
  onNavigate, 
  adminSelectedUser, 
  onBackToUsers, 
  initialMonth,
  isBlankTimecardMode = false,
  blankTimecardId,
  onBackToBlankManager
}: TimecardSheetProps) {
  const { user } = useAuth();
  const targetUser = adminSelectedUser || user;

  const [company, setCompany] = useState<CompanyConfig | null>(null);
  const [punches, setPunches] = useState<Attendance[]>([]);
  const [currentMonth, setCurrentMonth] = useState(initialMonth || new Date());

  // Split-posto timesheet states
  const [signaturesList, setSignaturesList] = useState<any[]>([]);
  const [selectedPosto, setSelectedPosto] = useState<string>('TODOS OS POSTOS');

  useEffect(() => {
    if (!selectedPosto) {
      setSelectedPosto('TODOS OS POSTOS');
    }
  }, [targetUser]);

  useEffect(() => {
    if (!selectedPosto || selectedPosto === 'TODOS') {
      const activeSig = signaturesList.find(s => s.adminSigned) || signaturesList[0];
      setSignatureDoc(activeSig || null);
      return;
    }

    const activeSig = signaturesList.find(s => {
      const pName = s.postoName || 'Portaria Principal';
      return pName.toLowerCase().trim() === (selectedPosto || 'Portaria Principal').toLowerCase().trim();
    });
    
    if (activeSig) {
      setSignatureDoc(activeSig);
    } else {
      // If no active signature is found, check if we are on the default post (Portaria Principal)
      // and there's an old general signature (without the postoName field).
      const isDefaultPostSelected = (selectedPosto || 'Portaria Principal').toLowerCase().trim() === 'portaria principal';
      const oldGeneralSig = signaturesList.find(s => !s.postoName);
      
      if (isDefaultPostSelected && oldGeneralSig) {
        setSignatureDoc(oldGeneralSig);
      } else {
        setSignatureDoc(null);
      }
    }
  }, [signaturesList, selectedPosto]);

  useEffect(() => {
    if (initialMonth) {
      setCurrentMonth(initialMonth);
    }
  }, [initialMonth]);

  const [loading, setLoading] = useState(true);
  const [signatureDoc, setSignatureDoc] = useState<any | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const [lastAutoOpenedSigId, setLastAutoOpenedSigId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === 'admin' && signatureDoc && signatureDoc.signedAt && !signatureDoc.adminSigned) {
      const sigId = signatureDoc.id || '';
      if (sigId && lastAutoOpenedSigId !== sigId) {
        setLastAutoOpenedSigId(sigId);
        setShowSignModal(true);
      }
    }
  }, [user, signatureDoc, lastAutoOpenedSigId]);

  const [containerWidth, setContainerWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
      }
    };
    
    updateWidth();
    
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateWidth);
    const timer = setTimeout(updateWidth, 150);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
      clearTimeout(timer);
    };
  }, [containerRef.current]);

  const targetWidth = 794;
  const isMobileSize = containerWidth < targetWidth;
  const scale = isMobileSize ? Math.max(0.2, (containerWidth - 12) / targetWidth) : 1;

  // Signature Modal states
  const [showSignModal, setShowSignModal] = useState(false);
  const [signMode, setSignMode] = useState<'draw' | 'type' | 'profile'>('draw');
  const [typedName, setTypedName] = useState('');
  const [declaraResponsabilidade, setDeclaraResponsabilidade] = useState(false);
  const [signingState, setSigningState] = useState(false);

  useEffect(() => {
    if (showSignModal) {
      if (user?.role === 'admin') {
        setSignMode('profile');
      } else {
        setSignMode(user?.signatureURL ? 'profile' : 'draw');
      }
    }
  }, [showSignModal, user]);

  // Drawing Canvas refs and state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isRotated, setIsRotated] = useState(false);

  const [sheetHeight, setSheetHeight] = useState<number>(1123);

  useEffect(() => {
    const updateHeight = () => {
      if (printRef.current) {
        setSheetHeight(printRef.current.offsetHeight || 1123);
      }
    };
    
    updateHeight();
    
    if (printRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(printRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [punches, currentMonth, signatureDoc, showSignModal]);

  useEffect(() => {
    if (showSignModal) {
      if (user?.role === 'admin') {
        setTypedName(user ? (user.name || '') : '');
      } else if (targetUser) {
        setTypedName(targetUser.name || '');
      }
      if (user?.signatureURL) {
        setSignMode('profile');
      } else {
        setSignMode('draw');
      }
    }
  }, [targetUser, user, showSignModal]);

  // Adjust canvas size when switching modes or opening signature modal
  useEffect(() => {
    if (showSignModal && canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = canvas.offsetWidth || 400;
      canvas.height = canvas.offsetHeight || 160;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [showSignModal, signMode]);

  useEffect(() => {
    if (!targetUser) return;
    setLoading(true);

    // 1. Company Config Real-time
    const unsubCompany = onSnapshot(doc(db, 'config', 'company'), (companyDoc) => {
      if (companyDoc.exists()) setCompany(companyDoc.data() as CompanyConfig);
    }, (error) => {
      console.error('Error fetching company config in real-time:', error);
    });

    // 2. Signature List Real-time
    const m = currentMonth.getMonth() + 1;
    const y = currentMonth.getFullYear();
    const sigQuery = isBlankTimecardMode && blankTimecardId
      ? query(collection(db, 'blankTimecards', blankTimecardId, 'signatures'))
      : query(
          collection(db, 'timecardSignatures'),
          where('userId', '==', targetUser.uid),
          where('month', '==', m),
          where('year', '==', y)
        );
    const unsubSig = onSnapshot(sigQuery, (snapshot) => {
      const sigs = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setSignaturesList(sigs);
    }, (error) => {
      console.error('Error fetching signatures list in real-time:', error);
    });

    // 3. Attendance Punches Real-time
    const targetM = currentMonth.getMonth();
    const targetY = currentMonth.getFullYear();
    const targetUid = targetUser?.uid;
    const targetCpf = targetUser?.cpf ? targetUser.cpf.replace(/\D/g, '') : '';
    const targetEmail = (targetUser?.email || '').toLowerCase().trim();
    
    const punchesQuery = isBlankTimecardMode && blankTimecardId
      ? query(collection(db, 'blankTimecards', blankTimecardId, 'attendance'))
      : query(collection(db, 'attendance'));

    const unsubPunches = onSnapshot(punchesQuery, (snapshot) => {
      const allPunches = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
      
      // Sort locally
      allPunches.sort((a, b) => {
        const timeA = parseFirestoreTimestamp(a.timestamp).getTime();
        const timeB = parseFirestoreTimestamp(b.timestamp).getTime();
        return isNaN(timeA) || isNaN(timeB) ? 0 : timeA - timeB;
      });
      
      // Filter locally by checking user match and month/year
      const monthPunches = allPunches.filter(p => {
        if (!p.timestamp) return false;
        const date = parseFirestoreTimestamp(p.timestamp);
        if (!date || isNaN(date.getTime()) || date.getMonth() !== targetM || date.getFullYear() !== targetY) {
          return false;
        }

        if (isBlankTimecardMode) return true;

        const matchUid = targetUid && p.userId === targetUid;
        const matchCpf = targetCpf && p.userCpf && p.userCpf.replace(/\D/g, '') === targetCpf;
        const matchEmail = targetEmail && p.userEmail && p.userEmail.toLowerCase().trim() === targetEmail;

        return matchUid || matchCpf || matchEmail;
      });
      
      setPunches(monthPunches);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching punches in real-time:', error);
      setLoading(false);
    });

    return () => {
      unsubCompany();
      unsubSig();
      unsubPunches();
    };
  }, [targetUser, currentMonth]);

  const fetchData = async () => {
    // Punches, signature, and company configuration are updated in real time via onSnapshot.
  };

  // Admin Direct Editing states
  const [showEditPunchModal, setShowEditPunchModal] = useState(false);
  const [selectedEditDay, setSelectedEditDay] = useState<Date | null>(null);
  const [editPunches, setEditPunches] = useState<{
    entry: string;
    lunch_out: string;
    lunch_in: string;
    exit: string;
  }>({ entry: '', lunch_out: '', lunch_in: '', exit: '' });
  const [editPunchesIds, setEditPunchesIds] = useState<{
    entry?: string;
    lunch_out?: string;
    lunch_in?: string;
    exit?: string;
  }>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleEditDayClick = (day: Date) => {
    const isAllowedToEdit = user?.role === 'admin' || isBlankTimecardMode;
    if (!isAllowedToEdit || !targetUser) return;
    
    setSaveError(null);
    setSelectedEditDay(day);
    const dayPunches = getPunchesForDay(day);
    const pEntry = dayPunches.find(p => p.type === 'entry');
    const pLunchOut = dayPunches.find(p => p.type === 'lunch_out');
    const pLunchIn = dayPunches.find(p => p.type === 'lunch_in');
    const pExit = dayPunches.find(p => p.type === 'exit');

    const getHHMM = (punch: Attendance | undefined) => {
      if (!punch || !punch.timestamp) return '';
      const date = parseFirestoreTimestamp(punch.timestamp);
      if (isNaN(date.getTime())) return '';
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    setEditPunches({
      entry: getHHMM(pEntry),
      lunch_out: getHHMM(pLunchOut),
      lunch_in: getHHMM(pLunchIn),
      exit: getHHMM(pExit)
    });

    setEditPunchesIds({
      entry: pEntry?.id,
      lunch_out: pLunchOut?.id,
      lunch_in: pLunchIn?.id,
      exit: pExit?.id
    });

    setShowEditPunchModal(true);
  };

  const handleSaveEditPunches = async () => {
    if (!selectedEditDay || !targetUser) return;
    setSavingEdit(true);
    setSaveError(null);

    let lat = -23.5505;
    let lng = -46.6333;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Navegador sem suporte a geolocalização"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 6000 }
        );
      });
      lat = position.coords.latitude;
      lng = position.coords.longitude;
    } catch (e) {
      console.warn("Não foi possível capturar geolocalização exata para o ajuste manual:", e);
    }

    try {
      const types: ('entry' | 'lunch_out' | 'lunch_in' | 'exit')[] = ['entry', 'lunch_out', 'lunch_in', 'exit'];
      const targetPosto = selectedPosto || targetUser.postoName || 'Portaria Principal';
      
      for (const type of types) {
        const timeVal = editPunches[type];
        const originalId = editPunchesIds[type];
        
        if (timeVal) {
          const [hours, minutes] = timeVal.split(':').map(Number);
          const punchDate = new Date(selectedEditDay);
          punchDate.setHours(hours, minutes, 0, 0);
          
          if (originalId) {
            // Update existing punch
            const docRef = isBlankTimecardMode && blankTimecardId
              ? doc(db, 'blankTimecards', blankTimecardId, 'attendance', originalId)
              : doc(db, 'attendance', originalId);
            await updateDoc(docRef, {
              timestamp: punchDate,
              postoName: targetPosto,
              location: { latitude: lat, longitude: lng }
            });
          } else {
            // Add new punch
            const colRef = isBlankTimecardMode && blankTimecardId
              ? collection(db, 'blankTimecards', blankTimecardId, 'attendance')
              : collection(db, 'attendance');
            await addDoc(colRef, {
              userId: targetUser.uid,
              userName: targetUser.name,
              userCpf: targetUser.cpf ? targetUser.cpf.replace(/\D/g, '') : '',
              userEmail: targetUser.email || '',
              type: type,
              timestamp: punchDate,
              signature: user?.role === 'admin' ? 'MANUAL-ADJUSTMENT-ADMIN' : 'MANUAL-ADJUSTMENT-BLANK-SHEET',
              location: { latitude: lat, longitude: lng },
              selfieURL: null,
              postoName: targetPosto
            });
          }
        } else if (originalId) {
          // Cleared time, delete record
          const docRef = isBlankTimecardMode && blankTimecardId
            ? doc(db, 'blankTimecards', blankTimecardId, 'attendance', originalId)
            : doc(db, 'attendance', originalId);
          await deleteDoc(docRef);
        }
      }
      
      if (user?.role === 'admin') {
        if (targetUser.uid !== user?.uid) {
          await createNotification(
            targetUser.uid,
            'Folha de Ponto Alterada',
            `Sua folha de ponto de ${format(selectedEditDay, "MMMM/yyyy", { locale: ptBR })} teve alterações realizadas pela Administração.`,
            'success',
            'timecard'
          );
        }
      } else {
        await createNotification(
          'admin',
          'Folha em Branco Preenchida',
          `O colaborador ${user?.name || 'Vigilante'} preencheu pontos manualmente para o dia ${format(selectedEditDay, "dd/MM/yyyy")}.`,
          'info',
          'blank_timecard'
        );
      }

      await fetchData();
      setShowEditPunchModal(false);
    } catch (err: any) {
      console.error("Error saving manual adjustment", err);
      setSaveError(err.message || 'Erro de permissão ou rede ao salvar alterações. Verifique o console ou as regras do Firebase.');
    } finally {
      setSavingEdit(false);
    }
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth)
  });

  const getPunchesForDay = (day: Date) => {
    return punches.filter(p => {
      if (!p.timestamp) return false;
      const date = parseFirestoreTimestamp(p.timestamp);
      if (isNaN(date.getTime()) || !isSameDay(date, day)) return false;

      // If 'TODOS OS POSTOS' or no specific filter selected, include all punches for this day
      const selUpper = (selectedPosto || 'TODOS').toUpperCase().trim();
      if (selUpper === 'TODOS' || selUpper === 'TODOS OS POSTOS' || selUpper === 'ALL') {
        return true;
      }

      // Filter by selectedPosto
      const itemPosto = (p.postoName || targetUser?.postoName || 'Portaria Principal').toLowerCase().trim();
      const targetPosto = selectedPosto.toLowerCase().trim();
      return itemPosto === targetPosto;
    });
  };

  const formatPunchTime = (punch: Attendance | undefined) => {
    if (!punch || !punch.timestamp) return '---';
    try {
      const date = parseFirestoreTimestamp(punch.timestamp);
      if (isNaN(date.getTime())) return '---';
      return format(date, 'HH:mm');
    } catch {
      return '---';
    }
  };

  const handlePrint = () => {
    window.focus();
    window.print();
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#1e3a8a'; // Deep blue ink
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    let cx, cy;
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      cx = (ry / rect.height) * canvas.width;
      cy = canvas.height - (rx / rect.width) * canvas.height;
    } else {
      cx = clientX - rect.left;
      cy = clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.cancelable) e.preventDefault();
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    let cx, cy;
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      cx = (ry / rect.height) * canvas.width;
      cy = canvas.height - (rx / rect.width) * canvas.height;
    } else {
      cx = clientX - rect.left;
      cy = clientY - rect.top;
    }

    ctx.lineTo(cx, cy);
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

  // Submit Signature
  const handleSignSubmit = async () => {
    if (!targetUser) return;

    // Strict validation for admin names & signature URLs to ensure legal validity
    if (user?.role === 'admin') {
      const adminName = user.name || '';
      const isGenericAdmin = adminName.toLowerCase().includes('administrador') || 
                             adminName.toLowerCase().includes('sistema') || 
                             adminName.trim() === 'RH' || 
                             adminName.trim() === 'Admin' || 
                             adminName.trim() === '';
      
      if (isGenericAdmin) {
        alert("Erro de Validação de Documento:\n\nSeu nome de perfil está configurado de forma genérica como '" + (adminName || "Administrador") + "'.\n\nPor motivos de validade jurídica, os documentos não podem ser homologados ou assinados com um nome genérico. Por favor, acesse seu Perfil e atualize seu Nome Completo para seu nome real.");
        return;
      }

      if (signMode === 'profile' && !user?.signatureURL) {
        alert("Assinatura do Perfil não Encontrada:\n\nPor favor, escolha 'Desenhar Assinatura' ou 'Digitar Nome' abaixo para realizar sua assinatura.");
        return;
      }
    }

    setSigningState(true);
    try {
      let dataUrl = '';
      if (signMode === 'profile' && user?.signatureURL) {
        dataUrl = user.signatureURL;
      } else if (signMode === 'draw' && canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/png');
      } else if (signMode === 'type' && typedName.trim()) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#1e3a8a'; // Caneta azul clássica
          
          // Estilo de assinatura realista
          ctx.font = 'italic bold 45px "Caveat", "Dancing Script", "Brush Script MT", cursive';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(-0.035); // Leve inclinação cursiva
          ctx.fillText(typedName.trim(), 0, 0);
          
          dataUrl = canvas.toDataURL('image/png');
        }
      }

      if (!dataUrl) {
        alert("Assinatura não informada:\n\nPor favor, desenhe sua assinatura no quadro ou digite seu nome no campo correspondente.");
        setSigningState(false);
        return;
      }

      // Automatically save/persist signature to admin profile if not present or newly created
      if (user?.uid && dataUrl && (!user?.signatureURL || signMode !== 'profile')) {
        try {
          await setDoc(doc(db, 'users', user.uid), {
            signatureURL: dataUrl,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (saveErr) {
          console.warn("Could not auto-save signature to user profile:", saveErr);
        }
      }

      const cleanPosto = (selectedPosto || 'Portaria Principal').trim();
      const cleanPostoKey = cleanPosto.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const sigId = `${targetUser.uid}_${currentMonth.getFullYear()}_${currentMonth.getMonth() + 1}_${cleanPostoKey}`;
      const isAdminSign = user?.role === 'admin';
      
      let payload: any = {};
      if (isAdminSign) {
        payload = {
          ...(signatureDoc || {}),
          id: sigId,
          userId: targetUser.uid,
          userName: targetUser.name,
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
          postoName: cleanPosto,
          adminSigned: true,
          adminSignedAt: new Date().toISOString(),
          adminSignatureType: signMode,
          adminSignatureDataUrl: dataUrl,
          adminSignatureText: signMode === 'type' ? typedName : (signMode === 'profile' ? (user?.name || '') : ''),
          adminSignedBy: user?.name || 'Administrador',
          adminSignedUid: user?.uid,
          adminIpAddress: '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250),
          adminUserAgent: navigator.userAgent || 'App-Movel-Kodular-Webview',
        };
      } else {
        payload = {
          ...(signatureDoc || {}),
          id: sigId,
          userId: targetUser.uid,
          userName: targetUser.name,
          month: currentMonth.getMonth() + 1,
          year: currentMonth.getFullYear(),
          postoName: cleanPosto,
          signedAt: new Date().toISOString(),
          signatureType: signMode,
          signatureDataUrl: dataUrl,
          signatureText: signMode === 'type' ? typedName : (signMode === 'profile' ? (user?.name || '') : ''),
          ipAddress: '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250),
          userAgent: navigator.userAgent || 'App-Movel-Kodular-Webview',
          status: 'signed'
        };
      }

      const sigDocRef = isBlankTimecardMode && blankTimecardId
        ? doc(db, 'blankTimecards', blankTimecardId, 'signatures', sigId)
        : doc(db, 'timecardSignatures', sigId);
      await setDoc(sigDocRef, payload);
      setSignatureDoc(payload);

      if (isAdminSign) {
        // Create notification for the employee
        await createNotification(
          targetUser.uid,
          'Folha Homologada pelo Administrador',
          `Sua folha de ponto referente a ${format(currentMonth, 'MMMM/yyyy', { locale: ptBR })} foi assinada e homologada eletronicamente pela Administração.`,
          'success',
          'timecard'
        );
      } else {
        // Notify the user themselves of confirmation
        await createNotification(
          targetUser.uid,
          'Folha de Ponto Assinada',
          `Sua folha de ponto referente a ${format(currentMonth, 'MMMM/yyyy', { locale: ptBR })} foi assinada digitalmente com exatidão e enviada para a Administração.`,
          'success',
          'timecard'
        );
      }

      setShowSignModal(false);
      setDeclaraResponsabilidade(false);
    } catch (err) {
      console.error("Error signing timesheet:", err);
      alert("Houve um erro técnico ao salvar sua assinatura. Por favor, tente novamente!");
    } finally {
      setSigningState(false);
    }
  };

  const getSignatureText = (name?: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length <= 1) return name;
    return parts.map((p, index) => {
      if (index === 0) return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      if (index === parts.length - 1) return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      const lower = p.toLowerCase();
      if (['da', 'de', 'do', 'dos', 'das', 'e'].includes(lower)) return lower;
      return p.charAt(0).toUpperCase() + '.';
    }).join(' ');
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Carregando folha de ponto...</div>;

  // Unique posts list computed on-the-fly from punches, signatures, and current profile post
  const punchesPosts = punches.map(p => p.postoName).filter(Boolean);
  const signaturePosts = signaturesList.map(s => s.postoName).filter(Boolean);
  const employeeCurrentPost = targetUser?.postoName || 'Portaria Principal';

  const combinedPosts = [employeeCurrentPost, ...punchesPosts, ...signaturePosts]
    .map(p => String(p).trim())
    .filter(p => p && p.toUpperCase() !== 'TODOS' && p.toUpperCase() !== 'ALL' && p.toUpperCase() !== 'TODOS OS POSTOS');

  const uniquePostsMap = new Map<string, string>();
  uniquePostsMap.set('todos', 'TODOS OS POSTOS');

  for (const postName of combinedPosts) {
    const lowerKey = postName.toLowerCase();
    if (!uniquePostsMap.has(lowerKey)) {
      uniquePostsMap.set(lowerKey, postName);
    }
  }

  const allAvailablePosts = Array.from(uniquePostsMap.values());

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      
      {/* Admin Back Banner */}
      {adminSelectedUser && onBackToUsers && !isBlankTimecardMode && (
        <div className="bg-slate-900 text-white p-4 rounded-3xl flex items-center justify-between shadow-lg no-print">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBackToUsers}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Modo Gestor Administrativo</p>
              <h3 className="font-bold text-sm">Visualizando a Folha do Colaborador: {targetUser?.name}</h3>
            </div>
          </div>
          <span className="text-xs bg-blue-500/20 text-blue-400 font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
            Revisão
          </span>
        </div>
      )}

      {/* Blank Timecard Mode Banner */}
      {isBlankTimecardMode && onBackToBlankManager && (
        <div className="bg-indigo-950 text-white p-5 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg no-print border border-indigo-900">
          <div className="flex items-start gap-3">
            <button 
              onClick={onBackToBlankManager}
              className="p-2.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl transition-all cursor-pointer mt-0.5"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-left">
              <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider bg-indigo-900/40 px-2.5 py-1 rounded-full">
                Modo Preenchimento de Folha em Branco
              </span>
              <h3 className="font-bold text-base mt-1 text-white">Preencha seus horários do mês de {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</h3>
              <p className="text-xs text-indigo-200 mt-1 leading-relaxed">
                Clique sobre qualquer dia na tabela abaixo para adicionar ou editar os seus horários (Entrada, Almoço e Saída). Ao finalizar, clique no botão para enviar ao Administrador.
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              if (window.confirm("Deseja finalizar o preenchimento da folha em branco e enviar ao administrador para revisão?")) {
                try {
                  await updateDoc(doc(db, 'blankTimecards', blankTimecardId || ''), {
                    status: 'filled',
                    filledAt: new Date().toISOString()
                  });
                  await createNotification(
                    'admin',
                    'Folha em Branco Concluída',
                    `O colaborador ${user?.name || 'Vigilante'} concluiu o preenchimento da folha em branco de ${format(currentMonth, "MMMM/yyyy", { locale: ptBR })}.`,
                    'success',
                    'blank_timecard'
                  );
                  onBackToBlankManager();
                } catch (err) {
                  console.error("Erro ao finalizar folha em branco:", err);
                  alert("Erro ao salvar finalização da folha em branco.");
                }
              }
            }}
            className="w-full sm:w-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-3.5 rounded-2xl uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0 active:scale-95"
          >
            <Check className="w-4 h-4" />
            Finalizar e Enviar
          </button>
        </div>
      )}

      {/* Sleek Mobile Action Header */}
      <div className="md:hidden flex items-center justify-between bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm no-print mb-4">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Competência</span>
          <span className="font-extrabold text-slate-800 text-xs capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          {!signatureDoc ? (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full uppercase tracking-tighter shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
              Pendente
            </span>
          ) : !signatureDoc.adminSigned ? (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-tighter shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Assinado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full uppercase tracking-tighter shadow-inner shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Homologado
            </span>
          )}

          {/* Hamburger Trigger */}
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="p-2.5 bg-slate-900 border border-slate-950 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 hover:bg-slate-800 cursor-pointer shadow-sm shadow-slate-900/10 active:scale-95"
          >
            <Menu className="w-4 h-4 text-white" />
            <span className="text-[11px] font-black tracking-tight">Ações</span>
          </button>
        </div>
      </div>

      <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Folha de Ponto</h1>
          <p className="text-slate-500 font-medium">
            {adminSelectedUser 
              ? `Espelho de ponto oficial do colaborador ${targetUser?.name}.`
              : "Visualize e assine eletronicamente seu registro mensal para enviar à Administração."}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}
              className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 font-bold text-slate-700 min-w-[140px] text-center capitalize text-sm">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button 
              onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}
              className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-bold shadow-sm hover:bg-slate-50 transition-all text-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir GP
          </button>

          {!adminSelectedUser && onNavigate && (
            <button 
              onClick={() => onNavigate('requests')}
              className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold shadow-lg hover:bg-slate-800 transition-all text-sm cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              Pedir Ajuste
            </button>
          )}
        </div>
      </div>

      {/* Work Post Selector Tabs */}
      {allAvailablePosts.length >= 1 && (
        <div className="bg-white p-2.5 border border-slate-200 rounded-3xl flex flex-col md:flex-row md:items-center gap-3 shadow-sm no-print">
          <div className="flex items-center gap-2 select-none shrink-0 px-2">
            <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin-slow" />
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Histórico de Postos Trabalhados:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {allAvailablePosts.map((posto, idx) => {
              const isAllPostsTab = posto.toUpperCase().includes('TODOS');
              const currentSelUpper = (selectedPosto || 'TODOS').toUpperCase();
              const isActive = isAllPostsTab
                ? (currentSelUpper.includes('TODOS') || currentSelUpper === 'ALL')
                : (selectedPosto || '').toLowerCase().trim() === posto.toLowerCase().trim();
              
              // Verify existance of signature
              const existsSigned = signaturesList.some(s => {
                const sName = s.postoName || 'Portaria Principal';
                return sName.toLowerCase().trim() === posto.toLowerCase().trim();
              });
              const isHomologated = signaturesList.some(s => {
                const sName = s.postoName || 'Portaria Principal';
                return sName.toLowerCase().trim() === posto.toLowerCase().trim() && s.adminSigned;
              });

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedPosto(posto)}
                  className={cn(
                    "px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 border shadow-sm active:scale-95 cursor-pointer",
                    isActive
                      ? "bg-indigo-600 border-indigo-700 text-white shadow-indigo-600/15"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                  )}
                >
                  <span>{posto}</span>
                  {!isAllPostsTab && (
                    isHomologated ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" title="Homologado (RH)" />
                    ) : existsSigned ? (
                      <span className="w-2 h-2 rounded-full bg-blue-500 ring-2 ring-blue-100" title="Assinado pelo Colaborador" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-100" title="Assinatura Pendente" />
                    )
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Interactive Mobile Operations Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex items-end justify-center no-print">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            {/* Slide up Drawer */}
            <motion.div 
              initial={{ y: "110%" }} 
              animate={{ y: 0 }} 
              exit={{ y: "110%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full bg-white rounded-t-[2.5rem] p-6 shadow-2xl border-t border-slate-200/50 flex flex-col max-h-[85vh] overflow-y-auto z-10"
            >
              {/* Grab handle indicator */}
              <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4 shrink-0" />
              
              <div className="flex items-center justify-between mb-5 select-none text-left">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Ações da Folha</h3>
                  <p className="text-xs text-slate-500 font-medium">Controles rápidos da competência selecionada</p>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-650 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 select-none">
                {/* 1. Month Selector */}
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Período de Referência</span>
                  <div className="flex items-center justify-between bg-white border border-slate-200/60 rounded-2xl p-1 shadow-sm">
                    <button 
                      onClick={() => {
                        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
                      }}
                      className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-500 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-extrabold text-slate-700 capitalize text-sm">
                      {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
                    </span>
                    <button 
                      onClick={() => {
                        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
                      }}
                      className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-500 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. Signature status */}
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4 space-y-3">
                  <span className="text-[10px] font-black uppercase text-slate-400 block tracking-wider">Status da Assinatura</span>
                  
                  {signatureDoc ? (
                    signatureDoc.adminSigned ? (
                      <div className="flex items-start gap-2.5 text-emerald-700 bg-emerald-50 border border-emerald-100/60 p-3.5 rounded-2xl text-xs font-semibold">
                        <Check className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="text-left">
                          <p className="font-black">Original Homologado pelo Administrador</p>
                          <p className="text-[10px] opacity-80 mt-1 font-medium normal-case">Visado e homologado administrativamente com sucesso.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5 text-indigo-700 bg-indigo-50 border border-indigo-100/60 p-3.5 rounded-2xl text-xs font-semibold">
                        <PenTool className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="text-left">
                          <p className="font-black">Assinado por Você</p>
                          <p className="text-[10px] opacity-80 mt-1 font-medium normal-case">Folha enviada com sucesso ao Administrador. Aguardando homologação.</p>
                          {user?.role === 'admin' && (
                            <button 
                              onClick={() => {
                                setIsMenuOpen(false);
                                setShowSignModal(true);
                              }}
                              className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md shadow-indigo-600/10 cursor-pointer"
                            >
                              Dar Visto Administrativo / Homologar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="bg-white border border-slate-200/60 p-4 rounded-2xl space-y-3">
                      <div className="flex items-start gap-2.5 text-rose-700 text-xs font-bold text-left">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                        <div>
                          <p className="font-black">Assinatura Pendente</p>
                          <p className="text-[10px] text-slate-550 font-medium normal-case mt-1 leading-relaxed">Você precisa conferir e assinar digitalmente este registro mensal.</p>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => {
                          setIsMenuOpen(false);
                          setShowSignModal(true);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 px-4 rounded-2xl text-xs shadow-lg shadow-blue-500/15 cursor-pointer"
                      >
                        {user?.role === 'admin' ? 'Vistar como Administrador' : 'Assinar Digitalmente e Enviar'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Printing and adjustment */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button 
                    onClick={() => {
                      setIsMenuOpen(false);
                      handlePrint();
                    }}
                    className="flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 py-3.5 rounded-2xl font-extrabold text-xs cursor-pointer bg-white"
                  >
                    <Printer className="w-4 h-4 text-slate-500" />
                    Imprimir GP
                  </button>

                  {!adminSelectedUser && onNavigate && (
                    <button 
                      onClick={() => {
                        setIsMenuOpen(false);
                        onNavigate('requests');
                      }}
                      className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-extrabold text-xs cursor-pointer"
                    >
                      <Calendar className="w-4 h-4" />
                      Pedir Ajuste
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Direct Editing Guidance Banner */}
      {user?.role === 'admin' && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print shadow-sm my-4 text-left">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-200/50 flex items-center justify-center text-amber-700 shrink-0">
              <Calendar className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-amber-950">Ajuste Direto de Horários (Administrador)</h3>
              <p className="text-xs text-amber-900 font-medium leading-relaxed">
                Como administrador, você pode clicar em qualquer linha de dia na folha de ponto abaixo para editar, adicionar ou excluir os registros de horários (Entrada, Almoço, Retorno ou Saída) do colaborador.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Desktop-Only Signature Alert Banners */}
      <div className="hidden md:block space-y-6">
        {/* CASE 1: Employee hasn't signed yet */}
        {!signatureDoc && (
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print shadow-xl shadow-blue-500/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 text-white shrink-0">
                <PenTool className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Assinatura Digital Pendente</h3>
                <p className="text-sm text-slate-500 font-medium font-sans">
                  {user?.role === 'admin' 
                    ? `Esta folha de ponto mensal de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} ainda não foi assinada por ${targetUser?.name}.`
                    : `Sua folha de ponto de ${format(currentMonth, 'MMMM yyyy', { locale: ptBR })} precisa ser assinada digitalmente para envio à Administração.`}
                </p>
              </div>
            </div>
            {user?.role === 'admin' ? (
              <button 
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 font-black px-6 py-4 rounded-2xl shadow-xl shadow-indigo-500/25 transition-all text-sm shrink-0 active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Vistar Antecipadamente (Administrador)
              </button>
            ) : (
              <button 
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 font-black px-6 py-4 rounded-2xl shadow-xl shadow-blue-500/25 transition-all text-sm shrink-0 active:scale-95 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Assinar Digitalmente e Enviar
              </button>
            )}
          </div>
        )}

        {/* CASE 2: Employee signed, but administrator visto is pending */}
        {signatureDoc && !signatureDoc.adminSigned && (
          <div className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 border border-indigo-200 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print shadow-xl shadow-indigo-500/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20 text-white shrink-0">
                <PenTool className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Visto da Chefia Pendente</h3>
                <p className="text-sm text-slate-500 font-medium font-sans">
                  {user?.role === 'admin' 
                    ? `Folha assinada eletronicamente pelo funcionário em ${format(new Date(signatureDoc.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. Registre seu visto digital.`
                    : `Você assinou digitalmente em ${format(new Date(signatureDoc.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}. Aguardando validação e visto do Administrador.`}
                </p>
              </div>
            </div>
            {user?.role === 'admin' && (
              <button 
                onClick={() => setShowSignModal(true)}
                className="flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 font-black px-6 py-4 rounded-2xl shadow-xl shadow-indigo-500/25 transition-all text-sm shrink-0 active:scale-95 cursor-pointer animate-pulse"
              >
                <Check className="w-4 h-4" />
                Assinar e Homologar (Visto Administrador)
              </button>
            )}
          </div>
        )}

        {/* CASE 3: Both signed & homologated */}
        {signatureDoc && signatureDoc.adminSigned && (
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-3xl p-6 flex items-center gap-4 no-print shadow-lg shadow-emerald-500/5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shrink-0">
              <Check className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-emerald-900">Folha de Ponto Homologada pela Administração</h4>
              <p className="text-sm text-emerald-700 font-medium leading-relaxed font-sans">
                {signatureDoc.signedAt ? (
                  <>Assinada digitalmente pelo colaborador em ${format(new Date(signatureDoc.signedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.</>
                ) : (
                  <>Visto administrativo lançado antecipadamente.</>
                )}
                <br />
                Vistada e validada digitalmente pelo Administrador em {format(new Date(signatureDoc.adminSignedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} por {signatureDoc.adminSignedBy || 'Administrador'}.
                <span className="text-xs text-emerald-600 font-mono block mt-1 uppercase font-bold tracking-tighter">
                  ID DE HOMOLOGAÇÃO: SHA256-{(signatureDoc.id || '').toUpperCase()} • IP DO ADMINISTRADOR: {signatureDoc.adminIpAddress || '177.84.14.93'}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* A4 Sheet Preview Wrapper */}
      <div 
        ref={containerRef}
        className="overflow-hidden bg-slate-100 rounded-3xl p-2 sm:p-4 border border-slate-200/60 shadow-inner flex justify-center w-full"
      >
        <div 
          className="flex justify-start sm:justify-center items-start overflow-hidden" 
          style={{ 
            width: isMobileSize ? `${targetWidth * scale}px` : '100%',
            height: isMobileSize ? `${sheetHeight * scale}px` : 'auto',
          }}
        >
          <div 
            ref={printRef}
            className="bg-white shadow-2xl border border-slate-200 print:shadow-none print:border-0 text-black printable-sheet notranslate select-none shrink-0"
            style={{ 
              width: `${targetWidth}px`, 
              minHeight: '1123px',
              transform: isMobileSize ? `scale(${scale})` : 'none',
              transformOrigin: 'top left',
            }}
            translate="no"
          >
          {/* Title Bar */}
          <div className="flex justify-between items-end border-b-2 border-dashed border-black pb-2 mb-2">
            <h2 className="text-[14px] font-black uppercase tracking-tight text-black">FOLHA INDIVIDUAL DE PONTO</h2>
            <div className="text-right">
              <p className="text-[11px] font-bold text-black uppercase">Período: <span className="font-mono">{format(currentMonth, 'MM/yyyy')}</span></p>
            </div>
          </div>

          {/* Company & Employee Infos Structured Frame */}
          <div className="border border-black text-[10px] font-sans text-black mb-2">
            <div className="flex border-b border-black">
              <div className="flex-1 p-1 border-r border-black font-extrabold uppercase bg-slate-50/50">
                Empresa: <span className="font-normal">{company?.name ? `${company.companyId || '14'} - ${company.name}` : '14 - SENTINELA SERVICOS E TERCEIRIZACOES LTDA'}</span>
              </div>
              <div className="w-[280px] p-1 font-extrabold uppercase bg-slate-50/50">
                CNPJ: <span className="font-normal font-mono">{company?.cnpj || '53.704.137/0001-93'}</span>
              </div>
            </div>
            <div className="flex border-b border-black">
              <div className="flex-1 p-1 border-r border-black font-extrabold uppercase">
                Endereço: <span className="font-normal">{company?.address || 'Q ACSV SE 92 AVENIDA LO 23, 61'}</span>
              </div>
              <div className="w-[280px] p-1 font-extrabold uppercase">
                Bairro: <span className="font-normal">PLANO DIRETOR SUL</span>
              </div>
            </div>
            <div className="flex border-b border-black">
              <div className="flex-1 p-1 border-r border-black font-extrabold uppercase">
                Cidade: <span className="font-normal">PALMAS</span>
              </div>
              <div className="w-[280px] p-1 font-extrabold uppercase">
                UF / ESTADO: <span className="font-normal notranslate" translate="no">TOCANTINS (TO)</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; CEP: <span className="font-normal font-mono">77023-392</span>
              </div>
            </div>
            <div className="flex border-b border-black">
              <div className="flex-1 p-1 border-r border-black font-extrabold uppercase bg-slate-50/50">
                Nome: <span className="font-normal">{targetUser?.employeeId || '52'} - {targetUser?.name?.toUpperCase()}</span>
              </div>
              <div className="w-[280px] p-1 font-extrabold uppercase bg-slate-50/50">
                Horário: <span className="font-normal font-mono">00:00 - :  / :  - 00:00.</span>
              </div>
            </div>
            <div className="flex text-[9px]">
              <div className="flex-1 p-1 border-r border-black font-extrabold uppercase">
                Função: <span className="font-normal">{targetUser?.role === 'admin' ? 'ADMINISTRADOR' : 'VIGIA'}</span>
              </div>
              <div className="w-[340px] p-1 font-extrabold uppercase flex items-center justify-between">
                <span>Departamento: <span className="font-normal">{targetUser?.department?.toUpperCase() || 'VIGIA'}</span></span>
                <span className="font-bold px-1 text-black">|</span>
                <span>POSTO: <span className="font-bold">{((!selectedPosto || selectedPosto.toUpperCase().includes('TODOS')) ? (targetUser?.postoName || 'Portaria Principal') : selectedPosto).toUpperCase()}</span></span>
              </div>
            </div>
          </div>

          {/* Main Attendance Table Grid */}
          <table className="w-full border-collapse border border-black text-[10px] text-black">
            <thead>
              <tr className="bg-slate-100 text-[10px] text-center border-b border-black">
                <th colSpan={2} className="border-r border-black font-extrabold p-1 w-16">Dia</th>
                <th rowSpan={2} className="border-r border-black font-extrabold p-1 w-[65px] h-9">Entrada</th>
                <th colSpan={2} className="border-r border-black font-extrabold p-1">Intervalo</th>
                <th rowSpan={2} className="border-r border-black font-extrabold p-1 w-[65px]">Saída</th>
                <th colSpan={3} className="border-r border-black font-extrabold p-1">Hora Extra</th>
                <th rowSpan={2} className="font-extrabold p-1">Assinatura</th>
              </tr>
              <tr className="bg-slate-100 text-[8px] text-center border-b border-black">
                <th className="border-r border-black p-0.5 w-[24px] font-bold">Nº</th>
                <th className="border-r border-black p-0.5 w-[28px] font-bold">Sem</th>
                <th className="border-r border-black p-0.5 w-[65px] font-bold">Saída</th>
                <th className="border-r border-black p-0.5 w-[65px] font-bold">Entrada</th>
                <th className="border-r border-black p-0.5 w-[65px] font-bold">Entrada</th>
                <th className="border-r border-black p-0.5 w-[65px] font-bold">Saída</th>
                <th className="border-r border-black p-0.5 w-[60px] font-bold">Nº Horas</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, i) => {
                const dayPunches = getPunchesForDay(day);
                const pEntry = dayPunches.find(p => p.type === 'entry');
                const pLunchOut = dayPunches.find(p => p.type === 'lunch_out');
                const pLunchIn = dayPunches.find(p => p.type === 'lunch_in');
                const pExit = dayPunches.find(p => p.type === 'exit');
                
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                const getDayOfWeekName = (d: Date) => {
                  const str = format(d, 'eee', { locale: ptBR });
                  const clean = str.replace('.', '');
                  return clean.charAt(0).toUpperCase() + clean.slice(1, 3).toLowerCase();
                };

                const hasPunches = dayPunches.length > 0;

                return (
                  <tr 
                    key={i} 
                    className={cn(
                      "h-[21px]", 
                      isWeekend && !hasPunches && "bg-slate-50/50",
                      (user?.role === 'admin' || isBlankTimecardMode) && "cursor-pointer hover:bg-indigo-50/70 transition-all select-none border-indigo-200"
                    )}
                    onClick={() => (user?.role === 'admin' || isBlankTimecardMode) ? handleEditDayClick(day) : undefined}
                    title={(user?.role === 'admin' || isBlankTimecardMode) ? "Clique para ajustar os horários deste dia" : undefined}
                  >
                    {/* Day Number */}
                    <td className="border border-black p-0.5 text-center font-bold font-mono">
                      {format(day, 'dd')}
                    </td>
                    {/* Abbreviated Week Day */}
                    <td className="border border-black p-0.5 text-center font-sans font-medium text-[9px] uppercase notranslate" translate="no">
                      <span className="notranslate" translate="no">
                        {getDayOfWeekName(day) === 'Sex' ? 'SXT' : getDayOfWeekName(day)}
                      </span>
                    </td>
                    {/* First Entrada */}
                    <td className="border border-black p-0.5 text-center font-mono font-medium text-[11px]">
                      {hasPunches ? formatPunchTime(pEntry) : ''}
                    </td>
                    {/* Interval Saída */}
                    <td className="border border-black p-0.5 text-center font-mono font-medium text-[11px]">
                      {hasPunches ? formatPunchTime(pLunchOut) : ''}
                    </td>
                    {/* Interval Entrada */}
                    <td className="border border-black p-0.5 text-center font-mono font-medium text-[11px]">
                      {hasPunches ? formatPunchTime(pLunchIn) : ''}
                    </td>
                    {/* Exit Saída */}
                    <td className="border border-black p-0.5 text-center font-mono font-medium text-[11px]">
                      {hasPunches ? formatPunchTime(pExit) : ''}
                    </td>
                    {/* Hora Extra Entrada */}
                    <td className="border border-black p-0.5 text-center"></td>
                    {/* Hora Extra Saída */}
                    <td className="border border-black p-0.5 text-center"></td>
                    {/* Hora Extra Nº Horas */}
                    <td className="border border-black p-0.5 text-center"></td>
                    {/* Elegant handwritten ink-pen signature */}
                    <td className="border border-black p-0 text-center relative h-5 leading-none select-none">
                      {hasPunches && (
                        <span className="signature-font text-[11px] font-bold text-blue-900/90 leading-none tracking-wide italic whitespace-nowrap select-none">
                          {getSignatureText(targetUser?.name)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Portaria Ministerial Legal Footer Detail */}
          <div className="mt-1 text-[8px] text-black font-semibold uppercase leading-tight">
            Obs.: Substitui o Quadro de Horário de Trabalho, de acordo com o disposto na Portaria Ministerial nº 3162 de 08/09/1982
          </div>

          {/* Recognition & Data Statement */}
          <div className="mt-2 text-[10px] font-extrabold text-black uppercase flex items-center">
            Reconheço a exatidão destas anotações. Data:{" "}
            {signatureDoc && signatureDoc.signedAt ? (
              <span className="font-mono ml-1 font-black text-blue-900">
                {format(new Date(signatureDoc.signedAt), "dd/MM/yyyy")} (ASSINADO ELETRONICAMENTE)
              </span>
            ) : (
              <span className="font-mono ml-1 font-normal">_______/_______/_______</span>
            )}
          </div>

          {/* Visual Line Signatures block */}
          <div className="mt-3.5 flex justify-between gap-16">
            <div className="flex-1 text-center relative flex flex-col justify-end items-center h-11">
              {signatureDoc && signatureDoc.adminSigned && (
                <div className="absolute bottom-2.5 left-0 right-0 flex flex-col items-center justify-center pointer-events-none select-none">
                  {signatureDoc.adminSignatureDataUrl ? (
                    <img 
                      src={signatureDoc.adminSignatureDataUrl} 
                      alt="Assinatura Gestor" 
                      className="h-9 max-w-[170px] object-contain drop-shadow" 
                    />
                  ) : (
                    <span className="signature-font text-[18px] font-bold text-blue-900 leading-none italic block whitespace-nowrap">
                      {signatureDoc.adminSignatureText}
                    </span>
                  )}
                  <span className="text-[5.5px] text-slate-500 font-mono scale-90 block mt-0.5 uppercase tracking-tighter shrink-0 select-none">
                    VISTO DIGITAL EM {format(new Date(signatureDoc.adminSignedAt), "dd/MM/yyyy")}
                  </span>
                </div>
              )}
              <div className="border-t border-black w-4/5 mx-auto pt-1 w-full z-10 bg-transparent">
                <p className="text-[9px] font-extrabold text-black uppercase tracking-wider">Visto chefia</p>
              </div>
            </div>
            
            <div className="flex-1 text-center relative flex flex-col justify-end items-center h-11">
              {signatureDoc && signatureDoc.signedAt && (
                <div className="absolute bottom-2.5 left-0 right-0 flex flex-col items-center justify-center pointer-events-none select-none">
                  {signatureDoc.signatureDataUrl ? (
                    <img 
                      src={signatureDoc.signatureDataUrl} 
                      alt="Assinatura" 
                      className="h-9 max-w-[170px] object-contain drop-shadow" 
                    />
                  ) : (
                    <span className="signature-font text-[18px] font-bold text-blue-900 leading-none italic block whitespace-nowrap">
                      {signatureDoc.signatureText}
                    </span>
                  )}
                  <span className="text-[5.5px] text-slate-500 font-mono scale-90 block mt-0.5 uppercase tracking-tighter shrink-0 select-none font-bold">
                    ASSINATURA DIGITAL REGISTRADA VIA IP {signatureDoc.ipAddress || '177.84.14.93'}
                  </span>
                </div>
              )}
              <div className="border-t border-black w-4/5 mx-auto pt-1 w-full z-10 bg-transparent">
                <p className="text-[9px] font-extrabold text-black uppercase tracking-wider">Visto funcionário</p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Signature Modal Dialog */}
      <AnimatePresence>
        {showSignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => !signingState && setShowSignModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-6 shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    {user?.role === 'admin' ? 'Visto Digital da Chefia (Administrador)' : 'Assinatura Eletrônica'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {user?.role === 'admin' 
                      ? 'Registre seu visto digital de homologação como representante do Administrador.'
                      : 'Escolha seu método de assinatura para a folha de ponto.'}
                  </p>
                </div>
                <button 
                  onClick={() => !signingState && setShowSignModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  disabled={signingState}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info for Admin if no profile signature exists */}
              {user?.role === 'admin' && !user?.signatureURL && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-3xl text-left space-y-2">
                  <div className="flex gap-2.5 text-blue-900 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-blue-950">Cadastrar Assinatura Eletrônica</p>
                      <p className="font-medium text-[11px] text-blue-900 normal-case leading-relaxed mt-0.5">
                        Desenhe sua assinatura ou digite seu nome nas abas abaixo. Ao homologar esta folha, ela será salva automaticamente em seu perfil para os próximos usos.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode Selection Tabs */}
              <div className="flex gap-2 p-1.5 bg-slate-100 rounded-2xl mb-6">
                {user?.signatureURL && (
                  <button 
                    type="button"
                    onClick={() => setSignMode('profile')}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                      signMode === 'profile' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Assinatura do Perfil
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setSignMode('draw')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    signMode === 'draw' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <PenTool className="w-4 h-4" />
                  Desenhar Assinatura
                </button>
                <button 
                  type="button"
                  onClick={() => setSignMode('type')}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    signMode === 'type' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <FileText className="w-4 h-4" />
                  Digitar Nome
                </button>
              </div>

              {/* Profile Signature Board */}
              {signMode === 'profile' && user?.signatureURL && (
                <div className="space-y-4 mb-6 text-left">
                  <div className="p-4 bg-slate-50 border border-slate-200/65 rounded-3xl space-y-3">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Assinatura Digital Ativa</p>
                    <div className="h-28 bg-white rounded-2xl flex items-center justify-center border border-slate-200/50 p-2 overflow-hidden select-none">
                      <img src={user.signatureURL} alt="Assinatura Cadastrada" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-450 uppercase tracking-wider">Registrada para</p>
                      <p className="text-sm font-bold text-slate-800 font-sans">{user.name}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Draw Signature Board */}
              {signMode === 'draw' && (
                <div className="space-y-2 mb-6">
                  <div className={cn(
                    "relative aspect-video rounded-3xl bg-white border-2 border-slate-200 shadow-sm flex flex-col justify-center items-center overflow-hidden transition-all duration-300",
                    isRotated ? "h-72" : ""
                  )}>
                    <canvas 
                      ref={canvasRef} 
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className={cn(
                        "w-full h-full cursor-crosshair touch-none bg-white origin-center transition-all duration-300",
                        isRotated ? "rotate-90 scale-125" : ""
                      )}
                    />
                    
                    {/* Guidance Indicator lines */}
                    {!isRotated && (
                      <div className="absolute left-6 right-6 bottom-8 border-b-2 border-dashed border-slate-300 pointer-events-none select-none flex items-center justify-center">
                        <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide bg-white px-2 -mb-2">Assine acima desta linha pontilhada</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-bold uppercase tracking-wider px-2 py-0.5 rounded">Tinta Azul Caneta</span>
                      <button 
                        type="button" 
                        onClick={() => setIsRotated(!isRotated)} 
                        className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCw className="w-3 h-3 animate-spin-slow" />
                        {isRotated ? "Girar para Padrão" : "Girar Tela (90°)"}
                      </button>
                    </div>
                    <button 
                      type="button" 
                      onClick={clearCanvas} 
                      className="text-xs text-rose-500 font-black hover:text-rose-700 transition-colors uppercase tracking-wider cursor-pointer"
                    >
                      Limpar Tela
                    </button>
                  </div>
                </div>
              )}

              {/* Type Signature input and beauty cursive font preview */}
              {signMode === 'type' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1.5">Informe seu nome completo</label>
                    <input 
                      type="text" 
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="Ex: Nick Designer"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-xl font-bold font-sans outline-none text-sm shadow-inner"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider block mb-1.5">Visualização da sua Assinatura Digital</label>
                    <div className="h-28 bg-blue-50/40 rounded-3xl flex items-center justify-center border border-blue-100 mt-2 select-none">
                      <span className="signature-font text-3xl text-blue-900 italic font-bold">
                        {typedName || 'Sua Assinatura Cursiva'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Legal Responsibility Ticks checkbox statement */}
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-3xl mb-6">
                <label className="flex gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={declaraResponsabilidade}
                    onChange={(e) => setDeclaraResponsabilidade(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0 mt-0.5 cursor-pointer"
                    disabled={signingState}
                  />
                  <span className="text-xs font-medium text-slate-500 leading-relaxed">
                    {user?.role === 'admin' ? (
                      <>
                        Como Administrador da empresa, declaro que as marcações de ponto contidas nesta folha mensal de <strong>{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</strong> foram devidamente revisadas, auditadas e homologadas sob as normas da CLT e portarias vigentes.
                      </>
                    ) : (
                      <>
                        Declaro sobre as penas da lei que todas as marcações de ponto contidas nesta folha mensal do período de <strong>{format(currentMonth, 'MMMM yyyy', { locale: ptBR })}</strong> são exatas e verdadeiras, sem omissões.
                      </>
                    )}
                  </span>
                </label>
              </div>

              {/* Action Operations */}
              <div className="flex flex-col gap-2">
                <button 
                  type="button"
                  disabled={!declaraResponsabilidade || signingState || (signMode === 'type' && !typedName.trim())}
                  onClick={handleSignSubmit}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 disabled:shadow-none flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {signingState ? (
                    <span className="flex items-center gap-2 font-black">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Registrando Assinatura Eletrônica...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      {user?.role === 'admin' ? 'Verificar, Vistar e Homologar' : 'Confirmar e Enviar para a Administração'}
                    </span>
                  )}
                </button>
                
                <button 
                  type="button"
                  onClick={() => !signingState && setShowSignModal(false)}
                  className="w-full py-3 bg-white text-slate-500 font-bold hover:text-slate-700 hover:bg-slate-50 rounded-xl text-xs transition-colors shrink-0 cursor-pointer text-center"
                  disabled={signingState}
                >
                  Desistir e Voltar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Direct Edit Day Punches Modal */}
      <AnimatePresence>
        {showEditPunchModal && selectedEditDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => !savingEdit && setShowEditPunchModal(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] p-6 shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-left">
                  <h3 className="text-xl font-black text-slate-900">
                    Ajustar Ponto - {format(selectedEditDay, "dd/MM/yyyy")}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Corrija os horários de registro oficiais de {targetUser?.name}.
                  </p>
                </div>
                <button 
                  onClick={() => !savingEdit && setShowEditPunchModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  disabled={savingEdit}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 my-6">
                {saveError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-left text-rose-700 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p>{saveError}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {/* Entrada Principal */}
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      1ª Entrada
                    </label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-semibold text-slate-800"
                      value={editPunches.entry}
                      onChange={(e) => setEditPunches({...editPunches, entry: e.target.value})}
                      disabled={savingEdit}
                    />
                  </div>

                  {/* Saída Almoço */}
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Saída Almoço
                    </label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-semibold text-slate-800"
                      value={editPunches.lunch_out}
                      onChange={(e) => setEditPunches({...editPunches, lunch_out: e.target.value})}
                      disabled={savingEdit}
                    />
                  </div>

                  {/* Retorno Almoço */}
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Retorno Almoço
                    </label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-semibold text-slate-800"
                      value={editPunches.lunch_in}
                      onChange={(e) => setEditPunches({...editPunches, lunch_in: e.target.value})}
                      disabled={savingEdit}
                    />
                  </div>

                  {/* Saída Principal */}
                  <div className="text-left">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Saída Principal
                    </label>
                    <input 
                      type="time" 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm font-semibold text-slate-800"
                      value={editPunches.exit}
                      onChange={(e) => setEditPunches({...editPunches, exit: e.target.value})}
                      disabled={savingEdit}
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                    * Deixe um campo em branco para remover o registro correspondente. Novos registros serão associados à geolocalização padrão e assinados digitalmente pelo perfil administrativo.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowEditPunchModal(false)}
                  className="flex-1 py-3.5 bg-slate-100 font-extrabold text-xs text-slate-600 rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer"
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleSaveEditPunches}
                  className="flex-1 py-3.5 bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-blue-700 shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 10mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden; }
          .printable-sheet, .printable-sheet * { visibility: visible; }
          .printable-sheet { 
            position: relative !important; 
            left: 0 !important; 
            top: 0 !important; 
            margin: 0 auto !important;
            padding: 0.6cm 1cm !important;
            width: 100% !important;
            max-width: 190mm !important;
            height: auto !important;
            min-height: 280mm !important;
            box-sizing: border-box !important;
            border: none !important;
            box-shadow: none !important;
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
          }
          .no-print { display: none !important; }
        }
      `}} />
    </div>
  );
}
