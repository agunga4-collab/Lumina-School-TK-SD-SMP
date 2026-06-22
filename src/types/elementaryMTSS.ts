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
}
