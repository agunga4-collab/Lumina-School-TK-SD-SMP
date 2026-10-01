import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import type {
  SnStudentDoc,
  SnMidtermReportDoc,
  SnPublishedMidtermReportDoc,
  SnSubject,
  SnLearningGoal
} from '../types/midtermSnReport';
import type { User, Class, Student } from '../types';

export function normalizeAcademicYear(year: string): string {
  return (year || '2025/2026').replace(/\//g, '_');
}

export function getSnReportDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_${semester}_${midtermPeriod}_SN`;
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
 * Fetch list of SN assigned students for a given class from `jh_sn_students`
 */
export async function fetchSnStudentsForClass(
  classId: string,
  academicYear?: string
): Promise<SnStudentDoc[]> {
  const path = 'jh_sn_students';
  try {
    const q = query(
      collection(db, path),
      where('classId', '==', classId),
      where('isSN', '==', true)
    );
    const snap = await getDocs(q);
    const list: SnStudentDoc[] = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as SnStudentDoc);
    });
    return list.sort((a, b) => a.studentName.localeCompare(b.studentName));
  } catch (err) {
    handleFirestoreError(err, 'list', path);
  }
}

/**
 * Assign SN status to a student (Admin only)
 */
export async function assignSnStudent(
  student: Student,
  classData: Class,
  academicYear: string,
  currentUser: User
): Promise<void> {
  const path = 'jh_sn_students';
  const docId = `${student.id}_${classData.id}`;
  try {
    const payload: SnStudentDoc = {
      id: docId,
      studentId: student.id,
      studentName: student.name || 'Siswa SN',
      nisn: (student as any).nisn || '',
      classId: classData.id,
      className: classData.name || '',
      academicYear: academicYear || '2025/2026',
      isSN: true,
      assignedAt: Date.now(),
      assignedBy: currentUser.uid,
      assignedByName: currentUser.displayName || currentUser.email || 'Admin',
      updatedAt: Date.now()
    };
    await setDoc(doc(db, path, docId), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, 'write', path);
  }
}

/**
 * Remove SN status from a student (Admin only)
 */
export async function removeSnStudent(
  studentId: string,
  classId: string
): Promise<void> {
  const path = 'jh_sn_students';
  const docId = `${studentId}_${classId}`;
  try {
    await deleteDoc(doc(db, path, docId));
  } catch (err) {
    handleFirestoreError(err, 'delete', path);
  }
}

/**
 * Returns default subject structure for new SN student report
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
 * Fetch draft report for SN student from `jh_sn_midterm_reports`
 */
export async function fetchSnMidtermReport(
  student: Student,
  classData: Class,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): Promise<SnMidtermReportDoc> {
  const path = 'jh_sn_midterm_reports';
  const docId = getSnReportDocId(student.id, classData.id, academicYear, semester, midtermPeriod);

  try {
    const docRef = doc(db, path, docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as SnMidtermReportDoc;
    }

    // Default structure for new report
    return {
      id: docId,
      reportType: 'SN',
      studentId: student.id,
      studentName: student.name || '',
      nisn: (student as any).nisn || '',
      classId: classData.id,
      className: classData.name || '',
      academicYear: academicYear,
      semester: semester,
      midtermPeriod: midtermPeriod,
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
    handleFirestoreError(err, 'get', `${path}/${docId}`);
  }
}

/**
 * Save draft report for SN student in `jh_sn_midterm_reports`
 */
export async function saveSnMidtermReport(
  reportData: Partial<SnMidtermReportDoc> & { id: string },
  currentUser: User
): Promise<void> {
  const path = 'jh_sn_midterm_reports';
  try {
    const payload = {
      ...reportData,
      reportType: 'SN',
      updatedAt: Date.now(),
      updatedBy: currentUser.uid,
      createdBy: reportData.createdBy || currentUser.uid,
      createdAt: reportData.createdAt || Date.now()
    };
    await setDoc(doc(db, path, reportData.id), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, 'write', `${path}/${reportData.id}`);
  }
}

/**
 * Fetch published reports for class from `jh_sn_midterm_published_reports`
 */
export async function fetchSnPublishedReportsForClass(
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): Promise<SnPublishedMidtermReportDoc[]> {
  const path = 'jh_sn_midterm_published_reports';
  try {
    const q = query(
      collection(db, path),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('midtermPeriod', '==', midtermPeriod)
    );
    const snap = await getDocs(q);
    const list: SnPublishedMidtermReportDoc[] = [];
    snap.forEach((docSnap) => {
      list.push({ id: docSnap.id, ...docSnap.data() } as SnPublishedMidtermReportDoc);
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, 'list', path);
  }
}

/**
 * Save published report snapshot in `jh_sn_midterm_published_reports`
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
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `SN_PUB_${student.id}_${classData.id}_${normYear}_${semester}_${midtermPeriod}_v${version}`;

  try {
    const publishedDoc: SnPublishedMidtermReportDoc = {
      id: docId,
      reportType: 'SN',
      studentId: student.id,
      studentName: student.name || '',
      classId: classData.id,
      className: classData.name || '',
      academicYear,
      semester,
      midtermPeriod,
      reportVersion: version,
      status: 'PUBLISHED',
      reportSnapshot,
      driveFileId,
      driveFolderId,
      driveFileUrl,
      publishedAt: Date.now(),
      publishedBy: currentUser.uid,
      publishedByName: currentUser.displayName || currentUser.email || 'Guru'
    };

    await setDoc(doc(db, path, docId), publishedDoc, { merge: true });
    return publishedDoc;
  } catch (err) {
    handleFirestoreError(err, 'write', `${path}/${docId}`);
  }
}
