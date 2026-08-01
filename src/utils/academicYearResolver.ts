type PeriodId = 'P1' | 'P2' | 'P3';

export const ELEMENTARY_PERIODS = [
  {
    id: 'P1',
    label: 'Juli–Oktober',
    semesterScope: '1',
    startMonth: 7,
    endMonth: 10
  },
  {
    id: 'P2',
    label: 'November–Februari',
    semesterScope: '1-2',
    startMonth: 11,
    endMonth: 2,
    crossesCalendarYear: true
  },
  {
    id: 'P3',
    label: 'Maret–Juni',
    semesterScope: '2',
    startMonth: 3,
    endMonth: 6
  }
] as const;

/**
 * Resolves the academic year (e.g., "2026/2027") and period ID (e.g., "P1", "P2", "P3")
 * for a given date in a specific timezone.
 * Defaults to Asia/Jakarta timezone.
 */
export function resolveAcademicYearAndPeriod(
  date: Date = new Date(),
  timezone: string = 'Asia/Jakarta'
): { academicYear: string; periodId: PeriodId } {
  // Format the date into year, month, and day based on timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  
  const parts = formatter.formatToParts(date);
  const yearPart = parts.find(p => p.type === 'year')?.value;
  const monthPart = parts.find(p => p.type === 'month')?.value;
  
  const year = yearPart ? parseInt(yearPart, 10) : date.getFullYear();
  const month = monthPart ? parseInt(monthPart, 10) : (date.getMonth() + 1);

  let periodId: PeriodId;
  let academicYear: string;

  if (month >= 7 && month <= 10) {
    // July - October
    periodId = 'P1';
    academicYear = `${year}/${year + 1}`;
  } else if (month === 11 || month === 12) {
    // November - December
    periodId = 'P2';
    academicYear = `${year}/${year + 1}`;
  } else if (month === 1 || month === 2) {
    // January - February
    periodId = 'P2';
    academicYear = `${year - 1}/${year}`;
  } else {
    // March - June
    periodId = 'P3';
    academicYear = `${year - 1}/${year}`;
  }

  return { academicYear, periodId };
}
