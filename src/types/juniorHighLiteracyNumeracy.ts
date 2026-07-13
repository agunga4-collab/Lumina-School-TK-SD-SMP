export type JuniorHighArea = 'BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY';

export type JuniorHighPeriod = 'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN';

export type JuniorHighSupportStatus = 'ON_TRACK' | 'MONITOR' | 'NEEDS_SUPPORT' | 'INTERVENTION_RECOMMENDED' | 'INCOMPLETE_DATA';

export interface JuniorHighProgressBase {
  id?: string;
  studentId: string;
  studentName: string;
  classId: string;
  gradeLevel: number;
  schoolYear: string;
  period: JuniorHighPeriod;
  area: JuniorHighArea;
  teacherId: string;
  supportStatus: JuniorHighSupportStatus;
  notes: string;
  updatedAt: any;
}

export interface BahasaIndonesiaProgress extends JuniorHighProgressBase {
  area: 'BAHASA_INDONESIA';
  wordsRead: number;
  errors: number;
  wpm: number;
  readingLevel: string;
  comprehensionScore: number | 'N/A' | null;
  libraryBorrowStatus: 'AKTIF' | 'BELUM_MEMINJAM';
  oneDayOneBookStatus: 'AKTIF' | 'KURANG_AKTIF';
}

export interface EnglishReadingProgress extends JuniorHighProgressBase {
  area: 'ENGLISH_READING';
  wordsRead: number;
  errors: number;
  wpm: number;
  readingLevel: string;
  comprehensionScore: number | 'N/A' | null;
}

export interface MengajiProgress extends JuniorHighProgressBase {
  area: 'MENGAJI';
  iqroCurrentLevel: number | string | null;
  iqroCurrentCheckpoint: string; // e.g., "2/40"
  targetIqroLevel: number | string | null;
  completionStatus: 'ON_PROGRESS' | 'LULUS' | 'TIDAK_LULUS' | 'BELUM_DINILAI';
  letterRecognitionNote: string;
  tajwidNote: string;
}

export interface NumeracyProgress extends JuniorHighProgressBase {
  area: 'NUMERACY';
  mathLevel: string;
  topic: string;
  accuracy: number;
  speed: number;
}

export type JuniorHighProgressRecord =
  | BahasaIndonesiaProgress
  | EnglishReadingProgress
  | MengajiProgress
  | NumeracyProgress;

export const JUNIOR_HIGH_AREAS: JuniorHighArea[] = [
  'BAHASA_INDONESIA',
  'ENGLISH_READING',
  'MENGAJI',
  'NUMERACY'
];

export const JUNIOR_HIGH_PERIODS: JuniorHighPeriod[] = [
  'JUL_OCT',
  'NOV_FEB',
  'MAR_JUN'
];

export const JUNIOR_HIGH_SUPPORT_STATUSES: JuniorHighSupportStatus[] = [
  'ON_TRACK',
  'MONITOR',
  'NEEDS_SUPPORT',
  'INTERVENTION_RECOMMENDED',
  'INCOMPLETE_DATA'
];

export function isBahasaIndonesiaProgress(record: JuniorHighProgressRecord): record is BahasaIndonesiaProgress {
  return record.area === 'BAHASA_INDONESIA';
}

export function isEnglishReadingProgress(record: JuniorHighProgressRecord): record is EnglishReadingProgress {
  return record.area === 'ENGLISH_READING';
}

export function isMengajiProgress(record: JuniorHighProgressRecord): record is MengajiProgress {
  return record.area === 'MENGAJI';
}

export function isNumeracyProgress(record: JuniorHighProgressRecord): record is NumeracyProgress {
  return record.area === 'NUMERACY';
}
