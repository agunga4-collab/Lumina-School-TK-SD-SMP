import { ElementaryPeriod, ElementarySupportStatus, ElementaryArea } from '../types/elementaryLiteracyNumeracy';

export interface WpmRange {
  min: number;
  max: number;
}

// READING_WPM_BENCHMARKS[grade][period]
export const READING_WPM_BENCHMARKS: Record<number, Partial<Record<ElementaryPeriod, WpmRange>>> = {
  1: {
    NOV_FEB: { min: 10, max: 30 },
    MAR_JUN: { min: 30, max: 60 },
  },
  2: {
    JUL_OCT: { min: 30, max: 60 },
    NOV_FEB: { min: 50, max: 80 },
    MAR_JUN: { min: 70, max: 90 },
  },
  3: {
    JUL_OCT: { min: 50, max: 90 },
    NOV_FEB: { min: 80, max: 120 },
    MAR_JUN: { min: 80, max: 110 },
  },
};

/**
 * Calculates words per minute (WPM) based on total words read and errors.
 * Ensures the value is not negative.
 */
export function calculateWpm(wordsRead: number, errors: number): number {
  if (isNaN(wordsRead) || isNaN(errors)) return 0;
  return Math.max(0, wordsRead - errors);
}

/**
 * Determines reading support status based on grade, period, calculated WPM, and comprehension score.
 */
export function getReadingSupportStatus(
  grade: number,
  period: ElementaryPeriod,
  wpm: number,
  comprehensionScore: number | 'N/A' | null
): ElementarySupportStatus {
  if (isNaN(grade) || isNaN(wpm) || !period) {
    return 'INCOMPLETE_DATA';
  }

  const gradeBenchmarks = READING_WPM_BENCHMARKS[grade];
  if (!gradeBenchmarks) {
    return 'INCOMPLETE_DATA';
  }

  const benchmark = gradeBenchmarks[period];
  if (!benchmark) {
    return 'INCOMPLETE_DATA';
  }

  let status: ElementarySupportStatus = 'ON_TRACK';

  if (wpm < benchmark.min) {
    status = 'NEEDS_SUPPORT';
  }

  // If comprehension score is poor (less than 70), status index downgrades at most to 'MONITOR'.
  // If comprehension is N/A or null, we do not downgrade.
  if (comprehensionScore !== 'N/A' && comprehensionScore !== null && comprehensionScore !== undefined) {
    const compVal = Number(comprehensionScore);
    if (!isNaN(compVal) && compVal < 70) {
      if (status === 'ON_TRACK') {
        status = 'MONITOR';
      }
    }
  }

  return status;
}

/**
 * Determines Mengaji progress support status based on completion status.
 */
export function getMengajiSupportStatus(
  completionStatus: 'ON_PROGRESS' | 'LULUS' | 'TIDAK_LULUS' | 'BELUM_DINILAI' | string
): ElementarySupportStatus {
  switch (completionStatus) {
    case 'LULUS':
      return 'ON_TRACK';
    case 'TIDAK_LULUS':
      return 'NEEDS_SUPPORT';
    case 'ON_PROGRESS':
      return 'MONITOR';
    case 'BELUM_DINILAI':
    default:
      return 'INCOMPLETE_DATA';
  }
}

/**
 * Translates ElementaryPeriod to human-readable label.
 */
export function getPeriodLabel(period: ElementaryPeriod): string {
  switch (period) {
    case 'JUL_OCT':
      return 'Juli - Oktober';
    case 'NOV_FEB':
      return 'November - Februari';
    case 'MAR_JUN':
      return 'Maret - Juni';
    default:
      return period;
  }
}

/**
 * Translates ElementaryArea to human-readable label.
 */
export function getAreaLabel(area: ElementaryArea): string {
  switch (area) {
    case 'BAHASA_INDONESIA':
      return 'Bahasa Indonesia';
    case 'ENGLISH_READING':
      return 'English Reading';
    case 'MENGAJI':
      return 'Mengaji';
    case 'NUMERACY':
      return 'Numeracy';
    default:
      return area;
  }
}

/**
 * Translates ElementarySupportStatus to human-readable label.
 */
export function getSupportStatusLabel(status: ElementarySupportStatus): string {
  switch (status) {
    case 'ON_TRACK':
      return 'On Track';
    case 'MONITOR':
      return 'Monitor';
    case 'NEEDS_SUPPORT':
      return 'Needs Support';
    case 'INTERVENTION_RECOMMENDED':
      return 'Intervention Recommended';
    case 'INCOMPLETE_DATA':
      return 'Incomplete Data';
    default:
      return status;
  }
}
