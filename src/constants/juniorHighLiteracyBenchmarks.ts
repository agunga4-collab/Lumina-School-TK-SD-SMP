import { JuniorHighPeriod, JuniorHighSupportStatus, JuniorHighArea } from '../types/juniorHighLiteracyNumeracy';

export interface WpmRange {
  min: number;
  max: number;
}

// READING_WPM_BENCHMARKS[grade][period] adapted for Junior High (Grades 7, 8, 9)
export const READING_WPM_BENCHMARKS: Record<number, Partial<Record<JuniorHighPeriod, WpmRange>>> = {
  7: {
    JUL_OCT: { min: 100, max: 130 },
    NOV_FEB: { min: 110, max: 140 },
    MAR_JUN: { min: 120, max: 150 },
  },
  8: {
    JUL_OCT: { min: 110, max: 140 },
    NOV_FEB: { min: 120, max: 150 },
    MAR_JUN: { min: 130, max: 160 },
  },
  9: {
    JUL_OCT: { min: 120, max: 150 },
    NOV_FEB: { min: 130, max: 160 },
    MAR_JUN: { min: 140, max: 170 },
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
  period: JuniorHighPeriod,
  wpm: number,
  comprehensionScore: number | 'N/A' | null
): JuniorHighSupportStatus {
  if (isNaN(grade) || isNaN(wpm) || !period) {
    return 'INCOMPLETE_DATA';
  }

  const gradeBenchmarks = READING_WPM_BENCHMARKS[grade];
  if (!gradeBenchmarks) {
    // If the grade is outside 7-9 (e.g., if a high schooler or other class is mapped), default to a baseline
    const fallbackBenchmark = { min: 110, max: 140 };
    let status: JuniorHighSupportStatus = 'ON_TRACK';
    if (wpm < fallbackBenchmark.min) {
      status = 'NEEDS_SUPPORT';
    }
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

  const benchmark = gradeBenchmarks[period];
  if (!benchmark) {
    return 'INCOMPLETE_DATA';
  }

  let status: JuniorHighSupportStatus = 'ON_TRACK';

  if (wpm < benchmark.min) {
    status = 'NEEDS_SUPPORT';
  }

  // If comprehension score is poor (less than 70), status index downgrades at most to 'MONITOR'.
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
): JuniorHighSupportStatus {
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
 * Translates JuniorHighPeriod to human-readable label.
 */
export function getPeriodLabel(period: JuniorHighPeriod): string {
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
 * Translates JuniorHighArea to human-readable label.
 */
export function getAreaLabel(area: JuniorHighArea): string {
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
 * Translates JuniorHighSupportStatus to human-readable label.
 */
export function getSupportStatusLabel(status: JuniorHighSupportStatus): string {
  switch (status) {
    case 'ON_TRACK':
      return 'Tier 1';
    case 'MONITOR':
      return 'Tier 2';
    case 'NEEDS_SUPPORT':
      return 'Tier 3';
    case 'INTERVENTION_RECOMMENDED':
      return 'SN (Special Needs)';
    case 'INCOMPLETE_DATA':
      return 'Belum diisi';
    default:
      return status;
  }
}
