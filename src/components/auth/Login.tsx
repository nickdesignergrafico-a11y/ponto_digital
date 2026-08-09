import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, limit, setDoc, doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { motion } from 'motion/react';
import { LogIn, User as UserIcon, ShieldCheck, Chrome, Eye, EyeOff } from 'lucide-react';
import { cn, formatCPF } from '../../lib/utils';

export default function LoginPage() {
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [showCpf, setShowCpf] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [inWebView, setInWebView] = useState(false);
  const [forceGoogle, setForceGoogle] = useState(false);

  const maskEmail = (emailStr: string): string => {
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 3) {
      return `***@${domain}`;
    }
    return `${name.substring(0, 3)}***@${domain}`;
  };

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setRecoverySuccess('');

    try {
      const trimmedInput = recoveryInput.trim();
      if (!trimmedInput) {
        throw new Error('Por favor, insira seu CPF ou E-mail');
      }

      let emailAddress = '';

      if (trimmedInput.includes('@')) {
        emailAddress = trimmedInput.toLowerCase();
      } else {
        const cleanCPF = trimmedInput.replace(/\D/g, '');
        if (!cleanCPF) {
          throw new Error('CPF inválido');
        }
        let userDoc = null;
        const qClean = query(collection(db, 'users'), where('cpf', '==', cleanCPF), limit(1));
        const snapClean = await getDocs(qClean);
        if (!snapClean.empty) {
          userDoc = snapClean.docs[0];
        } else {
          const qFormat = query(collection(db, 'users'), where('cpf', '==', formatCPF(cleanCPF)), limit(1));
          const snapFormat = await getDocs(qFormat);
          if (!snapFormat.empty) {
            userDoc = snapFormat.docs[0];
          }
        }

        if (!userDoc) {
          throw new Error('CPF não cadastrado no sistema');
        }

        const userData = userDoc.data();
        emailAddress = userData.email || `${cleanCPF}@pontodigital.app`;
      }

      await sendPasswordResetEmail(auth, emailAddress);
      setRecoverySuccess(`Um e-mail com instruções para redefinição de senha foi enviado para ${maskEmail(emailAddress)}.`);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('E-mail não encontrado no sistema de autenticação.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Formato de e-mail inválido.');
      } else {
        setError(err.message || 'Erro ao tentar enviar e-mail de recuperação.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkUsers = async () => {
      try {
        const q = query(collection(db, 'users'), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) setShowBootstrap(true);
      } catch (err) {
        console.error("Could not check users collection:", err);
      }
    };
    checkUsers();

    const detectWebView = () => {
      if (typeof window === 'undefined') return false;
      const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
      const lowercaseUA = ua.toLowerCase();
      
      const isAndroidWebView = lowercaseUA.includes('android') && (lowercaseUA.includes('version/') || lowercaseUA.includes('wv'));
      const isIosWebView = /(iphone|ipod|ipad).*applewebkit(?!.*safari)/i.test(lowercaseUA);
      const isGenericWebView = lowercaseUA.includes('webview') || lowercaseUA.includes('kodular') || lowercaseUA.includes('appinventor');

      // Android Webview spoof guard: in actual mobile Google Chrome on Android, window.chrome is defined.
      // In custom Android web views (like Kodular/Web_Viewer), window.chrome is undefined or has no 'app' attribute,
      // but the user-agent matches 'android'.
      const isAndroid = lowercaseUA.includes('android');
      const isWebViewByChromeCheck = isAndroid && (!(window as any).chrome || !(window as any).chrome?.app);

      return !!(isAndroidWebView || isIosWebView || isGenericWebView || isWebViewByChromeCheck);
    };
    setInWebView(detectWebView());
  }, []);

  const bootstrapAdmin = async () => {
    setLoading(true);
    setError('');
    const email = 'nickdesignergrafico@gmail.com';
    const pass = 'admin123';
    const cleanCPF = '00000000000';

    try {
      console.log("Trying server-side bootstrap...");
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      let data = { success: false, error: '' };
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      }

      if (data && data.success) {
        alert('Administrador configurado com sucesso via servidor!\n\nEmail: nickdesignergrafico@gmail.com\nSenha: admin123');
        setShowBootstrap(false);
        return;
      } else {
        console.warn("Backend bootstrap failed or not configured. Trying client-side fallback...", data?.error || "");
      }
    } catch (serverErr) {
      console.warn("Backend bootstrap failed with error, falling back to client-side bootstrap...", serverErr);
    }

    // Client-side bootstrap fallback
    try {
      console.log("Executing client-side bootstrap fallback...");
      let userUid = '';
      
      try {
        // Try to sign in first to see if it already exists
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        userUid = userCred.user.uid;
      } catch (signInErr: any) {
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential' || signInErr.code === 'auth/wrong-password') {
          // Create the user since they don't exist
          try {
            const userCred = await createUserWithEmailAndPassword(auth, email, pass);
            userUid = userCred.user.uid;
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('O e-mail nickdesignergrafico@gmail.com já existe no Firebase Auth. Se você esqueceu a senha, utilize o fluxo "Esqueceu a senha?" para recuperá-la.');
            } else if (createErr.code === 'auth/operation-not-allowed') {
              throw new Error('O provedor de "E-mail/Senha" está desativado no Firebase console. Vá em Authentication -> Sign-in method no seu Console do Firebase e ative o provedor "E-mail/Senha" para que o sistema possa criar sua conta.');
            } else {
              throw createErr;
            }
          }
        } else {
          throw signInErr;
        }
      }

      if (userUid) {
        // Since firestore rules allow write, we write directly to the user document
        await setDoc(doc(db, 'users', userUid), {
          cpf: cleanCPF,
          name: 'Administrador Sistema',
          email: email,
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString(),
        });
        alert('Administrador configurado localmente com sucesso via SDK!\n\nEmail: nickdesignergrafico@gmail.com\nSenha: admin123');
        setShowBootstrap(false);
      } else {
        throw new Error('Não foi possível obter ou criar o UID do usuário.');
      }
    } catch (err: any) {
      console.error("Client-side bootstrap error:", err);
      let localizedMsg = err.message || err.code;
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('operation-not-allowed'))) {
        localizedMsg = 'O provedor de "E-mail/Senha" está desativado no console do Firebase. Ative-o em Authentication -> Sign-in method no seu console do Firebase.';
      }
      setError('Erro no bootstrap: ' + localizedMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (inWebView && !forceGoogle) {
      setError('O login com Google não é compatível dentro do aplicativo (WebView). Use seu CPF/E-mail e Senha.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user exists in Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!userDoc.exists()) {
        const userEmail = user.email ? user.email.toLowerCase() : '';
        let preRegisteredDoc = null;
        if (userEmail) {
          const emailQuery = query(collection(db, 'users'), where('email', '==', userEmail), limit(1));
          const emailSnap = await getDocs(emailQuery);
          if (!emailSnap.empty) {
            preRegisteredDoc = emailSnap.docs[0];
          }
        }

        if (preRegisteredDoc) {
          const oldData = preRegisteredDoc.data();
          await setDoc(doc(db, 'users', user.uid), {
            ...oldData,
            name: user.displayName || oldData.name,
            active: true,
            createdAt: oldData.createdAt || new Date().toISOString(),
          });

          if (preRegisteredDoc.id !== user.uid) {
            await deleteDoc(doc(db, 'users', preRegisteredDoc.id));
          }
        } else if (user.email === 'nickdesignergrafico@gmail.com') {
          await setDoc(doc(db, 'users', user.uid), {
            cpf: 'ADMIN-MASTER',
            name: user.displayName || 'Administrador',
            email: user.email,
            role: 'admin',
            active: true,
            createdAt: new Date().toISOString(),
          });
        } else {
          // Auto-register collaborator with active status
          await setDoc(doc(db, 'users', user.uid), {
            cpf: '',
            name: user.displayName || 'Colaborador',
            email: user.email || '',
            role: 'employee',
            department: 'VIGIA',
            postoName: 'Portaria Principal',
            active: true,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        const userData = userDoc.data();
        if (!userData.active) {
          await updateDoc(doc(db, 'users', user.uid), { active: true });
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login cancelado');
      } else {
        setError(err.message || 'Erro ao realizar login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const inputVal = cpf.trim();
      const cleanPassword = password.trim();

      if (!inputVal) {
        throw new Error('Por favor, informe seu CPF ou E-mail.');
      }
      if (!cleanPassword) {
        throw new Error('Por favor, informe sua senha.');
      }

      let targetEmails: string[] = [];

      if (inputVal.includes('@')) {
        targetEmails.push(inputVal.toLowerCase());
      } else {
        const cleanCPF = inputVal.replace(/\D/g, '');
        let userDoc: any = null;

        if (cleanCPF) {
          try {
            const qClean = query(collection(db, 'users'), where('cpf', '==', cleanCPF), limit(1));
            const snapClean = await getDocs(qClean);
            if (!snapClean.empty) {
              userDoc = snapClean.docs[0];
            } else {
              const qFormat = query(collection(db, 'users'), where('cpf', '==', formatCPF(cleanCPF)), limit(1));
              const snapFormat = await getDocs(qFormat);
              if (!snapFormat.empty) {
                userDoc = snapFormat.docs[0];
              } else {
                const qEmployeeId = query(collection(db, 'users'), where('employeeId', '==', inputVal), limit(1));
                const snapEmployeeId = await getDocs(qEmployeeId);
                if (!snapEmployeeId.empty) {
                  userDoc = snapEmployeeId.docs[0];
                }
              }
            }
          } catch (lookupErr) {
            console.warn("Could not fetch user by specific CPF query:", lookupErr);
          }
        }

        // Fallback search across all users in case CPF was saved formatted differently
        if (!userDoc) {
          try {
            const allUsersSnap = await getDocs(collection(db, 'users'));
            for (const docItem of allUsersSnap.docs) {
              const uData = docItem.data();
              const uCpfClean = uData.cpf ? String(uData.cpf).replace(/\D/g, '') : '';
              const uEmail = uData.email ? String(uData.email).trim().toLowerCase() : '';
              const uEmpId = uData.employeeId ? String(uData.employeeId).trim() : '';

              if ((cleanCPF && uCpfClean === cleanCPF) || 
                  (uEmail && uEmail === inputVal.toLowerCase()) || 
                  (uEmpId && uEmpId === inputVal)) {
                userDoc = docItem;
                break;
              }
            }
          } catch (allErr) {
            console.warn("Could not perform fallback scan of users:", allErr);
          }
        }

        if (userDoc) {
          const userData = userDoc.data();
          if (userData.email) {
            targetEmails.push(userData.email.trim().toLowerCase());
          }
        }

        if (cleanCPF) {
          const defaultAppEmail = `${cleanCPF}@pontodigital.app`;
          if (!targetEmails.includes(defaultAppEmail)) {
            targetEmails.push(defaultAppEmail);
          }
        }

        const fallbackRawEmail = `${inputVal}@pontodigital.app`.toLowerCase();
        if (!targetEmails.includes(fallbackRawEmail)) {
          targetEmails.push(fallbackRawEmail);
        }
      }

      let lastAuthError: any = null;
      let loggedIn = false;

      for (const emailCandidate of targetEmails) {
        try {
          await signInWithEmailAndPassword(auth, emailCandidate, cleanPassword);
          loggedIn = true;
          break;
        } catch (authErr: any) {
          lastAuthError = authErr;
          // Fallback check with untrimmed password if different
          if (password !== cleanPassword) {
            try {
              await signInWithEmailAndPassword(auth, emailCandidate, password);
              loggedIn = true;
              break;
            } catch (pErr) {
              // Ignore
            }
          }
        }
      }

      if (!loggedIn && lastAuthError) {
        throw lastAuthError;
      }
    } catch (err: any) {
      console.error("Login error:", err);
      let translatedError = err.message || 'Erro ao realizar login';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || (err.message && err.message.includes('auth/invalid-credential'))) {
        translatedError = 'E-mail, CPF ou senha incorretos.';
      } else if (err.code === 'auth/operation-not-allowed') {
        translatedError = 'O provedor de login "E-mail/Senha" está desativado no Firebase console para este projeto.';
      } else if (err.code === 'auth/too-many-requests') {
        translatedError = 'Muitas tentativas malsucedidas de login. Tente novamente mais tarde.';
      }
      setError(translatedError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-slate-800">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-3xl p-8 shadow-2xl border border-black/5">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">PontoDigital</h1>
            <p className="text-slate-500 mt-2">Gestão Inteligente de Ponto</p>
          </div>

          {isRecovering ? (
            <form onSubmit={handleRecoverPassword} className="space-y-6">
              <div className="flex flex-col items-center mb-6">
                <p className="text-slate-500 text-sm text-center">
                  Digite seu CPF ou E-mail cadastrado para receber as instruções de recuperação de senha por e-mail.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CPF ou E-mail</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="000.000.000-00 ou email@exemplo.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm text-center"
                >
                  {error}
                </motion.div>
              )}

              {recoverySuccess && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-sm text-center font-medium"
                >
                  {recoverySuccess}
                </motion.div>
              )}

              <button
                disabled={loading}
                className={cn(
                  "w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2",
                  loading && "opacity-70 cursor-not-allowed"
                )}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Recuperar Senha'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRecovering(false);
                  setError('');
                  setRecoverySuccess('');
                }}
                className="w-full py-3 text-slate-500 font-bold hover:text-slate-700 transition-all text-sm text-center"
              >
                Voltar para o login
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6" autoComplete="on" noValidate>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CPF ou E-mail</label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="000.000.000-00 ou email@exemplo.com"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Senha</label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRecovering(true);
                      setRecoveryInput(cpf);
                      setError('');
                      setRecoverySuccess('');
                    }}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative flex items-center">
                  <LogIn className="absolute left-3 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer flex items-center justify-center"
                    title={showPassword ? "Ocultar Senha" : "Mostrar Senha"}
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm text-center"
                >
                  {error}
                </motion.div>
              )}

              <button
                disabled={loading}
                className={cn(
                  "w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2",
                  loading && "opacity-70 cursor-not-allowed"
                )}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Entrar no Sistema'
                )}
              </button>

              {inWebView ? (
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl text-slate-600 text-xs text-left mt-6 leading-relaxed">
                  <span className="font-bold block text-blue-800 mb-1 text-center">Acesso via Aplicativo</span>
                  Este aplicativo é exclusivo para acesso de colaboradores através de <strong>CPF e Senha</strong>.
                  <span className="block mt-1 text-2xs text-slate-400 text-center">Acesso administrativo via Google disponível apenas pelo navegador do Computador.</span>
                </div>
              ) : (
                <>
                  <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-4 text-slate-400 font-bold tracking-tighter">Ou continue com</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full py-4 bg-white border-2 border-slate-100 hover:border-blue-100 hover:bg-blue-50/30 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow-md cursor-pointer"
                  >
                    <Chrome className="w-5 h-5 text-blue-600" />
                    Entrar com Google
                  </button>
                </>
              )}

              <button 
                type="button"
                onClick={bootstrapAdmin}
                className="w-full py-2.5 text-slate-400 text-xs font-bold hover:text-blue-600 hover:bg-slate-50 transition-all border border-dashed border-slate-200 rounded-xl mt-4 cursor-pointer"
              >
                Garantir / Resetar Senha Admin Padrão (admin123)
              </button>
            </form>
          )}
        </div>
        
        <p className="text-center text-slate-400 text-sm mt-8">
          &copy; 2024 PontoDigital - Sistema de Gestão de RH
        </p>
      </motion.div>
    </div>
  );
}
