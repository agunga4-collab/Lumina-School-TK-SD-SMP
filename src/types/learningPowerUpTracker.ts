export type LpuTrackerSubject = 'bahasaIndonesia' | 'english' | 'mengaji' | 'numerasi';
export type LpuTrackerSemester = '1' | '2';
export type LpuTrackerValue = string | number;
export interface LpuTrackerActor {
  uid: string; role: string; status: string;
  unitId?: string; unit?: string; displayName?: string; email?: string;
  luminaId?: string; studentId?: string;
}
export interface LpuTrackerStudent {
  id: string; name: string; nis: string; classId: string; className: string; grade: number;
}
export interface LpuTrackerColumn {
  id: string; unit: 'JUNIOR_HIGH'; academicYear: string; semester: LpuTrackerSemester;
  subjectKey: LpuTrackerSubject; label: string; periodLabel: string; order: number;
  valueType: 'FREE' | 'NUMBER'; studentIds: string[]; archived: boolean;
  createdBy: string; createdAt: number; updatedBy: string; updatedAt: number; version: number;
}
export interface LpuTrackerCell {
  id: string; unit: 'JUNIOR_HIGH'; academicYear: string; semester: LpuTrackerSemester;
  subjectKey: LpuTrackerSubject; columnId: string; studentId: string; studentName: string;
  classId: string; className: string; label: string; periodLabel: string; order: number;
  valueType: 'FREE' | 'NUMBER'; visible: boolean; value: LpuTrackerValue;
  valueVersion: number; valueUpdatedAt: number; valueUpdatedBy: string;
  updatedBy: string; updatedAt: number;
}
export interface LpuTrackerCoach { uid: string; name: string; email: string; }
export interface LpuTrackerCoachAssignment {
  id: string; unit: 'JUNIOR_HIGH'; academicYear: string; semester: LpuTrackerSemester;
  studentId: string; classId: string; coachId: string; coachName: string;
  updatedBy: string; updatedAt: number;
}
export interface LpuTrackerLevel {
  recordId: string; studentId: string; subjectKey: LpuTrackerSubject; label: string; sessionKey: string;
  sourceLabel?: string; sourceType?: 'LEGACY' | 'SESSION' | 'CUSTOM_COLUMN';
  issue?: string;
}
export interface LpuTrackerLegacyRow {
  id: string; subjectKey: string; date: string; title: string; instructions: string;
  status: string; studentId: string; studentName: string; className: string;
}
