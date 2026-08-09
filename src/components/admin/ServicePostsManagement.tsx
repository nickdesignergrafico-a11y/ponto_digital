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
  Trash2, 
  Edit2, 
  X, 
  Save, 
  UserCheck, 
  MapPin, 
  AlertCircle 
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

    const postData = {
      name: postName.trim(),
      companyName: companyName.trim(),
      colaboradores: colaboradoresList,
      vigilantes: vigilantesList,
      createdAt: editingPost ? editingPost.createdAt : serverTimestamp()
    };

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
    post.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    post.colaboradores.some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
    post.vigilantes.some(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
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
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                  <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="font-extrabold uppercase tracking-tight text-sm truncate">{post.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(post)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Editar Posto"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-slate-800 transition-colors"
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
