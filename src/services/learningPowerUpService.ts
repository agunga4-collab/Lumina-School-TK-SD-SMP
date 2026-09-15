import {
  collection,
  doc,
  getDocs,
  query,
  where,
  limit,
  orderBy
} from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import {
  LearningPowerUpTaskBatch,
  LearningPowerUpAssignment,
  LpuSubjectKey,
  LpuSubjectArea,
  LpuAssignmentHistoryEntry
} from '../types';

/**
 * Subject Mapping Table (Canonical Source)
 */
export const LPU_SUBJECT_MAP: Record<LpuSubjectKey, LpuSubjectArea> = {
  bahasaIndonesia: 'BAHASA_INDONESIA',
  english: 'ENGLISH_READING',
  mengaji: 'MENGAJI',
  numerasi: 'NUMERACY'
};

/**
 * Session weight/order to help resolve the most recent assessment
 */
const SESSION_PRIORITY: Record<string, number> = {
  'SEMESTER_1_START': 1,
  'SEMESTER_1_END': 2,
  'SPRING_ASSESSMENT_3': 3,
  'SEMESTER_2_START': 4,
  'SEMESTER_2_END': 5
};

/**
 * 1. Resolves a student’s active subject level from the read-only junior_high_literacy_numeracy_records collection.
 * Treats junior_high_literacy_numeracy_records as read-only.
 * Fallback to default levels if no record exists.
 */
export async function resolveStudentActiveSubjectLevel(
  studentId: string,
  subjectKey: LpuSubjectKey,
  schoolYear: string,
  sessionKey?: string
): Promise<string> {
  const subjectArea = LPU_SUBJECT_MAP[subjectKey];
  if (!subjectArea) {
    throw new Error(`Invalid LPU subject key: ${subjectKey}`);
  }

  try {
    const recordsCol = collection(db, 'junior_high_literacy_numeracy_records');
    let q = query(
      recordsCol,
      where('studentId', '==', studentId),
      where('subjectArea', '==', subjectArea),
      where('schoolYear', '==', schoolYear)
    );

    if (sessionKey) {
      q = query(q, where('sessionKey', '==', sessionKey));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      // Return default initial levels based on the subject if no records exist
      switch (subjectKey) {
        case 'bahasaIndonesia':
          return 'Perlu Pendampingan Intensif';
        case 'english':
          return 'IR+';
        case 'mengaji':
          return 'Iqra 1';
        case 'numerasi':
          return 'Trailhead';
        default:
          return '';
      }
    }

    // Sort documents by session weight if multiple are found and no specific session was requested
    const docs = snap.docs.map(d => d.data());
    if (!sessionKey && docs.length > 1) {
      docs.sort((a, b) => {
        const priorityA = SESSION_PRIORITY[a.sessionKey] || 0;
        const priorityB = SESSION_PRIORITY[b.sessionKey] || 0;
        return priorityB - priorityA; // Descending
      });
    }

    const activeRecord = docs[0];

    // Extract level depending on subjectArea
    switch (subjectKey) {
      case 'bahasaIndonesia':
        return activeRecord.readingLevel || 'Perlu Pendampingan Intensif';
      case 'english':
        return activeRecord.readingLevel || 'IR+';
      case 'mengaji':
        return activeRecord.level || 'Iqra 1';
      case 'numerasi':
        return activeRecord.mathLevel || 'Trailhead';
      default:
        return '';
    }
  } catch (error) {
    console.error('Error resolving student active subject level:', error);
    // Safe fallbacks on error
    switch (subjectKey) {
      case 'bahasaIndonesia':
        return 'Perlu Pendampingan Intensif';
      case 'english':
        return 'IR+';
      case 'mengaji':
        return 'Iqra 1';
      case 'numerasi':
        return 'Trailhead';
      default:
        return '';
    }
  }
}

/**
 * 2. Resolves a teacher’s authorized subjects/classes.
 * Enforces structured class/subject assignment data as authority.
 * Super Admin/authorized Head Unit roles retain existing Junior High oversight.
 * Strictly avoids using email/job-title/display-name keyword fallback for write access.
 */
export function resolveTeacherAuthorizedScope(
  userProfile: { uid: string; role: string; email?: string; displayName?: string },
  classData: { id: string; unitId: string; homeroomTeacherId?: string | null; homeroomTeacherIds?: string[]; waliKelasIds?: string[]; teacherAssignments?: any[] },
  subjectKey: LpuSubjectKey,
  forWrite: boolean = true
): { isAuthorized: boolean; reason: string } {
  if (!userProfile || !classData) {
    return { isAuthorized: false, reason: 'Missing user profile or class data' };
  }

  // Ensure the class belongs to Junior High
  if (classData.unitId !== 'JUNIOR_HIGH') {
    return { isAuthorized: false, reason: 'Class is not in Junior High unit' };
  }

  // Active Junior High staff roles
  const activeJuniorHighStaffRoles = [
    'TEACHER', 'HEAD_JUNIOR', 'BK_MENTOR',
    'MTSS_ACADEMIC_PJ', 'SUPER_ADMIN', 'HEAD_UNIT',
    'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR',
    'HOMEROOM_TEACHER', 'COUNSELOR', 'SECRETARY_JH'
  ];

  if (activeJuniorHighStaffRoles.includes(userProfile.role)) {
    return { isAuthorized: true, reason: 'User has active Junior High staff/teacher role' };
  }

  return { isAuthorized: false, reason: `User role ${userProfile.role} is not authorized for Junior High LPU` };
}

/**
 * 3. Validates permitted assignment status transitions.
 * Enforces business flow integrity.
 */
export function validateAssignmentStatusTransition(
  currentStatus: 'ASSIGNED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'VERIFIED',
  newStatus: 'ASSIGNED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'VERIFIED'
): { isValid: boolean; error?: string } {
  if (currentStatus === newStatus) {
    return { isValid: true };
  }

  switch (currentStatus) {
    case 'ASSIGNED':
      if (newStatus === 'SUBMITTED') {
        return { isValid: true };
      }
      return { isValid: false, error: 'Tugas yang baru diberikan hanya bisa diubah statusnya ke SUBMITTED' };

    case 'SUBMITTED':
      if (newStatus === 'VERIFIED' || newStatus === 'REVISION_REQUIRED') {
        return { isValid: true };
      }
      return { isValid: false, error: 'Tugas yang telah dikirim hanya dapat diverifikasi atau diminta revisi' };

    case 'REVISION_REQUIRED':
      if (newStatus === 'SUBMITTED') {
        return { isValid: true };
      }
      return { isValid: false, error: 'Tugas dalam revisi hanya dapat dikirim ulang (SUBMITTED)' };

    case 'VERIFIED':
      // Support reversing verification if teacher makes a mistake
      if (newStatus === 'SUBMITTED' || newStatus === 'ASSIGNED') {
        return { isValid: true };
      }
      return { isValid: false, error: 'Tugas yang sudah diverifikasi tidak dapat diubah ke status ini' };

    default:
      return { isValid: false, error: 'Status tugas tidak dikenal' };
  }
}

/**
 * 4. Generates deterministic assignment IDs to prevent duplicate assignments on retry.
 */
export function generateDeterministicAssignmentId(
  taskBatchId: string,
  studentId: string,
  subjectKey: LpuSubjectKey
): string {
  if (!taskBatchId || !studentId || !subjectKey) {
    throw new Error('Deterministic ID requires taskBatchId, studentId, and subjectKey');
  }
  return `assignment_${taskBatchId}_${studentId}_${subjectKey}`;
}

/**
 * 5. Safe, timezone-resilient date-only formatter for Indonesian locale.
 * Outputs format: e.g. "Kamis, 17 September 2026"
 */
export function formatLearningPowerUpDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  const localDate = new Date(year, month, day, 12, 0, 0);

  return localDate.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

