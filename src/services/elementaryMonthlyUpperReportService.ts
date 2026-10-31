import { db, handleFirestoreError } from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import type { 
  ElementaryUpperCurriculumDoc,
  ElementaryUpperStudentDataDoc,
  ElementaryUpperLitNumRecordDoc,
  ElementaryUpperLitNumClassConfigDoc,
  ElementaryUpperStudentNarrativesDoc,
  UpperLGStatusMode,
  UpperLitNumSubjectField,
  UpperReviewStatus,
  ElementaryUpperSubject,
  ElementaryUpperProject,
  ElementaryUpperAttendanceConfig,
  ElementaryUpperAttendanceSummary,
  ElementaryUpperReportSignatory,
  ElementaryUpperMonthlyProgressSnapshot,
  ElementaryUpperLiteracyNumeracySnapshot,
  PublishedElementaryUpperReportDoc,
  ElementaryUpperReportKind,
  UpperLGAverageResult
} from '../types/elementaryMonthlyUpperReport';
import { 
  UPPER_LITNUM_FIELDS,
  calculateUpperLGAverageAndPredicate,
  normalizeUpperReportFilename
} from '../types/elementaryMonthlyUpperReport';
import type { User, Student, Class } from '../types';

export function normalizeAcademicYear(academicYear: string): string {
  return academicYear ? academicYear.replace(/\//g, '_') : '2025_2026';
}

export function buildUpperCurriculumDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildUpperStudentDataDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildUpperLitNumRecordDocId(
  studentId: string,
  classId: string,
  academicYear: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}`;
}

export function buildUpperLitNumClassConfigDocId(
  classId: string,
  academicYear: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}`;
}

export function buildUpperNarrativesDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_M${month}`;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatMonthLabel(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, mStr] = monthStr.split('-');
  const mIndex = parseInt(mStr, 10) - 1;
  if (mIndex >= 0 && mIndex < 12) {
    return `${MONTH_NAMES_ID[mIndex]} ${yearStr}`;
  }
  return monthStr;
}

export function getMonthOptionsForAcademicYear(
  academicYear: string,
  semester: string
): Array<{ value: string; label: string }> {
  let startYear = 2025;
  if (academicYear && academicYear.includes('/')) {
    const parts = academicYear.split('/');
    const parsed = parseInt(parts[0], 10);
    if (!isNaN(parsed)) startYear = parsed;
  }
  const endYear = startYear + 1;

  if (semester === '1') {
    return [
      { value: `${startYear}-07`, label: `Juli ${startYear}` },
      { value: `${startYear}-08`, label: `Agustus ${startYear}` },
      { value: `${startYear}-09`, label: `September ${startYear}` },
      { value: `${startYear}-10`, label: `Oktober ${startYear}` },
      { value: `${startYear}-11`, label: `November ${startYear}` },
      { value: `${startYear}-12`, label: `Desember ${startYear}` },
    ];
  } else {
    return [
      { value: `${endYear}-01`, label: `Januari ${endYear}` },
      { value: `${endYear}-02`, label: `Februari ${endYear}` },
      { value: `${endYear}-03`, label: `Maret ${endYear}` },
      { value: `${endYear}-04`, label: `April ${endYear}` },
      { value: `${endYear}-05`, label: `Mei ${endYear}` },
      { value: `${endYear}-06`, label: `Juni ${endYear}` },
    ];
  }
}

export function isElementaryUpperHeadOrSuperAdmin(user?: User | null): boolean {
  if (!user) return false;
  const role = (user.role || (user as any).roleId || '').toUpperCase();
  const unit = (user.unitId || (user as any).unit || '').toUpperCase();
  if (['SUPER_ADMIN'].includes(role)) return true;
  if (['HEAD_UNIT', 'PRINCIPAL', 'VICE_PRINCIPAL'].includes(role)) {
    return unit === 'ELEMENTARY' || unit === 'ALL' || !unit;
  }
  return false;
}

// ==========================================
// A. CURRICULUM & SUBJECT/PROJECT SERVICE
// ==========================================

export async function fetchUpperCurriculum(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<ElementaryUpperCurriculumDoc | null> {
  if (!classId || !academicYear || !semester || !month) return null;
  const docId = buildUpperCurriculumDocId(classId, academicYear, semester, month);
  try {
    const snap = await getDoc(doc(db, 'elem_monthly_upper_curricula', docId));
    if (snap.exists()) {
      return snap.data() as ElementaryUpperCurriculumDoc;
    }
    return null;
  } catch (err) {
    console.error('Error fetching upper curriculum:', err);
    throw err;
  }
}

export async function saveUpperCurriculum(
  curriculumDoc: ElementaryUpperCurriculumDoc,
  currentUser: User
): Promise<void> {
  const now = Date.now();
  const toSave: ElementaryUpperCurriculumDoc = {
    ...curriculumDoc,
    updatedAt: now,
    updatedBy: currentUser.uid || (currentUser as any).id || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };
  try {
    await setDoc(doc(db, 'elem_monthly_upper_curricula', curriculumDoc.id), toSave, { merge: true });
  } catch (err) {
    console.error('Error saving upper curriculum:', err);
    throw err;
  }
}

/**
 * Copies curriculum structure (subjects, LGs, LOs, projects) to another class
 * strictly WITHOUT copying any student scores.
 */
export async function copyUpperCurriculumToClass(
  sourceDoc: ElementaryUpperCurriculumDoc,
  targetClassId: string,
  targetClassName: string,
  targetGradeLevel: number,
  currentUser: User
): Promise<void> {
  const targetDocId = buildUpperCurriculumDocId(
    targetClassId,
    sourceDoc.academicYear,
    sourceDoc.semester,
    sourceDoc.month
  );

  const now = Date.now();
  const newDoc: ElementaryUpperCurriculumDoc = {
    id: targetDocId,
    classId: targetClassId,
    className: targetClassName,
    gradeLevel: targetGradeLevel,
    academicYear: sourceDoc.academicYear,
    semester: sourceDoc.semester,
    month: sourceDoc.month,
    subjects: JSON.parse(JSON.stringify(sourceDoc.subjects || [])),
    projects: JSON.parse(JSON.stringify(sourceDoc.projects || [])),
    createdAt: now,
    createdBy: currentUser.uid || (currentUser as any).id || 'system',
    createdByName: currentUser.displayName || currentUser.name || 'Guru',
    updatedAt: now,
    updatedBy: currentUser.uid || (currentUser as any).id || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };

  await setDoc(doc(db, 'elem_monthly_upper_curricula', targetDocId), newDoc);
}

// ==========================================
// A. STUDENT DATA (SCORES & IP STATUS) SERVICE
// ==========================================

export async function fetchUpperStudentDataMap(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, ElementaryUpperStudentDataDoc>> {
  if (!classId || !academicYear || !semester || !month) return {};
  try {
    const q = query(
      collection(db, 'elem_monthly_upper_student_data'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const result: Record<string, ElementaryUpperStudentDataDoc> = {};
    snap.forEach(d => {
      const data = d.data() as ElementaryUpperStudentDataDoc;
      result[data.studentId] = data;
    });
    return result;
  } catch (err) {
    console.error('Error fetching upper student data map:', err);
    throw err;
  }
}

export async function saveUpperStudentScore(
  params: {
    studentId: string;
    studentName: string;
    classId: string;
    academicYear: string;
    semester: string;
    month: string;
    loId: string;
    score: number | null; // null to delete/clear score
    isProject?: boolean;
  },
  currentUser: User
): Promise<void> {
  const { studentId, studentName, classId, academicYear, semester, month, loId, score, isProject } = params;
  const docId = buildUpperStudentDataDocId(studentId, classId, academicYear, semester, month);
  const ref = doc(db, 'elem_monthly_upper_student_data', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as ElementaryUpperStudentDataDoc) : null;

  const scores = { ...(existing?.scores || {}) };
  const projectScores = { ...(existing?.projectScores || {}) };

  if (isProject) {
    if (score === null || isNaN(score)) {
      delete projectScores[loId];
    } else {
      projectScores[loId] = Math.max(0, Math.min(100, score));
    }
  } else {
    if (score === null || isNaN(score)) {
      delete scores[loId];
    } else {
      scores[loId] = Math.max(0, Math.min(100, score));
    }
  }

  const data: ElementaryUpperStudentDataDoc = {
    id: docId,
    studentId,
    studentName,
    classId,
    academicYear,
    semester,
    month,
    scores,
    lgStatus: existing?.lgStatus || {},
    projectScores,
    projectLgStatus: existing?.projectLgStatus || {},
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || currentUser.uid || 'system',
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };

  await setDoc(ref, data, { merge: true });
}

export async function setUpperStudentLgStatus(
  params: {
    studentId: string;
    studentName: string;
    classId: string;
    academicYear: string;
    semester: string;
    month: string;
    lgId: string;
    statusMode: UpperLGStatusMode;
    isProject?: boolean;
  },
  currentUser: User
): Promise<void> {
  const { studentId, studentName, classId, academicYear, semester, month, lgId, statusMode, isProject } = params;
  const docId = buildUpperStudentDataDocId(studentId, classId, academicYear, semester, month);
  const ref = doc(db, 'elem_monthly_upper_student_data', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as ElementaryUpperStudentDataDoc) : null;

  const lgStatus = { ...(existing?.lgStatus || {}) };
  const projectLgStatus = { ...(existing?.projectLgStatus || {}) };

  if (isProject) {
    lgStatus[lgId] = statusMode;
  } else {
    lgStatus[lgId] = statusMode;
  }

  const data: ElementaryUpperStudentDataDoc = {
    id: docId,
    studentId,
    studentName,
    classId,
    academicYear,
    semester,
    month,
    scores: existing?.scores || {},
    lgStatus,
    projectScores: existing?.projectScores || {},
    projectLgStatus,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || currentUser.uid || 'system',
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };

  await setDoc(ref, data, { merge: true });
}

export async function batchSetUpperLgStatus(
  params: {
    classId: string;
    academicYear: string;
    semester: string;
    month: string;
    lgId: string;
    statusMode: UpperLGStatusMode;
    students: Student[];
    isProject?: boolean;
  },
  currentUser: User
): Promise<void> {
  const { classId, academicYear, semester, month, lgId, statusMode, students, isProject } = params;
  const batch = writeBatch(db);
  const now = Date.now();

  for (const st of students) {
    const docId = buildUpperStudentDataDocId(st.id, classId, academicYear, semester, month);
    const ref = doc(db, 'elem_monthly_upper_student_data', docId);
    
    // Set status mode directly inside merge
    const updatePayload: Record<string, any> = {
      id: docId,
      studentId: st.id,
      studentName: st.name,
      classId,
      academicYear,
      semester,
      month,
      updatedAt: now,
      updatedBy: currentUser.uid || 'system',
      updatedByName: currentUser.displayName || currentUser.name || 'Guru'
    };

    if (isProject) {
      updatePayload[`projectLgStatus.${lgId}`] = statusMode;
    } else {
      updatePayload[`lgStatus.${lgId}`] = statusMode;
    }

    batch.set(ref, updatePayload, { merge: true });
  }

  await batch.commit();
}

// ==========================================
// B. LITERASI & NUMERASI SERVICE
// ==========================================

export async function fetchUpperLitNumClassConfig(
  classId: string,
  academicYear: string
): Promise<ElementaryUpperLitNumClassConfigDoc | null> {
  if (!classId || !academicYear) return null;
  const docId = buildUpperLitNumClassConfigDocId(classId, academicYear);
  try {
    const snap = await getDoc(doc(db, 'elem_monthly_upper_litnum_class_configs', docId));
    if (snap.exists()) {
      return snap.data() as ElementaryUpperLitNumClassConfigDoc;
    }
    // Return sensible defaults if not created yet
    return {
      id: docId,
      classId,
      academicYear,
      standards: {
        bahasa_indonesia: 70,
        english: 55,
        mathematics: 70
      },
      comparisonPeriods: [
        { periodKey: '2025-08', label: 'Agustus', order: 0 },
        { periodKey: '2025-09', label: 'September', order: 1 },
        { periodKey: 'midterm-1', label: 'Midterm 1', order: 2 }
      ],
      updatedAt: Date.now(),
      updatedBy: 'system'
    };
  } catch (err) {
    console.error('Error fetching upper litnum class config:', err);
    throw err;
  }
}

export async function saveUpperLitNumClassConfig(
  config: ElementaryUpperLitNumClassConfigDoc,
  currentUser: User
): Promise<void> {
  const now = Date.now();
  const toSave: ElementaryUpperLitNumClassConfigDoc = {
    ...config,
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };
  await setDoc(doc(db, 'elem_monthly_upper_litnum_class_configs', config.id), toSave, { merge: true });
}

export async function fetchUpperLitNumRecordsMap(
  classId: string,
  academicYear: string
): Promise<Record<string, ElementaryUpperLitNumRecordDoc>> {
  if (!classId || !academicYear) return {};
  try {
    const q = query(
      collection(db, 'elem_monthly_upper_litnum_records'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear)
    );
    const snap = await getDocs(q);
    const result: Record<string, ElementaryUpperLitNumRecordDoc> = {};
    snap.forEach(d => {
      const data = d.data() as ElementaryUpperLitNumRecordDoc;
      result[data.studentId] = data;
    });
    return result;
  } catch (err) {
    console.error('Error fetching upper litnum records map:', err);
    throw err;
  }
}

export async function saveUpperStudentLitNumScore(
  params: {
    studentId: string;
    studentName: string;
    classId: string;
    academicYear: string;
    field: UpperLitNumSubjectField;
    periodKey: string;
    score: number | null;
    minimumStandard: number;
    sourceDescription?: string;
  },
  currentUser: User
): Promise<void> {
  const { studentId, studentName, classId, academicYear, field, periodKey, score, minimumStandard, sourceDescription } = params;
  const docId = buildUpperLitNumRecordDocId(studentId, classId, academicYear);
  const ref = doc(db, 'elem_monthly_upper_litnum_records', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as ElementaryUpperLitNumRecordDoc) : null;

  const periodScores = existing?.periodScores || {
    bahasa_indonesia: {},
    english: {},
    mathematics: {}
  };

  if (!periodScores[field]) {
    periodScores[field] = {};
  }

  if (score === null || isNaN(score)) {
    delete periodScores[field][periodKey];
  } else {
    periodScores[field][periodKey] = {
      score: Math.max(0, Math.min(100, score)),
      minimumStandard,
      sourceDescription: sourceDescription || 'Asesmen Bulanan',
      assessedAt: new Date().toISOString()
    };
  }

  const data: ElementaryUpperLitNumRecordDoc = {
    id: docId,
    studentId,
    studentName,
    classId,
    academicYear,
    periodScores,
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };

  await setDoc(ref, data, { merge: true });
}

// ==========================================
// C. NARRATIVES & DUAL APPROVAL SERVICE
// ==========================================

export function computeUpperMonthlyScoresHash(studentData?: ElementaryUpperStudentDataDoc | null): string {
  if (!studentData) return 'empty_scores';
  const scoresObj = studentData.scores || {};
  const statusObj = studentData.lgStatus || {};
  const projScores = studentData.projectScores || {};
  const projStatus = studentData.projectLgStatus || {};

  const keys = Object.keys(scoresObj).sort();
  const summary = keys.map(k => `${k}:${scoresObj[k]}`).join('|');
  const statusSummary = Object.keys(statusObj).sort().map(k => `${k}:${statusObj[k]}`).join('|');
  const projSummary = Object.keys(projScores).sort().map(k => `${k}:${projScores[k]}`).join('|');
  const projStatusSummary = Object.keys(projStatus).sort().map(k => `${k}:${projStatus[k]}`).join('|');

  const combined = `${summary}##${statusSummary}##${projSummary}##${projStatusSummary}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${hash}`;
}

export function computeUpperLitNumHash(litNumDoc?: ElementaryUpperLitNumRecordDoc | null): string {
  if (!litNumDoc || !litNumDoc.periodScores) return 'empty_litnum';
  const fields: UpperLitNumSubjectField[] = ['bahasa_indonesia', 'english', 'mathematics'];
  const parts: string[] = [];

  for (const f of fields) {
    const pScores = litNumDoc.periodScores[f] || {};
    const pKeys = Object.keys(pScores).sort();
    for (const pk of pKeys) {
      parts.push(`${f}:${pk}:${pScores[pk]?.score}:${pScores[pk]?.minimumStandard}`);
    }
  }

  const combined = parts.join('|');
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${hash}`;
}

export async function fetchUpperStudentNarrativesMap(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, ElementaryUpperStudentNarrativesDoc>> {
  if (!classId || !academicYear || !semester || !month) return {};
  try {
    const q = query(
      collection(db, 'elem_monthly_upper_narratives'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const result: Record<string, ElementaryUpperStudentNarrativesDoc> = {};
    snap.forEach(d => {
      const data = d.data() as ElementaryUpperStudentNarrativesDoc;
      result[data.studentId] = data;
    });
    return result;
  } catch (err) {
    console.error('Error fetching upper student narratives map:', err);
    throw err;
  }
}

export async function saveUpperStudentNarratives(
  docToSave: ElementaryUpperStudentNarrativesDoc,
  currentUser: User
): Promise<void> {
  const now = Date.now();
  const toSave: ElementaryUpperStudentNarrativesDoc = {
    ...docToSave,
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };
  await setDoc(doc(db, 'elem_monthly_upper_narratives', docToSave.id), toSave, { merge: true });
}

/**
 * Submits an approval package ('MONTHLY_PROGRESS' or 'LITERACY_NUMERACY')
 */
export async function submitUpperReviewPackage(
  params: {
    studentId: string;
    studentName: string;
    classId: string;
    academicYear: string;
    semester: string;
    month: string;
    packageType: 'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY';
    currentScoresHash: string;
  },
  currentUser: User
): Promise<void> {
  const { studentId, studentName, classId, academicYear, semester, month, packageType, currentScoresHash } = params;
  const docId = buildUpperNarrativesDocId(studentId, classId, academicYear, semester, month);
  const ref = doc(db, 'elem_monthly_upper_narratives', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as ElementaryUpperStudentNarrativesDoc) : null;

  const pkgUpdate = {
    reviewStatus: 'SUBMITTED' as UpperReviewStatus,
    submittedAt: now,
    submittedBy: currentUser.uid || 'system',
    submittedByName: currentUser.displayName || currentUser.name || 'Guru',
    sourceHash: currentScoresHash,
    isSourceStale: false
  };

  const updateData: Partial<ElementaryUpperStudentNarrativesDoc> = {
    id: docId,
    studentId,
    studentName,
    classId,
    academicYear,
    semester,
    month,
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Guru'
  };

  if (packageType === 'MONTHLY_PROGRESS') {
    updateData.monthlyProgressReview = {
      ...(existing?.monthlyProgressReview || { reviewStatus: 'DRAFT' }),
      ...pkgUpdate
    };
  } else {
    updateData.litNumReview = {
      ...(existing?.litNumReview || { reviewStatus: 'DRAFT' }),
      ...pkgUpdate
    };
  }

  await setDoc(ref, updateData, { merge: true });
}

/**
 * Approves or requests revision on an approval package
 */
export async function reviewUpperApprovalPackage(
  params: {
    studentId: string;
    classId: string;
    academicYear: string;
    semester: string;
    month: string;
    packageType: 'MONTHLY_PROGRESS' | 'LITERACY_NUMERACY';
    decision: 'APPROVED' | 'NEEDS_REVISION';
    notes?: string;
  },
  currentUser: User
): Promise<void> {
  if (!isElementaryUpperHeadOrSuperAdmin(currentUser)) {
    throw new Error('Hanya Kepala Unit Elementary atau Super Admin yang berwenang memberikan review.');
  }

  const { studentId, classId, academicYear, semester, month, packageType, decision, notes } = params;
  if (decision === 'NEEDS_REVISION' && (!notes || !notes.trim())) {
    throw new Error('Catatan revisi wajib diisi jika meminta perbaikan.');
  }

  const docId = buildUpperNarrativesDocId(studentId, classId, academicYear, semester, month);
  const ref = doc(db, 'elem_monthly_upper_narratives', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Dokumen narasi siswa tidak ditemukan.');
  }
  const existing = snap.data() as ElementaryUpperStudentNarrativesDoc;

  const reviewPayload = {
    reviewStatus: decision,
    reviewNotes: notes?.trim() || '',
    reviewedAt: now,
    reviewedBy: currentUser.uid || 'system',
    reviewedByName: currentUser.displayName || currentUser.name || 'Head Unit',
    reviewedRole: currentUser.role || 'HEAD_UNIT',
    isSourceStale: false
  };

  const updateData: Partial<ElementaryUpperStudentNarrativesDoc> = {
    updatedAt: now,
    updatedBy: currentUser.uid || 'system',
    updatedByName: currentUser.displayName || currentUser.name || 'Head Unit'
  };

  if (packageType === 'MONTHLY_PROGRESS') {
    updateData.monthlyProgressReview = {
      ...(existing.monthlyProgressReview || { reviewStatus: 'DRAFT' }),
      ...reviewPayload
    };
  } else {
    updateData.litNumReview = {
      ...(existing.litNumReview || { reviewStatus: 'DRAFT' }),
      ...reviewPayload
    };
  }

  await setDoc(ref, updateData, { merge: true });
}

// ==========================================
// D. ATTENDANCE CONFIG SERVICE
// ==========================================

export async function fetchUpperAttendanceConfig(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<ElementaryUpperAttendanceConfig | null> {
  if (!classId || !academicYear || !semester || !month) return null;
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${classId}_${normYear}_S${semester}_M${month}`;
  try {
    const snap = await getDoc(doc(db, 'elem_monthly_upper_attendance_configs', docId));
    if (snap.exists()) {
      return snap.data() as ElementaryUpperAttendanceConfig;
    }
    return null;
  } catch (err) {
    console.error('Error fetching upper attendance config:', err);
    throw err;
  }
}

export async function saveUpperAttendanceConfig(
  config: Omit<ElementaryUpperAttendanceConfig, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
  currentUser: User
): Promise<void> {
  const normYear = normalizeAcademicYear(config.academicYear);
  const docId = `${config.classId}_${normYear}_S${config.semester}_M${config.month}`;
  const ref = doc(db, 'elem_monthly_upper_attendance_configs', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data() : null;

  const payload: ElementaryUpperAttendanceConfig = {
    id: docId,
    ...config,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || currentUser.uid || 'system',
    updatedAt: now,
    updatedBy: currentUser.uid || 'system'
  };

  await setDoc(ref, payload, { merge: true });
}

// ==========================================
// E. PUBLICATION & DELIVERY SERVICES
// ==========================================

export async function fetchPublishedUpperReports(
  classId: string,
  academicYear: string,
  semester: string,
  month: string,
  reportKind?: ElementaryUpperReportKind
): Promise<PublishedElementaryUpperReportDoc[]> {
  if (!classId || !academicYear || !semester || !month) return [];
  try {
    const coll = collection(db, 'elem_monthly_upper_published_reports');
    let q = query(
      coll,
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    if (reportKind) {
      q = query(
        coll,
        where('classId', '==', classId),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester),
        where('month', '==', month),
        where('reportKind', '==', reportKind)
      );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PublishedElementaryUpperReportDoc);
  } catch (err) {
    console.error('Error fetching published upper reports:', err);
    throw err;
  }
}

export async function publishUpperMonthlyProgressReport(
  params: {
    student: Student;
    classInfo: Class;
    academicYear: string;
    semester: string;
    month: string;
    monthLabel: string;
    curriculumDoc: ElementaryUpperCurriculumDoc;
    studentDataDoc: ElementaryUpperStudentDataDoc;
    narrativesDoc: ElementaryUpperStudentNarrativesDoc;
    attendanceSummary: ElementaryUpperAttendanceSummary;
    signatory: ElementaryUpperReportSignatory;
  },
  currentUser: User
): Promise<PublishedElementaryUpperReportDoc> {
  const {
    student,
    classInfo,
    academicYear,
    semester,
    month,
    monthLabel,
    curriculumDoc,
    studentDataDoc,
    narrativesDoc,
    attendanceSummary,
    signatory
  } = params;

  // Build LG results
  const lgResults: Record<string, UpperLGAverageResult> = {};
  for (const sub of curriculumDoc.subjects || []) {
    for (const lg of sub.learningGoals || []) {
      const kkm = lg.kkmOverride || sub.kkm || 70;
      const statusMode = studentDataDoc.lgStatus?.[lg.id] || 'AUTO';
      lgResults[lg.id] = calculateUpperLGAverageAndPredicate(
        studentDataDoc.scores || {},
        lg.learningObjectives || [],
        kkm,
        statusMode
      );
    }
  }

  const projectLgResults: Record<string, UpperLGAverageResult> = {};
  for (const proj of curriculumDoc.projects || []) {
    for (const lg of proj.learningGoals || []) {
      const statusMode = studentDataDoc.projectLgStatus?.[lg.id] || 'AUTO';
      projectLgResults[lg.id] = calculateUpperLGAverageAndPredicate(
        studentDataDoc.projectScores || {},
        lg.learningObjectives || [],
        70,
        statusMode
      );
    }
  }

  const snapshot: ElementaryUpperMonthlyProgressSnapshot = {
    student: {
      id: student.id,
      name: student.name,
      nisn: student.nisn || student.nis || '-',
      className: classInfo.name,
      grade: classInfo.level || 4
    },
    academicYear,
    semester,
    month,
    monthLabel,
    curriculum: curriculumDoc,
    scoresSummary: {
      scores: studentDataDoc.scores || {},
      lgStatus: studentDataDoc.lgStatus || {},
      projectScores: studentDataDoc.projectScores || {},
      projectLgStatus: studentDataDoc.projectLgStatus || {},
      lgResults,
      projectLgResults
    },
    narratives: {
      monthlyGeneralComment: narrativesDoc.monthlyGeneralComment,
      approvedByName: narrativesDoc.monthlyProgressReview?.reviewedByName,
      approvedAt: narrativesDoc.monthlyProgressReview?.reviewedAt
    },
    attendance: attendanceSummary,
    signatory
  };

  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${normYear}_S${semester}_M${month}_${classInfo.id}_${student.id}_MONTHLY_PROGRESS`;
  const ref = doc(db, 'elem_monthly_upper_published_reports', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as PublishedElementaryUpperReportDoc) : null;
  const currentVersion = existing?.version ? existing.version + 1 : 1;

  const fileName = normalizeUpperReportFilename(student.name, 'MONTHLY_PROGRESS', monthLabel, academicYear);

  const docPayload: PublishedElementaryUpperReportDoc = {
    id: docId,
    unit: 'ELEMENTARY',
    reportType: 'MONTHLY_REPORT_UPPER',
    reportKind: 'MONTHLY_PROGRESS',
    studentId: student.id,
    studentNameSnapshot: student.name,
    nisnSnapshot: student.nisn || student.nis || '-',
    classId: classInfo.id,
    classNameSnapshot: classInfo.name,
    gradeSnapshot: classInfo.level || 4,
    academicYear,
    semester,
    month,
    monthLabel,
    version: currentVersion,
    status: 'PUBLISHED',
    deliveryStatus: existing?.deliveryStatus || 'NOT_SENT',
    isSentToPortal: existing?.isSentToPortal || false,
    sentAt: existing?.sentAt || null,
    sentBy: existing?.sentBy || null,
    sentByName: existing?.sentByName || null,
    monthlyProgressSnapshot: snapshot,
    fileName,
    generatedBy: currentUser.uid || 'system',
    generatedByName: currentUser.displayName || currentUser.name || 'Guru',
    generatedAt: now,
    isOpened: existing?.isOpened || false,
    firstOpenedAt: existing?.firstOpenedAt || null,
    lastOpenedAt: existing?.lastOpenedAt || null,
    openCount: existing?.openCount || 0,
    openedByEmail: existing?.openedByEmail || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await setDoc(ref, docPayload, { merge: true });
  return docPayload;
}

export async function publishUpperLiteracyNumeracyReport(
  params: {
    student: Student;
    classInfo: Class;
    academicYear: string;
    semester: string;
    month: string;
    monthLabel: string;
    classConfigDoc: ElementaryUpperLitNumClassConfigDoc;
    recordDoc: ElementaryUpperLitNumRecordDoc;
    narrativesDoc: ElementaryUpperStudentNarrativesDoc;
    signatory: ElementaryUpperReportSignatory;
  },
  currentUser: User
): Promise<PublishedElementaryUpperReportDoc> {
  const {
    student,
    classInfo,
    academicYear,
    semester,
    month,
    monthLabel,
    classConfigDoc,
    recordDoc,
    narrativesDoc,
    signatory
  } = params;

  const snapshot: ElementaryUpperLiteracyNumeracySnapshot = {
    student: {
      id: student.id,
      name: student.name,
      nisn: student.nisn || student.nis || '-',
      className: classInfo.name,
      grade: classInfo.level || 4
    },
    academicYear,
    semester,
    month,
    monthLabel,
    classConfig: classConfigDoc,
    record: recordDoc,
    narratives: {
      bahasaIndonesiaNarrative: narrativesDoc.bahasaIndonesiaNarrative,
      englishNarrative: narrativesDoc.englishNarrative,
      mathematicsNarrative: narrativesDoc.mathematicsNarrative,
      approvedByName: narrativesDoc.litNumReview?.reviewedByName,
      approvedAt: narrativesDoc.litNumReview?.reviewedAt
    },
    signatory
  };

  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${normYear}_S${semester}_M${month}_${classInfo.id}_${student.id}_LITERACY_NUMERACY`;
  const ref = doc(db, 'elem_monthly_upper_published_reports', docId);
  const now = Date.now();

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as PublishedElementaryUpperReportDoc) : null;
  const currentVersion = existing?.version ? existing.version + 1 : 1;

  const fileName = normalizeUpperReportFilename(student.name, 'LITERACY_NUMERACY', monthLabel, academicYear);

  const docPayload: PublishedElementaryUpperReportDoc = {
    id: docId,
    unit: 'ELEMENTARY',
    reportType: 'MONTHLY_REPORT_UPPER',
    reportKind: 'LITERACY_NUMERACY',
    studentId: student.id,
    studentNameSnapshot: student.name,
    nisnSnapshot: student.nisn || student.nis || '-',
    classId: classInfo.id,
    classNameSnapshot: classInfo.name,
    gradeSnapshot: classInfo.level || 4,
    academicYear,
    semester,
    month,
    monthLabel,
    version: currentVersion,
    status: 'PUBLISHED',
    deliveryStatus: existing?.deliveryStatus || 'NOT_SENT',
    isSentToPortal: existing?.isSentToPortal || false,
    sentAt: existing?.sentAt || null,
    sentBy: existing?.sentBy || null,
    sentByName: existing?.sentByName || null,
    litNumSnapshot: snapshot,
    fileName,
    generatedBy: currentUser.uid || 'system',
    generatedByName: currentUser.displayName || currentUser.name || 'Guru',
    generatedAt: now,
    isOpened: existing?.isOpened || false,
    firstOpenedAt: existing?.firstOpenedAt || null,
    lastOpenedAt: existing?.lastOpenedAt || null,
    openCount: existing?.openCount || 0,
    openedByEmail: existing?.openedByEmail || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  await setDoc(ref, docPayload, { merge: true });
  return docPayload;
}

export async function sendUpperReportToPortal(
  reportId: string,
  currentUser: User
): Promise<void> {
  const ref = doc(db, 'elem_monthly_upper_published_reports', reportId);
  const now = Date.now();
  await setDoc(
    ref,
    {
      deliveryStatus: 'SENT',
      isSentToPortal: true,
      sentAt: now,
      sentBy: currentUser.uid || 'system',
      sentByName: currentUser.displayName || currentUser.name || 'Guru',
      updatedAt: now
    },
    { merge: true }
  );
}

export async function revokeUpperReportAccess(
  reportId: string,
  currentUser: User
): Promise<void> {
  const ref = doc(db, 'elem_monthly_upper_published_reports', reportId);
  const now = Date.now();
  await setDoc(
    ref,
    {
      deliveryStatus: 'REVOKED',
      isSentToPortal: false,
      updatedAt: now,
      revokedBy: currentUser.uid || 'system',
      revokedByName: currentUser.displayName || currentUser.name || 'Guru',
      revokedAt: now
    },
    { merge: true }
  );
}

export async function trackUpperReportOpened(
  reportId: string,
  openedByEmail?: string
): Promise<void> {
  const ref = doc(db, 'elem_monthly_upper_published_reports', reportId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const existing = snap.data() as PublishedElementaryUpperReportDoc;
  const now = Date.now();

  await setDoc(
    ref,
    {
      isOpened: true,
      firstOpenedAt: existing.firstOpenedAt || now,
      lastOpenedAt: now,
      openCount: (existing.openCount || 0) + 1,
      openedByEmail: openedByEmail || existing.openedByEmail || null,
      updatedAt: now
    },
    { merge: true }
  );
}

