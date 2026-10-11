export type ComprehensionLevel = 'B' | 'D' | 'A';

export interface AssessmentBookOptions {
  formativeTasks: string[];
  nextActions: string[];
  summativeTasks: string[];
}

export const DEFAULT_ASSESSMENT_BOOK_OPTIONS: AssessmentBookOptions = {
  formativeTasks: [
    'Lembar Kerja (LKPD)',
    'Latihan Mandiri',
    'Kuis Singkat',
    'Diskusi Terbimbing',
    'Presentasi Mini',
    'Praktik / Eksperimen',
    'Tanya Jawab Lisan',
    'Observasi Kelas'
  ],
  nextActions: [
    'Lanjut ke LO Berikutnya',
    'Pengayaan Mandiri',
    'Tutor Sebaya',
    'Bimbingan Personal Guru',
    'Latihan Soal Bertingkat',
    'Refleksi & Remediasi Terfokus'
  ],
  summativeTasks: [
    'Proyek Pembelajaran (LJ)',
    'Tes Tertulis Sumatif',
    'Unjuk Kerja / Praktik',
    'Portofolio Karya',
    'Presentasi Akhir LJ'
  ]
};

export interface JHAssessmentLO {
  id: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  code: string; // e.g. "LO 1", "LO 2"
  title: string;
  order: number;
  isActive: boolean;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
}

export interface JHFormativeEntry {
  id: string;
  loId: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  studentId: string;
  studentName: string;
  date: string; // YYYY-MM-DD (WIB)
  formativeTask: string;
  comprehensionLevel: ComprehensionLevel;
  nextAction: string;
  notes?: string;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
  correctedAt?: number;
  correctedBy?: string;
  correctedByName?: string;
  correctionReason?: string;
}

export interface JHSummativeEntry {
  id: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  studentId: string;
  studentName: string;
  date: string; // YYYY-MM-DD (WIB)
  summativeTask: string;
  summativeScore: ComprehensionLevel;
  notes?: string;
  teacherId: string;
  teacherName: string;
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
  updatedByName?: string;
}
