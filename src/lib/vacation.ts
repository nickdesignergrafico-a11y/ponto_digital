import { differenceInMonths, differenceInDays, parseISO, addYears, isAfter, startOfDay, addDays } from 'date-fns';

export interface VacationBalance {
  totalEarned: number;
  totalTaken: number;
  available: number;
  proportional: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
}

export function calculateVacationBalance(admissionDate: string, approvedRequests: any[] = []): VacationBalance {
  if (!admissionDate) {
    return {
      totalEarned: 0,
      totalTaken: 0,
      available: 0,
      proportional: 0,
      currentPeriodStart: '',
      currentPeriodEnd: '',
    };
  }

  const start = parseISO(admissionDate);
  const now = new Date();
  
  // Total months worked since admission
  const monthsWorked = differenceInMonths(now, start);
  
  // Total full years (completed periods)
  const fullYearsWorked = Math.floor(monthsWorked / 12);
  
  // Total days earned from completed periods (30 days per year)
  const totalEarned = fullYearsWorked * 30;
  
  // Calculate proportional for the current uncompleted period
  const monthsInCurrentPeriod = monthsWorked % 12;
  const proportional = Math.floor((monthsInCurrentPeriod / 12) * 30);
  
  // Info about the current acquisitive period
  const periodStart = addYears(start, fullYearsWorked);
  const periodEnd = addYears(periodStart, 1);

  // Total days taken (only approved vacation requests)
  const totalTaken = approvedRequests
    .filter(req => req.type === 'vacation' && req.status === 'approved')
    .reduce((acc, req) => {
      const s = parseISO(req.startDate);
      const e = parseISO(req.endDate);
      // add 1 because differenceInDays(March 2, March 1) is 1, but it's 2 days of vacation
      return acc + (differenceInDays(e, s) + 1);
    }, 0);

  const available = totalEarned - totalTaken;

  return {
    totalEarned,
    totalTaken,
    available: available > 0 ? available : 0,
    proportional,
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
  };
}
