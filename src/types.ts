export type MTSSStatus = 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'UNDER_REVIEW' | 'CLOSED';
export type MTSSTier = 'Tier 1' | 'Tier 2' | 'Tier 3';

// --- MTSS Academic Types ---
export type MTSSAcademicDomain = 'ENGLISH' | 'NUMERACY' | 'BAHASA_INDONESIA';
export type MTSSAcademicStatus = 'SCREENING' | 'INITIAL_MEETING' | 'ACTIVE' | 'UNDER_REVIEW' | 'ESCALATED' | 'CLOSED';
export type MTSSAcademicAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type MTSSAcademicAlertType =
  | 'SCREENING_REVIEW_PENDING'
  | 'DRAFT_CASE_INCOMPLETE'
  | 'INITIAL_MEETING_MISSING'
  | 'PARENT_COMMUNICATION_PENDING'
  | 'PARENT_COMMITMENT_PENDING'
  | 'SESSION_LOG_OVERDUE'
  | 'SESSION_GAP_TOO_LONG'
  | 'ATTENDANCE_CONCERN'
  | 'LATENESS_CONCERN'
  | 'PARENT_FOLLOWUP_REQUIRED'
  | 'REVIEW_DATE_APPROACHING'
  | 'REVIEW_OVERDUE'
  | 'EVALUATION_PENDING'
  | 'REPORT_SIGNATURE_PENDING'
  | 'TIMELINE_PHASE_ACTION_PENDING'
  | 'TIER_2_CYCLE_NEAR_END'
  | 'TIER_2_CYCLE_COMPLETED_NO_DECISION'
  | 'TIER_3_PLAN_INCOMPLETE';

export interface MTSSAcademicAlert {
  id: string;
  caseId: string | null;
  studentId: string | null;
  studentName: string | null;
  classId: string | null;
  className: string | null;
  academicYear: string;
  semester: string;
  type: MTSSAcademicAlertType;
  severity: MTSSAcademicAlertSeverity;
  title: string;
  description: string;
  recommendedAction: string;
  relatedEntityType:
    | 'SCREENING'
    | 'CASE'
    | 'MEETING'
    | 'SESSION'
    | 'EVALUATION'
    | 'PARENT_DOC'
    | 'TIMELINE';
  relatedEntityId: string | null;
  assignedToUserIds: string[];
  assignedToRoles: UserRole[];
  assignedTo?: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED' | 'ARCHIVED';
  dueDate: number | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export type MTSSAcademicTier = 'Tier 1' | 'Tier 2' | 'Tier 3';
export type MTSSAcademicDecision = 'CONTINUE' | 'BACK_TO_TIER_1' | 'REPEAT_TIER_2' | 'ESCALATE_TO_TIER_3' | null;

export type MTSSAcademicRiskFlag =
  | 'LOW_PERFORMANCE_BASIC_SKILLS'
  | 'PERSISTENT_GAPS_AFTER_TIER1'
  | 'SIGNIFICANT_REGRESSION'
  | 'REPEATED_TIER2_HISTORY'
  | 'PREVIOUS_TIER3_HISTORY'
  | 'ATTENDANCE_CONCERN'
  | 'TEACHER_REFERRAL'
  | 'BEHAVIORAL_CONCERN_IMPACTING_ACADEMICS';

export type MTSSAcademicRiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type MTSSAcademicRecommendedAction =
  | 'MONITOR_IN_TIER1'
  | 'CONSIDER_TIER2_DISCUSSION'
  | 'RECOMMEND_TIER2'
  | 'CONSIDER_TIER3_REVIEW';

export interface MTSSAcademicScreeningResult {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  domain: 'BI' | 'ENG' | 'NUM';
  gradeLevel: 7 | 8 | 9;
  basicSkillsBelowExpectation: string[]; // reference codes/titles from constants
  averageScore: number | null;
  recentTrend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';
  riskFlags: MTSSAcademicRiskFlag[];
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  recommendedAction: MTSSAcademicRecommendedAction;
  requiresAdditionalDiagnosis?: boolean; // If class > 20% threshold
  lastAssessmentDate: number | null;
  teacherNotes?: string;
  isMarkedForDiscussion?: boolean;
}

export interface ClassScreeningSummary {
  classId: string;
  className: string;
  totalStudents: number;
  domain: 'BI' | 'ENG' | 'NUM';
  tier2CandidateCount: number;
  tier2CandidatePercentage: number;
  exceedsRecommendedThreshold: boolean;
}

export interface MTSSAcademicBasicSkill {
  code: string;
  title: string;
  description: string;
  grade: 7 | 8 | 9;
  domain: 'BI' | 'ENG' | 'NUM';
}

export interface MTSSAcademicCase {
  id: string;
  schoolUnit: UnitType;
  academicYear: string;
  semester: '1' | '2';
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  homeroomTeacherId: string;
  subjectDomains: MTSSAcademicDomain[];
  primaryConcern: string;
  currentTier: MTSSAcademicTier;
  status: MTSSAcademicStatus;
  sourceType: 'SCREENING' | 'TEACHER_REFERRAL' | 'DATA_REVIEW';
  assignedTeacherIds: string[];
  assignedSubjectTeacherIds: string[];
  assignedCounselorIds: string[];
  parentMeetingStatus: 'NOT_STARTED' | 'SCHEDULED' | 'COMPLETED';
  parentCommitmentStatus: 'NOT_SENT' | 'SENT' | 'SIGNED' | 'DECLINED';
  latestDecision: MTSSAcademicDecision;
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
  createdBy?: string;

  // --- Backup v1 Metadata ---
  registerSyncStatus?: MTSSSyncStatus;
  registerRowKey?: string;
  driveFolderId?: string;
  latestPdfFileId?: string;
  latestPdfFileName?: string;
  latestPdfVersion?: number;
  latestPdfGeneratedAt?: number;
  latestPdfGeneratedBy?: string;
  lastBackupAt?: number;
  lastBackupError?: string;

  // --- Snapshot v2 Metadata ---
  snapshotSyncStatus?: MTSSSyncStatus;
  latestSnapshotFileId?: string;
  latestSnapshotFileName?: string;
  latestSnapshotVersion?: number;
  latestSnapshotSyncedAt?: number;
  latestSnapshotError?: string;
  snapshotNeedsRefresh?: boolean;
  snapshotLastTriggeredAt?: number;
}

export interface MTSSAcademicGoal {
  id: string;
  caseId: string;
  domain: MTSSAcademicDomain;
  skillCategory: string;
  skillCode: string | null;
  goalType: 'CURRENT' | 'FORMER' | 'NEW';
  title: string;
  description: string;
  measurableTarget: string;
  baselineSummary: string;
  targetMetric: {
    type: 'PERCENT' | 'COUNT' | 'SCORE' | 'CUSTOM';
    value: number | null;
    unit: string | null;
  };
  status: 'ACTIVE' | 'ACHIEVED' | 'PARTIAL' | 'NOT_ACHIEVED' | 'REPLACED';
  createdAt: number;
  updatedAt: number;
}

export interface MTSSAcademicSession {
  id: string;
  caseId: string;
  sessionNo: number;
  date: number;
  domain: MTSSAcademicDomain;
  topic: string;
  materialTitle: string;
  activitySummary: string;
  attendanceStatus: 'PRESENT' | 'ABSENT' | 'LATE' | 'SICK';
  latenessMinutes: number | null;
  teacherObservation: string;
  performanceMark: 'A' | 'D' | 'B' | null;
  score: number | null;
  homeworkAssigned: boolean;
  homeworkStatus: 'DONE' | 'NOT_DONE' | 'PARTIAL' | null;
  notes: string;
  createdBy: string;
  createdAt: number;
}

export interface MTSSAcademicMeeting {
  id: string;
  caseId: string;
  meetingType: 'INITIAL' | 'FOLLOW_UP' | 'REVIEW' | 'TIER_3_PLANNING';
  date: number;
  participants: {
    userId: string | null;
    name: string;
    role: string;
  }[];
  summaryCurrentData: string;
  relevantBackground: string;
  strengths: string;
  pastConcerns: string;
  currentConcerns: string;
  definitionOfProblem: string;
  recommendations: string[];
  nextReviewDate: number | null;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface MTSSAcademicPlan {
  id: string;
  caseId: string;
  tier: 'Tier 2' | 'Tier 3';
  domain: MTSSAcademicDomain;
  frequencyPerWeek: number;
  durationMinutes: number;
  totalWeeks: number;
  supportAtHomeRequired: boolean;
  instructionalAccommodations: string[];
  plannedStrategies: string[];
  plannedMaterials: string[];
  assignedByRoles: string[];
  startDate: number;
  targetEndDate: number;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'REVISED';
  createdAt: number;
  updatedAt: number;
}

export interface MTSSAcademicEvaluation {
  id: string;
  caseId: string;
  evaluationType: 'TIER_2_REPORT' | 'TIER_3_REVIEW' | 'MID_PROGRAM_REVIEW' | 'FINAL_REVIEW';
  date: number;
  domainSummaries: {
    domain: MTSSAcademicDomain;
    goalId: string | null;
    progressComment: string;
    result: 'ACHIEVED' | 'PARTIAL' | 'NOT_ACHIEVED';
  }[];
  additionalComments: string;
  strategyDecision: 'CONTINUE' | 'REVISE' | 'REPLACE' | 'ESCALATE' | 'CLOSE';
  recommendedTier: MTSSAcademicTier;
  signedByTeacherId: string | null;
  signedByPrincipalId: string | null;
  createdAt: number;
}

export interface MTSSAcademicParentDocument {
  id: string;
  caseId: string;
  type: 'INITIAL_LETTER' | 'PARENT_COMMITMENT' | 'FOLLOW_UP_NOTE';
  status: 'DRAFT' | 'SENT' | 'SIGNED' | 'ARCHIVED';
  fileUrl: string | null;
  sentAt: number | null;
  acknowledgedAt: number | null;
  notes: string | null;
  createdAt: number;
}

export interface AttendanceContextSummary {
  absentCount: number;
  tardyCount: number;
  last30DaysTrend: 'improving' | 'declining' | 'stable';
  thresholdWarning: boolean;
}

export interface BehaviorContextSummary {
  activeCaseId?: string | null;
  currentTier?: 'Tier 1' | 'Tier 2' | 'Tier 3' | null;
  lastIncidentDate?: number | null;
  cicoActive: boolean;
  recentConcern?: string | null;
}

export interface AssessmentContextSummary {
  domain: string;
  recentScores: { date: number; score: number; label: string }[];
  masteryLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  trend: 'up' | 'down' | 'neutral';
}

export interface RaporContextSummary {
  lastNarrative?: string | null;
  consistentWithMTSS: boolean;
  period: string;
}

export interface MTSSAcademicAuditRecord {
  id: string;
  caseId: string;
  action: MTSSAcademicAuditAction;
  entityType: 'CASE' | 'GOAL' | 'SESSION' | 'MEETING' | 'EVALUATION' | 'ALERT' | 'DOCUMENT' | 'TIMELINE';
  entityId: string;
  performedBy: string;
  performedByRole: string;
  timestamp: number;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  note?: string;
}

export type MTSSAcademicAuditAction =
  | 'CASE_CREATED'
  | 'CASE_UPDATED'
  | 'CASE_STATUS_CHANGED'
  | 'GOAL_CREATED'
  | 'GOAL_UPDATED'
  | 'SESSION_LOGGED'
  | 'SESSION_UPDATED'
  | 'MEETING_CREATED'
  | 'MEETING_UPDATED'
  | 'EVALUATION_COMPLETED'
  | 'ALERT_CREATED'
  | 'ALERT_RESOLVED'
  | 'DOCUMENT_GENERATED'
  | 'DOCUMENT_SUPERSEDED'
  | 'TIMELINE_INITIALIZED'
  | 'TIMELINE_PHASE_UPDATED';

export interface MTSSAcademicDraft {
  id?: string;
  userId: string;
  caseId?: string;
  type: 'INITIAL_MEETING' | 'SESSION' | 'EVALUATION' | 'FOLLOW_UP_MEETING' | 'TRANSITION' | 'MEETING';
  content: any;
  lastSavedAt: number;
  status: 'SAVING' | 'SAVED' | 'FAILED' | 'DRAFT';
}

export type MTSSAcademicCaseStatus = 'DRAFT' | 'ACTIVE' | 'MONITORING' | 'CLOSED' | 'ARCHIVED';
export type MTSSAcademicAlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED' | 'ARCHIVED';
export type MTSSAcademicDocumentStatus = 'GENERATED' | 'SUPERSEDED' | 'ARCHIVED';

export interface MTSSAcademicStudentContext {
  studentId: string;
  attendance?: AttendanceContextSummary;
  behavior?: BehaviorContextSummary;
  assessments?: AssessmentContextSummary[];
  rapor?: RaporContextSummary;
  insightTags: string[];
}

export type MTSSAcademicDocumentType =
  | 'INITIAL_MEETING_PDF'
  | 'PARENT_COMMITMENT_PDF'
  | 'EVALUATION_REPORT_PDF'
  | 'FOLLOW_UP_MEETING_PDF'
  | 'TIER_3_TRANSITION_PDF';

export interface MTSSAcademicDocumentRecord {
  id: string;
  caseId: string;
  studentId: string;
  type: MTSSAcademicDocumentType;
  relatedMeetingId?: string | null;
  relatedEvaluationId?: string | null;
  fileUrl?: string | null;
  fileName: string;
  version: number;
  generatedAt: number;
  generatedBy: string;
  status: 'GENERATED' | 'ARCHIVED' | 'SUPERSEDED';
}

export interface MTSSAcademicTimelinePhase {
  id: string;
  schoolUnit: UnitType;
  academicYear: string;
  semester: '1' | '2';
  phase: 'PLANNING' | 'LAUNCH' | 'EXECUTION' | 'PERFORMANCE_CONTROL' | 'CLOSING_REVIEW';
  title: string;
  description: string;
  startDate: number;
  endDate: number;
  ownerRole: string;
  checklistItems: string[];
  createdAt: number;
  updatedAt: number;
}

// --- MTSS Academic Analytics Types ---

export interface MTSSAcademicAnalyticsFilters {
  academicYear: string;
  semester: string;
  grade?: number;
  classId?: string;
  domain?: MTSSAcademicDomain;
  tier?: MTSSAcademicTier;
  status?: MTSSAcademicStatus;
}

export interface MTSSAcademicExecutiveOverview {
  totalActiveCases: number;
  tier2Active: number;
  tier3Active: number;
  newCasesThisTerm: number;
  reviewsDueThisWeek: number;
  followUpRequired: number;
  successfullyClosed: number;
  parentFollowUpNeeded: number;
}

export interface MTSSAcademicGradeSummary {
  grade: number;
  totalStudents: number;
  totalCases: number;
  tierDistribution: Record<string, number>;
  domainDistribution: Record<string, number>;
}

export interface MTSSAcademicDomainSummary {
  domain: MTSSAcademicDomain;
  totalCases: number;
  activeCount: number;
  closedCount: number;
  escalatedToTier3: number;
  avgSessions: number;
  avgCompletionRate: number;
  topConcerns: string[];
}

export interface MTSSAcademicProgressSummary {
  onTrack: number;
  needsReview: number;
  actionNeeded: number;
}

export interface MTSSAcademicComplianceSummary {
  initialMeetingComplete: number;
  parentCommunicationRecorded: number;
  parentCommitmentSent: number;
  evaluationCompleted: number;
  totalCases: number;
}

export interface MTSSAcademicOutcomeTrendPoint {
  period: string;
  continue: number;
  revise: number;
  close: number;
  escalate: number;
}

export interface MTSSConcern {
  id: string;
  date: string;
  description: string;
  reporterId: string;
  reporterName: string;
  interventionsTried: string[];
  progressNotes?: string;
  nextSteps: string;
  nextStepPicId?: string;
  nextStepPicName?: string;
  nextStepDueDate?: string;
  isDone: boolean;
  doneAt?: number;
  createdAt: number;
}

export interface CICOGoal {
  id: string;
  label: string;
}

export interface CICOScore {
  goal1: 1 | 2 | 3 | null;
  goal2: 1 | 2 | 3 | null;
  goal3: 1 | 2 | 3 | null;
  goal4: 1 | 2 | 3 | null;
}

export interface CICOSessionData {
  sessionId: string;
  sessionName: string;
  timeSlot: string;
  scores: CICOScore;
  isNA: boolean;
  filledBy: string;
  filledByName: string;
}

export interface CICODailyReport {
  id: string;
  caseId: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  weekNumber: number;
  sessions: CICOSessionData[];
  dailyAvgScore: number;
  dailyNote: string;
  hasSpecialIncident: boolean;
  incidentNote: string;
  isAbsent?: boolean;
  isFinalSession?: boolean;
  isLateInput?: boolean;
  weeklyReflection?: {
    studentPositive: string;
    studentPlan: string;
    teacherNote: string;
  };
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface CICOWeeklyReflection {
  id: string;
  caseId: string;
  weekStartingDate: string; // Monday
  weekNumber: number;
  studentPositives: string;
  studentPlans: string;
  teacherNotes: string;
  createdAt: number;
  updatedAt: number;
}

export interface CICOGoalConfig {
  caseId: string;
  goals: CICOGoal[];
  targetPercentage: number; // e.g. 80
  updatedAt: number;
}

export interface BIPPlan {
  id: string;
  caseId: string;
  studentId: string;
  targetBehaviors: string;
  replacementBehaviors: string;
  strategies: string;
  homeProgram: string;
  reviewTerm: string;
  psychologistNotes: string;
  isConfidential: boolean;
  signatures: {
    principal?: boolean;
    classTeacher?: boolean;
    counselor?: boolean;
    parent?: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export interface MTSSCase {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  tier: MTSSTier;
  status: MTSSStatus;
  picId: string; // PIC Guru pengampu saat ini
  picName: string;
  initialAssets?: string; // Student strengths recorded at report time
  totalConcerns: number;
  lastConcernSummary: string;
  lastConcernDate: number;
  lastUpdatedAt: number;
  createdAt: number;
  
  // --- Backup v1 Metadata ---
  registerSyncStatus?: MTSSSyncStatus;
  registerRowKey?: string;
  driveFolderId?: string;
  latestCaseSummaryPdfId?: string;
  latestCaseSummaryPdfName?: string;
  latestCicoPdfId?: string;
  latestCicoPdfName?: string;
  latestBipPdfId?: string;
  latestBipPdfName?: string;
  latestArchiveVersion?: number;
  lastBackupAt?: number;
  lastBackupError?: string;

  // --- Snapshot v2 Metadata ---
  snapshotSyncStatus?: MTSSSyncStatus;
  latestSnapshotFileId?: string;
  latestSnapshotFileName?: string;
  latestSnapshotVersion?: number;
  latestSnapshotSyncedAt?: number;
  latestSnapshotError?: string;
  snapshotNeedsRefresh?: boolean;
  snapshotLastTriggeredAt?: number;

  // Tier 2 Meeting Data
  tier2Meeting?: {
    meetingDate: string;
    parentName: string;
    backgroundInfo: string;
    problemDefinition: string;
    desiredOutcome: string;
    parentContacted: boolean;
    parentContactDate?: string;
    interventionLetterDate?: string;
    interventionDescription: string;
    frequency: string;
    responsibleParties: string[]; // Teacher, Counselor, etc
    accommodations: string;
    meetingNotes: string;
    cicoGoals: CICOGoal[];
  };

  homeProgramme?: {
    motivationMessage?: string;
    homeNotesPerWeek?: Record<number, string>; // weekNumber -> note
    isVisibleToParent: boolean;
    publishedWeeks: number[];
  };

  closedInfo?: {
    reason: string;
    notes: string;
    closedAt: number;
    closedBy: string;
  };
}

export interface BehaviorCase {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  reporterUid: string;
  reporterName: string;
  date: string;
  time: string;
  location: string;
  description: string;
  frequency: string;
  impact: string;
  previousResponses: string;
  tier: MTSSTier;
  status: MTSSStatus;
  createdAt: number;
}

export interface InterventionPlan {
  caseId: string;
  targetBehavior: string;
  replacementBehavior: string;
  preventionStrategy: string;
  roleTeacher: string;
  roleBK: string;
  roleParent: string;
  successIndicator: string;
  reviewSchedule: string;
  createdAt: number;
}

export interface Class {
  id: string; // e.g. "JUNIOR_HIGH_2025-2026_7-Baiji"
  name: string; // "7 Baiji"
  grade: string; // "7"
  unitId: string;
  academicYear: string;
  homeroomTeacherId?: string;
  homeroomTeacherName?: string;
  status: 'active' | 'archived';
  createdAt: number;
  updatedAt: number;
  teacherSignatureUrl?: string | null;
}

export type UserRole = 
  | 'SUPER_ADMIN' 
  | 'HEAD_UNIT' 
  | 'HEAD_JUNIOR' 
  | 'TEACHER' 
  | 'BK_MENTOR' 
  | 'STUDENT' 
  | 'PARENT' 
  | 'GUEST'
  | 'MTSS_ACADEMIC_PJ'
  | 'PRINCIPAL'
  | 'VICE_PRINCIPAL'
  | 'COORDINATOR'
  | 'HOMEROOM_TEACHER'
  | 'COUNSELOR';

export type UserStatus = 'active' | 'pending' | 'disabled';
export type UnitType = 'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH';

export interface Student {
  id: string; // NIS
  name: string;
  nickname?: string;
  nisn?: string;
  currentUnit: string;
  classId: string;
  unitId?: string;
  nis?: string;
  oldLuminaId?: string; // Old NIS/Lumina ID
  grade?: number;
  academicYear?: string;
}

export interface Enrollment {
  studentId: string;
  classId: string;
  academicYear: string;
  status?: string;
}

// --- Attendance Backup & Sync Types ---
export type AttendanceStatus = 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPA' | 'LATE';

export interface AttendanceRecord {
  id: string; // Suggested: classId_date_studentId
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: '1' | '2';
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note: string;
  latenessMinutes: number | null;
  recordedBy: string;
  recordedAt: number;
  updatedAt: number;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
  lastSyncAt: number | null;
  syncError: string | null;
  retryCount: number;
}

// --- Attendance Backup Types ---
export interface AttendanceSyncResult {
  success: boolean;
  error?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  recordId?: string;
  timestamp?: number;
}

export type AttendanceSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface AttendanceBackupConfig {
  id: string; // 'junior_high_backup'
  rootFolderId: string; // shared drive root for Junior High Attendance
  rootFolderPath: string; 
  sharedDriveId: string;
  isEnabled: boolean;
  lastUpdatedBy: string;
  lastUpdatedAt: number;
}

export interface AttendanceBackupFileMap {
  id: string; // classId_academicYear_semester
  classId: string;
  academicYear: string;
  semester: '1' | '2';
  spreadsheetId: string;
  spreadsheetUrl: string;
  folderId: string; // Specific folder for this file if needed
  lastSyncedAt: number;
}

// --- MTSS Academic Backup Types ---
export type MTSSBackupStatus = 'READY' | 'MISCONFIGURED' | 'NEEDS_REAUTH';
export type MTSSSyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface MTSSAcademicBackupConfig {
  id: string; // 'junior_high_mtss_v1'
  schoolUnit: UnitType;
  isEnabled: boolean;
  
  // Storage
  sharedDriveId: string;
  rootFolderName: string;
  rootFolderId: string; // Shared Drive ID or a subfolder for MTSS Academic
  
  // Registration
  masterRegisterSpreadsheetId: string;
  
  // Patterns
  folderNamingPattern: string; // e.g. "{caseId}_{studentName}"
  pdfNamingPattern: string;    // e.g. "MTSS_{caseId}_{studentName}_{version}"
  
  // Toggles
  autoCreateFolder: boolean;
  autoSyncRegister: boolean;
  autoUploadPdf: boolean;
  
  lastValidatedAt: number | null;
  lastValidatedBy: string | null;
  updatedAt: number;
  updatedBy: string;
}

export interface MTSSAcademicCaseBackupMap {
  id: string; // caseId
  caseId: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  academicYear: string;
  semester: '1' | '2';
  domain: string;
  tier: string;
  caseStatus: string;
  caseFolderId: string | null;
  caseFolderName: string | null;
  initialMeetingDocId: string | null;
  interventionPlanDocId: string | null;
  evaluationDocId: string | null;
  parentFollowUpDocId: string | null;
  closingSummaryDocId: string | null;
  latestPdfIds: string[]; // List of IDs in Drive
  syncStatus: MTSSSyncStatus;
  lastSyncAt: number | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MTSSAcademicSemesterBackupMap {
  id: string; // academicYear_semester
  academicYear: string;
  semester: '1' | '2';
  schoolUnit: UnitType;
  masterRegisterSheetId: string | null;
  interventionTrackerSheetId: string | null;
  syncStatus: MTSSSyncStatus;
  lastSyncAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MTSSAcademicBackupSyncResult {
  success: boolean;
  syncStatus: MTSSSyncStatus;
  message: string;
  targetType: 'CASE_FOLDER' | 'DOC' | 'SHEET' | 'PDF';
  targetId: string | null;
  updatedAt: number;
  error?: string;
}

export type AssessmentScore = "A" | "D" | "B" | number | null;
export type ScoringMode = 'ABD' | 'NUMERIC';

export interface AssessmentGoal {
  goalId: string;
  goalCode: string;
  goalText: string;
  subject: string;
}

export interface AssessmentGoalScoreValue {
  score: AssessmentScore;
  scoringMode: ScoringMode;
  notes: string;
  scoredBy: string;
  scoredAt: number;
}

export interface AssessmentStudentScore {
  studentId: string;
  studentName: string;
  goalScores: {
    [goalId: string]: AssessmentGoalScoreValue;
  };
}

export interface Assessment {
  id: string;
  lxdId: string;
  lxdType: LXDType;
  lxdTitle: string;
  classId: string;
  unitId: "ELEMENTARY" | "JUNIOR_HIGH";
  subject: string;
  academicYear: string;
  semester: "1" | "2";
  assessmentLabel: string;
  assessedBy: string;
  assessedAt: number;
  updatedAt: number;
  scoringMode: ScoringMode;
  goals: AssessmentGoal[];
  scores: AssessmentStudentScore[];
}

export type ReportCardType = 'MONTHLY' | 'MIDTERM' | 'END_TERM_LAZUARDI' | 'END_TERM_DIKNAS';
export type ReportCardStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PUBLISHED';

export interface ReportConfig {
  unitId: string;
  subjectOrder: string[];
  studentProfileMapping: {
    "Spiritual Health": string[];
    "Islamic Awareness": string[];
    "Thinking, Research and Academic Abilities": string[];
    "Arts Proficiency": string[];
    "Range of Interests Talents and Dispositions": string[];
    "Physical Fitness": string[];
  };
  spiritualHealthLGId: string;
}

export interface StudentReport {
  studentId: string;
  studentName: string;
  nisn: string;
  spiritualHealth: {
    lgId: string;
    lgText: string;
    remark: string;
  };
  subjectScores: {
    [subject: string]: {
      lxdType: LXDType;
      scores: {
        goalId: string;
        goalCode: string;
        goalText: string;
        score: AssessmentScore;
      }[];
      subjectComment?: string;
    };
  };
  numericScores: {
    [subject: string]: number;
  };
  selfExplorationReflection: string;
  selfExplorationComment: string;
  clubScores: {
    clubName: string;
    competence: AssessmentScore;
    aspiration: AssessmentScore;
    commitment: AssessmentScore;
  }[];
  extracurricular: {
    activityName: string;
    mastery: "Sangat Baik" | "Baik" | "Cukup" | "Perlu Bimbingan";
  }[];
  graduationStatus: "LULUS" | "TIDAK_LULUS" | null;
  reportStatus: ReportCardStatus;
  attendance?: {
    sick: number;
    excused: number;
    absent: number;
  };
}

export interface ReportCard {
  id: string;
  type: ReportCardType;
  unitId: UnitType;
  classId: string;
  academicYear: string;
  semester: "1" | "2";
  period: string;
  homeroomTeacherId: string;
  homeroomComment: string;
  isEndTerm: boolean;
  studentReports: StudentReport[];
  status: ReportCardStatus;
  submittedAt: number | null;
  submittedBy: string | null;
  approvedAt: number | null;
  approvedBy: string | null;
  publishedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type SEStrand = 'Imaginal' | 'Rational' | 'Physical';

export interface SEPeriod {
  id: string;
  unitId: 'JUNIOR_HIGH';
  academicYear: string;
  semester: '1' | '2';
  periodNumber: 1 | 2;
  label: string;
  startDate: number;
  endDate: number;
  totalSessions: number;
  planningDeadline: number;
  exhibitionDate: number;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
}

export interface SEActivity {
  id: string;
  strand: SEStrand;
  name: string;
  requiresTemplate: boolean;
  isProhibited: boolean;
  isActive: boolean;
  unitId: 'JUNIOR_HIGH';
}

export interface SEChoice {
  slot: 1 | 2;
  strand: SEStrand;
  activityId: string;
  activityName: string;
  customActivity: string | null;
  requiresTemplate: boolean;
  // planning
  finalTarget: string;
  equipment: string;
  weeklyTargets: { week: number; target: string }[];
  // approval
  approvalStatus: 'PENDING' | 'APPROVED' | 'REVISION_NEEDED';
  approvalNote: string | null;
  approvedBy: string | null;
  approvedAt: number | null;
  // final result
  teacherComment: string | null;
}

export interface SEEnrollment {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  grade: 7 | 8 | 9;
  periodId: string;
  academicYear: string;
  semester: '1' | '2';
  periodNumber: 1 | 2;
  choices: SEChoice[];
  status: 'PLANNING' | 'SUBMITTED' | 'APPROVED' | 'IN_PROGRESS' | 'SELF_ASSESSED' | 'COMPLETED';
  createdAt: number;
  updatedAt: number;
}

export interface SESessionLog {
  id: string;
  enrollmentId: string;
  studentId: string;
  periodId: string;
  choiceSlot: 1 | 2;
  sessionNumber: number;
  date: number;
  // student
  weeklyTarget: string;
  workDone: string;
  progressNote: string;
  photoUrl: string | null;
  // supervisor
  supervisorId: string | null;
  attendance: 'PRESENT' | 'ABSENT' | 'NO_EQUIPMENT';
  supervisorNote: string | null;
  supervisorFilledAt: number | null;
  createdAt: number;
}

export interface SESelfAssessment {
  id: string;
  enrollmentId: string;
  studentId: string;
  periodId: string;
  choiceSlot: 1 | 2;
  goalAchievement: 'ACHIEVED' | 'ALMOST' | 'NOT_YET';
  goalAchievementNote: string;
  learnings: string;
  challenges: string;
  improvements: string;
  finalPhotoUrl: string | null;
  submittedAt: number;
}

export interface ParentStudentLink {
  parentId: string; // email
  studentIds: string[]; // NIS array
  createdBy: string;
  createdAt: number;
}

export interface ParentReportView {
  parentId: string;
  reportId: string;
  studentId: string;
  viewedAt: number;
}

export type NotificationType = 
  | 'REPORT_PUBLISHED' 
  | 'REPORT_SUBMITTED' 
  | 'REPORT_APPROVED' 
  | 'REPORT_REJECTED' 
  | 'SE_PERIOD_OPEN' 
  | 'BEHAVIOR_ALERT'
  | 'LXD_SUBMITTED_FOR_APPROVAL'
  | 'LXD_APPROVED'
  | 'LXD_REJECTED';

export type BehaviorAlertSeverity = "WARNING" | "HIGH" | "INFO";

export interface BehaviorNotification {
  id: string;
  type: string; // ALERT-T1-01, etc.
  severity: BehaviorAlertSeverity;
  title: string;
  message: string;
  caseId: string;
  studentId: string;
  studentName: string;
  targetRoles?: string[];
  targetUserIds: string[]; // UIDs
  isRead: Record<string, boolean>; // userId -> boolean
  isDismissed: Record<string, boolean>; // userId -> boolean
  actionUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface BehaviorAnalyticsFilters {
  academicYear: string;
  semester: '1' | '2';
  dateRange: { start: number; end: number };
  grade?: string;
  classId?: string;
  tier?: MTSSTier;
  status?: MTSSStatus;
  picId?: string;
}

export interface BehaviorKPI {
  totalActiveCases: number;
  activeCasesDelta: number; // percentage vs previous
  uniqueStudents: number;
  tierDistribution: Record<MTSSTier, number>;
  newCasesInPeriod: number;
  closedCasesInPeriod: number;
  avgResolutionDays: number;
  cicoTargetAchievement: number; // percentage
  casesWithAlerts: number;
}

export interface InterventionEffectivenessRow {
  type: string;
  usageCount: number;
  improvementRate: number; // percentage where status improved or resolved
  escalationRate: number; // percentage where tier increased
  avgDaysToResolution: number;
}

export interface CICOAnalyticsSummary {
  activeStudents: number;
  avgDailyScore: number;
  targetAchievementRate: number;
  goalAverages: Record<string, number>;
  atRiskStudents: WatchlistStudent[];
}

export interface WatchlistStudent {
  studentId: string;
  studentName: string;
  classId: string;
  caseId: string;
  tier: MTSSTier;
  durationInProgram: number;
  totalConcerns: number;
  activeAlerts: number;
  lastUpdateDate: number;
  avgCicoScore?: number;
  trend?: 'UP' | 'DOWN' | 'STAGNANT';
  recommendedAction: string;
}

export interface SmartInsight {
  id: string;
  type: 'TREND' | 'ALERT' | 'SUCCESS' | 'INFO';
  title: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface HeatmapData {
  day: string;
  session: string;
  count: number;
}

export interface AppNotification {
  id: string;
  userId: string; // email
  type: NotificationType;
  message: string;
  link: string;
  isRead: boolean;
  createdAt: number;
}

export interface User {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  jobTitle?: string;
  unitId?: string;
  luminaId?: string; // For Students
  nickname?: string;
  linkedStudents?: string[]; // For Parents
  classId?: string; // For Students
  academicYear?: string; // For Students
  photoURL?: string;
  signatureUrl?: string | null;
  niy?: string | null;
  fatherName?: string;
  motherName?: string;
  createdAt: number;
}

export interface RoleInvite {
  email: string;
  name: string;
  jobTitle?: string;
  role: UserRole;
  unitId: UnitType;
  luminaId?: string; // For Students (NIS)
  oldLuminaId?: string; // For Students (Old NIS)
  nisn?: string;
  nickname?: string;
  gender?: string;
  parentEmail?: string;
  fatherName?: string;
  motherName?: string;
  linkedStudents?: string[]; // For Parents
  classId?: string; // For Students
  academicYear?: string; // For Students
  status: 'ready' | 'used' | 'revoked';
  createdAt: number;
}

export interface Reflection {
  id: string;
  studentId: string;
  topic: string; // Belajar / Pergaulan / Proyek / Lainnya
  incident: string;
  feelings: string;
  improvement: string;
  aiReflection?: string;
  aiQuestions?: string[];
  createdAt: number;
}

export type VisibilityMode = 'SELF' | 'MENTOR' | 'PARENT';

export type LiteracyArea = 'BAHASA' | 'ENGLISH' | 'MENGAJI' | 'NUMERASI';
export type LiteracyLevel = 1 | 2 | 3 | 4;

// Kindergarten Types
export type KGAttendanceStatus = 'PRESENT' | 'SICK' | 'PERMISSION' | 'NO_NEWS';
export type KGEmotionStatus = 'HAPPY' | 'OK' | 'SAD' | 'ANGRY';
export type KGGrading = 'BB' | 'MB' | 'BSH' | 'BSB' | 'ABSENT' | 'NOT_PARTICIPATING';

export type KGActivity = 
  | 'MAKE_BELIEVE' | 'ISLAMIC_AWARENESS' | 'LIBRARY_LITERACY' 
  | 'DISCOVERY' | 'BLOCKS_BUILDING' | 'ART_EXPLORATIONS' 
  | 'ENGLISH' | 'MUSIC' | 'OUTSIDE' | 'AUDIO_VISUAL' 
  | 'SPECIAL_PROGRAM' | 'MORNING_MOVEMENT';

export type KGDomain = 
  | 'AGAMA_BUDI_PEKERTI' | 'SOSIAL_EMOSIONAL' | 'BAHASA' 
  | 'KOGNITIF' | 'FISIK_MOTORIK' | 'SENI';

export interface LiteracyProgress {
  id: string;
  studentId: string;
  area: LiteracyArea;
  level: LiteracyLevel;
  notes: string;
  assessedAt: number;
  assessedBy: string;
}

export interface SelfExploration {
  studentId: string;
  strengths: string[];
  interests: string[];
  values: string[];
  shortTermGoals: {
    goal: string;
    timeframe: string;
    whyImportant: string;
    firstSteps: string[];
  }[];
  longTermGoals: {
    goal: string;
    timeframe: string;
    whyImportant: string;
    firstSteps: string[];
  }[];
  supportNeeded: string[];
  visibility: VisibilityMode;
  updatedAt: number;
}

export interface LearningGoal {
  id: string;
  code: string;
  unitId: 'ELEMENTARY' | 'JUNIOR_HIGH';
  grade: string;
  subject: string;
  strand: string;
  goalText: string;
  academicYear: string;
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  backupSummary?: LGBackupSummary;
}

// --- New Learning Goals (LG) Module Types ---

export type LGReviewStatus = 'BELUM_DITELAAH' | 'SUDAH_SESUAI' | 'REVISI_MINOR' | 'REVISI_MAYOR';
export type LGStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type LGBackupStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface LGBackupSummary {
  lastBackupAt: number | null;
  lastBackupStatus: LGBackupStatus;
  lastBackupFileId: string | null;
  lastBackupFileUrl: string | null;
  lastBackupMessage: string | null;
}

export interface LGGoal {
  lgId: string;
  schoolId: string;
  schoolName: string;
  unitId: string;
  unitName: string;
  academicYearId: string;
  academicYearLabel: string;
  subjectId: string;
  subjectName: string;
  phase: string;
  semesterLabel: string;
  title: string;
  learningGoalText: string;
  reviewStatus: LGReviewStatus;
  notes: string;
  status: LGStatus;
  tags: string[];
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  publishedBy: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
  deletedAt: number | null;
  backupSummary: LGBackupSummary;
}

export interface LGBackupLog {
  id: string;
  lgId: string;
  status: LGBackupStatus;
  fileId: string | null;
  fileUrl: string | null;
  message: string | null;
  triggeredBy: string;
  createdAt: number;
}

export type LXDType = "WEEKLY_LESSONS" | "UNIT_AKTIVITAS" | "LEARNING_JOURNEY";
export type LXDStatus = "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "REJECTED";

export interface LXDApproval {
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: number | null;
  rejectionNote: string | null;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: number | null;
}

export interface IntegralStrandDetails {
  indicators: string[];
  narrative: string;
}

export interface IntegralStrands {
  moralSpiritual: IntegralStrandDetails;
  imaginal: IntegralStrandDetails;
  rational: IntegralStrandDetails;
  materialPhysical: IntegralStrandDetails;
}

export interface LXDMeeting {
  meetingNumber: number;
  meetingRange?: string;
  title: string;
  milestoneLabel?: string;
  learningObjective: string[];
  opening: string;
  mainActivities: string;
  closing: string;
  assessmentNotes: string;
  assessmentType: string[];
  differentiationNotes: {
    content: string;
    product: string;
    process: string;
  };
  instructionalStrategies: string[];
}

export interface RubricRow {
  goalId: string;
  goalSubject?: string;
  criteriaLabel: string;
  beginning: string;
  developing: string;
  achieved: string;
  assessedInMeeting: number;
}

export interface LXD {
  id: string;
  type: LXDType;
  title: string;
  unitId: "ELEMENTARY" | "JUNIOR_HIGH";
  academicYear: string;
  semester: "1" | "2";
  status: LXDStatus;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  approval?: LXDApproval;
  
  // Basic properties
  grade?: string;
  classId?: string;
  subject?: string;
  weeks?: string;
  duration?: string;
  generativeTopics?: string | string[];
  essentialQuestion?: string;
  linkedGoals: any[]; // Can be string[] or {goalId, subject}[]
  integralStrands?: IntegralStrands;
  differentiatedInstruction?: {
    content: string;
    process: string;
    product: string;
    environment: string;
  };
  rubric: RubricRow[];

  // Weekly Lessons specific
  lessonTopic?: string;
  meetings?: LXDMeeting[];

  // Unit Aktivitas specific
  subUnits?: {
    uaNumber: number;
    uaTitle: string;
    meetings: LXDMeeting[];
  }[];

  // Learning Journey specific
  grades?: string[];
  classIds?: string[];
  dateRange?: string;
  numberOfMeetings?: number;
  interdisciplinarySubjects?: string[];
  teachers?: { email: string; subject: string }[];
  prerequisiteSkills?: { subject: string; skills: string[] }[];
  materialsAndResources?: string;
  learningExperienceOverview?: string;
  meetTheExpert?: string;
  milestones?: {
    milestoneNumber: number;
    milestoneTitle: string;
    meetings: LXDMeeting[];
  }[];
  teacherReflection?: string;
  signatures?: {
    submissionDate: string;
    principal: { name: string; niy: string; signatureUrl?: string };
    subjectTeacher: { name: string; niy: string; signatureUrl?: string };
  };
  backupSummary?: LGBackupSummary;
}

export interface MTSSBehaviorBackupConfig {
  id: string; // 'junior_high_mtss_behavior_v1'
  schoolUnit: UnitType;
  isEnabled: boolean;
  
  // Storage
  sharedDriveId: string;
  rootFolderName: string;
  rootFolderId: string;
  
  // Registration
  masterRegisterSpreadsheetId: string;
  
  // Patterns
  folderNamingPattern: string;
  pdfNamingPattern: string;
  
  // Toggles
  autoCreateFolder: boolean;
  autoSyncRegister: boolean;
  autoUploadPdf: boolean;
  
  lastValidatedAt: number | null;
  lastValidatedBy: string | null;
  updatedAt: number;
  updatedBy: string;
}

export const MTSSBehaviorPdfType = {
  CASE_SUMMARY: 'CASE_SUMMARY',
  CICO_PROGRESS: 'CICO_PROGRESS',
  BIP_SUMMARY: 'BIP_SUMMARY'
} as const;

export type MTSSBehaviorPdfType = (typeof MTSSBehaviorPdfType)[keyof typeof MTSSBehaviorPdfType];

export type KGWeeklyReportDraft = {
  studentId: string;
  studentName: string;
  nickName?: string;
  className?: string;
  classGroup?: string;
  ageGroup?: 'PRA_TK' | 'TK_A' | 'TK_B';
  monthLabel: string;
  weekLabel: string;
  theme?: string;
  dateRangeLabel: string;

  weeklyObservationItems: Array<{
    dayLabel: string;
    dateKey: string;
    activity?: string;
    domain?: string;
    objective?: string;
    grade?: string;
    notes?: string;
    photoUrl?: string | null;
    generalPhotoUrl?: string | null;
  }>;

  groupedObservationSummary: Array<{
    domain: string;
    activityList: string[];
    objectiveList: string[];
    grades: string[];
    mergedNotes: string[];
  }>;

  dailySnapshots: Array<{
    dayKey: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';
    label: string;
    photoUrl: string | null;
    fallbackText: string;
  }>;

  attendanceSummary: {
    happy: number;
    sad: number;
    angry: number;
    ok: number;
    noNews: number;
    sick: number;
    izin: number;
    earlyLeave: number;
  };

  aiWeeklyCommentsDraft?: string;
  aiSocialEmotionalDraft?: string;
  teacherEditedWeeklyComments?: string;
  teacherEditedSocialEmotional?: string;
};

export interface PromptTemplate {
  id: string;
  key: string;
  name: string;
  unit: "ALL" | "KINDERGARTEN" | "ELEMENTARY" | "JUNIOR_HIGH";
  category: "report" | "chat" | "analysis" | "notification";
  prompt: string;
  variables: string[];
  description: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export type LdssAge = 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type LdssIndicator = {
  id: string;
  text: string;
  order: number;
};

export type LdssDomain = {
  id: string;
  name: string;
  order: number;
  indicators: LdssIndicator[];
};

export type LdssTemplateStatus = 'draft' | 'active' | 'archived';

export type LdssTemplate = {
  id: string;
  age: LdssAge;
  version: string;
  status: LdssTemplateStatus;
  domains: LdssDomain[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  publishedAt?: string;
};

export type LdssAssessment = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  age: LdssAge;
  templateId: string;
  scores: Record<string, "YA" | "TIDAK" | null>;
  notes: Record<string, string>;
  generalNotes?: string;
  assessedBy: string;
  assessedAt: string;
  updatedAt: string;
};

// --- Three-Way Conference & SMART Goal Tracker Types ---
export type ConferenceGoalStrand = 'SPIRITUAL' | 'IMAGINAL' | 'RATIONAL' | 'MATERIAL_PHYSICAL';

export type ConferenceGoalStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

export interface ConferencePeriod {
  id: string;
  academicYear: string;
  semester: 1 | 2;
  label: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED';
  goalSettingOpenDate: number | null;
  goalSettingCloseDate: number | null;
  trackerOpenDate: number | null;
  trackerCloseDate: number | null;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  updatedBy: string;
}

export interface SmartGoal {
  id: string;
  strand: ConferenceGoalStrand;
  goal: string;
  smartSpecific: string;
  smartMeasurable: string;
  smartAchievable: string;
  smartRelevant: string;
  smartTimeBound: string;
  actions: string;
  evidence: string;
  startDate: number | null;
  targetDate: number | null;
  status: ConferenceGoalStatus;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface UnitActivityItem {
  category: string;
  activityName: string;
  worries: string;
  overcomingPlan: string;
}

export interface StudentConferenceResponse {
  id: string; // ${periodId}_${studentId}
  periodId: string;
  studentId: string;
  studentName: string;
  studentLuminaId: string;
  classId: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: 1 | 2;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFERENCE_COMPLETED';
  aboutMe: string;
  strengths: string;
  areasForGrowth: string;
  goals: SmartGoal[];
  selfExplorationReferenceId: string | null;
  selfExplorationSnapshot?: any;
  karyaIlmiahReferenceId: string | null;
  unitActivity?: string;
  unitActivityCategory?: string;
  unitActivityName?: string;
  unitActivityWorries?: string;
  unitActivityOvercomingPlan?: string;
  unitActivities?: UnitActivityItem[];
  createdAt: number;
  updatedAt: number;
  submittedAt?: number | null;
  submittedBy?: string | null;
}

export interface MentorAssignment {
  id: string; // ${periodId}_${studentId}
  periodId: string;
  academicYear: string;
  semester: 1 | 2;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  mentorId: string;
  mentorName: string;
  mentorEmail: string;
  status: 'ACTIVE' | 'REASSIGNED' | 'REMOVED';
  assignedBy: string;
  assignedByName: string;
  assignedAt: number;
  updatedBy?: string | null;
  updatedAt?: number | null;
  previousMentorId: string | null;
  reassignmentReason: string | null;
  assignmentHistory?: Array<{
    mentorId: string | null;
    mentorName: string | null;
    mentorEmail: string | null;
    action: 'ASSIGNED' | 'REASSIGNED' | 'REMOVED';
    actionBy: string;
    actionByName: string;
    actionAt: number;
    reason: string | null;
  }>;
}

export interface SmartGoalTrackerEntry {
  id: string;
  periodId: string;
  studentId: string;
  goalId: string;
  goalStrand: ConferenceGoalStrand;
  goalSnapshot: SmartGoal;
  entryDate: number;
  actionsTaken: string;
  progressMade: string;
  hinderingBehaviors: string;
  improvementPlan: string;
  mentorComment: string | null;
  commentedBy: string | null;
  commentedByName: string | null;
  commentedAt: number | null;
  createdAt: number;
  updatedAt: number;
}




