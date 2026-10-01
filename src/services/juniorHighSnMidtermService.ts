import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  type QueryConstraint
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  SnStudentDoc,
  SnMidtermReportDoc,
  SnPublishedMidtermReportDoc,
  SnSubject,
  SnLearningGoal
} from '../types/midtermSnReport';
import type { User, Class, Student } from '../types';

export function normalizeAcademicYear(year: string): string {
  if (!year || typeof year !== 'string') return '2025_2026';
  return year.replace(/\//g, '_').trim();
}

export function getSnReportDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  const sId = (studentId || '').trim();
  const cId = (classId || '').trim();
  const sem = (semester || '1').trim();
  const per = (midtermPeriod || '1').trim();
  return `${sId}_${cId}_${normYear}_${sem}_${per}_SN`;
}

/**
 * Deep sanitization to ensure no `undefined` values reach Firestore writes.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (data instanceof Date) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as any;
  }
  const sanitizedObj: any = {};
  for (const key of Object.keys(data)) {
    const val = (data as any)[key];
    if (val !== undefined) {
      sanitizedObj[key] = sanitizeForFirestore(val);
    }
  }
  return sanitizedObj;
}

export function canUserManageSnStatus(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || '').toUpperCase();
  return [
    'SUPER_ADMIN',
    'PRINCIPAL',
    'HEAD_UNIT',
    'HEAD_JUNIOR',
    'VICE_PRINCIPAL',
    'SECRETARY_JH',
    'ADMIN'
  ].includes(role);
}

/**
 * Fetch list of SN assigned students for a given class from `jh_sn_students`.
 * Guarded against null / undefined / empty string parameters.
 */
export async function fetchSnStudentsForClass(
  classId?: string | null,
  academicYear?: string | null
): Promise<SnStudentDoc[]> {
  const path = 'jh_sn_students';
  if (!classId || typeof classId !== 'string' || !classId.trim()) {
    return [];
  }

  try {
    const constraints: QueryConstraint[] = [
      where('classId', '==', classId.trim()),
      where('isSN', '==', true)
    ];

    if (academicYear && typeof academicYear === 'string' && academicYear.trim()) {
      constraints.push(where('academicYear', '==', academicYear.trim()));
    }

    const q = query(collection(db, path), ...constraints);
    const snap = await getDocs(q);
    const list: SnStudentDoc[] = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.isSN === true) {
          list.push({ id: docSnap.id, ...data } as SnStudentDoc);
        }
      }
    });
    return list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
  } catch (err) {
    console.error("[fetchSnStudentsForClass] Error fetching SN students:", { classId, academicYear }, err);
    return [];
  }
}

/**
 * Assign SN status to a student (Admin only).
 * Sanitizes payload and verifies required parameters.
 */
export async function assignSnStudent(
  student: Student,
  classData: Class,
  academicYear: string,
  currentUser: User
): Promise<void> {
  const path = 'jh_sn_students';

  if (!student?.id || !classData?.id || !academicYear || !currentUser?.uid) {
    console.error("[assignSnStudent] Missing required parameters:", {
      studentId: student?.id,
      classId: classData?.id,
      academicYear,
      userId: currentUser?.uid
    });
    throw new Error("Parameter tidak lengkap untuk menetapkan siswa SN.");
  }

  const sId = student.id.trim();
  const cId = classData.id.trim();
  const docId = `${sId}_${cId}`;

  try {
    const rawPayload: SnStudentDoc = {
      id: docId,
      studentId: sId,
      studentName: student.name?.trim() || 'Siswa SN',
      nisn: (student as any).nisn || (student as any).nis || '',
      classId: cId,
      className: classData.name?.trim() || '',
      academicYear: academicYear.trim(),
      isSN: true,
      assignedAt: Date.now(),
      assignedBy: currentUser.uid,
      assignedByName: currentUser.displayName?.trim() || currentUser.email?.trim() || 'Admin',
      updatedAt: Date.now()
    };
    const sanitized = sanitizeForFirestore(rawPayload);
    await setDoc(doc(db, path, docId), sanitized, { merge: true });
  } catch (err) {
    console.error("[assignSnStudent] Error writing SN student document:", { docId, studentId: student.id, classId: classData.id }, err);
    throw err;
  }
}

/**
 * Remove SN status from a student (Admin only).
 */
export async function removeSnStudent(
  studentId: string,
  classId: string
): Promise<void> {
  const path = 'jh_sn_students';
  if (!studentId || !classId) {
    console.error("[removeSnStudent] Missing studentId or classId:", { studentId, classId });
    return;
  }
  const docId = `${studentId.trim()}_${classId.trim()}`;
  try {
    await deleteDoc(doc(db, path, docId));
  } catch (err) {
    console.error("[removeSnStudent] Error removing SN student document:", { docId, studentId, classId }, err);
    throw err;
  }
}

/**
 * Returns default subject structure for new SN student report.
 */
export function getDefaultSnSubjects(): SnSubject[] {
  const defaultNames = [
    'Spiritual Health',
    'Bahasa Indonesia',
    'English',
    'Mathematics',
    'Science (IPA)',
    'Social Studies and Civics (IPS & PKn)',
    'Islamic Studies',
    'Art & Performing Arts',
    'Physical Education (PJOK)',
    'Digital Literacy & Skills'
  ];

  return defaultNames.map((name, index) => ({
    subjectId: `subj_${index + 1}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
    subjectName: name,
    order: index + 1,
    learningGoals: []
  }));
}

/**
 * Fetch draft report for SN student from `jh_sn_midterm_reports`.
 * Returns null if parameters are invalid.
 */
export async function fetchSnMidtermReport(
  student: Student | null | undefined,
  classData: Class | null | undefined,
  academicYear: string | null | undefined,
  semester: string | null | undefined,
  midtermPeriod: string | null | undefined
): Promise<SnMidtermReportDoc | null> {
  const path = 'jh_sn_midterm_reports';

  if (!student?.id || !classData?.id || !academicYear || !semester || !midtermPeriod) {
    console.warn("[fetchSnMidtermReport] Incomplete parameters, skipping fetch:", {
      studentId: student?.id,
      classId: classData?.id,
      academicYear,
      semester,
      midtermPeriod
    });
    return null;
  }

  const sId = student.id.trim();
  const cId = classData.id.trim();
  const aYear = academicYear.trim();
  const sem = semester.trim();
  const period = midtermPeriod.trim();

  const docId = getSnReportDocId(sId, cId, aYear, sem, period);

  try {
    const docRef = doc(db, path, docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        id: snap.id,
        reportType: 'SN',
        studentId: sId,
        studentName: data.studentName || student.name || '',
        nisn: data.nisn || (student as any).nisn || '',
        classId: cId,
        className: data.className || classData.name || '',
        academicYear: aYear,
        semester: sem,
        midtermPeriod: period,
        subjects: Array.isArray(data.subjects) ? data.subjects : getDefaultSnSubjects(),
        generalComment: data.generalComment || {
          finalComment: '',
          status: 'DRAFT',
          manualNotes: '',
          aiDraft: '',
          strengths: [],
          achievements: [],
          needsImprovement: []
        },
        reviewStatus: data.reviewStatus || 'DRAFT',
        reviewHistory: Array.isArray(data.reviewHistory) ? data.reviewHistory : [],
        createdAt: data.createdAt || Date.now(),
        createdBy: data.createdBy || '',
        updatedAt: data.updatedAt || Date.now(),
        updatedBy: data.updatedBy || ''
      } as SnMidtermReportDoc;
    }

    // Default structure for new report
    return {
      id: docId,
      reportType: 'SN',
      studentId: sId,
      studentName: student.name || '',
      nisn: (student as any).nisn || '',
      classId: cId,
      className: classData.name || '',
      academicYear: aYear,
      semester: sem,
      midtermPeriod: period,
      subjects: getDefaultSnSubjects(),
      generalComment: {
        finalComment: '',
        status: 'DRAFT',
        manualNotes: '',
        aiDraft: '',
        strengths: [],
        achievements: [],
        needsImprovement: []
      },
      reviewStatus: 'DRAFT',
      reviewHistory: [],
      createdAt: Date.now(),
      createdBy: '',
      updatedAt: Date.now(),
      updatedBy: ''
    };
  } catch (err) {
    console.error("[fetchSnMidtermReport] Error fetching SN report:", { docId, sId, cId, aYear, sem, period }, err);
    return null;
  }
}

/**
 * Save draft report for SN student in `jh_sn_midterm_reports`.
 * Sanitizes all payload keys to eliminate any `undefined`.
 */
export async function saveSnMidtermReport(
  reportData: Partial<SnMidtermReportDoc> & { id: string },
  currentUser: User
): Promise<void> {
  const path = 'jh_sn_midterm_reports';

  if (!reportData?.id || typeof reportData.id !== 'string' || !reportData.id.trim()) {
    console.error("[saveSnMidtermReport] Missing valid report ID:", { reportData });
    throw new Error("ID dokumen laporan tidak valid.");
  }

  const docId = reportData.id.trim();

  try {
    const rawPayload = {
      ...reportData,
      reportType: 'SN',
      subjects: Array.isArray(reportData.subjects) ? reportData.subjects : [],
      generalComment: reportData.generalComment || {
        finalComment: '',
        status: 'DRAFT'
      },
      reviewHistory: Array.isArray(reportData.reviewHistory) ? reportData.reviewHistory : [],
      updatedAt: Date.now(),
      updatedBy: currentUser?.uid || 'system',
      createdBy: reportData.createdBy || currentUser?.uid || 'system',
      createdAt: reportData.createdAt || Date.now()
    };

    const sanitized = sanitizeForFirestore(rawPayload);
    await setDoc(doc(db, path, docId), sanitized, { merge: true });
  } catch (err) {
    console.error("[saveSnMidtermReport] Error saving SN report:", { docId }, err);
    throw err;
  }
}

/**
 * Fetch published reports for class from `jh_sn_midterm_published_reports`.
 */
export async function fetchSnPublishedReportsForClass(
  classId?: string | null,
  academicYear?: string | null,
  semester?: string | null,
  midtermPeriod?: string | null
): Promise<SnPublishedMidtermReportDoc[]> {
  const path = 'jh_sn_midterm_published_reports';

  if (!classId || !academicYear || !semester || !midtermPeriod) {
    return [];
  }

  const cId = classId.trim();
  const aYear = academicYear.trim();
  const sem = semester.trim();
  const period = midtermPeriod.trim();

  try {
    const constraints: QueryConstraint[] = [
      where('classId', '==', cId),
      where('academicYear', '==', aYear),
      where('semester', '==', sem),
      where('midtermPeriod', '==', period)
    ];

    const q = query(collection(db, path), ...constraints);
    const snap = await getDocs(q);
    const list: SnPublishedMidtermReportDoc[] = [];
    snap.forEach((docSnap) => {
      if (docSnap.exists()) {
        list.push({ id: docSnap.id, ...docSnap.data() } as SnPublishedMidtermReportDoc);
      }
    });
    return list;
  } catch (err) {
    console.error("[fetchSnPublishedReportsForClass] Error fetching published SN reports:", { cId, aYear, sem, period }, err);
    return [];
  }
}

/**
 * Save published report snapshot in `jh_sn_midterm_published_reports`.
 */
export async function publishSnMidtermReport(
  student: Student,
  classData: Class,
  academicYear: string,
  semester: string,
  midtermPeriod: string,
  reportSnapshot: any,
  driveFileUrl: string,
  driveFileId: string,
  driveFolderId: string,
  version: number,
  currentUser: User
): Promise<SnPublishedMidtermReportDoc> {
  const path = 'jh_sn_midterm_published_reports';

  if (!student?.id || !classData?.id || !academicYear || !semester || !midtermPeriod || !currentUser?.uid) {
    console.error("[publishSnMidtermReport] Missing required parameters:", {
      studentId: student?.id,
      classId: classData?.id,
      academicYear,
      semester,
      midtermPeriod,
      userId: currentUser?.uid
    });
    throw new Error("Parameter tidak lengkap untuk mempublikasikan rapor SN.");
  }

  const sId = student.id.trim();
  const cId = classData.id.trim();
  const aYear = academicYear.trim();
  const sem = semester.trim();
  const period = midtermPeriod.trim();

  const normYear = normalizeAcademicYear(aYear);
  const docId = `SN_PUB_${sId}_${cId}_${normYear}_${sem}_${period}_v${version}`;

  try {
    const rawDoc: SnPublishedMidtermReportDoc = {
      id: docId,
      reportType: 'SN',
      studentId: sId,
      studentName: student.name?.trim() || '',
      classId: cId,
      className: classData.name?.trim() || '',
      academicYear: aYear,
      semester: sem,
      midtermPeriod: period,
      reportVersion: version,
      status: 'PUBLISHED',
      reportSnapshot: reportSnapshot || {},
      driveFileId: driveFileId || '',
      driveFolderId: driveFolderId || '',
      driveFileUrl: driveFileUrl || '',
      publishedAt: Date.now(),
      publishedBy: currentUser.uid,
      publishedByName: currentUser.displayName?.trim() || currentUser.email?.trim() || 'Guru'
    };

    const sanitized = sanitizeForFirestore(rawDoc);
    await setDoc(doc(db, path, docId), sanitized, { merge: true });
    return sanitized;
  } catch (err) {
    console.error("[publishSnMidtermReport] Error publishing SN report:", { docId, sId, cId }, err);
    throw err;
  }
}
