import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
// @ts-ignore
import sentinelaLogo from '../../assets/images/sentinela_logo_png_1786010689264.jpg';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  limit,
  onSnapshot, 
  addDoc, 
  getDocs,
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  BookOpen, 
  Calendar, 
  Clock, 
  User, 
  Shield, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  FileText, 
  ChevronRight, 
  ChevronLeft,
  X,
  FileCheck,
  MapPin,
  ClipboardList,
  Edit2,
  Trash2,
  Camera,
  Image as ImageIcon,
  ChevronDown,
  Building2,
  Layers,
  Printer,
  Archive,
  FolderCheck,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';
import { Occurrence } from '../../types';
import { SignaturePad } from './SignaturePad';

export default function ShiftBook() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Toggle form view & Archive view
  const [showForm, setShowForm] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'current' | 'archive'>('current');
  const [archiveSelectedMonthKey, setArchiveSelectedMonthKey] = useState<string>('');
  const [archiveSelectedPost, setArchiveSelectedPost] = useState<string>('TODOS');
  const [showArchivePrintModal, setShowArchivePrintModal] = useState(false);
  const [archiveModalData, setArchiveModalData] = useState<{ monthKey: string; records: Occurrence[] } | null>(null);

  const [records, setRecords] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected record for details view
  const [selectedRecord, setSelectedRecord] = useState<Occurrence | null>(null);

  // Form States - Section 1: Identificação do Plantão
  const [postoName, setPostoName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [shift, setShift] = useState<'Manhã' | 'Noite' | ''>('');

  // Form States - Section 2: Modalidade do Posto
  const [hasWeapons, setHasWeapons] = useState(true); // default Armado

  // Form States - Section 3: Operador do Turno
  const [vigilanteEntrante, setVigilanteEntrante] = useState('');
  const [vigilanteSainte, setVigilanteSainte] = useState('');

  // Form States - Section 4: Controle de Armamento e Carga
  const [weaponsTipo, setWeaponsTipo] = useState('Revólver .38');
  const [weaponsNumeroSerie, setWeaponsNumeroSerie] = useState('');
  const [weaponsQuantidadeMunicao, setWeaponsQuantidadeMunicao] = useState<number | string>('');
  const [coleteNumero, setColeteNumero] = useState('');

  // Form States - Section 5: Registro de Ocorrências e Novidades
  const [ocorrencias, setOcorrencias] = useState('');

  // Form States - Section 6: Assinaturas Digitais (Base64)
  const [sigSainteDataUrl, setSigSainteDataUrl] = useState('');
  const [sigEntranteDataUrl, setSigEntranteDataUrl] = useState('');

  // Editing & Shift Status state
  const [editingRecord, setEditingRecord] = useState<Occurrence | null>(null);
  const [targetStatus, setTargetStatus] = useState<'in_progress' | 'resolved'>('in_progress');
  const [isClosingShiftMode, setIsClosingShiftMode] = useState<boolean>(false);

  // Service posts for auto-filling
  const [servicePosts, setServicePosts] = useState<any[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string>('');
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);

  // Fetch service posts from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'servicePosts'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setServicePosts(list);
    }, (error) => {
      if (error?.code !== 'resource-exhausted') {
        console.error("Error listening to service posts in ShiftBook:", error);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch registered users for quick operator selection
  useEffect(() => {
    const q = query(collection(db, 'users'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRegisteredUsers(list);
    }, (error) => {
      if (error?.code !== 'resource-exhausted') {
        console.error("Error loading users in ShiftBook:", error);
      }
    });
    return () => unsubscribe();
  }, []);

  // Photos & Lightbox States
  const [photos, setPhotos] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);

  // Book navigation states
  const [isBookOpen, setIsBookOpen] = useState(false);
  const [bookPageIndex, setBookPageIndex] = useState(0);
  const [navigationDirection, setNavigationDirection] = useState<'forward' | 'backward'>('forward');
  const [mobileActiveTab, setMobileActiveTab] = useState<'info' | 'relato'>('info');

  // Admin filter & Expansion menu state
  const [selectedAdminPost, setSelectedAdminPost] = useState<string>('TODOS');
  const [isPostMenuOpen, setIsPostMenuOpen] = useState(false);

  // Available posts for admin expansion menu
  const availablePostNames = Array.from(
    new Set([
      ...servicePosts.map(p => p.name?.trim()).filter(Boolean),
      ...records.map(r => r.shiftBookDetails?.postoName?.trim()).filter(Boolean)
    ])
  ).sort((a, b) => a.localeCompare(b));

  // Reset page index if search filters, selected post, or records count change
  useEffect(() => {
    setBookPageIndex(0);
  }, [searchTerm, selectedAdminPost, records.length]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new window.Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(compressedDataUrl);
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files);
    
    if (photos.length + fileList.length > 15) {
      alert("Você pode adicionar no máximo 15 fotos por relatório de turno.");
      return;
    }

    setCompressing(true);
    try {
      const compressedPromises = fileList.map(file => compressImage(file));
      const compressedImages = await Promise.all(compressedPromises);
      setPhotos(prev => [...prev, ...compressedImages]);
    } catch (err) {
      console.error("Erro ao compactar imagem:", err);
      alert("Erro ao carregar e processar algumas fotos. Certifique-se de que são imagens válidas.");
    } finally {
      setCompressing(false);
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleCloseForm = () => {
    setEditingRecord(null);
    setIsClosingShiftMode(false);
    setTargetStatus('in_progress');
    setPostoName('');
    setSelectedPostId('');
    setShift('');
    setVigilanteSainte(user?.name || '');
    setVigilanteEntrante('');
    setOcorrencias('');
    setSigSainteDataUrl('');
    setSigEntranteDataUrl('');
    setHasWeapons(true);
    setPhotos([]);
    setShowForm(false);
  };

  const insertTemplate = (type: 'iniciar' | 'finalizar' | 'anexar_encerramento') => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const entName = vigilanteEntrante.trim() || '';
    const postName = postoName.trim() || '';
    const saiName = vigilanteSainte.trim() || '';

    if (type === 'iniciar') {
      const text = `Eu vigia ${saiName || '____________________'} iniciando o plantão no posto ${postName || '_____________________'} no dia ${formattedDate} às ${formattedTime} e recebendo o posto do vigilante ${entName || '______________________________'}, sem qualquer alteração. Finalizo o relatório dessa ronda mediante imagens enviadas no grupo de whatsapp.`;
      setOcorrencias(text);
    } else if (type === 'finalizar') {
      const text = `Eu vigia ${saiName || '________________'} finalizo o plantão no dia ${formattedDate} às ${formattedTime} Hrs sem alterações e passo o posto da ${postName || '__________________'} para o vigilante ${entName || '_____________________'}.`;
      setOcorrencias(text);
    } else if (type === 'anexar_encerramento') {
      const closingBlock = `\n\n--- ENCERRAMENTO DE TURNO (${formattedDate} às ${formattedTime}) ---\nEu vigia ${saiName || '________________'} encerro e finalizo a jornada do plantão no posto ${postName || '__________________'} às ${formattedTime} Hrs sem qualquer alteração pendente.`;
      setOcorrencias(prev => prev ? prev + closingBlock : closingBlock);
    }
  };

  const handleStartEdit = (rec: Occurrence) => {
    setEditingRecord(rec);
    setIsClosingShiftMode(false);
    setTargetStatus(rec.status === 'in_progress' ? 'in_progress' : 'resolved');
    setPostoName(rec.shiftBookDetails?.postoName || '');
    setDate(rec.date);
    setShift(rec.shift as any || '');
    setHasWeapons(rec.shiftBookDetails?.weaponsDetails?.hasWeapons ?? false);
    setVigilanteEntrante(rec.shiftBookDetails?.vendedorAssumindoName || '');
    setVigilanteSainte(rec.shiftBookDetails?.vendedorSaindoName || rec.userName || '');
    setWeaponsTipo(rec.shiftBookDetails?.weaponsDetails?.tipo || 'Revólver .38');
    setWeaponsNumeroSerie(rec.shiftBookDetails?.weaponsDetails?.numeroSerie || '');
    setWeaponsQuantidadeMunicao(rec.shiftBookDetails?.weaponsDetails?.quantidadeMunicao ?? '');
    setColeteNumero(rec.shiftBookDetails?.coleteNumero || '');
    setOcorrencias(rec.shiftBookDetails?.routineDescription || rec.description || '');
    setSigSainteDataUrl(rec.shiftBookDetails?.sigSainteDataUrl || '');
    setSigEntranteDataUrl(rec.shiftBookDetails?.sigEntranteDataUrl || '');
    setPhotos(rec.photos || []);
    setShowForm(true);
  };

  const handleStartClosing = (rec: Occurrence) => {
    setEditingRecord(rec);
    setIsClosingShiftMode(true);
    setTargetStatus('resolved');
    setPostoName(rec.shiftBookDetails?.postoName || '');
    setDate(rec.date);
    setShift(rec.shift as any || '');
    setHasWeapons(rec.shiftBookDetails?.weaponsDetails?.hasWeapons ?? false);
    setVigilanteEntrante(rec.shiftBookDetails?.vendedorAssumindoName || '');
    setVigilanteSainte(rec.shiftBookDetails?.vendedorSaindoName || rec.userName || '');
    setWeaponsTipo(rec.shiftBookDetails?.weaponsDetails?.tipo || 'Revólver .38');
    setWeaponsNumeroSerie(rec.shiftBookDetails?.weaponsDetails?.numeroSerie || '');
    setWeaponsQuantidadeMunicao(rec.shiftBookDetails?.weaponsDetails?.quantidadeMunicao ?? '');
    setColeteNumero(rec.shiftBookDetails?.coleteNumero || '');
    const existingText = rec.shiftBookDetails?.routineDescription || rec.description || '';
    setOcorrencias(existingText);
    setSigSainteDataUrl(rec.shiftBookDetails?.sigSainteDataUrl || '');
    setSigEntranteDataUrl(rec.shiftBookDetails?.sigEntranteDataUrl || '');
    setPhotos(rec.photos || []);
    setShowForm(true);
  };

  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  // Prefill logged-in user name as leaving vigilante (Sainte)
  useEffect(() => {
    if (user && !vigilanteSainte) {
      setVigilanteSainte(user.name);
    }
  }, [user, vigilanteSainte]);

  // Reactive logic for switching armamento (equivalent to alternarArmamento in HTML)
  useEffect(() => {
    if (!hasWeapons) {
      setWeaponsTipo('Não se aplica');
      setWeaponsNumeroSerie('Não se aplica');
      setWeaponsQuantidadeMunicao('0');
      setColeteNumero('Não se aplica');
    } else {
      setWeaponsTipo('Revólver .38');
      setWeaponsNumeroSerie('');
      setWeaponsQuantidadeMunicao('');
      setColeteNumero('');
    }
  }, [hasWeapons]);

  // Fetch all registered shift books
  useEffect(() => {
    let q;
    if (isAdmin) {
      // Admins see all shift books
      q = query(
        collection(db, 'occurrences'),
        where('type', '==', 'shift_book'),
        limit(500)
      );
    } else {
      // Employees see shift books they participated in (either as entering or leaving) or their own
      q = query(
        collection(db, 'occurrences'),
        where('type', '==', 'shift_book'),
        limit(500)
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsList: Occurrence[] = [];
      snapshot.forEach((doc) => {
        docsList.push({ id: doc.id, ...doc.data() } as Occurrence);
      });
      // Sort desc by createdAt or date
      docsList.sort((a, b) => {
        const fallbackA = a.date ? new Date(a.date + 'T12:00:00') : new Date();
        const fallbackB = b.date ? new Date(b.date + 'T12:00:00') : new Date();
        const timeA = parseFirestoreTimestamp(a.createdAt, fallbackA).getTime();
        const timeB = parseFirestoreTimestamp(b.createdAt, fallbackB).getTime();
        if (!isNaN(timeA) && !isNaN(timeB) && timeB !== timeA) {
          return timeB - timeA;
        }
        return (b.date || '').localeCompare(a.date || '');
      });
      setRecords(docsList);
      setLoading(false);
    }, (error) => {
      if (error?.code !== 'resource-exhausted') {
        console.error("Erro ao escutar livros de turno:", error);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Calculate day of the week
  const getDiaSemana = (dateString: string) => {
    if (!dateString) return 'Dia de Plantão';
    try {
      const parsedDate = new Date(dateString + 'T12:00:00');
      const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      return days[parsedDate.getDay()];
    } catch (e) {
      return 'Dia de Plantão';
    }
  };

  // Format YYYY-MM-DD to DD-MM-YYYY (Brazilian format)
  const formatarDataBR = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateString;
  };

  const handleSaveTurno = async (e: React.FormEvent, explicitStatus?: 'in_progress' | 'resolved') => {
    e.preventDefault();
    if (!user) return;

    const finalStatus = explicitStatus || targetStatus || 'in_progress';
    const isFinalizing = finalStatus === 'resolved';

    if (!postoName.trim()) {
      alert("Por favor, preencha o Nome do Posto / Cliente.");
      return;
    }
    if (!date) {
      alert("Por favor, informe a Data.");
      return;
    }
    if (!shift) {
      alert("Por favor, selecione o Horário do Turno.");
      return;
    }
    if (!vigilanteSainte.trim()) {
      alert("Por favor, insira o nome do Vigilante Sainte (Quem passa o posto).");
      return;
    }
    if (!vigilanteEntrante.trim()) {
      alert("Por favor, insira o nome do Vigilante Entrante (Quem assume o posto).");
      return;
    }
    if (!ocorrencias.trim()) {
      alert("Por favor, relate as ocorrências e novidades do turno.");
      return;
    }

    setSubmitting(true);

    try {
      const diaSemana = getDiaSemana(date);
      const shiftStartTime = shift === 'Manhã' ? '06:00' : '18:00';
      const shiftEndTime = shift === 'Manhã' ? '18:00' : '06:00';

      const compiledDescription = `ATA DE REGISTRO DO POSTO: ${postoName}
DATA/HORA: ${date} (${diaSemana}) - Horário do Plantão: ${shiftStartTime} às ${shiftEndTime}
STATUS DO TURNO: ${isFinalizing ? 'TURNO ENCERRADO / FINALIZADO' : 'TURNO EM ABERTO / EM ANDAMENTO'}
VIGILANTE OPERADOR (SAINTE): ${vigilanteSainte}
VIGILANTE ENTRANTE (ASSUMINDO): ${vigilanteEntrante}
MODALIDADE DO POSTO: ${hasWeapons ? 'POSTO ARMADO' : 'POSTO DESARMADO'}

--------------------------------------------------
ARMAMENTO E CARGA DO POSTO:
- Tipo de Arma: ${weaponsTipo}
- Nº Série da Arma: ${weaponsNumeroSerie}
- Quantidade de Munições: ${weaponsQuantidadeMunicao}
- Nº Série do Colete Balístico: ${coleteNumero}

--------------------------------------------------
OCORRÊNCIAS E ROTINA:
${ocorrencias}

--------------------------------------------------
PASSAGEM DE SERVIÇO:
Ata devidamente registrada pelo Vigilante ${vigilanteSainte} e acompanhada por ${vigilanteEntrante}.
- Status: ${isFinalizing ? 'Turno Concluído e Encerrado' : 'Turno Mantido em Aberto'}
- Assinatura eletrônica registrada em sistema.`;

      const newOccurrence = {
        userId: user.uid,
        userName: vigilanteSainte,
        userRole: user.role,
        title: `Livro de Ata de Plantão: Posto ${postoName} (${shift})`,
        type: 'shift_book' as const,
        shift,
        date,
        description: compiledDescription,
        status: finalStatus,
        resolvedAt: isFinalizing ? serverTimestamp() : null,
        resolvedByName: isFinalizing ? (user.name || 'Encerramento de Turno') : null,
        feedback: isFinalizing ? 'Ata encerrada eletronicamente.' : 'Turno em aberto.',
        createdAt: serverTimestamp(),
        photos,
        shiftBookDetails: {
          postoName,
          shiftStartTime,
          shiftEndTime,
          diaSemana,
          equipamentosReceived: [],
          weaponsDetails: {
            hasWeapons,
            tipo: weaponsTipo,
            marca: hasWeapons ? (weaponsTipo === 'Pistola .380' ? 'Taurus' : 'CBC/Taurus') : 'Não se aplica',
            numeroSerie: weaponsNumeroSerie,
            calibre: hasWeapons ? (weaponsTipo === 'Pistola .380' ? '.380' : '.38') : 'Não se aplica',
            quantidadeMunicao: Number(weaponsQuantidadeMunicao) || 0
          },
          coleteNumero,
          vendedorSaindoName: vigilanteSainte,
          vendedorAssumindoName: vigilanteEntrante,
          signatureSaindo: vigilanteSainte || 'Assinado Eletronicamente',
          signatureAssumindo: vigilanteEntrante || 'Confirmado via Biometria/Login',
          sigSainteDataUrl,
          sigEntranteDataUrl,
          isIniciandoPlantao: true,
          isFinalizandoPlantao: isFinalizing,
          closedAt: isFinalizing ? serverTimestamp() : null,
          closedByName: isFinalizing ? user.name : null,
          routineDescription: ocorrencias
        }
      };

      if (editingRecord) {
        const docRef = doc(db, 'occurrences', editingRecord.id);
        await updateDoc(docRef, {
          title: `Livro de Ata de Plantão: Posto ${postoName} (${shift})`,
          shift,
          date,
          description: compiledDescription,
          userName: vigilanteSainte,
          status: finalStatus,
          resolvedAt: isFinalizing ? serverTimestamp() : editingRecord.resolvedAt || null,
          resolvedByName: isFinalizing ? (user.name || 'Encerramento de Turno') : (editingRecord.resolvedByName || null),
          photos,
          shiftBookDetails: {
            postoName,
            shiftStartTime,
            shiftEndTime,
            diaSemana,
            equipamentosReceived: editingRecord.shiftBookDetails?.equipamentosReceived || [],
            weaponsDetails: {
              hasWeapons,
              tipo: weaponsTipo,
              marca: hasWeapons ? (weaponsTipo === 'Pistola .380' ? 'Taurus' : 'CBC/Taurus') : 'Não se aplica',
              numeroSerie: weaponsNumeroSerie,
              calibre: hasWeapons ? (weaponsTipo === 'Pistola .380' ? '.380' : '.38') : 'Não se aplica',
              quantidadeMunicao: Number(weaponsQuantidadeMunicao) || 0
            },
            coleteNumero,
            vendedorSaindoName: vigilanteSainte,
            vendedorAssumindoName: vigilanteEntrante,
            signatureSaindo: vigilanteSainte || editingRecord.shiftBookDetails?.signatureSaindo || 'Assinado Eletronicamente',
            signatureAssumindo: vigilanteEntrante || editingRecord.shiftBookDetails?.signatureAssumindo || 'Confirmado via Biometria/Login',
            sigSainteDataUrl,
            sigEntranteDataUrl,
            isIniciandoPlantao: true,
            isFinalizandoPlantao: isFinalizing,
            closedAt: isFinalizing ? serverTimestamp() : editingRecord.shiftBookDetails?.closedAt || null,
            closedByName: isFinalizing ? user.name : editingRecord.shiftBookDetails?.closedByName || null,
            routineDescription: ocorrencias
          }
        });

        await createNotification(
          user.uid,
          isFinalizing ? "Turno Encerrado" : "Ata de Turno Atualizada",
          isFinalizing ? `Turno do posto ${postoName} foi ENCERRADO com sucesso!` : `Livro de ata do posto ${postoName} atualizado com sucesso!`,
          "success"
        );

        alert(isFinalizing ? "Sucesso! Turno ENCERRADO E FINALIZADO com sucesso." : "Sucesso! Registro de turno atualizado (mantido em aberto).");
      } else {
        await addDoc(collection(db, 'occurrences'), newOccurrence);

        await createNotification(
          user.uid,
          isFinalizing ? "Turno Registrado e Encerrado" : "Turno Aberto",
          isFinalizing ? `Ata do posto ${postoName} registrada e finalizada.` : `Turno ABERTO no posto ${postoName}.`,
          "success"
        );

        // Notify admins
        try {
          const adminsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
          adminsSnap.forEach((adminDoc) => {
            createNotification(
              adminDoc.id,
              isFinalizing ? "Ata de Turno Encerrada" : "Novo Turno Aberto",
              `O colaborador ${vigilanteSainte} ${isFinalizing ? 'encerrou' : 'abriu'} o turno no posto ${postoName} (${shift})`,
              "info",
              "occurrences"
            );
          });
        } catch (errAdmin) {
          console.error(errAdmin);
        }

        alert(isFinalizing 
          ? "Sucesso! Registro de turno finalizado com sucesso."
          : "Sucesso! Novo turno ABERTO com sucesso! Ao final do seu plantão (ex: 17:50), abra este mesmo registro para encerrar seu turno."
        );
      }
      
      handleCloseForm();

    } catch (err) {
      console.error("Erro ao salvar turno:", err);
      alert("Houve um erro ao registrar a ata de turno. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered list with strict role & post isolation
  const filteredRecords = records.filter(rec => {
    // 1. Non-admin employee strict post security isolation
    if (!isAdmin) {
      const userPost = (user?.postoName || 'Portaria Principal').trim().toLowerCase();
      const recPost = (rec.shiftBookDetails?.postoName || 'Portaria Principal').trim().toLowerCase();
      if (recPost !== userPost) {
        return false;
      }
    } else if (
      selectedAdminPost && 
      selectedAdminPost.toUpperCase() !== 'TODOS' && 
      selectedAdminPost.toUpperCase() !== 'TODOS OS POSTOS'
    ) {
      const selectedPostLower = selectedAdminPost.trim().toLowerCase();
      const recPost = (rec.shiftBookDetails?.postoName || '').trim().toLowerCase();
      if (recPost !== selectedPostLower) {
        return false;
      }
    }

    // 2. Search term filter
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const postNameMatch = rec.shiftBookDetails?.postoName?.toLowerCase().includes(term) || false;
    const operatorMatch = rec.userName?.toLowerCase().includes(term) || false;
    const sainteMatch = rec.shiftBookDetails?.vendedorSaindoName?.toLowerCase().includes(term) || false;
    const entranteMatch = rec.shiftBookDetails?.vendedorAssumindoName?.toLowerCase().includes(term) || false;
    const titleMatch = rec.title?.toLowerCase().includes(term) || false;
    const dateMatch = rec.date?.includes(searchTerm) || formatarDataBR(rec.date).includes(searchTerm);
    return postNameMatch || operatorMatch || sainteMatch || entranteMatch || titleMatch || dateMatch;
  });

  // Helper for archive grouping
  const getRecordMonthKey = (rec: Occurrence) => {
    if (rec.date && rec.date.includes('-')) {
      const parts = rec.date.split('-');
      if (parts.length === 3) return `${parts[0]}-${parts[1]}`;
    }
    const d = parseFirestoreTimestamp(rec.createdAt, rec.date ? new Date(rec.date) : new Date());
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${yr}-${mo}`;
  };

  const getMonthNameBR = (monthKey: string) => {
    if (!monthKey || !monthKey.includes('-')) return monthKey || 'Mês Atual';
    const [yr, mo] = monthKey.split('-');
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const idx = parseInt(mo, 10) - 1;
    return `${months[idx] || mo} de ${yr}`;
  };

  // Group all records by month YYYY-MM
  const archivedMonthsMap: Record<string, Occurrence[]> = {};
  records.forEach(rec => {
    // Also apply role/post filter to archive
    if (!isAdmin) {
      const userPost = (user?.postoName || 'Portaria Principal').trim().toLowerCase();
      const recPost = (rec.shiftBookDetails?.postoName || 'Portaria Principal').trim().toLowerCase();
      if (recPost !== userPost) return;
    }
    const key = getRecordMonthKey(rec);
    if (!archivedMonthsMap[key]) archivedMonthsMap[key] = [];
    archivedMonthsMap[key].push(rec);
  });

  const availableArchiveKeys = Object.keys(archivedMonthsMap).sort((a, b) => b.localeCompare(a));
  const currentActiveMonthKey = archiveSelectedMonthKey || (availableArchiveKeys.length > 0 ? availableArchiveKeys[0] : '');

  // Filtered records for the selected month in archive view
  const currentArchiveRecords = currentActiveMonthKey ? (archivedMonthsMap[currentActiveMonthKey] || []).filter(rec => {
    if (archiveSelectedPost && archiveSelectedPost.toUpperCase() !== 'TODOS' && archiveSelectedPost.toUpperCase() !== 'TODOS OS POSTOS') {
      const selectedPostLower = archiveSelectedPost.trim().toLowerCase();
      const recPost = (rec.shiftBookDetails?.postoName || '').trim().toLowerCase();
      if (recPost !== selectedPostLower) return false;
    }
    return true;
  }) : [];

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800" id="shift-book-view">
      
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            LIVRO DE TURNO DIGITAL
          </h1>
          <p className="text-sm text-slate-500">
            Passagem de serviço, controle de armamento, coletes balísticos e relato operacional de turno.
          </p>
        </div>
        
        {!showForm && !isAdmin && (
          <button
            onClick={() => {
              setEditingRecord(null);
              setPostoName(user?.postoName || 'Portaria Principal');
              setShowForm(true);
            }}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-yellow-300 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-yellow-300" />
            REGISTRAR NOVO TURNO
          </button>
        )}
      </div>

      {/* View Switcher: Livro Vigente vs Histórico de Guarda */}
      {!showForm && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveViewTab('current')}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer",
                activeViewTab === 'current'
                  ? "bg-indigo-600 text-yellow-300 shadow-md"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <BookOpen className="w-4 h-4" />
              <span>Livro de Turno Vigente</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveViewTab('archive');
                if (!archiveSelectedMonthKey && availableArchiveKeys.length > 0) {
                  setArchiveSelectedMonthKey(availableArchiveKeys[0]);
                }
              }}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer",
                activeViewTab === 'archive'
                  ? "bg-amber-800 text-amber-100 shadow-md border border-amber-600/40"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <FolderCheck className="w-4 h-4 text-amber-400" />
              <span>Histórico de Guarda de Atas Mensais</span>
              <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-950/30 text-[10px] text-amber-900 font-extrabold border border-amber-300">
                {availableArchiveKeys.length} {availableArchiveKeys.length === 1 ? 'Mês Arquivado' : 'Meses Arquivados'}
              </span>
            </button>
          </div>

          {activeViewTab === 'archive' && (
            <div className="text-xs font-extrabold text-amber-900 bg-amber-50 px-3 py-2 rounded-xl border border-amber-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Repositório de Guarda e Auditoria do Livro de Atas</span>
            </div>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {showForm ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl mx-auto overflow-hidden"
          >
            {/* Form Header */}
            <div className={cn(
              "text-white p-6 flex justify-between items-center transition-colors",
              isClosingShiftMode ? "bg-amber-950 border-b-2 border-amber-500" : "bg-slate-900"
            )}>
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-amber-400">
                  <ClipboardList className="w-5 h-5 text-amber-400" />
                  {isClosingShiftMode ? 'Encerramento de Turno (Finalização de Plantão)' : 'Abertura / Registro de Ata de Turno'}
                </h2>
                <p className="text-xs text-amber-200/80">
                  {isClosingShiftMode 
                    ? 'Preencha os dados finais para concluir e encerrar a jornada de trabalho no posto.'
                    : 'Registre o início ou andamento do seu plantão. Você pode salvá-lo em aberto e encerrar ao final do expediente.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => handleSaveTurno(e, targetStatus)} className="p-6 space-y-6">
              
              {isClosingShiftMode && (
                <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl flex items-center gap-3 text-amber-950 mb-2 shadow-xs">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <strong className="block text-xs uppercase font-extrabold text-amber-950">Procedimento de Encerramento (ex: 17:50 / Término de Plantão)</strong>
                    <p className="text-xs text-amber-800">
                      Você está concluindo a jornada deste turno. Anexe fotos do encerramento (se houver), revise os dados de armamento, colha as assinaturas e clique no botão <strong>"ENCERRAR E FINALIZAR TURNO"</strong>.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Section 1: Identificação do Plantão */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-l-4 border-indigo-600 pl-2">
                  1. Identificação do Plantão
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {servicePosts.length > 0 && (
                    <div className="flex flex-col gap-1.5 col-span-1 md:col-span-3">
                      <label className="text-xs font-bold text-slate-600">Selecione o Posto Cadastrado (Preenchimento Rápido)</label>
                      <select
                        value={selectedPostId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedPostId(val);
                          const found = servicePosts.find(p => p.id === val);
                          if (found) {
                            setPostoName(found.name);
                          }
                        }}
                        className="px-3.5 py-2.5 border border-indigo-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-indigo-50/55 font-bold text-indigo-700"
                      >
                        <option value="">-- Selecione um posto cadastrado para facilitar o preenchimento --</option>
                        {servicePosts.map(post => (
                          <option key={post.id} value={post.id}>
                            {post.name} {post.companyName ? `(${post.companyName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Nome do Posto / Cliente *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Agência Centro"
                      value={postoName}
                      onChange={(e) => setPostoName(e.target.value)}
                      className="px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-900 bg-slate-50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Data *</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-medium text-slate-900"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Horário do Turno *</label>
                    <select
                      required
                      value={shift}
                      onChange={(e) => setShift(e.target.value as any)}
                      className="px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-bold text-slate-900"
                    >
                      <option value="" className="text-slate-900 bg-white">Selecione...</option>
                      <option value="Manhã" className="text-slate-900 bg-white">06:00 às 18:00 (Diurno)</option>
                      <option value="Noite" className="text-slate-900 bg-white">18:00 às 06:00 (Noturno)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Modalidade do Posto */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-l-4 border-indigo-600 pl-2">
                  2. Modalidade do Posto neste Turno
                </h3>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-600">O posto está operando com armamento agora?</label>
                  
                  <div className="grid grid-cols-2 gap-3 mt-1">
                    <button
                      type="button"
                      onClick={() => setHasWeapons(true)}
                      className={cn(
                        "py-3.5 px-4 text-center rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all border cursor-pointer",
                        hasWeapons 
                          ? "bg-rose-750 text-white border-rose-800 shadow-md shadow-rose-600/10" 
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      POSTO ARMADO
                    </button>
                    <button
                      type="button"
                      onClick={() => setHasWeapons(false)}
                      className={cn(
                        "py-3.5 px-4 text-center rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all border cursor-pointer",
                        !hasWeapons 
                          ? "bg-emerald-750 text-white border-emerald-800 shadow-md shadow-emerald-600/10" 
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      POSTO DESARMADO
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 3: Operadores do Turno (Passagem de Posto) */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 border-l-4 border-indigo-600 pl-2">
                  3. Operadores do Turno (Passagem de Posto)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Vigilante Sainte (Quem passa o posto) *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Nome do Vigilante que entrega o posto"
                        value={vigilanteSainte}
                        onChange={(e) => setVigilanteSainte(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-medium text-slate-900"
                      />
                    </div>
                    {selectedPostId && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {servicePosts.find(p => p.id === selectedPostId)?.vigilantes?.map((vig: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setVigilanteSainte(vig)}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            {vig} (Vig)
                          </button>
                        ))}
                        {servicePosts.find(p => p.id === selectedPostId)?.colaboradores?.map((col: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setVigilanteSainte(col)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    )}
                    {registeredUsers.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) setVigilanteSainte(e.target.value);
                        }}
                        value=""
                        className="mt-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 font-medium"
                      >
                        <option value="">-- Selecionar Vigia / Vigilante Cadastrado --</option>
                        {registeredUsers.map(u => (
                          <option key={u.id} value={u.name}>
                            {u.name} {u.postoName ? `(${u.postoName})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Vigilante Entrante (Quem assume o posto) *</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Nome do Vigilante que assume o posto"
                        value={vigilanteEntrante}
                        onChange={(e) => setVigilanteEntrante(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-medium text-slate-900"
                      />
                    </div>
                    {selectedPostId && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {servicePosts.find(p => p.id === selectedPostId)?.vigilantes?.map((vig: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setVigilanteEntrante(vig)}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            {vig} (Vig)
                          </button>
                        ))}
                        {servicePosts.find(p => p.id === selectedPostId)?.colaboradores?.map((col: string, i: number) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setVigilanteEntrante(col)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    )}
                    {registeredUsers.length > 0 && (
                      <select
                        onChange={(e) => {
                          if (e.target.value) setVigilanteEntrante(e.target.value);
                        }}
                        value=""
                        className="mt-1 px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-50 text-slate-700 font-medium"
                      >
                        <option value="">-- Selecionar Vigia / Vigilante Cadastrado --</option>
                        {registeredUsers.map(u => (
                          <option key={u.id} value={u.name}>
                            {u.name} {u.postoName ? `(${u.postoName})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 4: Controle de Armamento e Carga */}
              <div className={cn("p-4 rounded-2xl transition-colors border", hasWeapons ? "bg-rose-50/40 border-rose-100" : "bg-slate-50 border-slate-200")}>
                <h3 className={cn("text-xs font-black uppercase tracking-widest mb-4 border-l-4 pl-2", hasWeapons ? "text-rose-700 border-rose-600" : "text-slate-500 border-slate-400")}>
                  4. Controle de Armamento e Carga { !hasWeapons && "(Inativo - Posto Desarmado)" }
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Tipo de Arma</label>
                    <select
                      disabled={!hasWeapons}
                      value={weaponsTipo}
                      onChange={(e) => setWeaponsTipo(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {hasWeapons ? (
                        <>
                          <option value="Revólver .38" className="text-slate-900 bg-white">Revólver .38</option>
                          <option value="Pistola .380" className="text-slate-900 bg-white">Pistola .380</option>
                        </>
                      ) : (
                        <option value="Não se aplica" className="text-slate-900 bg-white">Não se aplica (Sem Arma)</option>
                      )}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Número de Série da Arma</label>
                    <input
                      type="text"
                      disabled={!hasWeapons}
                      required={hasWeapons}
                      placeholder="Ex: ABC12345"
                      value={weaponsNumeroSerie}
                      onChange={(e) => setWeaponsNumeroSerie(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Quantidade de Munições</label>
                    <input
                      type="number"
                      disabled={!hasWeapons}
                      required={hasWeapons}
                      min="0"
                      placeholder="Ex: 12"
                      value={weaponsQuantidadeMunicao}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWeaponsQuantidadeMunicao(val === '' ? '' : Number(val));
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-center text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-600">Nº Série do Colete Balístico</label>
                    <input
                      type="text"
                      disabled={!hasWeapons}
                      required={hasWeapons}
                      placeholder="Ex: COL-9876"
                      value={coleteNumero}
                      onChange={(e) => setColeteNumero(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Registro de Ocorrências e Novidades */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 border-l-4 border-indigo-600 pl-2">
                  5. Registro de Ocorrências e Novidades
                </h3>
                
                {/* Quick Fill / Text Templates Panel */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 mb-2.5 flex flex-col gap-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wider">
                      ✨ Modelos de Preenchimento Rápido
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Clique em um modelo para preencher o relatório automaticamente com os dados atuais:
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => insertTemplate('iniciar')}
                      className="p-2.5 text-left border border-indigo-150 bg-white hover:bg-indigo-50/70 text-indigo-900 rounded-xl text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
                      title="Modelo para assumir e iniciar o plantão"
                    >
                      <span className="text-indigo-700 flex items-center gap-1 font-extrabold uppercase tracking-wide text-[10px]">
                        📝 Iniciar Turno (Abertura)
                      </span>
                      <p className="text-[10px] text-slate-400 font-medium italic line-clamp-1">
                        "Eu vigia... iniciando o plantão..."
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => insertTemplate('finalizar')}
                      className="p-2.5 text-left border border-indigo-150 bg-white hover:bg-indigo-50/70 text-indigo-900 rounded-xl text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
                      title="Modelo para passar/concluir o plantão"
                    >
                      <span className="text-indigo-700 flex items-center gap-1 font-extrabold uppercase tracking-wide text-[10px]">
                        🏁 Finalizar Turno (Encerramento)
                      </span>
                      <p className="text-[10px] text-slate-400 font-medium italic line-clamp-1">
                        "Eu vigia... finalizo o plantão..."
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => insertTemplate('anexar_encerramento')}
                      className="p-2.5 text-left border border-amber-200 bg-amber-50/50 hover:bg-amber-100/70 text-amber-950 rounded-xl text-xs font-bold transition-all flex flex-col gap-0.5 cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
                      title="Anexar nota de encerramento de turno ao relato existente"
                    >
                      <span className="text-amber-800 flex items-center gap-1 font-extrabold uppercase tracking-wide text-[10px]">
                        ➕ Anexar Encerramento
                      </span>
                      <p className="text-[10px] text-amber-700 font-medium italic line-clamp-1">
                        Adiciona nota final de encerramento com horário.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-600">Relato detalhado do turno *</label>
                  {ocorrencias && (
                    <button
                      type="button"
                      onClick={() => setOcorrencias('')}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-800 transition-colors cursor-pointer"
                    >
                      Limpar Relato
                    </button>
                  )}
                </div>
                
                <textarea
                  required
                  placeholder="Selecione um modelo acima ou digite seu relato detalhado aqui..."
                  rows={5}
                  value={ocorrencias}
                  onChange={(e) => setOcorrencias(e.target.value)}
                  className="w-full p-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-medium text-slate-950"
                />
              </div>

              {/* Section 6: Fotos do Relatório (Galeria) */}
              <div className="flex flex-col gap-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-sm text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-l-4 border-indigo-600 pl-2">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    6. Fotos do Relatório (Galeria)
                  </h3>
                  <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {photos.length} / 15 Fotos
                  </span>
                </div>

                <p className="text-xs text-slate-500 font-medium">
                  Adicione fotos para ilustrar e documentar o turno (rondas, portaria, ocorrências, etc.). Máximo de 15 fotos.
                </p>

                {/* Upload Trigger Area */}
                {photos.length < 15 && (
                  <div className="relative border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 transition-all bg-white text-center group cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={compressing}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center justify-center gap-2">
                      {compressing ? (
                        <>
                          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                          <p className="text-xs font-bold text-slate-600">Processando e otimizando imagens...</p>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Camera className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-extrabold text-slate-700">Clique para selecionar fotos da galeria</p>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Formatos aceitos: JPG, PNG • Redimensionamento inteligente ativo</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Grid Preview of Uploaded Photos */}
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3.5 mt-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                        <img
                          src={photo}
                          alt={`Foto do Relatório ${index + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute top-1.5 right-1.5 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                          title="Remover foto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white bg-slate-900/70 px-1.5 py-0.5 rounded backdrop-blur-xs">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 7: Assinaturas Digitais */}
              <div className="flex flex-col gap-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 border-l-4 border-indigo-600 pl-2">
                  7. Assinaturas Digitais (Tela de Toque / Mouse)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SignaturePad 
                    label="Assinatura do Vigilante SAINTE" 
                    initialValue={sigSainteDataUrl}
                    onSave={(dataUrl) => setSigSainteDataUrl(dataUrl)}
                    onClear={() => setSigSainteDataUrl('')}
                  />
                  
                  <SignaturePad 
                    label="Assinatura do Vigilante ENTRANTE" 
                    initialValue={sigEntranteDataUrl}
                    onSave={(dataUrl) => setSigEntranteDataUrl(dataUrl)}
                    onClear={() => setSigEntranteDataUrl('')}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-150">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="w-full sm:w-auto px-5 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>

                <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={(e) => handleSaveTurno(e, 'in_progress')}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-amber-950 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow flex items-center justify-center gap-1.5 cursor-pointer border border-amber-400"
                  >
                    <Clock className="w-4 h-4 text-amber-950" />
                    <span>{isClosingShiftMode ? 'SALVAR E MANTER EM ABERTO' : 'ABRIR TURNO (MANTER EM ABERTO)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={submitting}
                    onClick={(e) => handleSaveTurno(e, 'resolved')}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>SALVANDO...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                        <span>ENCERRAR E FINALIZAR TURNO</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Search/Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome do posto, vigia ou data (Ex: Agência Centro, 2026-06...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50 font-medium placeholder-slate-400"
                />
              </div>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="text-xs font-semibold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg bg-slate-100 cursor-pointer"
                >
                  Limpar Busca
                </button>
              )}
            </div>

            {/* List / Loading / Archive State */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mb-3" />
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando livro de turno...</p>
              </div>
            ) : activeViewTab === 'archive' ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Archive Vault Header Banner */}
                <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 text-white p-6 sm:p-8 rounded-3xl border-2 border-amber-600/30 shadow-xl relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-300 text-xs font-black uppercase tracking-wider">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        REPOSITÓRIO MENSAL DE ATAS DE SEGURANÇA
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                        <Archive className="w-6 h-6 text-amber-400" />
                        Histórico de Guarda do Livro de Turno
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
                        Documentos operacionais arquivados por mês de referência para fins de fiscalização, comprovação trabalhista e compliance legal de postura bélica.
                      </p>
                    </div>

                    {currentArchiveRecords.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setArchiveModalData({
                            monthKey: currentActiveMonthKey,
                            records: currentArchiveRecords
                          });
                          setShowArchivePrintModal(true);
                        }}
                        className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-black uppercase tracking-wider rounded-2xl transition-all shadow-lg hover:shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0 border border-amber-300"
                      >
                        <Printer className="w-4 h-4 text-amber-950" />
                        <span>Imprimir Livro do Mês (PDF)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Month Selector Pills */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-600" />
                    Selecione o Mês do Arquivo de Guarda:
                  </span>
                  
                  {availableArchiveKeys.length === 0 ? (
                    <p className="text-xs text-slate-400 font-bold italic py-2">Nenhum mês arquivado até o momento.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableArchiveKeys.map((mKey) => {
                        const count = (archivedMonthsMap[mKey] || []).length;
                        const isSelected = currentActiveMonthKey === mKey;
                        return (
                          <button
                            key={mKey}
                            type="button"
                            onClick={() => setArchiveSelectedMonthKey(mKey)}
                            className={cn(
                              "px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border",
                              isSelected
                                ? "bg-amber-800 text-amber-100 border-amber-600 shadow-md"
                                : "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200"
                            )}
                          >
                            <FolderCheck className={cn("w-4 h-4", isSelected ? "text-amber-300" : "text-amber-600")} />
                            <span>{getMonthNameBR(mKey)}</span>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold",
                              isSelected ? "bg-amber-950/40 text-amber-200 border border-amber-400/30" : "bg-slate-200 text-slate-700"
                            )}>
                              {count} {count === 1 ? 'Ata' : 'Atas'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Monthly Stats Cards & Post Filter */}
                {currentActiveMonthKey && (
                  <div className="space-y-4">
                    {/* Stats Bar */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-700">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400 block">Total de Atas</span>
                          <strong className="text-lg font-black text-slate-800">{currentArchiveRecords.length}</strong>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-indigo-700">
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400 block">Armamentos Checados</span>
                          <strong className="text-lg font-black text-slate-800">
                            {currentArchiveRecords.filter(r => r.shiftBookDetails?.weaponsDetails?.hasWeapons).length}
                          </strong>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400 block">Assinaturas Coletadas</span>
                          <strong className="text-lg font-black text-slate-800">
                            {currentArchiveRecords.filter(r => r.shiftBookDetails?.sigSainteDataUrl || r.shiftBookDetails?.sigEntranteDataUrl).length * 2}
                          </strong>
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-700">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400 block">Ocorrências Relatadas</span>
                          <strong className="text-lg font-black text-slate-800">
                            {currentArchiveRecords.filter(r => r.shiftBookDetails?.routineDescription && !r.shiftBookDetails.routineDescription.toLowerCase().includes('sem altera')).length}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Archived Records Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-amber-700" />
                            Atas Arquivadas de {getMonthNameBR(currentActiveMonthKey)}
                          </h3>
                          <p className="text-[11px] text-slate-500">Exibindo registros de passagem de turno certificados no mês.</p>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <select
                              value={archiveSelectedPost}
                              onChange={(e) => setArchiveSelectedPost(e.target.value)}
                              className="text-xs font-bold bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            >
                              <option value="TODOS">Todos os Postos ({currentArchiveRecords.length})</option>
                              {availablePostNames.map(pName => (
                                <option key={pName} value={pName}>{pName}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {currentArchiveRecords.length === 0 ? (
                        <div className="p-12 text-center text-slate-400 text-xs font-bold">
                          Nenhum registro encontrado para este mês ou posto selecionado.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                <th className="p-3.5">Data / Horário</th>
                                <th className="p-3.5">Posto de Serviço</th>
                                <th className="p-3.5">Vigilante Sainte</th>
                                <th className="p-3.5">Vigilante Entrante</th>
                                <th className="p-3.5">Armamento</th>
                                <th className="p-3.5 text-center">Assinaturas</th>
                                <th className="p-3.5 text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                              {currentArchiveRecords.map((rec) => {
                                const details = rec.shiftBookDetails;
                                return (
                                  <tr key={rec.id} className="hover:bg-amber-50/40 transition-colors group">
                                    <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-amber-700" />
                                        <span>{formatarDataBR(rec.date)}</span>
                                        <span className="text-[10px] font-normal text-slate-400">({rec.shift || 'Turno'})</span>
                                      </div>
                                    </td>
                                    <td className="p-3.5 font-bold text-slate-800">
                                      {details?.postoName || rec.userName || 'Portaria Principal'}
                                    </td>
                                    <td className="p-3.5 font-medium text-slate-700">
                                      {details?.vendedorSaindoName || rec.userName || 'Vigia Anterior'}
                                    </td>
                                    <td className="p-3.5 font-medium text-slate-700">
                                      {details?.vendedorAssumindoName || 'Vigia Sucessor'}
                                    </td>
                                    <td className="p-3.5 whitespace-nowrap">
                                      {details?.weaponsDetails?.hasWeapons ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          {details.weaponsDetails.tipo || 'Armado'} ({details.weaponsDetails.quantidadeMunicao} mun)
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                                          Desarmado
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3.5 text-center">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        Autenticado
                                      </span>
                                    </td>
                                    <td className="p-3.5 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedRecord(rec)}
                                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-extrabold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 border border-amber-300"
                                      >
                                        <span>Ver Ata</span>
                                        <ChevronRight className="w-3.5 h-3.5" />
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
                )}
              </motion.div>
            ) : filteredRecords.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Nenhum Registro Encontrado</h3>
                <p className="text-slate-400 text-xs max-w-md mx-auto mb-4">
                  {searchTerm 
                    ? "Sua busca não retornou resultados para este termo. Tente buscar por outra palavra."
                    : "Ainda não existem atas de turno registradas no sistema de ponto digital."}
                </p>
                {!searchTerm && !isAdmin && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                  >
                    Registrar o Primeiro Turno
                  </button>
                )}
              </div>
            ) : (() => {
              const currentRec = filteredRecords[bookPageIndex];
              const details = currentRec?.shiftBookDetails;
              const hasWeaponsRecord = details?.weaponsDetails?.hasWeapons ?? false;

              if (!isBookOpen) {
                return (
                  <div className="relative w-full max-w-xl mx-auto pb-12 pt-4" id="skeuomorphic-book-closed-container">
                    <motion.div
                      whileHover={{ scale: 1.02, rotateY: -4, rotateX: 2 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      onClick={() => setIsBookOpen(true)}
                      className="relative bg-gradient-to-br from-[#2c1a04] via-[#1a0f00] to-[#0d0700] p-6 sm:p-10 rounded-2xl shadow-[0_30px_70px_-10px_rgba(0,0,0,0.85),_inset_0_2px_4px_rgba(255,255,255,0.1)] border-2 border-amber-950/60 aspect-[3/4] flex flex-col justify-between cursor-pointer select-none overflow-hidden group"
                    >
                      {/* Leather Texture Overlay */}
                      <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                      
                      {/* Elegant gold foil border */}
                      <div className="absolute inset-4 sm:inset-6 border border-yellow-500/20 rounded-lg pointer-events-none" />
                      <div className="absolute inset-5 sm:inset-7 border-2 border-yellow-500/35 rounded-md pointer-events-none" />
                      
                      {/* Golden corners inside the gold border */}
                      <div className="absolute top-6 left-6 w-6 h-6 border-t-2 border-l-2 border-yellow-500/60 pointer-events-none" />
                      <div className="absolute top-6 right-6 w-6 h-6 border-t-2 border-r-2 border-yellow-500/60 pointer-events-none" />
                      <div className="absolute bottom-6 left-6 w-6 h-6 border-b-2 border-l-2 border-yellow-500/60 pointer-events-none" />
                      <div className="absolute bottom-6 right-6 w-6 h-6 border-b-2 border-r-2 border-yellow-500/60 pointer-events-none" />

                      {/* Spine highlight shadow */}
                      <div className="absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/60 via-black/20 to-transparent pointer-events-none" />
                      {/* Spine gold stripes */}
                      <div className="absolute left-5 top-0 bottom-0 w-[2px] bg-yellow-600/30 pointer-events-none" />
                      <div className="absolute left-[22px] top-0 bottom-0 w-[1px] bg-yellow-600/15 pointer-events-none" />

                      {/* Top content */}
                      <div className="text-center space-y-2 z-10 pt-4 sm:pt-6">
                        <span className="text-[10px] sm:text-xs font-black tracking-[0.25em] text-yellow-500/80 uppercase block font-serif">
                          SISTEMA DE CONTROLE DIGITAL
                        </span>
                        <div className="h-0.5 w-16 bg-yellow-500/30 mx-auto" />
                      </div>

                      {/* Center Emblem & Title */}
                      <div className="text-center space-y-5 z-10 my-auto flex flex-col items-center">
                        <div className="relative w-36 h-36 sm:w-44 sm:h-44 bg-gradient-to-br from-[#1a0f00] to-neutral-950 rounded-full border-2 border-yellow-500/40 p-2 shadow-2xl group-hover:scale-105 transition-transform duration-300 overflow-hidden flex items-center justify-center">
                          <img 
                            src={sentinelaLogo} 
                            alt="Sentinela Serviços Logo" 
                            className="w-full h-full object-contain filter drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)]" 
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 rounded-full bg-yellow-500/5 pointer-events-none" />
                        </div>

                        <div className="space-y-1">
                          <h2 className="text-xl sm:text-2xl font-serif font-black tracking-wider text-yellow-500/95 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase">
                            SENTINELA SERVIÇOS
                          </h2>
                          <div className="h-0.5 w-12 bg-yellow-500/40 mx-auto my-1.5" />
                          <h3 className="text-base sm:text-lg font-sans font-bold tracking-widest text-yellow-600/85 uppercase">
                            Livro de Turno
                          </h3>
                          <p className="text-[9px] sm:text-[10px] font-medium tracking-widest text-yellow-700/60 uppercase">
                            Atas e Ocorrências de Posto
                          </p>
                        </div>
                      </div>

                      {/* Bottom content & Opening Prompt */}
                      <div className="text-center space-y-4 z-10 pb-4">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-950/60 border border-yellow-500/25 rounded-full text-[10px] sm:text-xs font-bold text-yellow-500/80 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {filteredRecords.length} {filteredRecords.length === 1 ? 'Ata Registrada' : 'Atas Registradas'}
                        </div>

                        <div className="text-[11px] sm:text-xs font-black tracking-widest text-yellow-500/60 animate-pulse uppercase flex items-center justify-center gap-2">
                          <span>Clique na capa para abrir</span>
                          <ChevronRight className="w-4 h-4 text-yellow-500/60" />
                        </div>
                      </div>

                      {/* Realistic Golden Lock/Clasp overlay on the right edge */}
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-16 bg-gradient-to-l from-yellow-400 via-yellow-600 to-yellow-800 rounded-l-md border-y border-l border-yellow-300/40 shadow-md pointer-events-none">
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-4 bg-yellow-950 rounded-sm" />
                      </div>
                    </motion.div>
                  </div>
                );
              }

              return (
                <div className="relative w-full md:pr-24 pb-8" id="skeuomorphic-book-container">
                  {/* Outer Book Cover */}
                  <div className="relative bg-[#1a0f00] p-3 sm:p-5 md:p-6 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] border border-amber-950/40">
                    
                    {/* Hanging Gilded Header Controls / Post Expansion Button */}
                    {isAdmin ? (
                      <div className="absolute top-0 right-6 sm:right-14 z-35 flex items-center gap-2">
                        {/* Expandable Post Selector Button */}
                        <div className="relative">
                          <button
                            onClick={() => setIsPostMenuOpen(!isPostMenuOpen)}
                            className="bg-gradient-to-b from-yellow-500 via-yellow-600 to-yellow-800 hover:from-yellow-400 hover:to-yellow-700 text-yellow-950 text-[10px] sm:text-xs font-black uppercase px-3.5 py-1.5 rounded-b-xl shadow-lg border-b-2 border-x border-yellow-300/40 transition-all cursor-pointer flex items-center gap-2 hover:translate-y-[1px]"
                            title="Filtrar Atas por Posto de Serviço"
                          >
                            <Building2 className="w-3.5 h-3.5 text-yellow-950 shrink-0" />
                            <span className="max-w-[130px] sm:max-w-[200px] truncate">
                              {selectedAdminPost === 'TODOS' ? 'POSTOS: TODOS' : `POSTO: ${selectedAdminPost}`}
                            </span>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-yellow-950 transition-transform duration-200 shrink-0", isPostMenuOpen && "rotate-180")} />
                          </button>

                          {/* Expansion Menu Dropdown */}
                          <AnimatePresence>
                            {isPostMenuOpen && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40 bg-transparent" 
                                  onClick={() => setIsPostMenuOpen(false)} 
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                  className="absolute right-0 top-full mt-1.5 w-72 bg-neutral-900 border-2 border-yellow-500/60 rounded-2xl shadow-2xl p-2.5 z-50 text-left backdrop-blur-md"
                                >
                                  <div className="px-2.5 py-1.5 border-b border-yellow-500/20 mb-1.5 flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase text-yellow-400 tracking-wider flex items-center gap-1.5">
                                      <Building2 className="w-3.5 h-3.5 text-yellow-400" />
                                      Selecione o Posto
                                    </span>
                                    <span className="text-[9px] text-yellow-500/70 font-extrabold px-2 py-0.5 rounded bg-black/40 border border-yellow-500/20">
                                      {availablePostNames.length} {availablePostNames.length === 1 ? 'Posto' : 'Postos'}
                                    </span>
                                  </div>

                                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                    <button
                                      onClick={() => {
                                        setSelectedAdminPost('TODOS');
                                        setIsPostMenuOpen(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-colors cursor-pointer",
                                        selectedAdminPost === 'TODOS'
                                          ? "bg-yellow-500 text-yellow-950 shadow-md"
                                          : "text-slate-200 hover:bg-neutral-800 hover:text-yellow-400"
                                      )}
                                    >
                                      <span className="flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5 text-yellow-600" />
                                        TODOS OS POSTOS
                                      </span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/30">
                                        {records.length}
                                      </span>
                                    </button>

                                    {availablePostNames.map((postName) => {
                                      const count = records.filter(r => (r.shiftBookDetails?.postoName || '').trim().toLowerCase() === postName.toLowerCase()).length;
                                      const isSelected = selectedAdminPost.toLowerCase() === postName.toLowerCase();
                                      return (
                                        <button
                                          key={postName}
                                          onClick={() => {
                                            setSelectedAdminPost(postName);
                                            setIsPostMenuOpen(false);
                                          }}
                                          className={cn(
                                            "w-full text-left px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-between transition-colors cursor-pointer",
                                            isSelected
                                              ? "bg-yellow-500 text-yellow-950 shadow-md"
                                              : "text-slate-200 hover:bg-neutral-800 hover:text-yellow-400"
                                          )}
                                        >
                                          <span className="flex items-center gap-2 truncate pr-2">
                                            <Building2 className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                            <span className="truncate">{postName}</span>
                                          </span>
                                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 shrink-0">
                                            {count}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <div className="pt-2 border-t border-yellow-500/20 mt-1.5">
                                    <button
                                      onClick={() => {
                                        setIsPostMenuOpen(false);
                                        setIsBookOpen(false);
                                      }}
                                      className="w-full py-2 bg-neutral-800 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 rounded-xl text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/20"
                                    >
                                      <BookOpen className="w-3.5 h-3.5 text-rose-400" />
                                      Fechar Livro de Turno
                                    </button>
                                  </div>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>

                        <button
                          onClick={() => setIsBookOpen(false)}
                          className="bg-gradient-to-b from-yellow-700 to-yellow-900 hover:from-yellow-600 hover:to-yellow-800 text-yellow-100 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-b-xl shadow-md border-b-2 border-x border-yellow-400/30 transition-all cursor-pointer flex items-center gap-1 hover:translate-y-[1px]"
                          title="Fechar o Livro"
                        >
                          <BookOpen className="w-3 h-3 text-yellow-300" />
                          <span className="hidden sm:inline">Fechar Livro</span>
                        </button>
                      </div>
                    ) : (
                      <div className="absolute top-0 right-6 sm:right-12 z-35 flex items-center gap-2">
                        <div className="bg-gradient-to-b from-indigo-700 via-indigo-800 to-indigo-950 text-indigo-100 text-[10px] font-black uppercase px-3 py-1.5 rounded-b-xl shadow-md border-b-2 border-x border-indigo-400/30 flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-indigo-300" />
                          <span className="max-w-[160px] truncate">
                            POSTO: {user?.postoName || 'Portaria Principal'}
                          </span>
                        </div>
                        <button
                          onClick={() => setIsBookOpen(false)}
                          className="bg-gradient-to-b from-yellow-600 to-yellow-800 hover:from-yellow-500 hover:to-yellow-700 text-yellow-50 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-b-xl shadow-md border-b-2 border-x border-yellow-400/30 transition-all cursor-pointer flex items-center gap-1 hover:translate-y-[1px]"
                          title="Fechar o Livro"
                        >
                          <BookOpen className="w-3 h-3" />
                          Fechar Livro
                        </button>
                      </div>
                    )}

                    {/* Golden Corners */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-yellow-500/50 rounded-tl-2xl pointer-events-none" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-yellow-500/50 rounded-tr-2xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-yellow-500/50 rounded-bl-2xl pointer-events-none" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-yellow-500/50 rounded-br-2xl pointer-events-none" />

                    {/* Bookmark tabs sticking out from right edge of the book (only on desktop) */}
                    <div className="absolute top-12 right-0 h-[calc(100%-80px)] hidden lg:flex flex-col gap-2 z-0">
                      {filteredRecords.slice(0, 8).map((rec, idx) => {
                        const isActive = idx === bookPageIndex;
                        return (
                          <button
                            key={rec.id}
                            onClick={() => {
                              setNavigationDirection(idx > bookPageIndex ? 'forward' : 'backward');
                              setBookPageIndex(idx);
                            }}
                            className={cn(
                              "w-28 h-9 text-left pl-3 text-[10px] font-extrabold rounded-r-lg shadow-md transition-all duration-300 border-y border-r flex items-center cursor-pointer absolute right-[-112px]",
                              isActive 
                                ? "bg-amber-100 text-amber-950 border-amber-300 translate-x-1 font-black z-20"
                                : "bg-neutral-850 hover:bg-neutral-800 text-slate-300 border-neutral-900 translate-x-[-12px] z-0 hover:translate-x-0"
                            )}
                            style={{ top: `${idx * 44}px` }}
                            title={`${formatarDataBR(rec.date)} - ${rec.shiftBookDetails?.postoName}`}
                          >
                            <span className="truncate max-w-[85px]">
                              {rec.date.split('-')[2] || ''}/{rec.date.split('-')[1] || ''} • {rec.shiftBookDetails?.postoName ? rec.shiftBookDetails.postoName.substring(0, 5) : 'Posto'}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Mobile Navigation/Tab Switcher inside the book */}
                    <div className="flex md:hidden border-b border-amber-900/10 bg-[#eae1cf] p-1.5 rounded-t-xl gap-1 mb-2 z-10">
                      <button
                        onClick={() => setMobileActiveTab('info')}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-extrabold rounded-lg transition-all uppercase tracking-wide",
                          mobileActiveTab === 'info' ? "bg-[#faf6ed] text-indigo-950 shadow-xs" : "text-slate-600 hover:bg-amber-100/45"
                        )}
                      >
                        📄 Info & Carga
                      </button>
                      <button
                        onClick={() => setMobileActiveTab('relato')}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-extrabold rounded-lg transition-all uppercase tracking-wide",
                          mobileActiveTab === 'relato' ? "bg-[#faf6ed] text-indigo-950 shadow-xs" : "text-slate-600 hover:bg-amber-100/45"
                        )}
                      >
                        📝 Relato & Vistos
                      </button>
                    </div>

                    {/* Left and Right Open Pages (Skeuomorphic) */}
                    <div className="relative bg-[#faf6ed] text-slate-800 rounded-2xl flex flex-col md:flex-row overflow-hidden border border-[#e8dfcf] min-h-[560px] md:min-h-[640px] shadow-inner z-10">
                      
                      {/* Left crease vertical shadow for 3D realism */}
                      <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 bg-gradient-to-r from-black/15 via-transparent to-black/15 pointer-events-none z-20 hidden md:block" />
                      
                      {/* Red marker ribbon bookmark */}
                      <div className="bg-gradient-to-b from-rose-700 to-rose-950 shadow-lg w-3 h-[103%] absolute left-1/2 -translate-x-1/2 -top-1 rounded-b-md pointer-events-none z-20 hidden md:block" />

                      {/* Animation Wrapper for Page Turn Flip / Slide Effect */}
                      <AnimatePresence mode="wait" custom={navigationDirection}>
                        <motion.div
                          key={bookPageIndex}
                          custom={navigationDirection}
                          variants={{
                            initial: (dir: 'forward' | 'backward') => ({
                              opacity: 0,
                              x: dir === 'forward' ? 50 : -50,
                              rotateY: dir === 'forward' ? 8 : -8,
                            }),
                            animate: {
                              opacity: 1,
                              x: 0,
                              rotateY: 0,
                              transition: { duration: 0.35, ease: "easeOut" }
                            },
                            exit: (dir: 'forward' | 'backward') => ({
                              opacity: 0,
                              x: dir === 'forward' ? -50 : 50,
                              rotateY: dir === 'forward' ? -8 : 8,
                              transition: { duration: 0.25, ease: "easeIn" }
                            })
                          }}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                          className="w-full flex flex-col md:flex-row"
                        >
                          
                          {/* Left Page (Information & Scale) */}
                          <div className={cn(
                            "w-full md:w-1/2 p-5 sm:p-7 md:p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-amber-900/10 relative text-left",
                            mobileActiveTab !== 'info' && 'hidden md:flex'
                          )}>
                            {/* Paper margin line left page */}
                            <div className="absolute left-8 top-0 bottom-0 w-px border-r border-red-200/50 pointer-events-none hidden md:block" />
                            
                            <div className="space-y-5 md:pl-4">
                              {currentRec.status === 'in_progress' ? (
                                <div className="bg-amber-100/90 border border-amber-300 p-3 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600 animate-ping shrink-0" />
                                    <div>
                                      <span className="text-[10px] font-black uppercase text-amber-950 block">🟡 TURNO EM ABERTO</span>
                                      <span className="text-[9px] text-amber-800 font-bold">Plantão em andamento. Aguardando encerramento.</span>
                                    </div>
                                  </div>
                                  {(!isAdmin || currentRec.userId === user?.uid) && (
                                    <button
                                      onClick={() => handleStartClosing(currentRec)}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                                      <span>ENCERRAR TURNO</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex justify-between items-start gap-2">
                                  <div className="border-2 border-dashed border-emerald-600/50 text-emerald-700 font-black text-[9px] tracking-widest uppercase px-2 py-0.5 rounded rotate-[-2deg] bg-emerald-50/30 inline-block">
                                    ✅ TURNO CONCLUÍDO E HOMOLOGADO
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-slate-400 bg-[#eae1cf]/40 px-2 py-0.5 rounded border border-amber-950/5">
                                    REGISTRO {bookPageIndex + 1}
                                  </span>
                                </div>
                              )}

                              <div>
                                <span className="text-[9px] font-black text-amber-800/80 block uppercase tracking-wider">Posto de Trabalho / Cliente</span>
                                <h2 className="text-lg md:text-xl font-black text-indigo-950 uppercase tracking-tight leading-tight mt-0.5">
                                  {details?.postoName || "Posto Operacional"}
                                </h2>
                              </div>

                              <div className="grid grid-cols-2 gap-3 bg-[#f3ebd9] p-3 rounded-xl border border-amber-900/10 text-xs">
                                <div>
                                  <span className="text-[9px] font-extrabold text-amber-800/80 block uppercase tracking-wider">Data do Plantão</span>
                                  <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-1 text-xs">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    {formatarDataBR(currentRec.date)}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                                    ({details?.diaSemana || getDiaSemana(currentRec.date)})
                                  </span>
                                </div>
                                <div className="border-l border-amber-950/10 pl-3">
                                  <span className="text-[9px] font-extrabold text-amber-800/80 block uppercase tracking-wider">Período / Horário</span>
                                  <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-1 text-xs uppercase">
                                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                    {currentRec.shift}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-bold block mt-0.5">
                                    ({details?.shiftStartTime}h às {details?.shiftEndTime}h)
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-xs py-1 border-y border-amber-900/10">
                                <div className="py-1">
                                  <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider">Vigilante Sainte</span>
                                  <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-1 truncate">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {details?.vendedorSaindoName || currentRec.userName}
                                  </span>
                                </div>
                                <div className="py-1 border-l border-amber-900/10 pl-3">
                                  <span className="text-[9px] font-extrabold text-slate-400 block uppercase tracking-wider">Vigilante Entrante</span>
                                  <span className="font-extrabold text-slate-800 flex items-center gap-1 mt-1 truncate">
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {details?.vendedorAssumindoName || "-"}
                                  </span>
                                </div>
                              </div>

                              {/* Material Bélico Details */}
                              <div className="space-y-2.5 bg-white p-3.5 rounded-xl border border-amber-900/10 shadow-xs text-xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1">
                                  <h4 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Shield className="w-3.5 h-3.5 text-indigo-600" />
                                    Custódia de Carga
                                  </h4>
                                  <span className={cn(
                                    "text-[8px] font-black uppercase px-2 py-0.5 rounded border-2",
                                    hasWeaponsRecord 
                                      ? "bg-rose-50 text-rose-700 border-rose-200" 
                                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  )}>
                                    {hasWeaponsRecord ? "Posto Armado" : "Posto Desarmado"}
                                  </span>
                                </div>

                                {hasWeaponsRecord && details?.weaponsDetails ? (
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500 font-semibold">Armamento:</span>
                                      <strong className="text-slate-800">{details.weaponsDetails.tipo}</strong>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500 font-semibold">Nº de Série da Arma:</span>
                                      <strong className="font-mono text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 font-bold">{details.weaponsDetails.numeroSerie}</strong>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500 font-semibold">Quantidade Munições:</span>
                                      <strong className="text-slate-800">{details.weaponsDetails.quantidadeMunicao} cartuchos intactos</strong>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-slate-500 font-semibold">Nº Série Colete Balístico:</span>
                                      <strong className="font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border">{details?.coleteNumero || 'Não se aplica'}</strong>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-emerald-800 font-bold bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 flex items-start gap-1.5 leading-normal">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                    <span>Nenhum armamento, munição ou colete sob responsabilidade neste turno de serviço. Posto desarmado.</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Left Page Footer */}
                            <div className="pt-4 border-t border-amber-900/10 flex items-center justify-between text-xs mt-6 md:pl-4">
                              <div className="flex items-center gap-2">
                                {currentRec.status === 'in_progress' && (!isAdmin || currentRec.userId === user?.uid) && (
                                  <button
                                    onClick={() => handleStartClosing(currentRec)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 font-black uppercase text-[10px] tracking-wider cursor-pointer rounded-lg shadow-xs"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                                    Encerrar Turno
                                  </button>
                                )}
                                {(!isAdmin && currentRec.userId === user?.uid) && (
                                  <button
                                    onClick={() => handleStartEdit(currentRec)}
                                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-black uppercase text-[10px] tracking-wider cursor-pointer px-1.5 py-1 hover:bg-amber-100/50 rounded"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Editar Ata
                                  </button>
                                )}
                              </div>
                              <span className="font-serif italic text-slate-400 font-black select-none">
                                Página {(bookPageIndex * 2) + 1}
                              </span>
                            </div>
                          </div>

                          {/* Right Page (Journal Narration & Signatures) */}
                          <div className={cn(
                            "w-full md:w-1/2 p-5 sm:p-7 md:p-8 flex flex-col justify-between relative text-left",
                            mobileActiveTab !== 'relato' && 'hidden md:flex'
                          )}>
                            {/* Paper margin line right page */}
                            <div className="absolute left-8 top-0 bottom-0 w-px border-r border-red-200/50 pointer-events-none hidden md:block" />
                            
                            <div className="space-y-4 md:pl-4">
                              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                                Diário de Ocorrências & Rotina do Posto
                              </h3>

                              {/* Ruled Notebook Paper for Narration */}
                              <div className="relative rounded-xl border border-amber-900/10 p-4 bg-[#fbf9f4] shadow-inner overflow-hidden">
                                <div 
                                  className="text-xs sm:text-sm text-slate-800 whitespace-pre-line font-medium leading-[26px] min-h-[160px] max-h-[220px] overflow-y-auto pl-2 pr-1 select-text"
                                  style={{
                                    backgroundImage: 'linear-gradient(#eae1cf 1px, transparent 1px)',
                                    backgroundSize: '100% 26px',
                                    lineHeight: '26px'
                                  }}
                                >
                                  {details?.routineDescription || currentRec.description || "Sem novidades ou ocorrências registradas neste turno de trabalho."}
                                </div>
                              </div>

                              {/* Polaroid Evidence Photos Gallery */}
                              {currentRec.photos && currentRec.photos.length > 0 && (
                                <div className="space-y-1.5">
                                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                                    📸 Evidências do Plantão ({currentRec.photos.length} fotos)
                                  </span>
                                  <div className="flex flex-wrap gap-2 pt-0.5">
                                    {currentRec.photos.map((photo, idx) => (
                                      <div 
                                        key={idx} 
                                        onClick={() => setActiveLightboxImage(photo)}
                                        className="w-12 h-12 bg-white p-0.5 rounded shadow-sm border border-slate-200 cursor-zoom-in hover:border-indigo-300 transition-all hover:scale-105 transform duration-100 rotate-[1deg] hover:rotate-0"
                                      >
                                        <img 
                                          src={photo} 
                                          alt={`Foto ${idx+1}`} 
                                          className="w-full h-full object-cover rounded-xs"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Formal Passagem/Vistos signatures */}
                              <div className="bg-[#fcfaf5] border border-amber-900/10 p-3 rounded-xl space-y-2 mt-2">
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 block border-b pb-1">
                                  🤝 Termo de Passagem de Serviço
                                </span>
                                <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                                  <div className="p-1.5 bg-white rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Sainte (Passei)</span>
                                    <strong className="text-slate-800 block truncate max-w-full font-bold mt-0.5">{details?.vendedorSaindoName || currentRec.userName}</strong>
                                    {details?.sigSainteDataUrl ? (
                                      <img 
                                        src={details.sigSainteDataUrl} 
                                        alt="Assinatura" 
                                        className="h-6 object-contain mt-1 max-h-[24px] border border-slate-100 p-0.5 bg-white"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span className="text-[8px] text-indigo-700 font-extrabold mt-1 font-mono uppercase">[Visto Digital]</span>
                                    )}
                                  </div>
                                  <div className="p-1.5 bg-white rounded-lg border border-slate-100 flex flex-col items-center justify-center">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Entrante (Assumi)</span>
                                    <strong className="text-slate-800 block truncate max-w-full font-bold mt-0.5">{details?.vendedorAssumindoName || "-"}</strong>
                                    {details?.sigEntranteDataUrl ? (
                                      <img 
                                        src={details.sigEntranteDataUrl} 
                                        alt="Assinatura" 
                                        className="h-6 object-contain mt-1 max-h-[24px] border border-slate-100 p-0.5 bg-white"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span className="text-[8px] text-indigo-700 font-extrabold mt-1 font-mono uppercase">[Visto Digital]</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Right Page Footer */}
                            <div className="pt-4 border-t border-amber-900/10 flex items-center justify-between text-xs mt-6 md:pl-4">
                              <span className="font-serif italic text-slate-400 font-black select-none">
                                Página {(bookPageIndex * 2) + 2}
                              </span>
                              <button
                                onClick={() => setSelectedRecord(currentRec)}
                                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-black uppercase text-[9px] tracking-wider cursor-pointer"
                              >
                                Visualizar Certidão Completa
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                        </motion.div>
                      </AnimatePresence>

                    </div>

                    {/* Floating Navigation Controls on Left and Right Pages */}
                    <div className="absolute top-1/2 -translate-y-1/2 left-[-16px] sm:left-[-22px] z-30">
                      <button
                        onClick={() => {
                          if (bookPageIndex > 0) {
                            setNavigationDirection('backward');
                            setBookPageIndex(prev => prev - 1);
                          }
                        }}
                        disabled={bookPageIndex === 0}
                        className={cn(
                          "w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-md hover:scale-110 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                          bookPageIndex === 0 && "hidden"
                        )}
                        title="Página Anterior"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="absolute top-1/2 -translate-y-1/2 right-[-16px] sm:right-[-22px] md:right-[64px] lg:right-[80px] z-30">
                      <button
                        onClick={() => {
                          if (bookPageIndex < filteredRecords.length - 1) {
                            setNavigationDirection('forward');
                            setBookPageIndex(prev => prev + 1);
                          }
                        }}
                        disabled={bookPageIndex === filteredRecords.length - 1}
                        className={cn(
                          "w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-md hover:scale-110 hover:bg-slate-50 active:scale-95 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100",
                          bookPageIndex === filteredRecords.length - 1 && "hidden"
                        )}
                        title="Próxima Página"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                  </div>

                  {/* Slider & Quick Page Nav Bar underneath the book cover */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-5 px-3 text-xs font-bold text-slate-500">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200/60">
                        <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Folha de Ata <strong className="text-slate-800">{bookPageIndex + 1}</strong> de <strong className="text-slate-800">{filteredRecords.length}</strong></span>
                      </div>
                      <button
                        onClick={() => setIsBookOpen(false)}
                        className="px-3 py-1.5 bg-[#1a0f00] hover:bg-neutral-900 text-yellow-500 hover:text-yellow-400 text-xs font-bold rounded-full shadow-sm border border-yellow-500/30 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                        title="Fechar o Livro"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Fechar Livro</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5 w-full max-w-xs bg-white px-3.5 py-1.5 rounded-full shadow-sm border border-slate-200/60">
                      <span className="text-[9px] uppercase font-black text-slate-400 shrink-0">Passar Folha:</span>
                      <input
                        type="range"
                        min={0}
                        max={filteredRecords.length - 1}
                        value={bookPageIndex}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNavigationDirection(val > bookPageIndex ? 'forward' : 'backward');
                          setBookPageIndex(val);
                        }}
                        className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <span className="text-[10px] uppercase font-black text-slate-400 text-center sm:text-right">
                      * Toque nas laterais ou deslize o seletor para folhear
                    </span>
                  </div>

                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Record Details Modal */}
      <AnimatePresence>
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRecord(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 15, opacity: 0 }}
              className="relative bg-white text-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl border border-slate-200 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-start border-b border-slate-200 pb-4 mb-4">
                <div>
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border mb-1.5 inline-block",
                    selectedRecord.shiftBookDetails?.weaponsDetails?.hasWeapons
                      ? "bg-rose-50 text-rose-700 border-rose-100"
                      : "bg-emerald-50 text-emerald-700 border-emerald-100"
                  )}>
                    {selectedRecord.shiftBookDetails?.weaponsDetails?.hasWeapons ? "Posto Armado" : "Posto Desarmado"}
                  </span>
                  <h3 className="font-black text-lg text-slate-900 uppercase">
                    {selectedRecord.shiftBookDetails?.postoName || "ATA DE TURNO"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Registrado por <strong className="text-indigo-600">{selectedRecord.userName}</strong> em {formatarDataBR(selectedRecord.date)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Document Details Content */}
              <div className="space-y-6 text-sm text-slate-700">
                
                {/* ID & Date Header */}
                <div className="bg-slate-50 border p-4 rounded-xl grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Data / Dia do Plantão</span>
                    <span className="font-extrabold text-slate-800 text-xs">
                      {formatarDataBR(selectedRecord.date)} ({selectedRecord.shiftBookDetails?.diaSemana || getDiaSemana(selectedRecord.date)})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Período / Horário</span>
                    <span className="font-extrabold text-slate-800 text-xs">
                      Turno {selectedRecord.shift} ({selectedRecord.shiftBookDetails?.shiftStartTime} às {selectedRecord.shiftBookDetails?.shiftEndTime})
                    </span>
                  </div>
                </div>

                {/* Team */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 border rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Vigilante Sainte (Quem passou)</span>
                    <span className="font-bold text-slate-800 text-xs">{selectedRecord.shiftBookDetails?.vendedorSaindoName || selectedRecord.userName}</span>
                  </div>
                  <div className="p-3 bg-slate-50 border rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Vigilante Entrante (Quem assumiu)</span>
                    <span className="font-bold text-slate-800 text-xs">{selectedRecord.shiftBookDetails?.vendedorAssumindoName || "Não informado"}</span>
                  </div>
                </div>

                {/* Armamento details */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b pb-1.5">
                    🔫 Controle de Carga e Armamento do Posto
                  </span>
                  
                  {selectedRecord.shiftBookDetails?.weaponsDetails?.hasWeapons ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">Tipo de Arma</span>
                        <span className="font-bold text-slate-800">{selectedRecord.shiftBookDetails.weaponsDetails.tipo}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Nº Série Arma</span>
                        <span className="font-mono font-bold text-rose-700 bg-rose-50 px-1 border border-rose-100 rounded">{selectedRecord.shiftBookDetails.weaponsDetails.numeroSerie}</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">Munições</span>
                        <span className="font-bold text-slate-800">{selectedRecord.shiftBookDetails.weaponsDetails.quantidadeMunicao} unidades</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 block uppercase font-mono">Nº Série Colete</span>
                        <span className="font-mono font-bold text-slate-700 bg-slate-50 px-1 border rounded">{selectedRecord.shiftBookDetails.coleteNumero || 'Não informado'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-700 font-bold bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
                      Posto operacional desarmado neste turno de plantão. Nenhum material bélico custodiado.
                    </div>
                  )}
                </div>

                {/* Routine / Relato */}
                <div className="space-y-1.5 p-4 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    📝 Relato Detalhado do Turno
                  </span>
                  <p className="text-xs font-medium text-slate-700 whitespace-pre-line leading-relaxed">
                    {selectedRecord.shiftBookDetails?.routineDescription || selectedRecord.description}
                  </p>
                </div>

                {/* Photos Gallery */}
                {selectedRecord.photos && selectedRecord.photos.length > 0 && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b pb-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        📸 Evidências Fotográficas do Turno (Galeria)
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {selectedRecord.photos.length} Fotos
                      </span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {selectedRecord.photos.map((photo, idx) => (
                        <div 
                          key={idx} 
                          className="relative aspect-square bg-slate-50 rounded-xl overflow-hidden border border-slate-100 group cursor-zoom-in hover:border-indigo-300 transition-colors"
                          onClick={() => setActiveLightboxImage(photo)}
                        >
                          <img 
                            src={photo} 
                            alt={`Foto Evidência ${idx + 1}`} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute bottom-1 left-1.5 text-[9px] font-bold text-white bg-slate-900/60 px-1.5 py-0.5 rounded">
                            {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Passagem de serviço info */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block border-b pb-1.5 mb-3">
                    🤝 Passagem do Posto & Visto de Homologação
                  </span>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-2 border border-slate-100 bg-slate-50 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase mb-1">Vigilante Sainte</span>
                      <strong className="text-xs text-slate-800 block truncate mb-1">{selectedRecord.shiftBookDetails?.vendedorSaindoName || selectedRecord.userName || "Vigia Anterior"}</strong>
                      {selectedRecord.shiftBookDetails?.sigSainteDataUrl ? (
                        <img 
                          src={selectedRecord.shiftBookDetails.sigSainteDataUrl} 
                          alt="Assinatura Sainte" 
                          className="max-h-[50px] object-contain border border-slate-200 bg-white p-1 rounded"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-indigo-700 block font-mono mt-1">Visto: [Assinado Eletronicamente]</span>
                      )}
                    </div>
                    <div className="p-2 border border-slate-100 bg-slate-50 rounded-xl flex flex-col items-center justify-center">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase mb-1">Vigilante Entrante</span>
                      <strong className="text-xs text-slate-800 block truncate mb-1">{selectedRecord.shiftBookDetails?.vendedorAssumindoName || "Vigia Sucessor"}</strong>
                      {selectedRecord.shiftBookDetails?.sigEntranteDataUrl ? (
                        <img 
                          src={selectedRecord.shiftBookDetails.sigEntranteDataUrl} 
                          alt="Assinatura Entrante" 
                          className="max-h-[50px] object-contain border border-slate-200 bg-white p-1 rounded"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-indigo-700 block font-mono mt-1">Visto: [Confirmado Presencial]</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Footer action buttons */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between">
                <div>
                  {selectedRecord.status === 'in_progress' && (!isAdmin || selectedRecord.userId === user?.uid) && (
                    <button
                      onClick={() => {
                        const rec = selectedRecord;
                        setSelectedRecord(null);
                        handleStartClosing(rec);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                      <span>Encerrar Este Turno Agora</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-100 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Monthly Archive Batch Print Modal */}
      <AnimatePresence>
        {showArchivePrintModal && archiveModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/80 backdrop-blur-sm print:p-0 print:bg-white print:static">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-5xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto my-auto print:max-h-none print:shadow-none print:border-none print:p-0 print:w-full"
            >
              {/* Top Controls Bar (hidden in print) */}
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 print:hidden">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 text-amber-900 rounded-2xl">
                    <Archive className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 uppercase">
                      Livro de Atas do Mês: {getMonthNameBR(archiveModalData.monthKey)}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Relatório consolidado com {archiveModalData.records.length} passagem(ns) de turno arquivadas.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow flex items-center gap-2 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-300" />
                    <span>Imprimir / Gerar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowArchivePrintModal(false)}
                    className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Document Body for Print */}
              <div id="monthly-shiftbook-print-content" className="space-y-6 text-slate-900 font-sans">
                {/* Header */}
                <div className="border-b-2 border-slate-900 pb-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Shield className="w-6 h-6 text-amber-800" />
                    <span className="text-lg font-black uppercase tracking-tight">EGRS SEGURANÇA PATRIMONIAL & FACILITIES</span>
                  </div>
                  <h1 className="text-xl font-black uppercase tracking-widest text-amber-900 mt-1">
                    LIVRO OFICIAL DE GUARDA DE ATAS E PASSAGEM DE TURNO
                  </h1>
                  <p className="text-xs font-bold text-slate-600 uppercase mt-0.5">
                    Mês de Referência: {getMonthNameBR(archiveModalData.monthKey)} | Emissão de Auditoria
                  </p>
                </div>

                {/* Overview Summary Box */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs">
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Total de Turnos Registrados</span>
                    <strong className="text-sm font-black">{archiveModalData.records.length} Atas</strong>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Data de Emissão</span>
                    <strong className="text-sm font-black">{new Date().toLocaleDateString('pt-BR')}</strong>
                  </div>
                  <div>
                    <span className="font-bold text-slate-500 uppercase block text-[10px]">Status do Arquivo</span>
                    <strong className="text-sm font-black text-emerald-700">Auditado & Concluído</strong>
                  </div>
                </div>

                {/* Chronological List of Acts */}
                <div className="space-y-6">
                  {archiveModalData.records.map((rec, idx) => {
                    const details = rec.shiftBookDetails;
                    return (
                      <div key={rec.id} className="border border-slate-300 rounded-xl p-4 space-y-3 bg-white text-xs break-inside-avoid">
                        {/* Act Header */}
                        <div className="flex items-center justify-between bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                          <span className="font-black text-amber-900 uppercase">
                            ATA #{archiveModalData.records.length - idx} - {formatarDataBR(rec.date)} ({rec.shift || 'Turno Regular'})
                          </span>
                          <span className="font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-300">
                            Posto: {details?.postoName || 'Portaria Principal'}
                          </span>
                        </div>

                        {/* Guard Personnel */}
                        <div className="grid grid-cols-2 gap-3 bg-slate-50/80 p-2.5 rounded-lg text-slate-800">
                          <div>
                            <span className="font-bold text-[10px] text-slate-500 uppercase block">Vigilante Saindo (Passagem)</span>
                            <span className="font-extrabold">{details?.vendedorSaindoName || rec.userName || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="font-bold text-[10px] text-slate-500 uppercase block">Vigilante Entrante (Assunção)</span>
                            <span className="font-extrabold">{details?.vendedorAssumindoName || 'N/A'}</span>
                          </div>
                        </div>

                        {/* Weapons Status */}
                        <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                          <span className="font-bold text-[10px] text-slate-500 uppercase block mb-1">Cautela de Armamentos e Chaves</span>
                          {details?.weaponsDetails?.hasWeapons ? (
                            <div className="text-slate-800 space-y-1">
                              <p className="font-bold text-indigo-900">
                                Armamento: {details.weaponsDetails.tipo || 'Pistola'} | {details.weaponsDetails.quantidadeMunicao} Munições | Calibre: {details.weaponsDetails.calibre || '9mm'}
                              </p>
                              {details.weaponsDetails.observacoesArmamento && (
                                <p className="italic text-[11px] text-slate-600">Obs: {details.weaponsDetails.observacoesArmamento}</p>
                              )}
                            </div>
                          ) : (
                            <p className="font-semibold text-slate-600">Sem armamento sob cautela no posto.</p>
                          )}
                        </div>

                        {/* Shift Routine Text */}
                        <div className="p-2.5 rounded-lg border border-slate-200">
                          <span className="font-bold text-[10px] text-slate-500 uppercase block mb-1">Relatório das Ocorrências e Rotina</span>
                          <p className="whitespace-pre-wrap text-slate-800 font-medium leading-relaxed">
                            {details?.routineDescription || rec.description || 'Turno transcorrido sem alterações de segurança.'}
                          </p>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                          <div className="text-center">
                            {details?.sigSainteDataUrl ? (
                              <img src={details.sigSainteDataUrl} alt="Assinatura Sainte" className="h-10 mx-auto object-contain border-b border-slate-400 mb-1" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="h-10 border-b border-slate-400 flex items-center justify-center text-[10px] text-slate-400 font-mono">Assinatura Digital</div>
                            )}
                            <span className="font-extrabold text-[10px] text-slate-700 uppercase block">{details?.vendedorSaindoName || 'Vigilante Saindo'}</span>
                          </div>

                          <div className="text-center">
                            {details?.sigEntranteDataUrl ? (
                              <img src={details.sigEntranteDataUrl} alt="Assinatura Entrante" className="h-10 mx-auto object-contain border-b border-slate-400 mb-1" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="h-10 border-b border-slate-400 flex items-center justify-center text-[10px] text-slate-400 font-mono">Assinatura Digital</div>
                            )}
                            <span className="font-extrabold text-[10px] text-slate-700 uppercase block">{details?.vendedorAssumindoName || 'Vigilante Entrante'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Terms of Guard */}
                <div className="pt-6 border-t-2 border-slate-900 text-center text-[10px] text-slate-500 uppercase font-bold space-y-1">
                  <p>Termo de Encerramento e Guarda Legal de Livro de Passagem de Turno</p>
                  <p>Certifico a autenticidade e inviolabilidade dos registros acima em conformidade com o sistema de gestão de portarias.</p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end print:hidden">
                <button
                  type="button"
                  onClick={() => setShowArchivePrintModal(false)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox Modal */}
      <AnimatePresence>
        {activeLightboxImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveLightboxImage(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md cursor-zoom-out"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-4xl max-h-[85vh] z-10 flex flex-col items-center justify-center"
            >
              <img
                src={activeLightboxImage}
                alt="Foto Expandida"
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <button
                onClick={() => setActiveLightboxImage(null)}
                className="absolute top-4 right-4 p-2 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full cursor-pointer transition-colors shadow-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
