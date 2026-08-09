import admin from 'firebase-admin';
import fs from 'fs';

async function diagnose() {
  const configPath = './firebase-applet-config.json';
  if (!fs.existsSync(configPath)) {
    console.error('Config file not found');
    return;
  }
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  admin.initializeApp({
    projectId: config.projectId
  });
  
  const db = admin.firestore();
  
  console.log('--- DIAGNOSTIC STUDY ---');
  console.log(`Database connected: Project ${config.projectId}`);
  
  const collections = [
    'users', 
    'salarySlips', 
    'attendance', 
    'requests', 
    'occurrences', 
    'benefitReceipts', 
    'notifications', 
    'orders',
    'chatRooms'
  ];
  
  const counts = {};
  let totalRecords = 0;
  
  // Fetch lists
  const data = {};
  for (const col of collections) {
    try {
      const snap = await db.collection(col).get();
      data[col] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      counts[col] = snap.size;
      totalRecords += snap.size;
    } catch (e) {
      counts[col] = 0;
      data[col] = [];
    }
  }
  
  console.log('\n--- TOTAL RECORDS ---');
  console.log(`Total: ${totalRecords} records across all collections`);
  for (const [col, count] of Object.entries(counts)) {
    console.log(`- ${col}: ${count}`);
  }
  
  // Audits
  const errors = [];
  const warnings = [];
  
  // 1. Audit Users
  const cpfs = new Set();
  const emails = new Set();
  for (const u of data.users) {
    if (!u.cpf) {
      errors.push(`[ERRO] Usuário com ID ${u.id} (${u.name || 'Sem nome'}) não tem CPF cadastrado.`);
    } else {
      const cleanCpf = u.cpf.replace(/\D/g, '');
      if (cpfs.has(cleanCpf)) {
        errors.push(`[ERRO] CPF duplicado encontrado: ${u.cpf} para o usuário ${u.name || u.id}.`);
      }
      cpfs.add(cleanCpf);
    }
    
    if (!u.email) {
      errors.push(`[ERRO] Usuário com ID ${u.id} (${u.name || 'Sem nome'}) não tem e-mail.`);
    } else {
      if (emails.has(u.email.toLowerCase())) {
        errors.push(`[ERRO] E-mail duplicado encontrado: ${u.email} no usuário ${u.name || u.id}.`);
      }
      emails.add(u.email.toLowerCase());
    }
    
    if (!u.role) {
      warnings.push(`[AVISO] Usuário ${u.name || u.id} não possui campo role definido.`);
    }
    if (u.active === undefined) {
      warnings.push(`[AVISO] Usuário ${u.name || u.id} não possui o status active definido (indica se está ativo ou desligado).`);
    }
  }
  
  // 2. Audit Salary Slips
  for (const s of data.salarySlips) {
    const userExists = data.users.some(u => u.id === s.userId);
    if (!userExists) {
      errors.push(`[ERRO] Holerite ${s.id} está associado ao usuário inexistente ou excluído com ID: ${s.userId}.`);
    }
    
    if (s.baseSalary === undefined || s.baseSalary === null) {
      errors.push(`[ERRO] Holerite ${s.id} não possui salário base definido.`);
    }
    if (!s.month || !s.year) {
      errors.push(`[ERRO] Holerite ${s.id} está sem mês ou ano de referência.`);
    }
    if (s.signed && !s.signedAt) {
      warnings.push(`[AVISO] Holerite ${s.id} de ${s.month}/${s.year} está marcado como assinado, mas não possui a data da assinatura (signedAt).`);
    }
  }
  
  // 3. Audit Attendance
  for (const a of data.attendance) {
    const userExists = data.users.some(u => u.id === a.userId);
    if (!userExists) {
      errors.push(`[ERRO] Registro de ponto ${a.id} está associado ao usuário inexistente ou excluído com ID: ${a.userId || 'Nulo'}.`);
    }
    if (!a.timestamp) {
      errors.push(`[ERRO] Registro de ponto ${a.id} possui timestamp inválido.`);
    }
    if (!a.coords || !a.coords.latitude) {
      warnings.push(`[AVISO] Registro de ponto ${a.id} de ${a.employeeName || 'Sem nome'} foi cadastrado sem coordenadas geográficas (offline ou GPS desativado).`);
    }
  }
  
  // 4. Audit benefit receipts
  for (const b of data.benefitReceipts) {
    const userExists = data.users.some(u => u.id === b.userId);
    if (!userExists) {
      errors.push(`[ERRO] Recibo de benefício ${b.id} está associado ao usuário inexistente ou excluído : ${b.userId}`);
    }
    if (!b.amount) {
      warnings.push(`[AVISO] Recibo de benefício ${b.id} não possui valor (amount) especificado.`);
    }
  }
  
  console.log('\n--- SYSTEM AUDIT RESULTS ---');
  console.log(`Found: ${errors.length} Errors and ${warnings.length} Warnings.`);
  
  console.log('\n--- ERRORS ---');
  if (errors.length === 0) console.log('None.');
  else errors.forEach(e => console.log(e));
  
  console.log('\n--- WARNINGS ---');
  if (warnings.length === 0) console.log('None.');
  else warnings.forEach(w => console.log(w));
}

diagnose();
