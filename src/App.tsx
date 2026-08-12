import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './components/auth/Login';
import Dashboard from './components/layout/Dashboard';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4">
        <div className="flex flex-col items-center max-w-sm text-center">
          <div className="w-16 h-16 mb-6 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center relative shadow-xl shadow-indigo-500/10">
            <div className="w-10 h-10 border-3 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin" />
            <span className="absolute text-xl font-black text-indigo-400">📌</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-wider uppercase text-slate-100 mb-1">
            PONTO DIGITAL
          </h1>
          <p className="text-xs text-indigo-300 font-medium mb-4">
            Gestão Operacional de Segurança & Portaria
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/80 px-4 py-2 rounded-full border border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Inicializando conexões de segurança...</span>
          </div>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LoginPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
