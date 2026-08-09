import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CompanyConfig as CompanyType } from '../../types';
import { Building2, MapPin, Phone, Mail, Upload, Save, CheckCircle2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function CompanyConfig() {
  const [config, setConfig] = useState<CompanyType>({
    name: '',
    cnpj: '',
    address: '',
    contact: '',
    email: '',
    mealTicketValue: 0,
    companyId: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      const docRef = doc(db, 'config', 'company');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setConfig(docSnap.data() as CompanyType);
      }
      setLoading(false);
    };
    fetchConfig();
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('A logo deve ter no máximo 5MB.');
        return;
      }
      setSelectedLogoFile(file);
      // Local instant preview
      const previewUrl = URL.createObjectURL(file);
      setConfig({ ...config, logoUrl: previewUrl });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let finalConfig = { ...config };
      if (selectedLogoFile) {
        try {
          const fileExtension = selectedLogoFile.name.split('.').pop() || 'png';
          const logoRef = ref(storage, `company/logo_${Date.now()}.${fileExtension}`);
          await uploadBytes(logoRef, selectedLogoFile);
          const logoUrl = await getDownloadURL(logoRef);
          finalConfig.logoUrl = logoUrl;
          setConfig(finalConfig);
          setSelectedLogoFile(null);
        } catch (uploadErr) {
          console.error('Error uploading logo to Storage:', uploadErr);
        }
      }
      await setDoc(doc(db, 'config', 'company'), finalConfig);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center font-bold text-slate-400">Carregando...</div>;

  const isAdmin = window.location.pathname.includes('admin'); // Fallback or check role

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Configurações da Empresa</h1>
        <p className="text-slate-500 font-medium">Gerencie os dados e a identidade visual da sua empresa.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col items-center">
            <input 
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleLogoChange}
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-colors"
            >
              {config.logoUrl ? (
                <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-4" />
              ) : (
                <>
                  <Building2 className="w-10 h-10 text-slate-300" />
                  <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">Sua Logo</p>
                </>
              )}
              <div className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Upload className="text-white w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-400 text-[10px] mt-4 text-center font-bold uppercase tracking-wider">Tamanho recomendado:<br/>512x512px (PNG/JPG)</p>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 border-b border-slate-50 pb-3">Seus Benefícios</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-slate-600">
                  Vale Refeição (R$ {config.mealTicketValue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'})
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-medium text-slate-600">Plano de Saúde Bradesco</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-sm font-medium text-slate-600">Gympass Gold</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Column */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSave} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  ID da Empresa
                </label>
                <input 
                  type="text" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="Ex: EMP-001"
                  value={config.companyId || ''}
                  onChange={e => setConfig({...config, companyId: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Vale Refeição (Valor Mensal)
                </label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                    placeholder="0,00"
                    value={config.mealTicketValue || ''}
                    onChange={e => setConfig({...config, mealTicketValue: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  Nome da Empresa / Razão Social
                </label>
                <input 
                  type="text" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="Ex: PontoDigital Software LTDA"
                  value={config.name}
                  onChange={e => setConfig({...config, name: e.target.value})}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  CNPJ
                </label>
                <input 
                  type="text" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="00.000.000/0000-00"
                  value={config.cnpj || ''}
                  onChange={e => setConfig({...config, cnpj: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                Endereço Corporativo
              </label>
              <textarea 
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium h-32"
                placeholder="Rua, Número, Bairro, Cidade - Estado"
                value={config.address}
                onChange={e => setConfig({...config, address: e.target.value})}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  Contato Oficial
                </label>
                <input 
                  type="text" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="(00) 00000-0000"
                  value={config.contact}
                  onChange={e => setConfig({...config, contact: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  E-mail de RH
                </label>
                <input 
                  type="email" 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  placeholder="rh@suaempresa.com"
                  value={config.email || ''}
                  onChange={e => setConfig({...config, email: e.target.value})}
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
              <AnimatePresence>
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-emerald-600 font-bold"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Dados salvos com sucesso!
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                type="submit" 
                disabled={saving}
                className="ml-auto bg-slate-900 text-white font-bold px-8 py-4 rounded-2xl shadow-xl hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Gravando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
