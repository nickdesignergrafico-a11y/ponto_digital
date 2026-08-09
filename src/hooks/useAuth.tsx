import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User } from '../types';
import { formatCPF } from '../lib/utils';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  switchAdminUser: (adminUser: User | null) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true,
  switchAdminUser: () => {} 
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [overrideUser, setOverrideUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const switchAdminUser = (adminUser: User | null) => {
    setOverrideUser(adminUser);
  };

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (firebaseUser) {
        unsubscribeSnapshot = onSnapshot(doc(db, 'users', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            let dept = data.department || '';
            if (dept.toUpperCase() === 'OPERADOR') {
              dept = 'VIGIA';
              if (data.department !== 'VIGIA') {
                const ref = doc(db, 'users', firebaseUser.uid);
                updateDoc(ref, { department: 'VIGIA' }).catch(err => {
                  console.error("Background department update error:", err);
                });
              }
            }

            // Ensure account active status is true to grant access
            if (data.active === false) {
              const ref = doc(db, 'users', firebaseUser.uid);
              updateDoc(ref, { active: true }).catch(err => {
                console.error("Auto-activating user error:", err);
              });
            }

            setUser({ uid: firebaseUser.uid, ...data, active: true, department: dept } as User);
            setLoading(false);
          } else {
            // Document not found directly by UID! Try to recover/link pre-registered document
            try {
              const userEmail = (firebaseUser.email || '').trim().toLowerCase();
              let cleanCPF = '';
              if (userEmail.endsWith('@pontodigital.app')) {
                cleanCPF = userEmail.replace('@pontodigital.app', '').replace(/\D/g, '');
              }

              let foundDoc = null;

              if (userEmail) {
                const qEmail = query(collection(db, 'users'), where('email', '==', userEmail), limit(1));
                const snapEmail = await getDocs(qEmail);
                if (!snapEmail.empty) {
                  foundDoc = snapEmail.docs[0];
                }
              }

              if (!foundDoc && cleanCPF) {
                const qCpfClean = query(collection(db, 'users'), where('cpf', '==', cleanCPF), limit(1));
                const snapCpfClean = await getDocs(qCpfClean);
                if (!snapCpfClean.empty) {
                  foundDoc = snapCpfClean.docs[0];
                } else {
                  const qCpfFormat = query(collection(db, 'users'), where('cpf', '==', formatCPF(cleanCPF)), limit(1));
                  const snapCpfFormat = await getDocs(qCpfFormat);
                  if (!snapCpfFormat.empty) {
                    foundDoc = snapCpfFormat.docs[0];
                  }
                }
              }

              if (foundDoc) {
                const oldData = foundDoc.data();
                const newUserData = {
                  ...oldData,
                  cpf: cleanCPF || oldData.cpf || '',
                  active: true,
                  department: oldData.department?.toUpperCase() === 'OPERADOR' ? 'VIGIA' : (oldData.department || 'VIGIA'),
                  createdAt: oldData.createdAt || new Date().toISOString(),
                };
                // Copy/link user data to firebaseUser.uid doc
                await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
                setUser({ uid: firebaseUser.uid, ...newUserData } as User);
              } else {
                // No pre-registered doc found: create default employee profile so access is granted
                const defaultUserData = {
                  cpf: cleanCPF,
                  name: firebaseUser.displayName || (userEmail ? userEmail.split('@')[0] : 'Colaborador'),
                  email: firebaseUser.email || '',
                  role: userEmail === 'nickdesignergrafico@gmail.com' ? 'admin' : 'employee',
                  department: 'VIGIA',
                  postoName: 'Portaria Principal',
                  active: true,
                  createdAt: new Date().toISOString(),
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), defaultUserData);
                setUser({ uid: firebaseUser.uid, ...defaultUserData } as User);
              }
            } catch (recoveryErr) {
              console.error("Error recovering user profile in Firestore:", recoveryErr);
              // Fallback user object to prevent blackscreen or null state
              setUser({
                uid: firebaseUser.uid,
                cpf: '',
                name: firebaseUser.displayName || 'Colaborador',
                email: firebaseUser.email || '',
                role: firebaseUser.email === 'nickdesignergrafico@gmail.com' ? 'admin' : 'employee',
                department: 'VIGIA',
                postoName: 'Portaria Principal',
                active: true,
              } as User);
            } finally {
              setLoading(false);
            }
          }
        }, (error) => {
          console.warn("Auth Firestore sync warning/error:", error);
          if (firebaseUser) {
            setUser((prev) => prev || ({
              uid: firebaseUser.uid,
              cpf: '',
              name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'Colaborador'),
              email: firebaseUser.email || '',
              role: firebaseUser.email === 'nickdesignergrafico@gmail.com' ? 'admin' : 'employee',
              department: 'VIGIA',
              postoName: 'Portaria Principal',
              active: true,
            } as User));
          }
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user: overrideUser || user, loading, switchAdminUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

