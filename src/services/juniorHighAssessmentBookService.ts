import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AssessmentBookOptions,
  DEFAULT_ASSESSMENT_BOOK_OPTIONS,
  JHAssessmentLO,
  JHFormativeEntry,
  JHSummativeEntry,
  LearningGoal,
  ReportConfig
} from '../types';
import { isSameJHSubject, getJHSubjectLegacyValue } from '../constants/juniorHighSubjectCatalog';

/**
 * Returns today's date formatted as YYYY-MM-DD in Western Indonesia Time (WIB, UTC+7).
 */
export function getTodayWIB(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wibDate = new Date(utc + 7 * 3600000);
  const year = wibDate.getFullYear();
  const month = String(wibDate.getMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string (YYYY-MM-DD) or timestamp into readable Indonesian date string.
 */
export function formatDateWIB(dateStrOrTs: string | number | undefined | null): string {
  if (!dateStrOrTs) return '-';
  if (typeof dateStrOrTs === 'number') {
    const d = new Date(dateStrOrTs);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    });
  }
  const parts = String(dateStrOrTs).split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return String(dateStrOrTs);
}

// ==========================================
// 1. ASSESSMENT BOOK OPTIONS (reportConfig)
// ==========================================

export async function getAssessmentBookOptions(): Promise<AssessmentBookOptions> {
  try {
    const docRef = doc(db, 'reportConfig', 'JUNIOR_HIGH');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data() as ReportConfig;
      if (data.assessmentBookOptions) {
        return {
          formativeTasks: Array.isArray(data.assessmentBookOptions.formativeTasks) && data.assessmentBookOptions.formativeTasks.length > 0
            ? data.assessmentBookOptions.formativeTasks
            : DEFAULT_ASSESSMENT_BOOK_OPTIONS.formativeTasks,
          nextActions: Array.isArray(data.assessmentBookOptions.nextActions) && data.assessmentBookOptions.nextActions.length > 0
            ? data.assessmentBookOptions.nextActions
            : DEFAULT_ASSESSMENT_BOOK_OPTIONS.nextActions,
          summativeTasks: Array.isArray(data.assessmentBookOptions.summativeTasks) && data.assessmentBookOptions.summativeTasks.length > 0
            ? data.assessmentBookOptions.summativeTasks
            : DEFAULT_ASSESSMENT_BOOK_OPTIONS.summativeTasks,
        };
      }
    }
  } catch (err) {
    console.error('Error fetching assessmentBookOptions:', err);
  }
  return DEFAULT_ASSESSMENT_BOOK_OPTIONS;
}

export async function saveAssessmentBookOptions(options: AssessmentBookOptions): Promise<void> {
  const docRef = doc(db, 'reportConfig', 'JUNIOR_HIGH');
  await setDoc(
    docRef,
    {
      assessmentBookOptions: {
        formativeTasks: options.formativeTasks.filter(Boolean),
        nextActions: options.nextActions.filter(Boolean),
        summativeTasks: options.summativeTasks.filter(Boolean),
      },
      updatedAt: Date.now()
    },
    { merge: true }
  );
}

// ==========================================
// 2. LEARNING GOALS (LGs) & APPROVAL
// ==========================================

export async function getJuniorHighLGs(grade?: string, subject?: string, academicYear?: string): Promise<LearningGoal[]> {
  try {
    let q = query(collection(db, 'learning_goals'), where('unitId', '==', 'JUNIOR_HIGH'));
    if (grade) {
      q = query(q, where('grade', '==', grade));
    }
    // Ganti where('subject', '==', subject) dengan pemfilteran normalisasi di sisi klien
    const snap = await getDocs(q);
    let goals = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Kompatibilitas data LG lama yang tidak memiliki status maupun reviewStatus
        status: data.status || 'PUBLISHED',
        reviewStatus: data.reviewStatus || 'SUDAH_SESUAI',
        isActive: data.isActive !== false
      } as LearningGoal;
    });

    if (subject) {
      goals = goals.filter(g => isSameJHSubject(g.subject, subject));
    }

    if (academicYear) {
      goals = goals.filter(g => !g.academicYear || g.academicYear === academicYear);
    }

    // Filter aktif dan tidak diarsipkan
    return goals.filter(g => g.isActive !== false && g.status !== 'ARCHIVED');
  } catch (err) {
    console.error('Error fetching Junior High LGs:', err);
    return [];
  }
}

export async function proposeNewLG(params: {
  code: string;
  grade: string;
  subject: string;
  strand: string;
  goalText: string;
  academicYear: string;
  teacherId: string;
  teacherName?: string;
  parentGoalId?: string;
  version?: number;
}): Promise<string> {
  const docRef = doc(collection(db, 'learning_goals'));
  const now = Date.now();
  const newLG: LearningGoal = {
    id: docRef.id,
    code: params.code,
    unitId: 'JUNIOR_HIGH',
    grade: params.grade,
    subject: getJHSubjectLegacyValue(params.subject),
    strand: params.strand || 'General',
    goalText: params.goalText,
    academicYear: params.academicYear,
    isActive: true,
    createdBy: params.teacherId,
    createdAt: now,
    updatedAt: now,
    version: params.version || 1,
    parentGoalId: params.parentGoalId,
    proposedFromAssessmentBook: true,
    status: 'DRAFT',
    reviewStatus: 'BELUM_DITELAAH'
  };
  await setDoc(docRef, newLG);
  return docRef.id;
}

export async function updateTeacherOwnLG(params: {
  goalId: string;
  code: string;
  goalText: string;
  strand: string;
}): Promise<void> {
  const docRef = doc(db, 'learning_goals', params.goalId);
  await updateDoc(docRef, {
    code: params.code,
    goalText: params.goalText,
    strand: params.strand,
    updatedAt: Date.now()
  });
}

export async function getPendingProposedLGs(): Promise<LearningGoal[]> {
  try {
    const q = query(
      collection(db, 'learning_goals'),
      where('proposedFromAssessmentBook', '==', true),
      where('status', '==', 'DRAFT')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningGoal));
  } catch (err) {
    console.error('Error fetching pending proposed LGs:', err);
    return [];
  }
}

export async function approveProposedLG(goalId: string): Promise<void> {
  const docRef = doc(db, 'learning_goals', goalId);
  await updateDoc(docRef, {
    status: 'PUBLISHED',
    reviewStatus: 'SUDAH_SESUAI',
    updatedAt: Date.now()
  });
}

export async function requestRevisionProposedLG(
  goalId: string,
  reviewStatus: 'REVISI_MINOR' | 'REVISI_MAYOR',
  notes: string
): Promise<void> {
  const docRef = doc(db, 'learning_goals', goalId);
  await updateDoc(docRef, {
    status: 'DRAFT',
    reviewStatus,
    notes,
    updatedAt: Date.now()
  });
}

// ==========================================
// 3. LEARNING OBJECTIVES (LOs)
// ==========================================

export async function getLOsForLG(params: {
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  lgId: string;
}): Promise<JHAssessmentLO[]> {
  try {
    const q = query(
      collection(db, 'jh_ab_los'),
      where('classId', '==', params.classId),
      where('academicYear', '==', params.academicYear),
      where('semester', '==', params.semester),
      where('lgId', '==', params.lgId)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as JHAssessmentLO));
    // Filter active items (soft delete check) and sort by order
    return items
      .filter(lo => lo.isActive !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (err) {
    console.error('Error fetching LOs for LG:', err);
    return [];
  }
}

export async function saveLO(params: {
  id?: string;
  lgId: string;
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  code: string;
  title: string;
  order: number;
  teacherId: string;
  teacherName?: string;
}): Promise<string> {
  const now = Date.now();
  if (params.id) {
    const docRef = doc(db, 'jh_ab_los', params.id);
    await updateDoc(docRef, {
      code: params.code,
      title: params.title,
      order: params.order,
      updatedAt: now
    });
    return params.id;
  } else {
    const docRef = doc(collection(db, 'jh_ab_los'));
    const newLO: JHAssessmentLO = {
      id: docRef.id,
      lgId: params.lgId,
      classId: params.classId,
      subjectId: params.subjectId,
      academicYear: params.academicYear,
      semester: params.semester,
      code: params.code,
      title: params.title,
      order: params.order,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      teacherId: params.teacherId,
      teacherName: params.teacherName || ''
    };
    await setDoc(docRef, newLO);
    return docRef.id;
  }
}

/**
 * Soft delete LO (isActive: false) so teachers can remove LO without violating rules.
 */
export async function softDeleteLO(loId: string): Promise<void> {
  const docRef = doc(db, 'jh_ab_los', loId);
  await updateDoc(docRef, {
    isActive: false,
    updatedAt: Date.now()
  });
}

/**
 * Permanent delete LO (admin only).
 */
export async function hardDeleteLO(loId: string): Promise<void> {
  await deleteDoc(doc(db, 'jh_ab_los', loId));
}

// ==========================================
// 4. FORMATIVE ENTRIES (jh_ab_formative_entries)
// ==========================================

export async function getFormativeEntries(params: {
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  lgId: string;
}): Promise<JHFormativeEntry[]> {
  try {
    const q = query(
      collection(db, 'jh_ab_formative_entries'),
      where('classId', '==', params.classId),
      where('academicYear', '==', params.academicYear),
      where('semester', '==', params.semester),
      where('lgId', '==', params.lgId)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as JHFormativeEntry));
    return items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (err) {
    console.error('Error fetching formative entries:', err);
    return [];
  }
}

export async function addFormativeEntry(entry: Omit<JHFormativeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const docRef = doc(collection(db, 'jh_ab_formative_entries'));
  const now = Date.now();
  const record: JHFormativeEntry = {
    ...entry,
    id: docRef.id,
    createdAt: now,
    updatedAt: now
  };
  await setDoc(docRef, record);
  return docRef.id;
}

/**
 * Correct an existing formative entry (Koreksi).
 * Strictly updates only the correction fields allowed by firestore.rules.
 */
export async function correctFormativeEntry(params: {
  entryId: string;
  comprehensionLevel: 'B' | 'D' | 'A';
  formativeTask?: string;
  nextAction?: string;
  notes?: string;
  date?: string;
  correctedBy: string;
  correctedByName?: string;
  correctionReason?: string;
}): Promise<void> {
  const docRef = doc(db, 'jh_ab_formative_entries', params.entryId);
  const now = Date.now();
  const updatePayload: any = {
    comprehensionLevel: params.comprehensionLevel,
    updatedAt: now,
    correctedAt: now,
    correctedBy: params.correctedBy
  };
  if (params.formativeTask !== undefined) updatePayload.formativeTask = params.formativeTask;
  if (params.nextAction !== undefined) updatePayload.nextAction = params.nextAction;
  if (params.notes !== undefined) updatePayload.notes = params.notes;
  if (params.date !== undefined) updatePayload.date = params.date;
  if (params.correctedByName) updatePayload.correctedByName = params.correctedByName;
  if (params.correctionReason) updatePayload.correctionReason = params.correctionReason;

  await updateDoc(docRef, updatePayload);
}

/**
 * Permanent delete of a formative entry (Admin only).
 */
export async function hardDeleteFormativeEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'jh_ab_formative_entries', entryId));
}

/**
 * Bulk insert formative assessments for multiple students using writeBatch.
 */
export async function bulkAddFormativeEntries(entries: Omit<JHFormativeEntry, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<void> {
  if (entries.length === 0) return;
  const batch = writeBatch(db);
  const now = Date.now();

  for (const entry of entries) {
    const docRef = doc(collection(db, 'jh_ab_formative_entries'));
    const payload: JHFormativeEntry = {
      ...entry,
      id: docRef.id,
      createdAt: now,
      updatedAt: now
    };
    batch.set(docRef, payload);
  }

  await batch.commit();
}

// ==========================================
// 5. SUMMATIVE ENTRIES (jh_ab_summative_entries)
// ==========================================

export async function getSummativeEntries(params: {
  classId: string;
  subjectId: string;
  academicYear: string;
  semester: string;
  lgId: string;
}): Promise<JHSummativeEntry[]> {
  try {
    const q = query(
      collection(db, 'jh_ab_summative_entries'),
      where('classId', '==', params.classId),
      where('academicYear', '==', params.academicYear),
      where('semester', '==', params.semester),
      where('lgId', '==', params.lgId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as JHSummativeEntry));
  } catch (err) {
    console.error('Error fetching summative entries:', err);
    return [];
  }
}

export function normalizeAcademicYear(ay: string): string {
  return String(ay || '').replace(/\//g, '_').trim();
}

export function buildSummativeEntryId(params: {
  studentId: string;
  classId: string;
  subjectId: string;
  lgId: string;
  academicYear: string;
  semester: string;
}): string {
  const normYear = normalizeAcademicYear(params.academicYear);
  return `${params.studentId}_${params.classId}_${params.subjectId}_${params.lgId}_${normYear}_${params.semester}`;
}

export async function saveSummativeEntry(entry: Omit<JHSummativeEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
  const now = Date.now();
  const docId = buildSummativeEntryId({
    studentId: entry.studentId,
    classId: entry.classId,
    subjectId: entry.subjectId,
    lgId: entry.lgId,
    academicYear: entry.academicYear,
    semester: entry.semester
  });
  const docRef = doc(db, 'jh_ab_summative_entries', docId);
  const snap = await getDoc(docRef);

  if (snap.exists()) {
    // Edit existing entry: do not overwrite teacherId, teacherName, or createdAt
    await updateDoc(docRef, {
      summativeTask: entry.summativeTask,
      summativeScore: entry.summativeScore,
      notes: entry.notes ?? '',
      date: entry.date,
      updatedAt: now,
      updatedBy: entry.updatedBy || entry.teacherId,
      updatedByName: entry.updatedByName || entry.teacherName
    });
  } else {
    // New entry: populate teacherId, teacherName, createdAt, updatedAt, updatedBy, updatedByName
    const payload: JHSummativeEntry = {
      ...entry,
      id: docId,
      notes: entry.notes ?? '',
      createdAt: now,
      updatedAt: now,
      updatedBy: entry.updatedBy || entry.teacherId,
      updatedByName: entry.updatedByName || entry.teacherName
    };
    await setDoc(docRef, payload);
  }
  return docId;
}

export async function hardDeleteSummativeEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, 'jh_ab_summative_entries', entryId));
}
