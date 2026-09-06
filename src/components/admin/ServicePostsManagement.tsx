import { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Building2, 
  Users, 
  Shield, 
  ShieldAlert,
  ShieldCheck,
  Trash2, 
  Edit2, 
  X, 
  Save, 
  UserCheck, 
  MapPin, 
  AlertCircle,
  Crosshair
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ServicePost } from '../../types';

export default function ServicePostsManagement() {
  const [posts, setPosts] = useState<ServicePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPost, setEditingPost] = useState<ServicePost | null>(null);

  // Form states
  const [postName, setPostName] = useState('');
  const [companyName, setCompanyName] = useState('');
  
  // Modalidade Armada / Desarmada
  const [isArmed, setIsArmed] = useState(false);

  // Dados da Arma (somente quando posto armado)
  const [weaponTipo, setWeaponTipo] = useState('Revólver .38');
  const [weaponMarca, setWeaponMarca] = useState('Taurus');
  const [weaponCalibre, setWeaponCalibre] = useState('.38');
  const [weaponNumeroSerie, setWeaponNumeroSerie] = useState('');
  const [weaponQuantidadeMunicao, setWeaponQuantidadeMunicao] = useState<number | string>('12');
  const [weaponRegistroSinarm, setWeaponRegistroSinarm] = useState('');
  const [weaponObservacoes, setWeaponObservacoes] = useState('');

  // Dados do Colete Balístico (somente quando posto armado)
  const [vestNumeroSerie, setVestNumeroSerie] = useState('');
  const [vestMarca, setVestMarca] = useState('Inbra Terrestre');
  const [vestNivelProtecao, setVestNivelProtecao] = useState('Nível III-A');
  const [vestTamanho, setVestTamanho] = useState('G');
  const [vestValidade, setVestValidade] = useState('');
  const [vestObservacoes, setVestObservacoes] = useState('');

  // Tag input states
  const [colaboradorInput, setColaboradorInput] = useState('');
  const [colaboradoresList, setColaboradoresList] = useState<string[]>([]);
  
  const [vigilanteInput, setVigilanteInput] = useState('');
  const [vigilantesList, setVigilantesList] = useState<string[]>([]);

  // Fetch posts from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'servicePosts'), (snapshot) => {
      const fetchedPosts: ServicePost[] = [];
      snapshot.forEach((doc) => {
        fetchedPosts.push({ id: doc.id, ...doc.data() } as ServicePost);
      });
      // Sort alphabetically by post name
      fetchedPosts.sort((a, b) => a.name.localeCompare(b.name));
      setPosts(fetchedPosts);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching service posts:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenAddModal = () => {
    setEditingPost(null);
    setPostName('');
    setCompanyName('');
    setIsArmed(false);
    setWeaponTipo('Revólver .38');
    setWeaponMarca('Taurus');
    setWeaponCalibre('.38');
    setWeaponNumeroSerie('');
    setWeaponQuantidadeMunicao('12');
    setWeaponRegistroSinarm('');
    setWeaponObservacoes('');
    setVestNumeroSerie('');
    setVestMarca('Inbra Terrestre');
    setVestNivelProtecao('Nível III-A');
    setVestTamanho('G');
    setVestValidade('');
    setVestObservacoes('');
    setColaboradoresList([]);
    setVigilantesList([]);
    setColaboradorInput('');
    setVigilanteInput('');
    setShowModal(true);
  };

  const handleOpenEditModal = (post: ServicePost) => {
    setEditingPost(post);
    setPostName(post.name);
    setCompanyName(post.companyName || '');
    setIsArmed(Boolean(post.isArmed));
    setWeaponTipo(post.weaponDetails?.tipo || 'Revólver .38');
    setWeaponMarca(post.weaponDetails?.marca || 'Taurus');
    setWeaponCalibre(post.weaponDetails?.calibre || '.38');
    setWeaponNumeroSerie(post.weaponDetails?.numeroSerie || '');
    setWeaponQuantidadeMunicao(post.weaponDetails?.quantidadeMunicao ?? '12');
    setWeaponRegistroSinarm(post.weaponDetails?.registroSinarm || '');
    setWeaponObservacoes(post.weaponDetails?.observacoes || '');
    setVestNumeroSerie(post.vestDetails?.numeroSerie || '');
    setVestMarca(post.vestDetails?.marca || 'Inbra Terrestre');
    setVestNivelProtecao(post.vestDetails?.nivelProtecao || 'Nível III-A');
    setVestTamanho(post.vestDetails?.tamanho || 'G');
    setVestValidade(post.vestDetails?.validade || '');
    setVestObservacoes(post.vestDetails?.observacoes || '');
    setColaboradoresList(post.colaboradores || []);
    setVigilantesList(post.vigilantes || []);
    setColaboradorInput('');
    setVigilanteInput('');
    setShowModal(true);
  };

  const handleAddColaborador = () => {
    if (colaboradorInput.trim() && !colaboradoresList.includes(colaboradorInput.trim())) {
      setColaboradoresList([...colaboradoresList, colaboradorInput.trim()]);
      setColaboradorInput('');
    }
  };

  const handleRemoveColaborador = (index: number) => {
    setColaboradoresList(colaboradoresList.filter((_, i) => i !== index));
  };

  const handleAddVigilante = () => {
    if (vigilanteInput.trim() && !vigilantesList.includes(vigilanteInput.trim())) {
      setVigilantesList([...vigilantesList, vigilanteInput.trim()]);
      setVigilanteInput('');
    }
  };

  const handleRemoveVigilante = (index: number) => {
    setVigilantesList(vigilantesList.filter((_, i) => i !== index));
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postName.trim()) {
      alert("Por favor, digite o nome do posto.");
      return;
    }

    if (isArmed) {
      if (!weaponNumeroSerie.trim()) {
        alert("Para postos armados, o número de série da arma é obrigatório.");
        return;
      }
      if (!vestNumeroSerie.trim()) {
        alert("Para postos armados, o número de série do colete balístico é obrigatório.");
        return;
      }
    }

    const postData: any = {
      name: postName.trim(),
      companyName: companyName.trim(),
      isArmed: Boolean(isArmed),
      colaboradores: colaboradoresList,
      vigilantes: vigilantesList,
      createdAt: editingPost ? editingPost.createdAt : serverTimestamp()
    };

    if (isArmed) {
      postData.weaponDetails = {
        tipo: weaponTipo,
        marca: weaponMarca.trim(),
        calibre: weaponCalibre.trim(),
        numeroSerie: weaponNumeroSerie.trim().toUpperCase(),
        quantidadeMunicao: weaponQuantidadeMunicao === '' ? 0 : Number(weaponQuantidadeMunicao),
        registroSinarm: weaponRegistroSinarm.trim(),
        observacoes: weaponObservacoes.trim()
      };
      postData.vestDetails = {
        numeroSerie: vestNumeroSerie.trim().toUpperCase(),
        marca: vestMarca.trim(),
        nivelProtecao: vestNivelProtecao,
        tamanho: vestTamanho,
        validade: vestValidade,
        observacoes: vestObservacoes.trim()
      };
    } else {
      postData.weaponDetails = null;
      postData.vestDetails = null;
    }

    try {
      if (editingPost) {
        await updateDoc(doc(db, 'servicePosts', editingPost.id), postData);
      } else {
        await addDoc(collection(db, 'servicePosts'), postData);
      }
      setShowModal(false);
    } catch (err) {
      console.error("Error saving service post:", err);
      alert("Erro ao salvar o posto de serviço.");
    }
  };

  const handleDeletePost = async (id: string) => {
    if (window.confirm("Deseja realmente remover este posto de serviço? Isso não afetará os registros já salvos no Livro de Turno.")) {
      try {
        await deleteDoc(doc(db, 'servicePosts', id));
      } catch (err) {
        console.error("Error deleting service post:", err);
        alert("Erro ao excluir o posto de serviço.");
      }
    }
  };

  // Filter posts
  const filteredPosts = posts.filter(post => 
    post.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (post.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (post.isArmed ? 'armado' : 'desarmado').includes(searchTerm.toLowerCase()) ||
    (post.weaponDetails?.numeroSerie || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (post.vestDetails?.numeroSerie || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (post.colaboradores || []).some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (post.vigilantes || []).some(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Postos de Serviço
          </h1>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
            Cadastro de postos, empresas terceirizadas, vigilantes e colaboradores atuantes.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-yellow-300 text-xs font-extrabold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-yellow-300" />
          Cadastrar Posto
        </button>
      </div>

      {/* Search and stats bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por posto, empresa ou nomes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
          />
        </div>
        <div className="text-xs font-black text-slate-500 uppercase tracking-wider">
          Total de Postos: <span className="text-indigo-600 font-extrabold">{posts.length}</span>
        </div>
      </div>

      {/* Grid of posts */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm max-w-lg mx-auto">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-800">Nenhum posto encontrado</h3>
          <p className="text-xs text-slate-500 mt-1">Crie um novo posto de serviço ou ajuste sua busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPosts.map((post) => (
            <div 
              key={post.id} 
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="bg-slate-900 text-white p-4 flex justify-between items-start">
                <div className="flex-1 overflow-hidden mr-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="font-extrabold uppercase tracking-tight text-sm truncate">{post.name}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    {post.isArmed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <Crosshair className="w-3 h-3 text-rose-400" />
                        Posto Armado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        Posto Desarmado
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(post)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Editar Posto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Excluir Posto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 space-y-4">
                {/* Third-party outsourced company */}
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    Empresa Terceirizada
                  </span>
                  <p className="text-xs font-bold text-slate-800">
                    {post.companyName || "Não informada"}
                  </p>
                </div>

                {/* Exibição de Arma e Colete quando for Posto Armado */}
                {post.isArmed && (
                  <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-rose-900 tracking-wider flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-rose-600" />
                        Armamento e Colete do Posto
                      </span>
                      <span className="text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md">
                        Cautelados
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-rose-100 shadow-2xs">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Arma Cadastrada</span>
                        <p className="font-extrabold text-slate-900 truncate mt-0.5">
                          {post.weaponDetails?.tipo || 'Arma Cadastrada'}
                        </p>
                        <p className="text-[10px] font-mono text-rose-700 font-bold mt-0.5 truncate">
                          Série: {post.weaponDetails?.numeroSerie || 'N/I'}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {post.weaponDetails?.quantidadeMunicao !== undefined ? `${post.weaponDetails.quantidadeMunicao} mun.` : ''} {post.weaponDetails?.marca ? `• ${post.weaponDetails.marca}` : ''} {post.weaponDetails?.calibre ? `(${post.weaponDetails.calibre})` : ''}
                        </p>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-rose-100 shadow-2xs">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Colete Balístico</span>
                        <p className="font-extrabold text-slate-900 truncate mt-0.5">
                          {post.vestDetails?.nivelProtecao || 'Nível III-A'} {post.vestDetails?.tamanho ? `(${post.vestDetails.tamanho})` : ''}
                        </p>
                        <p className="text-[10px] font-mono text-indigo-900 font-bold mt-0.5 truncate">
                          Série: {post.vestDetails?.numeroSerie || 'N/I'}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5 truncate">
                          {post.vestDetails?.marca ? `${post.vestDetails.marca}` : 'Colete balístico'} {post.vestDetails?.validade ? `• Val: ${post.vestDetails.validade.split('-').reverse().join('/')}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Colaboradores */}
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Colaboradores do Posto ({post.colaboradores?.length || 0})
                  </span>
                  {post.colaboradores && post.colaboradores.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                      {post.colaboradores.map((col, index) => (
                        <span 
                          key={index} 
                          className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-semibold rounded-lg text-[10px] truncate max-w-full"
                        >
                          {col}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium italic">Nenhum colaborador cadastrado</p>
                  )}
                </div>

                {/* Vigilantes */}
                <div className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Vigilantes ({post.vigilantes?.length || 0})
                  </span>
                  {post.vigilantes && post.vigilantes.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pt-1">
                      {post.vigilantes.map((vig, index) => (
                        <span 
                          key={index} 
                          className="px-2 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 font-semibold rounded-lg text-[10px] truncate max-w-full"
                        >
                          {vig}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 font-medium italic">Nenhum vigilante cadastrado</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="relative bg-white border border-slate-200 w-full max-w-2xl rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center pb-4 border-b border-slate-150">
                <h3 className="font-extrabold uppercase tracking-tight text-slate-900 text-base flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  {editingPost ? "Editar Posto de Serviço" : "Cadastrar Posto de Serviço"}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSavePost} className="space-y-4 py-4 flex-1 overflow-y-auto pr-1">
                {/* Post Name and Company Name */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Nome do Posto / Cliente *</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="Ex: Agência Banco Centro"
                        value={postName}
                        onChange={(e) => setPostName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Empresa Terceirizada</label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Ex: Seguradora Sentinela Ltda"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Modalidade do Posto: Desarmado vs Armado */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-indigo-600" />
                        Modalidade do Posto
                      </h4>
                      <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                        Defina se o posto opera com arma de fogo e colete balístico.
                      </p>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      isArmed 
                        ? 'bg-rose-100 text-rose-800 border-rose-300' 
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    }`}>
                      {isArmed ? 'Posto Armado' : 'Posto Desarmado'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setIsArmed(false)}
                      className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        !isArmed 
                          ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm' 
                          : 'bg-white border-slate-200 hover:bg-slate-100 opacity-70'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${!isArmed ? 'bg-emerald-600 text-white' : 'bg-slate-150 text-slate-500'}`}>
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-900">Posto Desarmado</p>
                        <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                          Vigilância desarmada, controle de portaria ou recepção.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsArmed(true)}
                      className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all cursor-pointer ${
                        isArmed 
                          ? 'bg-rose-50/90 border-rose-500 ring-2 ring-rose-500/20 shadow-sm' 
                          : 'bg-white border-slate-200 hover:bg-slate-100 opacity-70'
                      }`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isArmed ? 'bg-rose-600 text-white' : 'bg-slate-150 text-slate-500'}`}>
                        <Crosshair className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-900">Posto Armado</p>
                        <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">
                          Exige cadastramento obrigatório de arma e colete balístico.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* SOMENTE QUANDO FOR POSTO ARMADO: Cadastrar Arma e Colete Balístico */}
                <AnimatePresence>
                  {isArmed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4 overflow-hidden"
                    >
                      {/* 1. Armamento da Carga do Posto */}
                      <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-rose-200/70">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-rose-600 text-white flex items-center justify-center text-xs font-black">
                              1
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-wider text-rose-950 flex items-center gap-1.5">
                                <Crosshair className="w-4 h-4 text-rose-600" />
                                Cadastrar Arma de Fogo
                              </h4>
                              <p className="text-[10px] text-rose-700 font-medium">
                                Dados da arma de fogo alocada permanentemente neste posto.
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] font-black uppercase bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md">
                            Obrigatório
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Tipo de Arma *</label>
                            <select
                              value={weaponTipo}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWeaponTipo(val);
                                if (val === 'Revólver .38') setWeaponCalibre('.38');
                                else if (val === 'Pistola .380') setWeaponCalibre('.380 ACP');
                                else if (val === 'Pistola 9mm') setWeaponCalibre('9mm');
                                else if (val === 'Pistola .40') setWeaponCalibre('.40 S&W');
                                else if (val === 'Espingarda Cal. 12') setWeaponCalibre('12');
                                else if (val === 'Carabina .38') setWeaponCalibre('.38');
                              }}
                              className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-bold text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            >
                              <option value="Revólver .38">Revólver .38</option>
                              <option value="Pistola .380">Pistola .380</option>
                              <option value="Pistola 9mm">Pistola 9mm</option>
                              <option value="Pistola .40">Pistola .40</option>
                              <option value="Espingarda Cal. 12">Espingarda Cal. 12</option>
                              <option value="Carabina .38">Carabina .38</option>
                              <option value="Outro">Outro Armamento</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Marca / Fabricante</label>
                            <input
                              type="text"
                              placeholder="Ex: Taurus, CBC, Glock"
                              value={weaponMarca}
                              onChange={(e) => setWeaponMarca(e.target.value)}
                              className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Calibre</label>
                            <input
                              type="text"
                              placeholder="Ex: .38, .380, 9mm"
                              value={weaponCalibre}
                              onChange={(e) => setWeaponCalibre(e.target.value)}
                              className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-rose-950">Número de Série da Arma *</label>
                            <input
                              type="text"
                              required={isArmed}
                              placeholder="Ex: ABC123456"
                              value={weaponNumeroSerie}
                              onChange={(e) => setWeaponNumeroSerie(e.target.value.toUpperCase())}
                              className="px-3 py-2 border border-rose-300 rounded-xl text-xs bg-white font-mono font-bold text-rose-950 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 uppercase"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Qtd. de Munições *</label>
                            <input
                              type="number"
                              min="0"
                              required={isArmed}
                              placeholder="Ex: 12"
                              value={weaponQuantidadeMunicao}
                              onChange={(e) => setWeaponQuantidadeMunicao(e.target.value)}
                              className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-bold text-slate-800 text-center focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Registro SINARM / PF (Opcional)</label>
                            <input
                              type="text"
                              placeholder="Ex: SINARM 123456"
                              value={weaponRegistroSinarm}
                              onChange={(e) => setWeaponRegistroSinarm(e.target.value)}
                              className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 pt-1">
                          <label className="text-[11px] font-bold text-slate-700">Observações do Armamento (Opcional)</label>
                          <input
                            type="text"
                            placeholder="Ex: Armário cofre do posto, coldre saque rápido, 2 carregadores"
                            value={weaponObservacoes}
                            onChange={(e) => setWeaponObservacoes(e.target.value)}
                            className="px-3 py-2 border border-rose-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                          />
                        </div>
                      </div>

                      {/* 2. Colete Balístico do Posto */}
                      <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-3">
                        <div className="flex items-center justify-between pb-2 border-b border-indigo-200/70">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black">
                              2
                            </div>
                            <div>
                              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-indigo-600" />
                                Cadastrar Colete Balístico
                              </h4>
                              <p className="text-[10px] text-indigo-700 font-medium">
                                Especificação do colete balístico de proteção individual da guarnição.
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] font-black uppercase bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-md">
                            Obrigatório
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-indigo-950">Nº Série / Lacre do Colete *</label>
                            <input
                              type="text"
                              required={isArmed}
                              placeholder="Ex: COL-987654"
                              value={vestNumeroSerie}
                              onChange={(e) => setVestNumeroSerie(e.target.value.toUpperCase())}
                              className="px-3 py-2 border border-indigo-300 rounded-xl text-xs bg-white font-mono font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Fabricante / Marca</label>
                            <input
                              type="text"
                              placeholder="Ex: Inbra Terrestre, Glágio, CBC"
                              value={vestMarca}
                              onChange={(e) => setVestMarca(e.target.value)}
                              className="px-3 py-2 border border-indigo-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Nível de Proteção</label>
                            <select
                              value={vestNivelProtecao}
                              onChange={(e) => setVestNivelProtecao(e.target.value)}
                              className="px-3 py-2 border border-indigo-200 rounded-xl text-xs bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            >
                              <option value="Nível III-A">Nível III-A</option>
                              <option value="Nível II">Nível II</option>
                              <option value="Nível II-A">Nível II-A</option>
                              <option value="Nível I">Nível I</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Tamanho da Capa</label>
                            <select
                              value={vestTamanho}
                              onChange={(e) => setVestTamanho(e.target.value)}
                              className="px-3 py-2 border border-indigo-200 rounded-xl text-xs bg-white font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            >
                              <option value="P">Tamanho P</option>
                              <option value="M">Tamanho M</option>
                              <option value="G">Tamanho G</option>
                              <option value="GG">Tamanho GG</option>
                              <option value="XG">Tamanho XG</option>
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Data de Validade do Painel</label>
                            <input
                              type="date"
                              value={vestValidade}
                              onChange={(e) => setVestValidade(e.target.value)}
                              className="px-3 py-2 border border-indigo-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-slate-700">Observações do Colete (Opcional)</label>
                            <input
                              type="text"
                              placeholder="Ex: Capa tática preta, zíper revisado"
                              value={vestObservacoes}
                              onChange={(e) => setVestObservacoes(e.target.value)}
                              className="px-3 py-2 border border-indigo-200 rounded-xl text-xs bg-white font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Colaboradores Tag input */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Colaboradores que atuam no Posto
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Adicione os colaboradores para poderem ser selecionados rapidamente.
                  </p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome do colaborador"
                      value={colaboradorInput}
                      onChange={(e) => setColaboradorInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddColaborador();
                        }
                      }}
                      className="flex-1 px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                    />
                    <button
                      type="button"
                      onClick={handleAddColaborador}
                      className="px-4 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-colors uppercase tracking-wider"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                    {colaboradoresList.map((col, index) => (
                      <span 
                        key={index} 
                        className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        {col}
                        <button
                          type="button"
                          onClick={() => handleRemoveColaborador(index)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {colaboradoresList.length === 0 && (
                      <span className="text-[11px] font-medium italic text-slate-400 pl-1">
                        Nenhum colaborador adicionado ainda.
                      </span>
                    )}
                  </div>
                </div>

                {/* Vigilantes Tag input */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Vigilantes (Escala de Plantão)
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Adicione os vigilantes para poderem ser selecionados no Livro de Ata de Plantão.
                  </p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nome do vigilante"
                      value={vigilanteInput}
                      onChange={(e) => setVigilanteInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddVigilante();
                        }
                      }}
                      className="flex-1 px-3.5 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                    />
                    <button
                      type="button"
                      onClick={handleAddVigilante}
                      className="px-4 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-colors uppercase tracking-wider"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                    {vigilantesList.map((vig, index) => (
                      <span 
                        key={index} 
                        className="px-2.5 py-1 bg-white border border-indigo-150 text-indigo-700 font-semibold rounded-xl text-xs flex items-center gap-1.5 shadow-sm"
                      >
                        {vig}
                        <button
                          type="button"
                          onClick={() => handleRemoveVigilante(index)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {vigilantesList.length === 0 && (
                      <span className="text-[11px] font-medium italic text-slate-400 pl-1">
                        Nenhum vigilante adicionado ainda.
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-slate-150">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50 transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer uppercase tracking-wider"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Posto
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
