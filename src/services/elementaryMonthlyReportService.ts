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
  ElementaryMonthlyCurriculumDoc, 
  ElementaryMonthlyStudentScoreDoc, 
  ElementaryMonthlySubject 
} from '../types/elementaryMonthlyReport';
import type { User, Student } from '../types';

export function normalizeAcademicYear(academicYear: string): string {
  return academicYear ? academicYear.replace(/\//g, '_') : '2025_2026';
}

export function buildMonthlyCurriculumDocId(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_M${month}`;
}

export function buildMonthlyStudentScoreDocId(
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

/**
 * Returns sensible months for Semester 1 (July - Dec) or Semester 2 (Jan - June)
 * based on academic year, e.g. "2025/2026".
 */
export function getMonthOptionsForAcademicYear(academicYear: string, semester: string): Array<{ value: string; label: string }> {
  const parts = academicYear.split('/');
  const startYear = parseInt(parts[0], 10) || 2025;
  const endYear = parseInt(parts[1], 10) || (startYear + 1);

  if (semester === '1') {
    // July to Dec of startYear
    return [
      { value: `${startYear}-07`, label: `Juli ${startYear}` },
      { value: `${startYear}-08`, label: `Agustus ${startYear}` },
      { value: `${startYear}-09`, label: `September ${startYear}` },
      { value: `${startYear}-10`, label: `Oktober ${startYear}` },
      { value: `${startYear}-11`, label: `November ${startYear}` },
      { value: `${startYear}-12`, label: `Desember ${startYear}` },
    ];
  } else {
    // January to June of endYear
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

/**
 * Fetches the curriculum document for a specific class, year, semester, and month.
 */
export async function fetchElementaryMonthlyCurriculum(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<ElementaryMonthlyCurriculumDoc | null> {
  try {
    const docId = buildMonthlyCurriculumDocId(classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_curriculum', docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as ElementaryMonthlyCurriculumDoc;
  } catch (err: any) {
    handleFirestoreError(err, 'get', 'elem_monthly_curriculum');
    return null;
  }
}

/**
 * Saves the entire curriculum structure (subjects, LGs, LOs, KKMs) for a monthly context.
 */
export async function saveElementaryMonthlyCurriculum(
  curriculum: Omit<ElementaryMonthlyCurriculumDoc, 'updatedAt' | 'updatedBy' | 'updatedByName'> & {
    createdAt?: number;
    createdBy?: string;
    createdByName?: string;
  },
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMonthlyCurriculumDocId(
      curriculum.classId,
      curriculum.academicYear,
      curriculum.semester,
      curriculum.month
    );
    const docRef = doc(db, 'elem_monthly_curriculum', docId);

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: ElementaryMonthlyCurriculumDoc = {
      ...curriculum,
      id: docId,
      createdAt: curriculum.createdAt || now,
      createdBy: curriculum.createdBy || userId,
      createdByName: curriculum.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', 'elem_monthly_curriculum');
    throw err;
  }
}

/**
 * Fetches all student score documents for a class, academicYear, semester, month.
 */
export async function fetchElementaryMonthlyStudentScores(
  classId: string,
  academicYear: string,
  semester: string,
  month: string
): Promise<Record<string, ElementaryMonthlyStudentScoreDoc>> {
  try {
    const q = query(
      collection(db, 'elem_monthly_student_scores'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('month', '==', month)
    );
    const snap = await getDocs(q);
    const map: Record<string, ElementaryMonthlyStudentScoreDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data() as ElementaryMonthlyStudentScoreDoc;
      if (data && data.studentId) {
        map[data.studentId] = data;
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_monthly_student_scores');
    return {};
  }
}

/**
 * Saves a single LO score for a student.
 */
export async function saveElementaryMonthlySingleScore(params: {
  studentId: string;
  studentName: string;
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  loId: string;
  score: number | null; // null deletes or clears
  user?: User | null;
}): Promise<void> {
  const { studentId, studentName, classId, academicYear, semester, month, loId, score, user } = params;
  try {
    const docId = buildMonthlyStudentScoreDocId(studentId, classId, academicYear, semester, month);
    const docRef = doc(db, 'elem_monthly_student_scores', docId);

    const snap = await getDoc(docRef);
    const existing = snap.exists() ? (snap.data() as ElementaryMonthlyStudentScoreDoc) : null;
    const scores = existing?.scores ? { ...existing.scores } : {};

    if (score === null || score === undefined) {
      delete scores[loId];
    } else {
      scores[loId] = score;
    }

    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';

    const payload: ElementaryMonthlyStudentScoreDoc = {
      id: docId,
      studentId,
      studentName,
      classId,
      academicYear,
      semester,
      month,
      scores,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || userId,
      createdByName: existing?.createdByName || userName,
      updatedAt: now,
      updatedBy: userId,
      updatedByName: userName
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'write', `elem_monthly_student_scores/${studentId}`);
    throw err;
  }
}

/**
 * Bulk writes LO score across multiple students.
 */
export async function saveBulkElementaryMonthlyScores(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  loId: string;
  score: number;
  students: Student[];
  targetStudentIds: string[];
  onlyEmpty?: boolean;
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  user?: User | null;
}): Promise<number> {
  const { 
    classId, academicYear, semester, month, loId, score, 
    students, targetStudentIds, onlyEmpty, existingScoresMap, user 
  } = params;

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let count = 0;

    for (const student of students) {
      if (!targetStudentIds.includes(student.id)) continue;

      const existingDoc = existingScoresMap[student.id];
      const existingScore = existingDoc?.scores?.[loId];

      if (onlyEmpty && existingScore !== undefined && existingScore !== null) {
        continue;
      }

      const docId = buildMonthlyStudentScoreDocId(student.id, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_scores', docId);

      const currentScores = existingDoc?.scores ? { ...existingDoc.scores } : {};
      currentScores[loId] = score;

      batch.set(docRef, {
        id: docId,
        studentId: student.id,
        studentName: student.name,
        classId,
        academicYear,
        semester,
        month,
        scores: currentScores,
        createdAt: existingDoc?.createdAt || now,
        createdBy: existingDoc?.createdBy || userId,
        createdByName: existingDoc?.createdByName || userName,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: userName
      }, { merge: true });

      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    handleFirestoreError(err, 'batch', 'elem_monthly_student_scores/bulk');
    throw err;
  }
}

/**
 * Imports table scores for multiple students and LOs from paste/import.
 */
export async function importTableElementaryMonthlyScores(params: {
  classId: string;
  academicYear: string;
  semester: string;
  month: string;
  scoresByStudent: Record<string, Record<string, number>>; // studentId -> { loId: score }
  students: Student[];
  existingScoresMap: Record<string, ElementaryMonthlyStudentScoreDoc>;
  user?: User | null;
}): Promise<number> {
  const { classId, academicYear, semester, month, scoresByStudent, students, existingScoresMap, user } = params;

  try {
    const batch = writeBatch(db);
    const now = Date.now();
    const userId = user?.uid || (user as any)?.id || 'unknown';
    const userName = user?.displayName || (user as any)?.name || 'Guru';
    let updatedCount = 0;

    for (const [studentId, loScores] of Object.entries(scoresByStudent)) {
      const student = students.find(s => s.id === studentId);
      if (!student) continue;

      const docId = buildMonthlyStudentScoreDocId(studentId, classId, academicYear, semester, month);
      const docRef = doc(db, 'elem_monthly_student_scores', docId);

      const existingDoc = existingScoresMap[studentId];
      const mergedScores = {
        ...(existingDoc?.scores || {}),
        ...loScores
      };

      batch.set(docRef, {
        id: docId,
        studentId,
        studentName: student.name,
        classId,
        academicYear,
        semester,
        month,
        scores: mergedScores,
        createdAt: existingDoc?.createdAt || now,
        createdBy: existingDoc?.createdBy || userId,
        createdByName: existingDoc?.createdByName || userName,
        updatedAt: now,
        updatedBy: userId,
        updatedByName: userName
      }, { merge: true });

      updatedCount++;
    }

    if (updatedCount > 0) {
      await batch.commit();
    }
    return updatedCount;
  } catch (err: any) {
    handleFirestoreError(err, 'batch', 'elem_monthly_student_scores/import');
    throw err;
  }
}

/**
 * Copies the curriculum structure (subjects, LGs, LOs, KKMs) from a source class/month to target class/month.
 * Generates fresh unique IDs for subjects, LGs, and LOs so target has its own independent identity.
 * Does NOT copy student scores.
 */
export async function copyElementaryMonthlyCurriculum(params: {
  sourceCurriculum: ElementaryMonthlyCurriculumDoc;
  targetClassId: string;
  targetClassName: string;
  targetGradeLevel: number;
  targetAcademicYear: string;
  targetSemester: string;
  targetMonth: string;
  user?: User | null;
}): Promise<void> {
  const { 
    sourceCurriculum, 
    targetClassId, 
    targetClassName, 
    targetGradeLevel, 
    targetAcademicYear, 
    targetSemester, 
    targetMonth, 
    user 
  } = params;

  const now = Date.now();
  const userId = user?.uid || (user as any)?.id || 'unknown';
  const userName = user?.displayName || (user as any)?.name || 'Guru';

  // Deep clone subjects with new stable IDs
  const clonedSubjects: ElementaryMonthlySubject[] = (sourceCurriculum.subjects || []).map((sub, sIdx) => {
    const newSubjectId = `subj_${now}_${sIdx}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      id: newSubjectId,
      name: sub.name,
      kkm: sub.kkm ?? 70,
      order: sub.order ?? sIdx,
      learningGoals: (sub.learningGoals || []).map((lg, lgIdx) => {
        const newLgId = `lg_${now}_${sIdx}_${lgIdx}_${Math.random().toString(36).substring(2, 7)}`;
        return {
          id: newLgId,
          code: lg.code || `LG ${lgIdx + 1}`,
          title: lg.title,
          order: lg.order ?? lgIdx,
          kkmOverride: lg.kkmOverride,
          learningObjectives: (lg.learningObjectives || []).map((lo, loIdx) => {
            const newLoId = `lo_${now}_${sIdx}_${lgIdx}_${loIdx}_${Math.random().toString(36).substring(2, 7)}`;
            return {
              id: newLoId,
              code: lo.code || `LO ${loIdx + 1}`,
              title: lo.title,
              order: lo.order ?? loIdx
            };
          })
        };
      })
    };
  });

  const docId = buildMonthlyCurriculumDocId(targetClassId, targetAcademicYear, targetSemester, targetMonth);
  const docRef = doc(db, 'elem_monthly_curriculum', docId);

  const payload: ElementaryMonthlyCurriculumDoc = {
    id: docId,
    classId: targetClassId,
    className: targetClassName,
    gradeLevel: targetGradeLevel,
    academicYear: targetAcademicYear,
    semester: targetSemester,
    month: targetMonth,
    subjects: clonedSubjects,
    createdAt: now,
    createdBy: userId,
    createdByName: userName,
    updatedAt: now,
    updatedBy: userId,
    updatedByName: userName
  };

  await setDoc(docRef, payload, { merge: true });
}
