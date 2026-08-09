import { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, updateDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ShoppingCart, Package, Check, X, Clock, ExternalLink, Undo, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

export default function OrdersManagement() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'processing' | 'completed'>('all');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const ordersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOrders(ordersList);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching orders in real-time:', err);
      setLoading(false);
    });

    return unsub;
  }, []);

  const fetchOrders = async () => {
    // Handled in real time via onSnapshot listener in useEffect
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      setOrders(orders.map(o => o.id === orderId ? { ...o, status } : o));
    } catch (err) {
      alert('Erro ao atualizar pedido');
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filterStatus === 'all') return true;
    return order.status === filterStatus;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Gestão de Pedidos</h1>
        <p className="text-slate-500">Acompanhe e configure solicitações de insumos, equipamentos e suprimentos.</p>
      </div>

      {/* Interactive Filters Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { id: 'pending', label: 'Pendentes', value: orders.filter(o => o.status === 'pending').length, color: 'text-orange-600', activeBg: 'bg-orange-500 text-white border-orange-500 shadow-orange-100', icon: Clock },
          { id: 'processing', label: 'Em Processamento', value: orders.filter(o => o.status === 'processing').length, color: 'text-blue-600', activeBg: 'bg-blue-600 text-white border-blue-600 shadow-blue-100', icon: Package },
          { id: 'completed', label: 'Concluídos', value: orders.filter(o => o.status === 'completed').length, color: 'text-emerald-600', activeBg: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-100', icon: Check },
          { id: 'all', label: 'Total Mês', value: orders.length, color: 'text-slate-600', activeBg: 'bg-slate-900 text-white border-slate-900 shadow-slate-200', icon: ShoppingCart },
        ].map((s) => {
          const isActive = filterStatus === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setFilterStatus(s.id as any)}
              className={cn(
                "p-6 rounded-3xl border text-left flex items-center gap-6 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 active:scale-98 select-none w-full outline-none",
                isActive 
                  ? s.activeBg + " shadow-xl border-transparent scale-[1.02]" 
                  : "bg-white border-slate-100 hover:border-slate-200 hover:shadow-md hover:shadow-slate-100/50"
              )}
            >
              <div className={cn(
                "p-4 rounded-2xl transition-colors duration-300", 
                isActive ? "bg-white/20 text-white" : "bg-slate-50 " + s.color
              )}>
                <s.icon className="w-8 h-8" />
              </div>
              <div>
                <p className={cn("text-xs font-black uppercase tracking-wider", isActive ? "text-white/80" : "text-slate-400")}>{s.label}</p>
                <h4 className={cn("text-3xl font-black font-sans leading-none mt-1", isActive ? "text-white" : "text-slate-900")}>{s.value}</h4>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Pedido / Item</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Solicitante</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Data</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/80 transition-all">
                <td 
                  className="px-6 py-4 cursor-pointer group select-none"
                  onClick={() => setSelectedOrder(order)}
                  title="Clique para ver detalhes do pedido"
                >
                  <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                    {order.title}
                    <Eye className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all shrink-0" />
                  </p>
                  <p className="text-xs text-slate-500 truncate max-w-xs">{order.description}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                      {order.userName?.charAt(0) || 'U'}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{order.userName || 'Usuário'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  {order.createdAt ? format(new Date(order.createdAt), 'dd/MM/yyyy') : '-'}
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase",
                    order.status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                    order.status === 'processing' ? "bg-blue-100 text-blue-600" :
                    order.status === 'pending' ? "bg-orange-100 text-orange-600" :
                    "bg-red-100 text-red-600"
                  )}>
                    {order.status === 'completed' ? 'Concluído' : 
                     order.status === 'processing' ? 'Preperando' :
                     order.status === 'pending' ? 'Pendente' : 'Cancelado'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {order.status === 'pending' && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(order.id, 'processing')}
                          title="Iniciar Processamento"
                          className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                          <Package className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStatusChange(order.id, 'completed')}
                          title="Marcar como Concluído"
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStatusChange(order.id, 'cancelled')}
                          title="Mudar para Cancelado"
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {order.status === 'processing' && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(order.id, 'completed')}
                          title="Marcar como Concluído"
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStatusChange(order.id, 'cancelled')}
                          title="Mudar para Cancelado"
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {(order.status === 'completed' || order.status === 'cancelled') && (
                      <button 
                        onClick={() => handleStatusChange(order.id, 'pending')}
                        title="Reabrir / Mudar para Pendente"
                        className="p-2 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-600 hover:text-white transition-all shadow-sm cursor-pointer"
                      >
                        <Undo className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setSelectedOrder(order)}
                      title="Ver Itens Solicitados"
                      className="p-2 bg-slate-50 text-slate-500 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && !loading && (
          <div className="p-20 text-center flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Package className="w-10 h-10 text-slate-200" />
            </div>
            <h4 className="text-slate-900 font-bold mb-1">Nenhum pedido encontrado</h4>
            <p className="text-slate-500 text-sm">Não há solicitações correspondentes ao filtro de status selecionado.</p>
          </div>
        )}
      </div>

      {/* Details Dialog Modal */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedOrder(null)}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 overflow-hidden text-left"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className={cn(
                    "px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider",
                    selectedOrder.status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                    selectedOrder.status === 'processing' ? "bg-blue-100 text-blue-700" :
                    selectedOrder.status === 'pending' ? "bg-orange-100 text-orange-700" :
                    "bg-red-100 text-red-700"
                  )}>
                    {selectedOrder.status === 'completed' ? 'Concluído' :
                     selectedOrder.status === 'processing' ? 'Preparando' :
                     selectedOrder.status === 'pending' ? 'Pendente' : 'Cancelado'}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 mt-2 leading-tight">
                    {selectedOrder.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Order Info Fields */}
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Solicitante</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold font-sans">
                        {selectedOrder.userName?.charAt(0) || 'U'}
                      </div>
                      <span className="text-sm font-bold text-slate-800">{selectedOrder.userName || 'Usuário'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Data de Envio</p>
                      <p className="text-xs font-bold text-slate-700 mt-1">
                        {selectedOrder.createdAt ? format(new Date(selectedOrder.createdAt), 'dd/MM/yyyy HH:mm') : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Identificação</p>
                      <p className="text-xs font-mono font-bold text-slate-500 mt-1">
                        #{selectedOrder.id?.substring(0, 8)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Itens Solicitados / Descrição</p>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-700 text-sm font-medium leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {selectedOrder.description}
                  </div>
                </div>
              </div>

              {/* Status Management Actions */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-3">Gerenciar Status do Pedido</p>
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status !== 'processing' && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        handleStatusChange(selectedOrder.id, 'processing');
                        setSelectedOrder({ ...selectedOrder, status: 'processing' });
                      }}
                      className="flex-1 min-w-[120px] py-2.5 px-4 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Package className="w-4 h-4" />
                      Preparar
                    </button>
                  )}
                  {selectedOrder.status !== 'completed' && (
                    <button
                      onClick={() => {
                        handleStatusChange(selectedOrder.id, 'completed');
                        setSelectedOrder({ ...selectedOrder, status: 'completed' });
                      }}
                      className="flex-1 min-w-[120px] py-2.5 px-4 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Concluir
                    </button>
                  )}
                  {selectedOrder.status !== 'cancelled' && (
                    <button
                      onClick={() => {
                        handleStatusChange(selectedOrder.id, 'cancelled');
                        setSelectedOrder({ ...selectedOrder, status: 'cancelled' });
                      }}
                      className="flex-1 min-w-[120px] py-2.5 px-4 bg-red-50 hover:bg-red-600 hover:text-white text-rose-600 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      Cancelar
                    </button>
                  )}
                  {(selectedOrder.status === 'completed' || selectedOrder.status === 'cancelled' || selectedOrder.status === 'processing') && (
                    <button
                      onClick={() => {
                        handleStatusChange(selectedOrder.id, 'pending');
                        setSelectedOrder({ ...selectedOrder, status: 'pending' });
                      }}
                      className="flex-1 min-w-[120px] py-2.5 px-4 bg-slate-100 hover:bg-slate-700 hover:text-white text-slate-700 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Undo className="w-4 h-4" />
                      Reabrir Pendente
                    </button>
                  )}
                </div>
              </div>

              {/* Close Button */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="w-full py-3.5 bg-slate-900 text-white font-black rounded-2xl hover:bg-slate-850 active:scale-98 transition-all cursor-pointer text-center text-xs"
                >
                  Fechar Visualização
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

