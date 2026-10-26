export interface StudentProgressIdentity {
  id: string;
  name: string;
  classId: string;
  className: string;
  grade: number;
}
export interface StudentProgressSubject { key: string; label: string; }
export interface StudentProgressActivity { id: string; name: string; category: string; categoryLabel: string; }
export interface StudentProgressResult {
  id: string;
  score: string;
  date: string;
  task: string;
  nextAction: string;
  teacherName: string;
  createdAt: number;
  correctedAt: number;
}
export interface StudentProgressLO {
  id: string;
  code: string;
  title: string;
  order: number;
  current: StudentProgressResult | null;
  history: StudentProgressResult[];
}
export interface StudentProgressSum {
  score: string;
  date: string;
  task: string;
  teacherName: string;
  updatedAt: number;
}
export interface StudentProgressGoal {
  id: string;
  code: string;
  text: string;
  los: StudentProgressLO[];
  summative: StudentProgressSum | null;
}
export interface StudentDailyEntryItem {
  id: string;
  type: 'FORMATIVE' | 'SUMMATIVE' | 'SHARED_TASK';
  date: string;
  isUA: boolean;
  subjectKey: string;
  subjectLabel: string;
  unitActivityName?: string;
  unitActivityCategory?: string;
  unitActivityCategoryLabel?: string;
  lgId: string;
  lgCode?: string;
  lgText?: string;
  loId?: string;
  loCode?: string;
  loTitle?: string;
  score?: string;
  task: string;
  nextAction?: string;
  teacherName?: string;
  createdAt?: number;
  correctedAt?: number;
  history?: StudentProgressResult[];
}
export interface StudentDailySection {
  key: string;
  title: string;
  isUA: boolean;
  category?: string;
  categoryLabel?: string;
  items: StudentDailyEntryItem[];
}
export interface StudentProgressPayload {
  version: 1;
  student: StudentProgressIdentity;
  academicYear: string;
  semester: string;
  availableYears: string[];
  availableDates: string[];
  latestDateWithRecords: string | null;
  selectedDate: string;
  subjects: StudentProgressSubject[];
  activities: StudentProgressActivity[];
  dailySections: StudentDailySection[];
  warnings: string[];
  feedbackPolicy: 'INTERNAL_NOTES_NOT_SHARED';
  selected?: { key: string; label: string; kind: 'SUBJECT' | 'UNIT_ACTIVITY' } | null;
  goals?: StudentProgressGoal[] | null;
}
