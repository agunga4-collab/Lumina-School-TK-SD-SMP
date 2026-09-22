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
  updatedAt: number;
  updatedBy: string;
  updatedByName?: string;
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

export type ElementaryMidtermGenComReviewStatus = 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED';

export interface ElementaryMidtermReviewHistoryEntry {
  action: 'DRAFT_SAVED' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'RESUBMITTED_FOR_REVIEW' | 'APPROVED';
  actorId: string;
  actorName: string;
  actorRole: string;
  timestamp: number;
  feedback?: string;
  commentSnapshot?: string;
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
