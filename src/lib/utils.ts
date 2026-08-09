import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCPF(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function parseFirestoreTimestamp(timestamp: any, fallbackDate?: Date): Date {
  if (!timestamp) return fallbackDate || new Date();
  
  // If it's already a JS Date
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? (fallbackDate || new Date()) : timestamp;
  }
  
  // If it has a toDate method (as a Firestore Timestamp instance)
  if (typeof timestamp.toDate === 'function') {
    try {
      const d = timestamp.toDate();
      return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
    } catch (e) {
      return fallbackDate || new Date();
    }
  }
  
  // If it's a serialized Firestore timestamp structure { seconds, nanoseconds } or { _seconds, _nanoseconds }
  const secs = timestamp.seconds !== undefined ? timestamp.seconds : timestamp._seconds;
  if (secs !== undefined) {
    const s = Number(secs);
    const nanos = Number(timestamp.nanoseconds || timestamp._nanoseconds || 0);
    const d = new Date(s * 1000 + Math.floor(nanos / 1000000));
    return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
  }
  
  // If it's a string
  if (typeof timestamp === 'string') {
    const cleanStr = timestamp.trim();
    if (!cleanStr) return fallbackDate || new Date();

    // Match YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, d] = cleanStr.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    // Match DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanStr)) {
      const [d, m, y] = cleanStr.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }

    const parsed = new Date(cleanStr);
    return isNaN(parsed.getTime()) ? (fallbackDate || new Date()) : parsed;
  }
  
  // If it's a number (timestamp epoch milliseconds or seconds)
  if (typeof timestamp === 'number') {
    if (timestamp < 10000000000) {
      const d = new Date(timestamp * 1000);
      return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
    }
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? (fallbackDate || new Date()) : d;
  }
  
  return fallbackDate || new Date();
}
