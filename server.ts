import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore";
import fs from 'fs';
import admin from 'firebase-admin';
import { GoogleGenAI, Type } from "@google/genai";

const _filename = typeof __filename !== "undefined" ? __filename : (typeof import.meta !== "undefined" && import.meta.url ? fileURLToPath(import.meta.url) : "");
const _dirname = typeof __dirname !== "undefined" ? __dirname : (_filename ? path.dirname(_filename) : process.cwd());

let firebaseAdminApp: admin.app.App | null = null;

function getFirebaseAdmin(projectId?: string): typeof admin {
  if (!firebaseAdminApp) {
    try {
      firebaseAdminApp = admin.initializeApp({
        projectId: projectId
      });
    } catch (err) {
      console.warn("Failed to initialize firebase-admin using projectId, retrying with default settings:", err);
      try {
        firebaseAdminApp = admin.initializeApp();
      } catch (innerErr) {
        console.error("Critical: Could not initialize firebase-admin:", innerErr);
      }
    }
  }
  return admin;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Load Firebase Config
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let firebaseConfig: any = null;
  let firebaseApp: any = null;
  let auth: any = null;
  let db: any = null;

  if (!fs.existsSync(configPath)) {
    console.error('Firebase config file not found!');
  } else {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      firebaseApp = initializeApp(firebaseConfig);
      auth = getAuth(firebaseApp);
      db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      console.log("Firebase initialized successfully on backend.");
    } catch (err) {
      console.error("Failed to initialize Firebase on backend:", err);
    }
  }

  // API Routes (Registered unconditionally to avoid 404/HTML fallbacks)
  app.post("/api/bootstrap", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const cleanCPF = '00000000000';
      const email = 'nickdesignergrafico@gmail.com';
      const pass = 'admin123';

      const fbAdmin = getFirebaseAdmin(firebaseConfig.projectId);
      let userUid = '';
      
      try {
        // Check if user already exists
        const userRecord = await fbAdmin.auth().getUserByEmail(email);
        userUid = userRecord.uid;
        
        // Force update password to 'admin123'
        await fbAdmin.auth().updateUser(userUid, {
          password: pass,
          displayName: 'Administrador Sistema'
        });
        console.log('Firebase-Admin: Updated existing admin password successfully.');
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found') {
          // Create user
          const newUser = await fbAdmin.auth().createUser({
            email: email,
            password: pass,
            displayName: 'Administrador Sistema'
          });
          userUid = newUser.uid;
          console.log('Firebase-Admin: Created new admin successfully.');
        } else {
          throw authErr;
        }
      }

      if (userUid) {
        await setDoc(doc(db, 'users', userUid), {
          cpf: cleanCPF,
          name: 'Administrador Sistema',
          email: email,
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString(),
        });
        res.json({ success: true, message: 'Administrador configurado e senha definida para admin123 com sucesso!' });
      } else {
        res.status(500).json({ success: false, error: 'Falha ao obter ou criar usuário' });
      }
    } catch (err: any) {
      console.error('Server Bootstrap Error:', err);
      res.status(500).json({ success: false, error: err.code || err.message });
    }
  });

  app.post("/api/admin/update-user", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const { uid, email, password } = req.body;
      if (!uid) {
        return res.status(400).json({ success: false, error: "UID do colaborador é obrigatório" });
      }

      const fbAdmin = getFirebaseAdmin(firebaseConfig.projectId);
      const updateData: any = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;

      if (Object.keys(updateData).length > 0) {
        await fbAdmin.auth().updateUser(uid, updateData);
      }

      res.json({ success: true, message: "Colaborador atualizado no Firebase Auth com sucesso!" });
    } catch (err: any) {
      console.error("Error updating user in Auth:", err);
      res.status(500).json({ success: false, error: err.message || err.code || "Erro ao atualizar dados de autenticação." });
    }
  });

  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ success: false, error: "UID do colaborador é obrigatório" });
      }

      // Prevent deleting oneself
      // Note: The actual check can also be done on client, but on server we should log it.
      const fbAdmin = getFirebaseAdmin(firebaseConfig.projectId);

      // 1. Delete from Firebase Auth
      try {
        await fbAdmin.auth().deleteUser(uid);
        console.log(`Successfully deleted user ${uid} from Firebase Auth.`);
      } catch (authErr: any) {
        console.warn(`Could not delete user ${uid} from Auth (it might not exist or was already deleted):`, authErr.message);
      }

      // 2. Delete from Firestore 'users' collection
      await deleteDoc(doc(db, 'users', uid));
      console.log(`Successfully deleted user ${uid} document from Firestore.`);

      res.json({ success: true, message: "Colaborador excluído com sucesso!" });
    } catch (err: any) {
      console.error("Error deleting user:", err);
      res.status(500).json({ success: false, error: err.message || err.code || "Erro ao excluir colaborador." });
    }
  });

  app.post("/api/admin/create-user", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const { email, password, displayName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, error: "Email e senha são obrigatórios" });
      }

      const fbAdmin = getFirebaseAdmin(firebaseConfig.projectId);
      const newUser = await fbAdmin.auth().createUser({
        email: email.toLowerCase(),
        password: password,
        displayName: displayName,
      });

      res.json({ success: true, uid: newUser.uid, message: "Colaborador criado no Firebase Auth com sucesso!" });
    } catch (err: any) {
      console.error("Error creating user in Auth:", err);
      res.status(500).json({ success: false, error: err.message || err.code || "Erro ao criar usuário na autenticação." });
    }
  });

  app.post("/api/user/change-password", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Não autorizado" });
      }

      const idToken = authHeader.split("Bearer ")[1];
      const fbAdmin = getFirebaseAdmin(firebaseConfig.projectId);
      
      // Verify token securely and get user UID
      const decodedToken = await fbAdmin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, error: "A nova senha deve ter no mínimo 6 caracteres" });
      }

      await fbAdmin.auth().updateUser(uid, { password: newPassword });

      res.json({ success: true, message: "Senha alterada com sucesso!" });
    } catch (err: any) {
      console.error("Error changing user password:", err);
      res.status(500).json({ success: false, error: err.message || "Erro ao alterar senha de acesso." });
    }
  });

  let aiClient: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new Error("A chave GEMINI_API_KEY não foi configurada em Settings > Secrets.");
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  app.post("/api/parse-holerite", async (req, res) => {
    try {
      if (!db || !firebaseConfig) {
        return res.status(500).json({ success: false, error: "Firebase não está inicializado no backend. Verifique o arquivo de configuração." });
      }
      const { fileB64, mimeType } = req.body;
      if (!fileB64) {
        return res.status(400).json({ success: false, error: "O conteúdo do arquivo em base64 é obrigatório." });
      }

      const ai = getGeminiClient();

      // Prepare contents according to our guidelines for multi-part
      const filePart = {
        inlineData: {
          mimeType: mimeType || "image/png",
          data: fileB64.split(",").pop() || fileB64,
        },
      };

      const promptText = "Extraia as informações do holerite ou contracheque brasileiro. " +
        "Identifique o nome do colaborador, CPF, mês (1 a 12), ano (ex: 2026), salário base, e TODAS as rubricas de adicionais " +
        "(como horas extras, DSR, bonificações, gratificações, adicionais de periculosidade ou insalubridade) " +
        "e TODAS as rubricas de deduções/descontos (como INSS, IRPF/Imposto de Renda, vale transporte, farmácia, faltas, pensão alimentícia, empréstimo consignado, etc.). " +
        "Importante: NÃO ignore ou exclua o desconto de INSS e IRPF. Mantenha os valores exatamente como constam no documento, " +
        "sem alterar ou arredondar incorrectamente, para garantir que o resultado seja 100% fiel e idêntico ao documento original.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          filePart,
          { text: promptText }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              employeeName: {
                type: Type.STRING,
                description: "Nome completo do colaborador se estiver legível no contracheque."
              },
              cpf: {
                type: Type.STRING,
                description: "CPF do colaborador encontrado (somente dígitos numéricos)."
              },
              month: {
                type: Type.INTEGER,
                description: "Mês de referência da folha (1 para Janeiro, 12 para Dezembro)."
              },
              year: {
                type: Type.INTEGER,
                description: "Ano com 4 dígitos (ex: 2026)."
              },
              baseSalary: {
                type: Type.NUMBER,
                description: "Salário base contratual padrão da rubrica inicial ou vencimento básico bruto."
              },
              additions: {
                type: Type.ARRAY,
                description: "Acréscimos ou Proventos do mês (DSR, Horas extras, gratificações, insalubridade). NÃO inclua o salário contratual base aqui.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Descrição do adicional/provento" },
                    amount: { type: Type.NUMBER, description: "Valor do adicional" }
                  },
                  required: ["name", "amount"]
                }
              },
              deductions: {
                type: Type.ARRAY,
                description: "Descontos ou deduções do colaborador do mês, incluindo obrigatoriamente INSS, IRPF, convênios de saúde, etc., conforme aparecem no holerite.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Descrição do desconto" },
                    amount: { type: Type.NUMBER, description: "Valor do desconto" }
                  },
                  required: ["name", "amount"]
                }
              }
            },
            required: ["month", "year", "baseSalary"]
          }
        }
      });

      const parsedText = response.text;
      if (!parsedText) {
        throw new Error("A IA gerou uma resposta vazia.");
      }

      const aiOutput = JSON.parse(parsedText);

      // Fetch users to try finding a match matching names or cpf
      const uSnapshot = await getDocs(collection(db, 'users'));
      const usersList = uSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const extractedCPF = aiOutput.cpf ? aiOutput.cpf.replace(/\D/g, '') : '';
      const extractedNameClean = aiOutput.employeeName ? aiOutput.employeeName.toLowerCase().trim() : '';

      let matchedEmployee: any = null;
      if (extractedCPF) {
        matchedEmployee = usersList.find(u => u.cpf && u.cpf.replace(/\D/g, '') === extractedCPF);
      }

      if (!matchedEmployee && extractedNameClean) {
        matchedEmployee = usersList.find(u => {
          const uName = u.name ? u.name.toLowerCase().trim() : '';
          return uName.includes(extractedNameClean) || extractedNameClean.includes(uName);
        });
      }

      res.json({
        success: true,
        data: aiOutput,
        matchedEmployee: matchedEmployee ? {
          id: matchedEmployee.id,
          name: matchedEmployee.name,
          salary: matchedEmployee.salary || matchedEmployee.baseSalary || 2500,
          cpf: matchedEmployee.cpf,
          email: matchedEmployee.email
        } : null
      });

    } catch (err: any) {
      console.error("Error process AI holerite:", err);
      res.status(500).json({ success: false, error: err.message || "Erro ao processar holerite inteligente." });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      firebase: db ? "initialized" : "not-initialized",
      geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
