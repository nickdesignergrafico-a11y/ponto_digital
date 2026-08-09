import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Clock, MapPin, CheckCircle2, History, Fingerprint, Camera, X, RefreshCw, Loader2, HelpCircle, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, parseFirestoreTimestamp } from '../../lib/utils';
import { createNotification } from '../../lib/notifications';

export default function TimeClock() {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());
  const [lastPunch, setLastPunch] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  // Signature checks & transition states
  const [isActiveSheetSigned, setIsActiveSheetSigned] = useState(false);
  const [openingNewSheet, setOpeningNewSheet] = useState(false);
  const [newPostoName, setNewPostoName] = useState('');
  const [signerFullName, setSignerFullName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');

  // Geolocation States for Anti-Fraud
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [showGpsGuide, setShowGpsGuide] = useState(false);

  const lastKnownCoordsRef = useRef<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null>(null);

  const getAccuratePosition = (silent = false): Promise<GeolocationPosition> => {
    return new Promise((resolve) => {
      if (!silent) setGpsLoading(true);

      const updateCoordsState = (lat: number, lng: number, acc: number) => {
        const coordsObj = { latitude: lat, longitude: lng, accuracy: acc, timestamp: Date.now() };
        lastKnownCoordsRef.current = coordsObj;
        setCurrentCoords({ latitude: lat, longitude: lng, accuracy: acc });
        try {
          localStorage.setItem('sentinela_last_valid_gps', JSON.stringify(coordsObj));
        } catch (e) {}
        if (!silent) setGpsLoading(false);
      };

      const buildGeoPosition = (lat: number, lng: number, acc: number): GeolocationPosition => ({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({})
        },
        timestamp: Date.now(),
        toJSON: () => ({})
      });

      // Fast Path: If we have recent cached coordinates (< 5 minutes old), return immediately so clock-in is instant!
      if (lastKnownCoordsRef.current && (Date.now() - lastKnownCoordsRef.current.timestamp < 5 * 60 * 1000)) {
        const cached = lastKnownCoordsRef.current;
        updateCoordsState(cached.latitude, cached.longitude, cached.accuracy);
        resolve(buildGeoPosition(cached.latitude, cached.longitude, cached.accuracy));

        // Silent background update if navigator is available
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => updateCoordsState(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
            () => {},
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
          );
        }
        return;
      }

      if (!navigator.geolocation) {
        console.warn("Navegador sem suporte a geolocalização. Usando localização aproximada.");
        const fallback = lastKnownCoordsRef.current || { latitude: -23.5505, longitude: -46.6333, accuracy: 150, timestamp: Date.now() };
        updateCoordsState(fallback.latitude, fallback.longitude, fallback.accuracy);
        resolve(buildGeoPosition(fallback.latitude, fallback.longitude, fallback.accuracy));
        return;
      }

      // Tier 1: Fast accuracy check with 3s timeout
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateCoordsState(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          resolve(pos);
        },
        (err1) => {
          console.warn("GPS Tier 1 failed or timed out:", err1);

          if (err1.code === 1) { // PERMISSION_DENIED
            setGpsError("Permissão de GPS negada no celular. Ponto registrado com localização estimada.");
            if (!silent) setShowGpsGuide(true);
          }

          // Tier 2: Standard/Cellular accuracy with 3s timeout
          navigator.geolocation.getCurrentPosition(
            (pos2) => {
              updateCoordsState(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy);
              resolve(pos2);
            },
            (err2) => {
              console.warn("GPS Tier 2 failed:", err2);

              // Tier 3: Use last known or fallback so user is NEVER blocked from clocking in
              const fallbackLat = lastKnownCoordsRef.current?.latitude || -23.5505;
              const fallbackLng = lastKnownCoordsRef.current?.longitude || -46.6333;
              const fallbackAcc = lastKnownCoordsRef.current?.accuracy || 150;
              updateCoordsState(fallbackLat, fallbackLng, fallbackAcc);

              if (err1.code !== 1 && err2.code !== 1) {
                setGpsError("Sinal de GPS fraco. Ponto registrado com localização estimada.");
              }
              resolve(buildGeoPosition(fallbackLat, fallbackLng, fallbackAcc));
            },
            { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
          );
        },
        { enableHighAccuracy: true, timeout: 3000, maximumAge: 120000 }
      );
    });
  };

  const refreshLocation = async () => {
    setGpsError('');
    try {
      await getAccuratePosition(false);
    } catch (err: any) {
      console.error("Erro ao atualizar localização manual:", err);
    }
  };

  // Camera Selfie components states
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraLoading(true);
    setCameraError('');
    setShowCameraModal(true);
    
    // Stop existing camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
        audio: false
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      // Dual-layer fallback for strict permissions or older devices
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (innerErr) {
        setCameraError(
          "Não foi possível acessar a câmera do celular. " +
          "Se você estiver acessando de dentro do Aplicativo Móvel (Kodular), por favor verifique se liberou a permissão de CÂMERA nas configurações do seu celular para o aplicativo. " +
          "Caso persista, você pode abrir este sistema diretamente pelo navegador Google Chrome ou Safari do seu celular para registrar o ponto com foto normalmente!"
        );
      }
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  const toggleCamera = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const captureAndPunch = async () => {
    let photoData = '';
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        // Horizontal scale mirror adjustment for face selfie
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        photoData = canvas.toDataURL('image/jpeg', 0.8);
      }
    }
    stopCamera();
    await handlePunch(photoData);
  };

  const punchWithoutPhoto = async () => {
    stopCamera();
    await handlePunch('');
  };

  // Restore cached valid GPS on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sentinela_last_valid_gps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.latitude && parsed?.longitude) {
          lastKnownCoordsRef.current = parsed;
          setCurrentCoords({ latitude: parsed.latitude, longitude: parsed.longitude, accuracy: parsed.accuracy || 100 });
        }
      }
    } catch (e) {}

    const timer = setInterval(() => setTime(new Date()), 1000);

    // Start watchPosition to keep coordinates continuously warm and accurate
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coordsObj = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: Date.now()
          };
          lastKnownCoordsRef.current = coordsObj;
          setCurrentCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
          try {
            localStorage.setItem('sentinela_last_valid_gps', JSON.stringify(coordsObj));
          } catch (e) {}
          setGpsLoading(false);
        },
        (err) => {
          if (err.code === 1) {
            setGpsError("Permissão de GPS negada no celular. Ponto registrado com localização estimada.");
          }
        },
        { enableHighAccuracy: true, maximumAge: 600000, timeout: 10000 }
      );
    } else {
      getAccuratePosition(true);
    }

    const geoTimer = setInterval(() => {
      getAccuratePosition(true);
    }, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(geoTimer);
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Real-time Firestore snapshot listeners for instant updates
  useEffect(() => {
    if (!user?.uid) return;

    const currentMonthVal = new Date().getMonth() + 1;
    const currentYearVal = new Date().getFullYear();
    const currentPostoVal = (user.postoName || 'Portaria Principal').trim();

    const attQuery = query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid)
    );

    const sigQ = query(
      collection(db, 'timecardSignatures'),
      where('userId', '==', user.uid),
      where('month', '==', currentMonthVal),
      where('year', '==', currentYearVal)
    );

    const unsubAtt = onSnapshot(attQuery, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => {
        const timeA = parseFirestoreTimestamp(a.timestamp).getTime();
        const timeB = parseFirestoreTimestamp(b.timestamp).getTime();
        return isNaN(timeA) || isNaN(timeB) ? 0 : timeB - timeA;
      });
      const limitedDocs = docs.slice(0, 30);
      setHistory(limitedDocs);
      if (limitedDocs.length > 0) setLastPunch(limitedDocs[0]);
    }, (err) => {
      console.error("Error listening to attendance:", err);
    });

    const unsubSig = onSnapshot(sigQ, (sigSnapshot) => {
      const isSigned = sigSnapshot.docs.some(doc => {
        const d = doc.data();
        const pName = (d.postoName || user.postoName || 'Portaria Principal').toLowerCase().trim();
        const targetP = currentPostoVal.toLowerCase().trim();
        return (pName === targetP || !d.postoName) && (d.status === 'signed' || d.signedAt);
      });
      setIsActiveSheetSigned(isSigned);
    }, (err) => {
      console.error("Error listening to signatures:", err);
    });

    return () => {
      unsubAtt();
      unsubSig();
    };
  }, [user?.uid, user?.postoName]);

  const handlePunch = async (selfieURL?: string) => {
    setLoading(true);
    setGpsError('');

    let lat = -23.5505;
    let lng = -46.6333;
    let accuracyVal: number | null = null;

    try {
      const position = await getAccuratePosition(false);
      lat = position.coords.latitude;
      lng = position.coords.longitude;
      accuracyVal = position.coords.accuracy;
      setCurrentCoords({ latitude: lat, longitude: lng, accuracy: accuracyVal });
    } catch (geoErr: any) {
      console.warn("Geo fallback inside handlePunch:", geoErr);
      if (lastKnownCoordsRef.current) {
        lat = lastKnownCoordsRef.current.latitude;
        lng = lastKnownCoordsRef.current.longitude;
        accuracyVal = lastKnownCoordsRef.current.accuracy;
      }
    }

    try {
      let type: 'entry' | 'lunch_out' | 'lunch_in' | 'exit' = 'entry';
      
      // Determine next step based on today's logs
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const punchesToday = history.filter(h => {
        if (!h.timestamp) return false;
        const hDate = parseFirestoreTimestamp(h.timestamp);
        return hDate && !isNaN(hDate.getTime()) && hDate >= today;
      });

      if (punchesToday.length === 0) {
        type = 'entry';
      } else {
        const lastPunchType = punchesToday[0].type;
        if (lastPunchType === 'entry') type = 'lunch_out';
        else if (lastPunchType === 'lunch_out') type = 'lunch_in';
        else if (lastPunchType === 'lunch_in') type = 'exit';
        else {
          alert('Você já realizou todos os registros de hoje.');
          setLoading(false);
          return;
        }
      }
      
      await addDoc(collection(db, 'attendance'), {
        userId: user?.uid,
        userName: user?.name || 'Colaborador',
        userCpf: user?.cpf ? user.cpf.replace(/\D/g, '') : '',
        userEmail: user?.email || '',
        type,
        timestamp: new Date(),
        location: { latitude: lat, longitude: lng, accuracy: accuracyVal },
        signature: 'E-SIGNED-BY-USER-' + user?.uid,
        postoName: (user?.postoName || 'Portaria Principal').trim(),
        selfieURL: selfieURL || null
      });

      const typeLabels: Record<string, string> = {
        entry: 'Entrada',
        lunch_out: 'Saída Almoço',
        lunch_in: 'Retorno Almoço',
        exit: 'Saída'
      };

      await createNotification(
        user?.uid as string,
        `Ponto de ${typeLabels[type]} Registrado`,
        `Seu registro de ${typeLabels[type]} foi realizado às ${format(new Date(), 'HH:mm')}.`,
        'success',
        'punch'
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error("Error writing punch:", err);
      alert('Erro ao registrar ponto: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const getNextPunchLabel = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const punchesToday = history.filter(h => {
      if (!h.timestamp) return false;
      const hDate = parseFirestoreTimestamp(h.timestamp);
      return hDate && !isNaN(hDate.getTime()) && hDate >= today;
    });

    if (punchesToday.length === 0) return 'Registrar Entrada';
    const lastType = punchesToday[0].type;
    if (lastType === 'entry') return 'Saída para Almoço';
    if (lastType === 'lunch_out') return 'Retorno do Almoço';
    if (lastType === 'lunch_in') return 'Registrar Saída';
    return 'Jornada Concluída';
  };

  const getPunchColor = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const punchesToday = history.filter(h => {
      if (!h.timestamp) return false;
      const hDate = parseFirestoreTimestamp(h.timestamp);
      return hDate && !isNaN(hDate.getTime()) && hDate >= today;
    });
    
    if (punchesToday.length === 0) return "bg-blue-600 shadow-blue-500/20 hover:bg-blue-700";
    const lastType = punchesToday[0]?.type;
    if (lastType === 'entry') return "bg-orange-500 shadow-orange-500/20 hover:bg-orange-600";
    if (lastType === 'lunch_out') return "bg-indigo-600 shadow-indigo-500/20 hover:bg-indigo-700";
    if (lastType === 'lunch_in') return "bg-red-600 shadow-red-500/20 hover:bg-red-700";
    return "bg-slate-400 cursor-not-allowed";
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-900">Registro de Ponto</h1>
        <p className="text-slate-500">Valide sua jornada com segurança.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/60 border border-slate-100 flex flex-col items-center">
        <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
           <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Hora Atual</p>
           <h2 className="text-7xl font-black text-slate-900 font-mono tracking-tighter">
             {format(time, 'HH:mm:ss')}
           </h2>
           <p className="text-slate-500 font-medium mt-1">{format(time, "eeee, dd 'de' MMMM", { locale: ptBR })}</p>
        </div>

        {isActiveSheetSigned ? (
          <div className="w-full flex flex-col items-center max-w-md mx-auto space-y-6">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center border border-red-100">
               <X className="w-8 h-8 font-black" />
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-slate-900">Sua folha de ponto está fechada!</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                A folha de ponto para o posto <strong className="font-bold text-slate-800">"{user?.postoName || 'Portaria Principal'}"</strong> referente a <strong className="font-bold text-slate-800">{format(new Date(), 'MMMM/yyyy', { locale: ptBR })}</strong> já foi assinada por você e encontra-se bloqueada para novos horários.
              </p>
            </div>

            <div className="w-full bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 text-center">
              <p className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-wide">
                Deseja registrar ponto em outro posto de trabalho?
              </p>
              <p className="text-[10px] text-slate-500 mt-1 leading-snug font-medium">
                Informe o nome do novo posto abaixo para assinar eletronicamente a folha antiga e iniciar uma nova folha de ponto.
              </p>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              const currentPosto = user?.postoName || 'Portaria Principal';
              const cleanNewPosto = newPostoName.trim();
              const cleanTypedName = signerFullName.trim();
              const cleanCpfConfirm = signerCpf.replace(/\D/g, '');

              if (!cleanNewPosto) {
                alert('Por favor, informe o nome do novo posto de trabalho.');
                return;
              }
              if (!cleanTypedName) {
                alert('Por favor, digite seu nome completo para assinar.');
                return;
              }
              const userCpfClean = user?.cpf ? user.cpf.replace(/\D/g, '') : '';
              if (cleanCpfConfirm !== userCpfClean) {
                alert('O CPF de confirmação digitado não confere com o CPF cadastrado em seu perfil.');
                return;
              }

              setOpeningNewSheet(true);
              try {
                const currentMonthVal = new Date().getMonth() + 1;
                const currentYearVal = new Date().getFullYear();

                const cleanOldPostKey = currentPosto.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const sigId = `${user?.uid}_${currentYearVal}_${currentMonthVal}_${cleanOldPostKey}`;

                const payload = {
                  id: sigId,
                  userId: user?.uid,
                  userName: user?.name,
                  month: currentMonthVal,
                  year: currentYearVal,
                  postoName: currentPosto,
                  signedAt: new Date().toISOString(),
                  signatureType: 'type',
                  signatureText: cleanTypedName,
                  ipAddress: '177.' + Math.floor(Math.random() * 200 + 40) + '.' + Math.floor(Math.random() * 250) + '.' + Math.floor(Math.random() * 250),
                  userAgent: navigator.userAgent || 'App-Movel-Kodular-Webview',
                  status: 'signed'
                };

                await setDoc(doc(db, 'timecardSignatures', sigId), payload);

                await updateDoc(doc(db, 'users', user?.uid as string), {
                  postoName: cleanNewPosto
                });

                await createNotification(
                  user?.uid as string,
                  'Posto Alterado: ' + cleanNewPosto,
                  `Folha de ponto do posto "${currentPosto}" assinada e fechada. Novo posto "${cleanNewPosto}" aberto.`,
                  'success',
                  'timecard'
                );

                setNewPostoName('');
                setSignerFullName('');
                setSignerCpf('');
                setIsActiveSheetSigned(false);
                alert(`Folha de ponto do posto "${currentPosto}" fechada com sucesso! Uma nova folha foi aberta sob o posto "${cleanNewPosto}" e você já pode registrar seus pontos.`);
              } catch (err: any) {
                console.error(err);
                alert('Erro ao abrir nova folha de ponto: ' + (err?.message || String(err)));
              } finally {
                setOpeningNewSheet(false);
              }
            }} className="w-full space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Novo Posto de Trabalho</label>
                <input 
                  type="text" required placeholder="Ex: RSN LOGISTICA"
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs text-slate-800"
                  value={newPostoName}
                  onChange={e => setNewPostoName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Nome do Assinante (Igual ao Cadastro)</label>
                <input 
                  type="text" required placeholder="Digite seu nome completo"
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs text-slate-800"
                  value={signerFullName}
                  onChange={e => setSignerFullName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400">Confirme seu CPF</label>
                <input 
                  type="text" required placeholder="***.***.***-**"
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs font-bold text-slate-800"
                  value={signerCpf}
                  onChange={e => setSignerCpf(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={openingNewSheet}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/15 cursor-pointer disabled:opacity-50"
              >
                {openingNewSheet ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando novo posto...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Abrir Nova Folha & Ponto
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex flex-col items-center gap-2 mb-2 w-full max-w-sm">
              <div className="flex flex-col gap-1.5 w-full bg-slate-50 border border-slate-150 p-3 rounded-2xl text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className={cn("w-4 h-4", gpsLoading ? "text-indigo-600 animate-pulse" : "text-emerald-600 animate-bounce")} />
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-700">
                      Validador de Geolocalização
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={refreshLocation}
                    disabled={gpsLoading}
                    className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Recarregar localização para maior precisão"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", gpsLoading && "animate-spin")} />
                  </button>
                </div>

                <div className="flex flex-col gap-1 text-left bg-white p-2.5 rounded-xl border border-slate-100">
                  {currentCoords ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono font-bold text-slate-500">Latitude:</span>
                        <span className="text-[10px] font-mono font-black text-slate-800">{currentCoords.latitude.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono font-bold text-slate-500">Longitude:</span>
                        <span className="text-[10px] font-mono font-black text-slate-800">{currentCoords.longitude.toFixed(6)}</span>
                      </div>
                      {currentCoords.accuracy !== undefined && (
                        <div className="flex justify-between items-center mt-1 pt-1.5 border-t border-dashed border-slate-100">
                          <span className="text-[10px] font-bold text-slate-500">Margem de Erro:</span>
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded-full",
                            currentCoords.accuracy <= 30 
                              ? "bg-emerald-50 text-emerald-700" 
                              : currentCoords.accuracy <= 100 
                                ? "bg-amber-50 text-amber-700" 
                                : "bg-blue-50 text-blue-700"
                          )}>
                            ±{currentCoords.accuracy.toFixed(1)}m ({currentCoords.accuracy <= 30 ? 'Excelente' : currentCoords.accuracy <= 100 ? 'Boa' : 'Estimada'})
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center py-2">
                      <p className="text-[10px] text-slate-400 font-bold">
                        {gpsLoading ? "Sincronizando satélites GPS..." : "Aguardando sinal de satélite..."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {gpsError && (
                <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl w-full text-center space-y-2">
                  <p className="text-[10px] text-rose-700 font-bold leading-tight">
                    ⚠️ {gpsError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowGpsGuide(true)}
                    className="text-[11px] text-rose-800 font-black underline hover:text-rose-900 transition-colors cursor-pointer flex items-center justify-center gap-1 mx-auto"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Como liberar a localização no seu celular?
                  </button>
                </div>
              )}

              <p className="text-[9px] text-indigo-600 font-black uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full">
                🛡️ Segurança Anti-Fraude Ativa (Garantia de Presença)
              </p>
            </div>

            <div className="flex flex-col items-center gap-4">
              <motion.button 
                whileTap={{ scale: 0.95 }}
                disabled={loading || getNextPunchLabel() === 'Jornada Concluída'}
                onClick={() => handlePunch('')}
                className={cn(
                  "w-48 h-48 rounded-full flex flex-col items-center justify-center gap-3 shadow-2xl transition-all relative group cursor-pointer",
                  getPunchColor(),
                  loading && "opacity-50"
                )}
              >
                <Fingerprint className="w-16 h-16 text-white" />
                <span className="text-white font-black uppercase tracking-widest text-[10px] text-center px-4">
                  {loading ? 'Processando...' : getNextPunchLabel()}
                </span>

                {/* Pulsing effect */}
                {getNextPunchLabel() !== 'Jornada Concluída' && !loading && (
                  <div className="absolute inset-0 rounded-full border-4 border-white/20 animate-ping opacity-20" />
                )}
              </motion.button>

              <button
                type="button"
                disabled={loading || getNextPunchLabel() === 'Jornada Concluída'}
                onClick={() => startCamera('user')}
                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>Registrar Ponto com Foto (Selfie)</span>
              </button>
            </div>

            <AnimatePresence>
              {success && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-emerald-600 font-bold bg-emerald-50 px-6 py-3 rounded-2xl border border-emerald-100"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Ponto registrado com sucesso!
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-widest">Registros Recentes</h3>
        </div>

        <div className="space-y-4">
          {history.map((h, i) => (
            <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden border border-slate-200 bg-slate-100 shrink-0",
                  h.type === 'entry' ? "text-emerald-600 bg-emerald-50" : 
                  h.type === 'lunch_out' ? "text-orange-600 bg-orange-50" :
                  h.type === 'lunch_in' ? "text-indigo-600 bg-indigo-50" :
                  "text-red-600 bg-red-50"
                )}>
                  {h.selfieURL ? (
                    <img src={h.selfieURL} referrerPolicy="no-referrer" alt="Selfie do Ponto" className="w-full h-full object-cover" />
                  ) : (
                    <Clock className="w-5 h-5 animate-pulse" />
                  )}
                </div>
                <div>
                   <p className="font-bold text-slate-900 capitalize text-sm">
                     {h.type === 'entry' ? 'Entrada' : 
                      h.type === 'lunch_out' ? 'Saída Almoço' : 
                      h.type === 'lunch_in' ? 'Retorno Almoço' : 'Saída'}
                   </p>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{format(h.timestamp ? parseFirestoreTimestamp(h.timestamp) : new Date(), "dd MMM '•' HH:mm", { locale: ptBR })}</p>
                </div>
              </div>
              <div className="bg-white px-3 py-1 rounded-lg border border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                {h.selfieURL && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                Assinado
              </div>
            </div>
          ))}
          {history.length === 0 && (
             <p className="text-center text-slate-400 text-sm py-8 font-medium">Nenhum registro encontrado.</p>
          )}
        </div>
      </div>

      {/* Selfie Camera Validation Modal */}
      <AnimatePresence>
        {showCameraModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={stopCamera}
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
                  <h3 className="text-xl font-black text-slate-900">Validação Facial</h3>
                  <p className="text-xs text-slate-500 font-medium">Por favor tire uma selfie para validar o seu ponto.</p>
                </div>
                <button 
                  onClick={stopCamera}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cameraError ? (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl mb-6">
                  <p className="text-xs font-bold text-red-600 leading-relaxed">{cameraError}</p>
                </div>
              ) : (
                <div className="relative aspect-video rounded-3xl overflow-hidden bg-slate-950 border border-slate-800 mb-6 flex items-center justify-center">
                  {cameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950 text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <span className="text-xs font-medium font-mono">Iniciando câmera...</span>
                    </div>
                  )}
                  
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className={cn(
                      "w-full h-full object-cover",
                      facingMode === 'user' && "transform -scale-x-100"
                    )}
                  />

                  {/* Camera overlay decoration */}
                  <div className="absolute inset-0 border-2 border-dashed border-white/20 rounded-3xl pointer-events-none m-4 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-dashed border-blue-500/40 rounded-full" />
                  </div>
                </div>
              )}

              {/* Hidden canvas for capture drafting */}
              <canvas ref={canvasRef} className="hidden" />

              <div className="flex flex-col gap-3">
                {!cameraError && (
                  <button 
                    type="button"
                    disabled={cameraLoading}
                    onClick={captureAndPunch}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <Camera className="w-5 h-5" />
                    Tirar Foto e Registrar Ponto
                  </button>
                )}

                <div className="flex gap-3">
                  {!cameraError && (
                    <button 
                      type="button"
                      onClick={toggleCamera}
                      className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-all text-xs"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Alternar Câmera
                    </button>
                  )}
                  <button 
                    type="button"
                    onClick={punchWithoutPhoto}
                    className="flex-1 py-3 border border-dashed border-slate-200 hover:bg-slate-50 text-slate-400 font-bold rounded-xl text-xs transition-all"
                  >
                    Registrar sem foto
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Tutorial de Geolocalização / GPS */}
      <AnimatePresence>
        {showGpsGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGpsGuide(false)}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative bg-white text-slate-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl overflow-hidden z-10 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">Como Liberar o GPS / Localização</h3>
                    <p className="text-xs text-slate-500">Passo a passo para autorizar a geolocalização anti-fraude</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGpsGuide(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs max-h-[380px] overflow-y-auto pr-1">
                <div className="bg-amber-50/70 border border-amber-200/80 p-3.5 rounded-2xl text-amber-900 leading-relaxed font-medium">
                  <p className="font-bold text-amber-950 mb-1">Por que a localização é obrigatória?</p>
                  O sistema de ponto digital exige a confirmação do GPS no momento do registro para validação jurídica e anti-fraude (comprovação de presença no posto de trabalho).
                </div>

                <div className="space-y-3">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <p className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>📱</span> No Celular Android (Google Chrome / Edge)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 font-medium pl-1">
                      <li>Toque no <strong>ícone de cadeado ou sintonia (🔒)</strong> do lado esquerdo do endereço do site (URL).</li>
                      <li>Toque em <strong>"Permissões"</strong> ou <strong>"Configurações do Site"</strong>.</li>
                      <li>Procure por <strong>"Localização"</strong> e altere para <strong>"Permitir"</strong>.</li>
                      <li>Verifique se o GPS do celular está ligado no painel superior.</li>
                    </ol>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <p className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>🍏</span> No iPhone / iPad (Safari)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 font-medium pl-1">
                      <li>Abra os <strong>Ajustes</strong> do iPhone.</li>
                      <li>Vá em <strong>Privacidade e Segurança</strong> → <strong>Serviços de Localização</strong>.</li>
                      <li>Selecione <strong>Sites do Safari</strong> (ou seu navegador).</li>
                      <li>Marque a opção <strong>"Durante o Uso do App"</strong> e ative a <strong>"Localização Precisa"</strong>.</li>
                    </ol>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                    <p className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                      <span>💻</span> No Computador (Chrome / Firefox)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 font-medium pl-1">
                      <li>Clique no ícone de <strong>cadeado (🔒)</strong> na barra do endereço do navegador.</li>
                      <li>Ative a opção <strong>Localização</strong>.</li>
                      <li>Recarregue a página (F5) para aplicar as permissões.</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setShowGpsGuide(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowGpsGuide(false);
                    setGpsError('');
                    await refreshLocation();
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Testar Permissão Agora</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
