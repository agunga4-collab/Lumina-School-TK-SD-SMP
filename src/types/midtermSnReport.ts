export interface SnStudentDoc {
  id: string; // studentId or studentId_classId
  studentId: string;
  studentName: string;
  nisn: string;
  classId: string;
  className: string;
  academicYear: string;
  isSN: boolean; // true
  assignedAt: number;
  assignedBy: string;
  assignedByName: string;
  updatedAt: number;
}

export interface SnLearningGoal {
  goalId: string;
  text: string;
  remark: 'A' | 'D' | 'B' | '' | string;
  order: number;
}

export interface SnSubject {
  subjectId: string;
  subjectName: string;
  order: number;
  learningGoals: SnLearningGoal[];
}

export interface SnMidtermReportDoc {
  id: string; // `${studentId}_${classId}_${academicYearNormalized}_${semester}_${midtermPeriod}_SN`
  reportType: 'SN';
  studentId: string;
  studentName: string;
  nisn: string;
  classId: string;
  className: string;
  academicYear: string;
  semester: string; // '1' | '2'
  midtermPeriod: string; // '1' | '2'

  subjects: SnSubject[];

  generalComment: {
    finalComment: string;
    status: string; // 'DRAFT' | 'SUBMITTED' | 'APPROVED'
    manualNotes?: string;
    aiDraft?: string;
    strengths?: string[];
    achievements?: string[];
    needsImprovement?: string[];
    updatedAt?: number;
    updatedBy?: string;
  };

  reviewStatus: string; // 'DRAFT' | 'SUBMITTED_FOR_REVIEW' | 'REVISION_REQUESTED' | 'APPROVED'
  reviewHistory: Array<{
    action: string;
    actorId: string;
    actorName: string;
    actorRole: string;
    timestamp: number;
    feedback?: string;
    commentSnapshot?: string;
  }>;

  createdAt: number;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
}

export interface SnPublishedMidtermReportDoc {
  id: string;
  reportType: 'SN';
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  academicYear: string;
  semester: string;
  midtermPeriod: string;

  reportVersion: number;
  status: 'PUBLISHED';
  reportSnapshot: any;

  driveFileId?: string;
  driveFolderId?: string;
  driveFileUrl?: string;

  publishedAt: number;
  publishedBy: string;
  publishedByName: string;

  isOpened?: boolean;
  firstOpenedAt?: number;
  lastOpenedAt?: number;
  openCount?: number;
}
