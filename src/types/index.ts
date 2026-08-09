export type UserRole = 'admin' | 'employee';

export interface User {
  uid: string;
  cpf: string;
  employeeId?: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  postoName?: string;
  salary?: number;
  benefits?: string[];
  active: boolean;
  createdAt: string;
  workScale?: '12x36' | 'default';
  photoURL?: string;
  phone?: string;
  address?: string;
  birthDate?: string;
  signatureURL?: string;
  admissionDate?: string;
}

export interface Attendance {
  id: string;
  userId: string;
  userName: string;
  userCpf?: string;
  userEmail?: string;
  type: 'entry' | 'lunch_out' | 'lunch_in' | 'exit';
  timestamp: any; // Firestore Timestamp
  signature?: string;
  postoName?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface Request {
  id: string;
  userId: string;
  userName: string;
  type: 'vacation' | 'allowance' | 'per_diem' | 'shift_swap' | 'medical';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  response?: string;
  createdAt: string;
  attachmentUrl?: string;
}

export interface SalarySlip {
  id: string;
  userId: string;
  month: number;
  year: number;
  baseSalary: number;
  taxes: { name: string; amount: number; type: 'deduction' | 'addition' }[];
  discounts: { name: string; amount: number }[];
  netSalary: number;
  signed: boolean;
  signature?: string;
  issuedAt: string;
}

export interface CompanyConfig {
  name: string;
  cnpj?: string;
  address: string;
  contact: string;
  logoUrl?: string;
  email?: string;
  mealTicketValue?: number;
  companyId?: string;
}

export interface Diaria {
  id: string;
  userId: string;
  amount: number;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  link?: string;
  createdAt: any;
}

export interface ChatRoom {
  id: string;
  type: 'dm' | 'channel';
  name: string;
  participants?: string[];
  department?: string;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: any;
  };
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  timestamp: any;
}

export interface BenefitReceipt {
  id: string;
  userId: string;
  userName: string;
  userCpf?: string;
  companyName: string;
  companyCnpj: string;
  amount: number;
  month: number;
  year: number;
  status: 'pending' | 'signed';
  signedAt?: string;
  signatureText?: string;
  signatureURL?: string;
  adminSigned?: boolean;
  adminSignatureURL?: string;
  adminSignatureText?: string;
  adminSignedAt?: string;
  createdAt: string;
}

export interface Occurrence {
  id: string;
  userId: string;
  userName: string;
  userRole?: string;
  title: string;
  description: string;
  type: 'injury' | 'equipment' | 'maintenance' | 'behavior' | 'shift_handover' | 'general' | 'shift_book';
  date: string;
  shift: string;
  status: 'pending' | 'resolved' | 'in_progress';
  feedback?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: any;
  createdAt: any;
  signatureOccurrence?: string;
  photos?: string[];
  shiftBookDetails?: {
    postoName?: string;
    matriculaVigia?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    diaSemana?: string;
    equipamentosReceived?: { name: string; quantity: number; status: string; checked: boolean }[];
    weaponsDetails?: {
      hasWeapons: boolean;
      tipo: string;
      marca: string;
      numeroSerie: string;
      calibre: string;
      quantidadeMunicao: number;
      observacoesArmamento?: string;
    };
    coleteNumero?: string;
    vendedorSaindoName?: string;
    vendedorAssumindoName?: string;
    signatureSaindo?: string;
    signatureAssumindo?: string;
    sigSainteDataUrl?: string;
    sigEntranteDataUrl?: string;
    isIniciandoPlantao?: boolean;
    isFinalizandoPlantao?: boolean;
    closedAt?: any;
    closedByName?: string;
    routineDescription?: string;
  };
}

export interface ServicePost {
  id: string;
  name: string;
  companyName: string;
  colaboradores: string[]; // List of employees acting on the post
  vigilantes: string[];    // List of vigilantes assigned to this post
  createdAt: any;
}


