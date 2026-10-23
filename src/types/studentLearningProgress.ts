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
export interface StudentProgressPayload {
  version: 1;
  student: StudentProgressIdentity;
  academicYear: string;
  semester: string;
  availableYears: string[];
  subjects: StudentProgressSubject[];
  activities: StudentProgressActivity[];
  warnings: string[];
  feedbackPolicy: 'INTERNAL_NOTES_NOT_SHARED';
  selected: { key: string; label: string; kind: 'SUBJECT' | 'UNIT_ACTIVITY' } | null;
  goals: StudentProgressGoal[] | null;
}
