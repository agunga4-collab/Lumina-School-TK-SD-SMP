export type ElementaryArea = 'BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY';

export type ElementaryPeriod = 'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN';

export type ElementarySupportStatus = 'ON_TRACK' | 'MONITOR' | 'NEEDS_SUPPORT' | 'INTERVENTION_RECOMMENDED' | 'INCOMPLETE_DATA';

export interface ElementaryProgressBase {
  id?: string;
  studentId: string;
  studentName: string;
  classId: string;
  gradeLevel: number;
  schoolYear: string;
  period: ElementaryPeriod;
  area: ElementaryArea;
  teacherId: string;
  supportStatus: ElementarySupportStatus;
  notes: string;
  updatedAt: any;
}

export interface BahasaIndonesiaProgress extends ElementaryProgressBase {
  area: 'BAHASA_INDONESIA';
  wordsRead: number;
  errors: number;
  wpm: number;
  readingLevel: string;
  comprehensionScore: number | 'N/A' | null;
  libraryBorrowStatus: 'AKTIF' | 'BELUM_MEMINJAM';
  oneDayOneBookStatus: 'AKTIF' | 'KURANG_AKTIF';
}

export interface EnglishReadingProgress extends ElementaryProgressBase {
  area: 'ENGLISH_READING';
  wordsRead: number;
  errors: number;
  wpm: number;
  readingLevel: string;
  comprehensionScore: number | 'N/A' | null;
}

export interface MengajiProgress extends ElementaryProgressBase {
  area: 'MENGAJI';
  iqroCurrentLevel: number;
  iqroCurrentCheckpoint: string; // e.g., "2/40"
  targetIqroLevel: number;
  completionStatus: 'ON_PROGRESS' | 'LULUS' | 'TIDAK_LULUS' | 'BELUM_DINILAI';
  letterRecognitionNote: string;
  tajwidNote: string;
}

export interface NumeracyProgress extends ElementaryProgressBase {
  area: 'NUMERACY';
  mathLevel: string;
  topic: string;
  accuracy: number;
  speed: number;
}

export type ElementaryProgressRecord =
  | BahasaIndonesiaProgress
  | EnglishReadingProgress
  | MengajiProgress
  | NumeracyProgress;

// Constants arrays
export const ELEMENTARY_AREAS: ElementaryArea[] = [
  'BAHASA_INDONESIA',
  'ENGLISH_READING',
  'MENGAJI',
  'NUMERACY'
];

export const ELEMENTARY_PERIODS: ElementaryPeriod[] = [
  'JUL_OCT',
  'NOV_FEB',
  'MAR_JUN'
];

export const ELEMENTARY_SUPPORT_STATUSES: ElementarySupportStatus[] = [
  'ON_TRACK',
  'MONITOR',
  'NEEDS_SUPPORT',
  'INTERVENTION_RECOMMENDED',
  'INCOMPLETE_DATA'
];

// Type guards
export function isBahasaIndonesiaProgress(record: ElementaryProgressRecord): record is BahasaIndonesiaProgress {
  return record.area === 'BAHASA_INDONESIA';
}

export function isEnglishReadingProgress(record: ElementaryProgressRecord): record is EnglishReadingProgress {
  return record.area === 'ENGLISH_READING';
}

export function isMengajiProgress(record: ElementaryProgressRecord): record is MengajiProgress {
  return record.area === 'MENGAJI';
}

export function isNumeracyProgress(record: ElementaryProgressRecord): record is NumeracyProgress {
  return record.area === 'NUMERACY';
}
