export interface ElementaryMTSSCase {
  id: string; // Document ID (usually studentId_subject_schoolYear)
  studentId: string;
  studentName: string;
  classId: string;
  subject: 'Bahasa Indonesia' | 'English' | 'Numeracy' | 'Mengaji';
  tier: 'Tier 2' | 'Tier 3' | 'SN'; // Tier 2 corresponds to MONITOR, Tier 3 to NEEDS_SUPPORT, SN to INTERVENTION_RECOMMENDED
  baselineScore: string;
  targetScore: string;
  status: 'Active' | 'Achieved';
  createdAt: number;
  updatedAt: number;
}

export interface ElementaryCoachingSession {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  notes: string;
  loggedBy: string; // Name or UID of assessor/teacher
  createdAt: number;
  updatedAt?: number;
  durationMinutes?: number;
  interventionMethod?: string;
  caseId?: string;
  batchSheetId?: string;
  blockId?: string;
  sourceType?: 'SPREADSHEET' | 'MANUAL';
  sourceStatus?: 'active' | 'inactive';
  isArchived?: boolean;
  archivedReason?: string;
  hasConflict?: boolean;
}

export interface MTSSBlockConfig {
  id: string;
  type: 'MEETING' | 'ASSESSMENT';
  label: string;
}

export interface MTSSMeetingValue {
  date?: string;
  status?: string;
  date1?: string;
  date2?: string;
}

export interface MTSSAssessmentValue {
  result?: string;
  dateAssessed?: string;
  note?: string;
}

export interface MTSSStudentRowData {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  goal: string;
  teachers: string;
  baseline: string;
  current: string;
  target: string;
  blocks: Record<string, any>; // Keyed by block.id -> MTSSMeetingValue or MTSSAssessmentValue
  dateAssessed?: string;
  finalDiagnosis?: string;
  notes?: string;
}

export interface MTSSBatchSheet {
  id: string;
  academicYear: string;
  semester: string;
  subject: string;
  tier: string;
  classId: string;
  className: string;
  teacherName: string;
  orderedBlocks: MTSSBlockConfig[];
  studentsData: Record<string, MTSSStudentRowData>;
  studentIds: string[];
  createdAt: number;
  updatedAt: number;
}
