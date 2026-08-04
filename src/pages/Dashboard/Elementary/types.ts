export interface ElementaryClass {
  id: string;
  name: string;
  homeroomTeacherName?: string;
  gradeLevel?: number;
  unitId?: string;
  status?: string;
}

export interface ElementaryStudent {
  id: string;
  name: string;
  classId: string;
  className?: string;
  academicYear?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName?: string;
  classId: string;
  date: string;
  status: string;
  semester?: number | string;
  academicYear?: string;
}

export interface LatenessRecord {
  id: string;
  studentId: string;
  studentName?: string;
  classId: string;
  date: string;
  arrivalTime: string;
  reason?: string;
  academicYear?: string;
}

export interface LiteracyNumeracyRecord {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  area: 'BAHASA_INDONESIA' | 'ENGLISH_READING' | 'MENGAJI' | 'NUMERACY';
  supportStatus: 'ON_TRACK' | 'MONITOR' | 'NEEDS_SUPPORT' | 'INTERVENTION_RECOMMENDED';
  period: 'JUL_OCT' | 'NOV_FEB' | 'MAR_JUN';
  schoolYear: string;
  updatedAt: number;
}

export interface MTSSCase {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  subject: string;
  tier: 'Tier 2' | 'Tier 3' | 'SN';
  status: 'Active' | 'Achieved';
  createdAt: number;
  updatedAt: number;
}

export interface LDSSAssessment {
  id: string;
  studentId: string;
  studentName: string;
  classId?: string;
  classNameSnapshot?: string;
  periodKey?: 'LDSS_1' | 'LDSS_2' | 'LDSS_3';
  status?: 'DRAFT' | 'COMPLETED' | 'IN_PROGRESS';
  createdAt: number;
  updatedAt: number;
}
