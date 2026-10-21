export type JHFormativeScore = 'Achieved' | 'Not Achieved';
export type JHLegacyScore = 'B' | 'D' | 'A';
export type JHFormativeLevel = JHFormativeScore | JHLegacyScore;
export type ComprehensionLevel = JHFormativeLevel;
export type JHSummativeScore = 'B' | 'D' | 'A';
export type JHAssessmentMode = 'SUBJECT' | 'UNIT_ACTIVITY';

export function isLegacyScore(val: unknown): val is JHLegacyScore {
  return val === 'B' || val === 'D' || val === 'A';
}

export interface AssessmentBookOptions {
  formativeTasks: string[];
  nextActions: string[];
  summativeTasks: string[];
}
export const DEFAULT_ASSESSMENT_BOOK_OPTIONS: AssessmentBookOptions = {
  formativeTasks: ['Lembar Kerja (LKPD)', 'Latihan Mandiri', 'Kuis Singkat', 'Diskusi Terbimbing', 'Presentasi Mini', 'Praktik / Eksperimen', 'Tanya Jawab Lisan', 'Observasi Kelas'],
  nextActions: ['Lanjut ke LO Berikutnya', 'Pengayaan Mandiri', 'Tutor Sebaya', 'Bimbingan Personal Guru', 'Latihan Soal Bertingkat', 'Refleksi & Remediasi Terfokus'],
  summativeTasks: ['Proyek Pembelajaran (LJ)', 'Tes Tertulis Sumatif', 'Unjuk Kerja / Praktik', 'Portofolio Karya', 'Presentasi Akhir LJ']
};

export interface JHAssessmentUAContext {
  assessmentMode?: JHAssessmentMode;
  unitActivityId?: string;
  unitActivityName?: string;
  unitActivityCategory?: string;
  targetGrade?: string;
  assessmentGroupId?: string;
}
export interface JHAssessmentLO extends JHAssessmentUAContext {
  id: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  code: string;
  title: string;
  order: number;
  isActive: boolean;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
}
export interface JHFormativeEntry extends JHAssessmentUAContext {
  id: string;
  loId: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  studentId: string;
  studentName: string;
  date: string;
  formativeTask: string;
  comprehensionLevel: JHFormativeLevel;
  nextAction: string;
  notes?: string;
  sessionId?: string;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
  correctedAt?: number;
  correctedBy?: string;
  correctedByName?: string;
  correctionReason?: string;
}
export interface JHSummativeEntry extends JHAssessmentUAContext {
  id: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  studentId: string;
  studentName: string;
  date: string;
  summativeTask: string;
  summativeScore: JHSummativeScore;
  notes?: string;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
  updatedByName?: string;
}
