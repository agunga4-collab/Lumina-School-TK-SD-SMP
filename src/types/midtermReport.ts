export type MidtermReportStatus = 'DRAFT' | 'READY_TO_PUBLISH' | 'PUBLISHED';

export type MidtermRemark = 'A' | 'D' | 'B';

export interface MidtermCategoryConfig {
  id: string;
  name: string;
  subjects: string[];
}

export const JH_MIDTERM_CATEGORIES: MidtermCategoryConfig[] = [
  {
    id: 'SPIRITUAL_HEALTH',
    name: 'SPIRITUAL HEALTH',
    subjects: ['Spiritual Health'],
  },
  {
    id: 'LEARNING_JOURNEY',
    name: 'LEARNING JOURNEY',
    subjects: [
      'Bahasa Indonesia',
      'Science',
      'Mathematics',
      'English',
      'Social Studies and Civics',
    ],
  },
  {
    id: 'WEEKLY_LESSONS',
    name: 'WEEKLY LESSONS',
    subjects: [
      'Islamic Studies',
      'Quran Recitation',
      'Household & Urban Gardening',
      'Kewirausahaan',
    ],
  },
  {
    id: 'UNIT_ACTIVITY',
    name: 'UNIT ACTIVITY',
    subjects: [
      'Performing Arts',
      'Art & Makerspace',
      'Physical Education',
      'Digital Literacy',
    ],
  },
];

export interface MidtermGoalItem {
  id: string;
  text: string;
  order: number;
}

export interface MidtermMasterGoalDoc {
  id: string; // `${classId}_${academicYearNormalized}_${semester}_${term}_${subjectSlug}`
  classId: string;
  className: string;
  academicYear: string;
  semester: string;
  midtermTerm: string; // '1' or '2'
  category: string;
  subjectKey: string;
  goals: MidtermGoalItem[];
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
}

export interface MidtermGeneralCommentData {
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

export type MidtermGenComReviewStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED';

export interface MidtermReviewHistoryEntry {
  action: 'DRAFT_SAVED' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'RESUBMITTED_FOR_REVIEW' | 'APPROVED';
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: number;
  feedback?: string;
  commentSnapshot?: string;
}

export interface MidtermStudentDataDoc {
  id: string; // `${studentId}_${classId}_${academicYearNormalized}_${semester}_${term}`
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  midtermTerm: string;
  remarks: Record<string, string>; // goalId -> 'A' | 'D' | 'B' or text for Spiritual Health
  spiritualHealthRemark?: string;
  generalComment: MidtermGeneralCommentData;
  status: MidtermReportStatus;
  
  // General Comment Review Status and Metadata
  generalCommentReviewStatus?: MidtermGenComReviewStatus;
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
  reviewHistory?: MidtermReviewHistoryEntry[];

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
}

export interface MidtermSnapshotGoal {
  id: string;
  text: string;
  remark: string;
}

export interface MidtermSnapshotSubject {
  name: string;
  goals: MidtermSnapshotGoal[];
}

export interface MidtermSnapshotCategory {
  name: string;
  subjects: MidtermSnapshotSubject[];
}

export interface MidtermAttendanceSnapshot {
  sakit: number | null;
  izin: number | null;
  tanpaKeterangan: number | null;
}

export interface MidtermSignatorySnapshot {
  principalName: string;
  principalNiy?: string;
  principalSignatureUrl?: string | null;
  homeroomTeacherName: string;
  homeroomTeacherNiy?: string;
  homeroomTeacherSignatureUrl?: string | null;
}

export interface MidtermReportSnapshot {
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
  categories: MidtermSnapshotCategory[];
  generalComment: string;
  attendance: MidtermAttendanceSnapshot;
  signatory: MidtermSignatorySnapshot;
  logoUrl?: string | null;
  reportSigningLocation?: string;
  reportSigningDate?: string;
  attendanceCutoffDate?: string;
}

export interface PublishedMidtermReport {
  id: string; // `JH_MIDTERM_REPORT_${studentId}_${classId}_${academicYearNormalized}_${semester}_${term}_v${version}`
  unit: 'JUNIOR_HIGH';
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

  reportSnapshot: MidtermReportSnapshot;

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

export interface MidtermClassCommentsConfig {
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
