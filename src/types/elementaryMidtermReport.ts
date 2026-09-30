export const ELEMENTARY_OFFICIAL_SUBJECTS = [
  'Islamic Studies',
  'Qur\'an Reciting',
  'Bahasa Indonesia',
  'Mathematics',
  'English',
  'Arts and Crafts',
  'Performing Arts',
  'Physical Education',
  'Information and Communications Technology',
  'Projects'
] as const;

export function normalizeElementarySubjectName(rawSubject: string): string | null {
  if (!rawSubject) return null;
  const s = rawSubject.trim();

  // Official subject mappings
  if (s === "Agama & Budi Pekerti" || s === "Pendidikan Agama Islam" || s === "PABP" || s === "Islamic Studies") {
    return "Islamic Studies";
  }
  if (s === "Pendidikan Al-Quran" || s === "Al-Qur'an" || s === "Qur'an" || s === "Qur'an Reciting") {
    return "Qur'an Reciting";
  }
  if (s === "Matematika" || s === "Mathematics") {
    return "Mathematics";
  }
  if (s === "SBDP" || s === "Seni Budaya & Prakarya" || s === "Seni Budaya" || s === "Arts and Crafts") {
    return "Arts and Crafts";
  }
  if (s === "PJOK" || s === "Pendidikan Jasmani" || s === "Physical Education") {
    return "Physical Education";
  }
  if (s === "ICT" || s === "TIK" || s === "Information and Communications Technology") {
    return "Information and Communications Technology";
  }
  if (s.startsWith("Performing Arts")) return "Performing Arts";
  if (s === "Bahasa Indonesia") return "Bahasa Indonesia";
  if (s === "English") return "English";
  if (s === "Projects" || s === "Project" || s === "PROJECTS") return "Projects";

  // Exclude non-official elementary subjects
  const upper = s.toUpperCase();
  if (["IPA", "IPS", "PKN", "PANCASILA", "PPKN", "ILMU PENGETAHUAN ALAM", "ILMU PENGETAHUAN SOSIAL"].includes(upper)) {
    return null;
  }

  return s;
}

export type ElementaryMidtermReportStatus = 'DRAFT' | 'READY_TO_PUBLISH' | 'PUBLISHED';

export type ElementaryMidtermRemark = 'A' | 'D' | 'B';

export interface ElementaryMidtermGoalItem {
  id: string;
  text: string;
  order: number;
}

export interface ElementaryMidtermMasterGoalDoc {
  id: string; // `${classId}_${academicYearNormalized}_${semester}_${term}_${subjectSlug}`
  classId: string;
  className: string;
  academicYear: string;
  semester: string;
  midtermTerm: string; // '1' or '2'
  category: string;
  subjectKey: string;
  goals: ElementaryMidtermGoalItem[];
  activeGoalIds?: string[]; // IDs of goals selected/active for this Midterm term
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export function getActiveMasterGoals(doc?: ElementaryMidtermMasterGoalDoc | null): ElementaryMidtermGoalItem[] {
  if (!doc || !Array.isArray(doc.goals)) return [];
  if (!Array.isArray(doc.activeGoalIds)) {
    // Default to all goals if activeGoalIds is undefined for backward compatibility
    return doc.goals;
  }
  const activeSet = new Set(doc.activeGoalIds);
  return doc.goals.filter(g => g && activeSet.has(g.id));
}

export interface ElementaryMidtermGeneralCommentData {
  studentName?: string;
  nickname?: string;
  gender?: 'MALE' | 'FEMALE';
  strengths: string[];
  achievements: string[];
  needsImprovement: string[];
  manualNotes?: string;
  aiDraft?: string;
  finalComment?: string;
  isFinal?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export type ElementaryMidtermGenComReviewStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'PENDING_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED';

export interface ElementaryMidtermReviewHistoryEntry {
  action: 'DRAFT_SAVED' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'RESUBMITTED_FOR_REVIEW' | 'APPROVED' | 'WITHDRAWN_FROM_REVIEW';
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: number;
  feedback?: string;
  commentSnapshot?: string;
}

/**
 * Resolves the display name of the approver without exposing raw UIDs
 */
export function getApprovedByName(studentData?: ElementaryMidtermStudentDataDoc | null): string {
  if (studentData?.approvedByName && studentData.approvedByName.trim()) {
    return studentData.approvedByName.trim();
  }
  if (Array.isArray(studentData?.reviewHistory)) {
    for (let i = studentData.reviewHistory.length - 1; i >= 0; i--) {
      const entry = studentData.reviewHistory[i];
      if (entry && entry.action === 'APPROVED' && entry.actorName && entry.actorName.trim()) {
        return entry.actorName.trim();
      }
    }
  }
  return '';
}

/**
 * Formats timestamp to Indonesian local datetime string
 */
export function formatIndonesianDateTime(timestamp?: number | null): string {
  if (!timestamp) return '-';
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta'
    }).format(date) + ' WIB';
  } catch {
    return new Date(timestamp).toLocaleString('id-ID');
  }
}

/**
 * Checks if a review status is pending review
 */
export function isReviewPending(status?: string | null): boolean {
  return status === 'SUBMITTED_FOR_REVIEW' || status === 'PENDING_REVIEW';
}

export interface ElementaryMidtermStudentDataDoc {
  id: string; // `${studentId}_${classId}_${academicYearNormalized}_${semester}_${term}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  midtermTerm: string;
  remarks: Record<string, string>; // goalId -> 'A' | 'D' | 'B'
  generalComment: ElementaryMidtermGeneralCommentData;
  status: ElementaryMidtermReportStatus;
  
  // General Comment Review Status and Metadata
  generalCommentReviewStatus?: ElementaryMidtermGenComReviewStatus;
  submittedForReviewAt?: number;
  submittedForReviewBy?: string;
  submittedForReviewByName?: string;
  approvedAt?: number;
  approvedBy?: string;
  approvedByName?: string;
  revisionRequestedAt?: number;
  revisionRequestedBy?: string;
  revisionRequestedByName?: string;
  revisionFeedback?: string;
  reviewVersion?: number;
  reviewHistory?: ElementaryMidtermReviewHistoryEntry[];

  updatedAt: number;
  updatedBy?: string;
  commentBuilder?: {
    strengths: string[];
    achievements: string[];
    needsImprovement: string[];
    manualNotes: string;
    aiDraftText: string;
  };
  attendance?: {
    sakit: number;
    izin: number;
    tanpaKeterangan: number;
  };
  performingArtsUA?: string;
}

export function getGradeLevelNumber(cls: { grade?: number | string; name?: string } | null | undefined): number {
  if (!cls) return 1;
  if (typeof cls.grade === 'number' && cls.grade >= 1 && cls.grade <= 6) {
    return cls.grade;
  }
  if (typeof cls.grade === 'string') {
    const parsed = parseInt(cls.grade, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 6) return parsed;
  }
  const match = (cls.name || '').match(/([1-6])/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1;
}

export function getDefaultPerformingArtsUAs(gradeLevel: number): string[] {
  if (gradeLevel === 1 || gradeLevel === 2) {
    return ['Percussion Pals', 'Choir', 'Dancing', 'Role-play', 'Ensemble Music'];
  }
  if (gradeLevel === 3 || gradeLevel === 4) {
    return ['Traditional Symphony', 'Choir', 'Dancing', 'Acting', 'Ensemble Music'];
  }
  if (gradeLevel === 5 || gradeLevel === 6) {
    return ['Dancing', 'Choir', 'Acting', 'Ensemble Music'];
  }
  return ['Dancing', 'Choir', 'Acting', 'Ensemble Music'];
}

export interface ElementaryMidtermSnapshotGoal {
  id: string;
  text: string;
  remark: string;
}

export interface ElementaryMidtermSnapshotSubject {
  name: string;
  category?: string;
  goals: ElementaryMidtermSnapshotGoal[];
}

export interface ElementaryMidtermSnapshotCategory {
  name: string;
  subjects: ElementaryMidtermSnapshotSubject[];
}

export interface ElementaryMidtermAttendanceSnapshot {
  sakit: number | null;
  izin: number | null;
  tanpaKeterangan: number | null;
}

export interface ElementaryMidtermSignatorySnapshot {
  principalName: string;
  principalTitle?: string;
  principalNiy?: string;
  principalSignatureUrl?: string | null;
  homeroomTeacherName: string;
  homeroomTeacherNiy?: string;
  homeroomTeacherSignatureUrl?: string | null;
}

export interface ElementaryMidtermReportSnapshot {
  student: {
    id: string;
    name: string;
    nisn: string;
    className: string;
    grade?: string | number;
  };
  academicYear: string;
  semester: string;
  midtermTerm: string;
  categories: ElementaryMidtermSnapshotCategory[];
  generalComment: string;
  attendance: ElementaryMidtermAttendanceSnapshot;
  signatory: ElementaryMidtermSignatorySnapshot;
  logoUrl?: string | null;
  reportSigningDate?: string;
  reportSigningLocation?: string;
  attendanceCutoffDate?: string;
  midtermPeriod?: string;
  showAttendanceRecap?: boolean;
}

export interface PublishedElementaryMidtermReport {
  id: string;
  unit: 'ELEMENTARY';
  reportType: 'MIDTERM_REPORT';

  studentId: string;
  studentNameSnapshot: string;
  nisnSnapshot: string;
  classId: string;
  classNameSnapshot: string;
  gradeSnapshot: number | string;

  academicYear: string;
  semester: string;
  midtermTerm: string;
  periodLabel?: string;

  version: number;

  driveFolderId: string;
  driveFileId: string;
  driveFileUrl: string;
  fileName: string;

  reportSnapshot: ElementaryMidtermReportSnapshot;

  generatedBy: string;
  generatedByName?: string;
  generatedAt: number;

  // Open Tracking fields
  isOpened: boolean;
  firstOpenedAt: number | null;
  lastOpenedAt: number | null;
  openCount: number;
  openedByEmail: string | null;

  createdAt: number;
  updatedAt: number;
}

export interface ElementaryMidtermClassCommentsConfig {
  id: string; // `${classId}_${academicYearNormalized}_${semester}_${midtermTerm}`
  classId: string;
  academicYear: string;
  semester: string;
  midtermTerm: string;
  customStrengths: string[];
  customAchievements: string[];
  customNeedsImprovement: string[];
  strengthsEnabled: boolean;
  achievementsEnabled: boolean;
  needsImprovementEnabled: boolean;
  updatedAt: number;
  updatedBy: string;
}
