import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User as UserIcon, Mail, Phone, MapPin, Calendar, Camera, Save, Loader2, CheckCircle2, Eraser, PenTool, Key, X, RefreshCw, FileImage, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import SignatureCanvas from 'react-signature-canvas';
import { uploadBase64ToStorage } from '../../lib/storageHelper';

const compressImage = (base64Str: string, maxWidth = 300, maxHeight = 300): Promise<string> => {
  return new Promise((resolve) => {
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
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

export default function MyProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const signaturePadRef = useRef<SignatureCanvas>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sigIsDrawing, setSigIsDrawing] = useState(false);
  const [isRotated, setIsRotated] = useState(false);

  const startDrawingSig = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#000000'; // Black ink
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let cx, cy;
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      cx = (ry / rect.height) * canvas.width;
      cy = canvas.height - (rx / rect.width) * canvas.height;
    } else {
      cx = ((clientX - rect.left) / rect.width) * canvas.width;
      cy = ((clientY - rect.top) / rect.height) * canvas.height;
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    setSigIsDrawing(true);
  };

  const drawSig = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!sigIsDrawing) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let cx, cy;
    if (isRotated) {
      const rx = clientX - rect.left;
      const ry = clientY - rect.top;
      cx = (ry / rect.height) * canvas.width;
      cy = canvas.height - (rx / rect.width) * canvas.height;
    } else {
      cx = ((clientX - rect.left) / rect.width) * canvas.width;
      cy = ((clientY - rect.top) / rect.height) * canvas.height;
    }

    ctx.lineTo(cx, cy);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    setSigIsDrawing(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    birthDate: '',
    photoURL: '',
    signatureURL: '',
  });

  const [showSignaturePad, setShowSignaturePad] = useState(false);

  // Resize and clear canvas when opened
  useEffect(() => {
    if (showSignaturePad && sigCanvasRef.current) {
      const canvas = sigCanvasRef.current;
      canvas.width = 600;
      canvas.height = 250;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [showSignaturePad]);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
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
    setShowPhotoOptions(false);
    
    // Stop existing stream first
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
      // Fallback if facingMode constraint is too strict on some devices
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
        setCameraError("Não foi possível acessar a câmera do dispositivo. Se você estiver acessando de dentro do aplicativo móvel (Kodular), feche esta janela e use a opção 'Escolher na Galeria', pois ela permite tirar fotos com a câmera nativa do seu celular ou escolher um arquivo da galeria!");
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

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        // Match canvas dimensions to video aspect
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        // Mirror the image if using front camera
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const photoData = canvas.toDataURL('image/jpeg', 0.85);
        stopCamera();

        setLoading(true);
        try {
          const compressed = await compressImage(photoData, 400, 400);
          if (user) {
            const downloadURL = await uploadBase64ToStorage(compressed, `avatars/${user.uid}.jpg`);
            setFormData(prev => ({ ...prev, photoURL: downloadURL }));
            
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
              photoURL: downloadURL
            }, { merge: true });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
          }
        } catch (err) {
          console.error("Error compressing/saving profile photo:", err);
          alert("Erro ao salvar foto no servidor.");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  // Sync formData with user when user loads
  React.useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || '',
        birthDate: user.birthDate || '',
        photoURL: user.photoURL || '',
        signatureURL: user.signatureURL || '',
      });
    }
  }, [user]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setSuccess(false);

    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        birthDate: formData.birthDate,
        photoURL: formData.photoURL,
        signatureURL: formData.signatureURL,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Erro ao atualizar perfil.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const originalBase64 = reader.result as string;
        setLoading(true);
        try {
          const compressed = await compressImage(originalBase64, 400, 400);
          if (user) {
            const downloadURL = await uploadBase64ToStorage(compressed, `avatars/${user.uid}.jpg`);
            setFormData(prev => ({ ...prev, photoURL: downloadURL }));
            
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
              photoURL: downloadURL
            }, { merge: true });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
          }
        } catch (err) {
          console.error("Error compressing/saving profile photo:", err);
          alert("Erro ao processar e salvar a foto.");
        } finally {
          setLoading(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
    setShowPhotoOptions(false);
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignature = async () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL('image/png');
    if (signatureData) {
      setShowSignaturePad(false);
      
      if (user) {
        setLoading(true);
        try {
          const downloadURL = await uploadBase64ToStorage(signatureData, `signatures/${user.uid}.png`);
          setFormData(prev => ({ ...prev, signatureURL: downloadURL }));
          
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, {
            signatureURL: downloadURL,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
          console.error("Error saving signature directly:", err);
          alert("Erro ao salvar assinatura no perfil. Tente novamente.");
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const avatarPlaceholders = [
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">Meu Perfil</h1>
        <p className="text-slate-500 font-medium">Gerencie suas informações pessoais e assinatura digital.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Column */}
        <div className="lg:col-span-1 space-y-6">
          {/* Main Card */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col items-center text-center">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={handlePhotoChange} 
            />
            <div className="relative group mb-6 cursor-pointer" onClick={() => setShowPhotoOptions(true)}>
              <div className="w-32 h-32 rounded-3xl overflow-hidden bg-slate-100 border-4 border-white shadow-lg group-hover:opacity-90 transition-opacity">
                {formData.photoURL ? (
                  <img src={formData.photoURL} alt={formData.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-400">
                    <UserIcon className="w-12 h-12" />
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-2 rounded-xl shadow-lg group-hover:scale-110 transition-transform">
                <Camera className="w-4 h-4" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900 mb-1">{formData.name}</h2>
            <p className="text-slate-400 text-sm font-medium mb-6 uppercase tracking-wider">
              {user?.department?.toUpperCase() === 'OPERADOR' ? 'VIGIA' : (user?.department || 'Setor não informado')}
            </p>

            <button 
              type="button"
              onClick={() => setShowPhotoOptions(true)}
              className="w-full py-3 bg-slate-50 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-colors text-xs flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Alterar Foto de Perfil
            </button>
          </div>

          {/* Signature Card */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <PenTool className="w-4 h-4 text-blue-600" />
                Assinatura Digital
              </h3>
              <button 
                onClick={() => setShowSignaturePad(true)}
                className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {formData.signatureURL ? 'Alterar' : 'Cadastrar'}
              </button>
            </div>

            <div className="aspect-[2/1] rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
              {formData.signatureURL ? (
                <img src={formData.signatureURL} alt="Minha Assinatura" className="max-w-full max-h-full" />
              ) : (
                <div className="text-center p-4">
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    Você ainda não cadastrou sua assinatura digital.
                  </p>
                </div>
              )}
            </div>
            <p className="mt-3 text-[10px] text-slate-400 text-center leading-relaxed italic">
              Sua assinatura será usada para assinar holerites e espelhos de ponto eletronicamente.
            </p>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-lg shadow-slate-200/50">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
               Dados Profissionais
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Matrícula</span>
                <span className="text-slate-900 font-bold font-mono uppercase">{user?.employeeId || '---'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">CPF</span>
                <span className="text-slate-900 font-bold">{user?.cpf}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Setor</span>
                <span className="text-slate-900 font-bold">
                  {user?.department?.toUpperCase() === 'OPERADOR' ? 'VIGIA' : (user?.department || '---')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400 font-medium">Data de Admissão</span>
                <span className="text-slate-900 font-bold">
                  {user?.admissionDate ? (() => {
                    const parts = user.admissionDate.split('-');
                    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date(user.admissionDate).toLocaleDateString('pt-BR');
                  })() : '---'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Column / Tabs */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tab Selector Buttons */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={cn(
                "flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-200",
                activeTab === 'profile'
                  ? "bg-white text-blue-600 shadow-md"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <UserIcon className="w-4 h-4" />
                Dados Pessoais
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('password')}
              className={cn(
                "flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-200",
                activeTab === 'password'
                  ? "bg-white text-blue-600 shadow-md"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <Key className="w-4 h-4" />
                Alterar Senha
              </span>
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'profile' ? (
              <motion.form
                key="profile-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleUpdate}
                className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-8"
              >
                {user?.role === 'admin' && (formData.name.toLowerCase().includes('administrador') || formData.name.toLowerCase().includes('sistema') || formData.name.trim() === 'RH' || formData.name.trim() === 'Admin' || formData.name.trim() === '') && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-3xl text-left flex gap-3 text-xs">
                    <UserIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-amber-950">Nome do Perfil Genérico Detectado</p>
                      <p className="font-medium text-amber-900 leading-relaxed mt-1">
                        Por razões legais e de validade jurídica, os documentos **não podem** ser homologados ou assinados com um nome genérico como "Administrador" ou "Administrador Sistema". Por favor, altere o campo **Nome Completo** abaixo para o seu **nome real completo** e cadastre sua assinatura eletrônica.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <UserIcon className="w-4 h-4 text-blue-500" />
                      Nome Completo
                    </label>
                    <input 
                      type="text"
                      required
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium font-sans text-sm"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Mail className="w-4 h-4 text-blue-500" />
                      E-mail
                    </label>
                    <input 
                      type="email"
                      disabled
                      className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl text-slate-400 font-medium cursor-not-allowed text-sm"
                      value={formData.email}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Phone className="w-4 h-4 text-blue-500" />
                      Telefone / WhatsApp
                    </label>
                    <input 
                      type="text"
                      placeholder="(00) 00000-0000"
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      Data de Nascimento
                    </label>
                    <input 
                      type="date"
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                      value={formData.birthDate}
                      onChange={e => setFormData({...formData, birthDate: e.target.value})}
                    />
                  </div>

                  <div className="md:col-span-2 space-y-3">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                      <MapPin className="w-4 h-4 text-blue-500" />
                      Endereço Residencial
                    </label>
                    <input 
                      type="text"
                      placeholder="Rua, Número, Bairro, Cidade - UF"
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-sm"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex items-center justify-between gap-4">
                  <div>
                    {success && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2 text-emerald-600 font-bold text-xs"
                      >
                        <CheckCircle2 className="w-5 h-5 animate-bounce" />
                        <span>Perfil atualizado com sucesso!</span>
                      </motion.div>
                    )}
                  </div>
                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </motion.form>
            ) : (
              <PasswordChangeForm />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Signature Modal */}
      <AnimatePresence>
        {showSignaturePad && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
              onClick={() => setShowSignaturePad(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] overflow-hidden shadow-2xl"
            >
              <div className="p-8 text-center border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Desenhe sua Assinatura</h2>
                <p className="text-sm text-slate-500 font-medium">Use seu dedo ou mouse para assinar no campo abaixo.</p>
              </div>

              <div className="p-8 bg-slate-50">
                <div className={cn(
                  "bg-white rounded-2xl border-2 border-slate-200 shadow-inner overflow-hidden flex items-center justify-center transition-all duration-300 relative",
                  isRotated ? "h-80" : "h-64"
                )}>
                  <canvas 
                    ref={sigCanvasRef}
                    onMouseDown={startDrawingSig}
                    onMouseMove={drawSig}
                    onMouseUp={stopDrawingSig}
                    onMouseLeave={stopDrawingSig}
                    onTouchStart={startDrawingSig}
                    onTouchMove={drawSig}
                    onTouchEnd={stopDrawingSig}
                    className={cn(
                      "w-full h-full cursor-crosshair touch-none bg-white origin-center transition-all duration-300",
                      isRotated ? "rotate-90 scale-125" : ""
                    )}
                  />
                </div>
                <div className="flex justify-between items-center mt-4 px-1">
                  <button 
                    type="button"
                    onClick={() => setIsRotated(!isRotated)}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold uppercase tracking-wider px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer text-xs"
                  >
                    <RotateCw className="w-3.5 h-3.5 animate-spin-slow" />
                    {isRotated ? "Girar para Padrão" : "Girar Tela (90°)"}
                  </button>
                  <button 
                    onClick={clearSignature}
                    className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Eraser className="w-4 h-4" />
                    Limpar Assinatura
                  </button>
                </div>
              </div>

              <div className="p-8 grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setShowSignaturePad(false)}
                  className="px-6 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={saveSignature}
                  className="px-6 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
                >
                  Salvar Assinatura
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Options Modal */}
      <AnimatePresence>
        {showPhotoOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
              onClick={() => setShowPhotoOptions(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden shadow-2xl p-8"
            >
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-slate-900">Foto de Perfil</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">Como deseja escolher sua foto de perfil?</p>
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => startCamera('user')}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 cursor-pointer"
                >
                  <Camera className="w-5 h-5" />
                  Tirar Foto com a Câmera
                </button>

                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-2xl transition-all border border-slate-100 flex items-center justify-center gap-3 cursor-pointer"
                >
                  <FileImage className="w-5 h-5 text-slate-500" />
                  Escolher na Galeria
                </button>

                <button
                  type="button"
                  onClick={() => setShowPhotoOptions(false)}
                  className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 text-xs transition-colors text-center cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Real-time Web Camera Capture Modal */}
      <AnimatePresence>
        {showCameraModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/95 backdrop-blur-md"
              onClick={stopCamera}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 leading-tight">Câmera de Perfil</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Posicione seu rosto sob o centro da imagem</p>
                </div>
                <button 
                  type="button"
                  onClick={stopCamera} 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 bg-slate-900 flex flex-col items-center justify-center relative aspect-square overflow-hidden min-h-[320px]">
                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3 z-10 bg-slate-950">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="text-xs font-medium">Iniciando câmera...</p>
                  </div>
                )}

                {cameraError ? (
                  <div className="p-8 text-center text-red-400 flex flex-col items-center gap-4">
                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                      <X className="w-6 h-6" />
                    </div>
                    <p className="text-xs leading-relaxed font-medium">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                ) : (
                  <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-inner bg-black flex items-center justify-center">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted
                      className={cn(
                        "w-full h-full object-cover rounded-2xl transition-all",
                        facingMode === 'user' && "-scale-x-100"
                      )}
                    />
                    <div className="absolute inset-0 border-[3px] border-dashed border-white/20 rounded-2xl pointer-events-none" />
                  </div>
                )}
                
                {/* Hidden processing canvas */}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={toggleCamera}
                  disabled={!!cameraError || cameraLoading}
                  className="p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-40 rounded-2xl transition-all cursor-pointer"
                  title="Alternar Câmeras"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!!cameraError || cameraLoading}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-5 h-5 animate-pulse" />
                  Capturar Foto
                </button>

                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-4 text-slate-500 hover:text-slate-700 font-bold hover:bg-slate-50 rounded-2xl transition-all text-sm cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PasswordChangeForm() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccess(false);

    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('A nova senha e a confirmação não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const { auth } = await import('../../lib/firebase');
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error("Non-JSON Response received from change password service:", textResponse);
        let customError = "Resposta inválida do servidor backend (não é JSON).";
        if (response.status === 404) {
          customError = "O serviço de alteração de senha (/api/user/change-password) não está disponível (404). Verifique se o servidor backend está ativo.";
        } else if (textResponse.includes("<!DOCTYPE") || textResponse.includes("<html")) {
          const matchedTitle = textResponse.match(/<title>([\s\S]*?)<\/title>/i);
          const pageTitle = matchedTitle ? matchedTitle[1].trim() : "";
          customError = `O servidor retornou uma página HTML (${response.status}${pageTitle ? ': ' + pageTitle : ''}) em vez de dados JSON. Certifique-se de que o backend esteja ativo e inicializado de forma síncrona.`;
        } else {
          customError = `Erro ${response.status} do servidor: ${textResponse.slice(0, 150)}`;
        }
        throw new Error(customError);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Erro ao alterar a senha.');
      }

      setSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccess(false), 5000);
    } catch (err: any) {
      console.error('Password change error:', err);
      setErrorMsg(err.message || 'Erro inesperado ao alterar senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form 
      key="password-form"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onSubmit={handlePasswordChange}
      className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
          <Key className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">Alterar Senha</h3>
          <p className="text-xs text-slate-500 mt-1">Defina uma nova senha de acesso pessoal para substituir a senha corporativa.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-700">Nova Senha</label>
          <input 
            type="password"
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono tracking-widest text-sm"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-bold text-slate-700">Confirmar Nova Senha</label>
          <input 
            type="password"
            required
            minLength={6}
            placeholder="Repita a nova senha"
            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono tracking-widest text-sm"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>

      {errorMsg && (
        <div className="text-red-500 text-xs font-bold bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          {errorMsg}
        </div>
      )}

      {success && (
        <div className="text-emerald-600 text-xs font-bold bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Senha alterada com sucesso! Use-a nos próximos acessos.</span>
        </div>
      )}

      <div className="pt-4 border-t border-slate-50 flex justify-end">
        <button 
          type="submit"
          disabled={loading}
          className="w-full md:w-auto px-8 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {loading ? 'Salvando...' : 'Atualizar Senha'}
        </button>
      </div>
    </motion.form>
  );
}
