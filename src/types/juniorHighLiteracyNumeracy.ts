import { OralReadingRiskLevel, JuniorHighOrfGrade } from '../config/oralReadingFluencyRiskThresholds';

export type JuniorHighArea = 'BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY';

export type JuniorHighSessionKey = 'SEMESTER_1_START' | 'SEMESTER_1_END' | 'SEMESTER_2_START' | 'SEMESTER_2_END' | 'SPRING_ASSESSMENT_3';

// Alias for backwards-compatibility where JuniorHighPeriod is referenced
export type JuniorHighPeriod = JuniorHighSessionKey;

export interface JuniorHighProgressBase {
  id?: string;
  unit: 'JUNIOR_HIGH';
  studentId: string;
  studentName: string;
  classId: string;
  gradeLevel: number;
  schoolYear: string;
  sessionKey: JuniorHighSessionKey;
  sessionLabel: string;
  subjectArea: JuniorHighArea;
  updatedBy: string;
  updatedAt: any;
  notes: string;
  
  // Backwards compatibility fields
  period: JuniorHighPeriod;
  area: JuniorHighArea;
  teacherId: string;
  supportStatus?: string;
}

export interface BahasaIndonesiaProgress extends JuniorHighProgressBase {
  subjectArea: 'BAHASA_INDONESIA';
  readingLevel: 'Perlu Pendampingan Intensif' | 'Perlu Penguatan Terarah' | 'Siap Berkembang' | 'Siap Lanjut' | '';
  readingComprehension: number | '';
}

export interface EnglishReadingProgress extends JuniorHighProgressBase {
  subjectArea: 'ENGLISH_READING';
  wordsRead: number | '';
  errors: number | '';
  wpm: number | '';
  readingLevel: 'IR+' | 'ER' | 'ER EN' | '';
  comprehension: number | '';
  
  riskLevel?: OralReadingRiskLevel | null;
  riskBenchmark?: 'SPRING_ASSESSMENT_3' | null;
  riskGrade?: JuniorHighOrfGrade | null;
  riskCalculatedAt?: number | null;
}

export interface MengajiProgress extends JuniorHighProgressBase {
  subjectArea: 'MENGAJI';
  level: 'Iqra 1' | 'Iqra 2' | 'Iqra 3' | 'Iqra 4' | 'Iqra 5' | 'Iqra 6' | 'Juz Amma' | 'Alquran' | string;
  targetLevel: 'Iqra 1' | 'Iqra 2' | 'Iqra 3' | 'Iqra 4' | 'Iqra 5' | 'Iqra 6' | 'Juz Amma' | 'Alquran' | string;
  mengajiLevel?: string;
  mengajiTarget?: string;
}

export interface NumeracyProgress extends JuniorHighProgressBase {
  subjectArea: 'NUMERACY';
  mathLevel: 'Trailhead' | 'Ascent' | 'Ridge' | 'Summit' | string;
  accuracy: number | '';
  numerasiLevel?: string;
  numerasiTarget?: string;
  mathTargetLevel?: string;
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

export const JUNIOR_HIGH_SESSION_KEYS: JuniorHighSessionKey[] = [
  'SEMESTER_1_START',
  'SEMESTER_1_END',
  'SEMESTER_2_START',
  'SEMESTER_2_END',
  'SPRING_ASSESSMENT_3'
];

export function isBahasaIndonesiaProgress(record: JuniorHighProgressRecord): record is BahasaIndonesiaProgress {
  return record.subjectArea === 'BAHASA_INDONESIA' || record.area === 'BAHASA_INDONESIA';
}

export function isEnglishReadingProgress(record: JuniorHighProgressRecord): record is EnglishReadingProgress {
  return record.subjectArea === 'ENGLISH_READING' || record.area === 'ENGLISH_READING';
}

export function isMengajiProgress(record: JuniorHighProgressRecord): record is MengajiProgress {
  return record.subjectArea === 'MENGAJI' || record.area === 'MENGAJI';
}

export function isNumeracyProgress(record: JuniorHighProgressRecord): record is NumeracyProgress {
  return record.subjectArea === 'NUMERACY' || record.area === 'NUMERACY';
}
