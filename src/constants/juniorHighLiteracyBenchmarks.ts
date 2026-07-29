import { JuniorHighSessionKey, JuniorHighArea } from '../types/juniorHighLiteracyNumeracy';

export type JuniorHighSupportStatus = 'ON_TRACK' | 'MONITOR' | 'NEEDS_SUPPORT' | 'INTERVENTION_RECOMMENDED' | 'INCOMPLETE_DATA';

export interface WpmRange {
  min: number;
  max: number;
}

// READING_WPM_BENCHMARKS[grade][sessionKey] adapted for Junior High (Grades 7, 8, 9)
export const READING_WPM_BENCHMARKS: Record<number, Partial<Record<JuniorHighSessionKey, WpmRange>>> = {
  7: {
    SEMESTER_1_START: { min: 100, max: 130 },
    SEMESTER_1_END: { min: 110, max: 140 },
    SEMESTER_2_START: { min: 115, max: 145 },
    SEMESTER_2_END: { min: 120, max: 150 },
  },
  8: {
    SEMESTER_1_START: { min: 110, max: 140 },
    SEMESTER_1_END: { min: 120, max: 150 },
    SEMESTER_2_START: { min: 125, max: 155 },
    SEMESTER_2_END: { min: 130, max: 160 },
  },
  9: {
    SEMESTER_1_START: { min: 120, max: 150 },
    SEMESTER_1_END: { min: 130, max: 160 },
    SEMESTER_2_START: { min: 135, max: 165 },
    SEMESTER_2_END: { min: 140, max: 170 },
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
 * Determines reading support status based on grade, sessionKey, calculated WPM, and comprehension score.
 */
export function getReadingSupportStatus(
  grade: number,
  sessionKey: JuniorHighSessionKey,
  wpm: number,
  comprehensionScore: number | 'N/A' | null
): JuniorHighSupportStatus {
  if (isNaN(grade) || isNaN(wpm) || !sessionKey) {
    return 'INCOMPLETE_DATA';
  }

  const gradeBenchmarks = READING_WPM_BENCHMARKS[grade];
  if (!gradeBenchmarks) {
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

  const benchmark = gradeBenchmarks[sessionKey];
  if (!benchmark) {
    return 'INCOMPLETE_DATA';
  }

  let status: JuniorHighSupportStatus = 'ON_TRACK';

  if (wpm < benchmark.min) {
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
 * Translates JuniorHighSessionKey to human-readable label.
 */
export function getPeriodLabel(sessionKey: JuniorHighSessionKey): string {
  switch (sessionKey) {
    case 'SEMESTER_1_START':
      return 'Awal Semester 1';
    case 'SEMESTER_1_END':
      return 'Akhir Semester 1';
    case 'SEMESTER_2_START':
      return 'Awal Semester 2';
    case 'SEMESTER_2_END':
      return 'Akhir Semester 2';
    default:
      return sessionKey;
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
