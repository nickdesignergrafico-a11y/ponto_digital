import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Wallet, Utensils, Heart, Car, Star, Info, ChevronRight, Check } from 'lucide-react';
import { CompanyConfig } from '../../types';
import { cn } from '../../lib/utils';

export default function MyBenefits() {
  const { user } = useAuth();
  const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'company'), (docSnap) => {
      if (docSnap.exists()) {
        setCompanyConfig(docSnap.data() as CompanyConfig);
      }
    });

    return () => unsubscribe();
  }, []);

  const benefits = [
    {
      id: 'meal-ticket',
      name: 'Vale Refeição',
      description: 'Crédito mensal para alimentação em restaurantes e lanchonetes.',
      value: companyConfig?.mealTicketValue || 0,
      icon: Utensils,
      color: 'bg-emerald-500',
      active: true,
    },
    {
      id: 'health-plan',
      name: 'Plano de Saúde',
      description: 'Cobertura médica Nacional para você e seus dependentes.',
      value: 'Plano Ouro Plus',
      icon: Heart,
      color: 'bg-red-500',
      active: user?.benefits?.includes('health_plan') || true,
    },
    {
      id: 'transport',
      name: 'Vale Transporte',
      description: 'Auxílio mensal para deslocamento residência-trabalho.',
      value: 'Recarga Mensal',
      icon: Car,
      color: 'bg-blue-500',
      active: true,
    },
    {
      id: 'gympass',
      name: 'Auxílio Academia',
      description: 'Acesso a diversas academias e estúdios de atividade física.',
      value: 'Plano Basic',
      icon: Star,
      color: 'bg-purple-500',
      active: false,
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 leading-tight">Meus Benefícios</h1>
        <p className="text-slate-500 font-medium">Confira as vantagens e auxílios oferecidos pela empresa.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {benefits.map((benefit) => (
          <div 
            key={benefit.id}
            className={cn(
              "bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col h-full transition-all hover:scale-[1.02]",
              !benefit.active && "opacity-60 grayscale-[0.5]"
            )}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", benefit.color)}>
                <benefit.icon className="w-8 h-8" />
              </div>
              {benefit.active ? (
                <div className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Check className="w-3 h-3" /> ATIVO
                </div>
              ) : (
                <div className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black uppercase tracking-wider">
                  NÃO ADERIDO
                </div>
              )}
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.name}</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-6 flex-1">
              {benefit.description}
            </p>

            <div className="pt-6 border-t border-slate-50 flex items-center justify-between mt-auto">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor/Categoria</p>
                <p className="text-lg font-black text-slate-900">
                  {typeof benefit.value === 'number' 
                    ? `R$ ${benefit.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                    : benefit.value
                  }
                </p>
              </div>
              <button 
                className={cn(
                  "p-3 rounded-xl transition-all",
                  benefit.active ? "bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50" : "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                )}
              >
                {benefit.active ? <Info className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl shadow-blue-600/30">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
            <Star className="w-10 h-10 text-white" />
          </div>
          <div className="text-center md:text-left flex-1">
            <h3 className="text-2xl font-bold mb-2">Novos Benefícios em Breve</h3>
            <p className="text-blue-100 font-medium">Estamos trabalhando para trazer ainda mais vantagens para você e sua família.</p>
          </div>
          <button className="px-8 py-4 bg-white text-blue-600 font-bold rounded-2xl shadow-lg hover:scale-105 transition-all">
            Sugerir Benefício
          </button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
