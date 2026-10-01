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
  orderBy,
  QueryConstraint
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../lib/firebase';
import type {
  ElementarySnStudentDoc,
  ElementarySnMidtermReportDoc,
  ElementarySnPublishedMidtermReportDoc,
  ElementarySnSubject
} from '../types/elementaryMidtermSnReport';
import type { Student, Class, User } from '../types';

export function normalizeAcademicYear(academicYear: string): string {
  return (academicYear || '2025/2026').replace(/\//g, '_');
}

export function getElemSnDocId(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_T${midtermPeriod}_SN`;
}

// ----------------------------------------------------
// 1. ELEM SN STUDENTS (elem_sn_students)
// ----------------------------------------------------

export async function fetchElemSnStudentsForClass(
  classId: string,
  academicYear: string
): Promise<ElementarySnStudentDoc[]> {
  if (!classId || typeof classId !== 'string' || !academicYear || typeof academicYear !== 'string') {
    return [];
  }

  try {
    const constraints: QueryConstraint[] = [
      where('classId', '==', classId.trim()),
      where('academicYear', '==', academicYear.trim()),
      where('isSN', '==', true)
    ];

    const q = query(
      collection(db, 'elem_sn_students'),
      ...constraints
    );

    const snap = await getDocs(q);
    const list: ElementarySnStudentDoc[] = [];
    snap.docs.forEach((d) => {
      const data = d.data() as ElementarySnStudentDoc;
      if (data && data.isSN) {
        list.push({ ...data, id: d.id });
      }
    });

    return list.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
  } catch (err: any) {
    console.error('[elementarySnMidtermService] fetchElemSnStudentsForClass error:', { classId, academicYear }, err);
    handleFirestoreError(err, 'list', 'elem_sn_students');
    return [];
  }
}

export async function assignElemSnStudent(
  student: Student,
  classObj: Class,
  academicYear: string,
  currentUser: User
): Promise<void> {
  if (!student?.id || !classObj?.id || !academicYear || !currentUser?.uid) {
    throw new Error('Data siswa, kelas, tahun ajaran, atau pengguna tidak valid.');
  }

  try {
    const docId = `${student.id}_${classObj.id}`;
    const docRef = doc(db, 'elem_sn_students', docId);

    const payload: ElementarySnStudentDoc = {
      id: docId,
      studentId: student.id,
      studentName: student.name || 'Siswa',
      nisn: (student as any).nisn || (student as any).nis || '',
      classId: classObj.id,
      className: classObj.name || '',
      academicYear: academicYear.trim(),
      isSN: true,
      assignedAt: Date.now(),
      assignedBy: currentUser.uid,
      assignedByName: currentUser.displayName || currentUser.name || 'Admin',
      updatedAt: Date.now()
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    console.error('[elementarySnMidtermService] assignElemSnStudent error:', { studentId: student?.id, classId: classObj?.id }, err);
    handleFirestoreError(err, 'create', 'elem_sn_students');
    throw err;
  }
}

export async function removeElemSnStudent(
  studentId: string,
  classId: string
): Promise<void> {
  if (!studentId || !classId) {
    throw new Error('studentId dan classId wajib diisi.');
  }

  try {
    const docId = `${studentId}_${classId}`;
    const docRef = doc(db, 'elem_sn_students', docId);
    await deleteDoc(docRef);
  } catch (err: any) {
    console.error('[elementarySnMidtermService] removeElemSnStudent error:', { studentId, classId }, err);
    handleFirestoreError(err, 'delete', 'elem_sn_students');
    throw err;
  }
}

// ----------------------------------------------------
// 2. ELEM SN MIDTERM REPORT DRAFTS (elem_sn_midterm_reports)
// ----------------------------------------------------

export const DEFAULT_ELEMENTARY_SN_SUBJECTS: ElementarySnSubject[] = [
  {
    subjectId: 'elem_subj_islamic_studies',
    subjectName: 'Islamic Studies',
    order: 1,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_quran_reciting',
    subjectName: "Qur'an Reciting",
    order: 2,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_bahasa_indonesia',
    subjectName: 'Bahasa Indonesia',
    order: 3,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_mathematics',
    subjectName: 'Mathematics',
    order: 4,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_english',
    subjectName: 'English',
    order: 5,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_arts_crafts',
    subjectName: 'Arts and Crafts',
    order: 6,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_performing_arts',
    subjectName: 'Performing Arts',
    order: 7,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_physical_education',
    subjectName: 'Physical Education',
    order: 8,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_ict',
    subjectName: 'Information and Communications Technology',
    order: 9,
    category: 'ACADEMIC',
    learningGoals: []
  },
  {
    subjectId: 'elem_subj_projects',
    subjectName: 'Projects',
    order: 10,
    category: 'PROJECTS',
    learningGoals: []
  }
];

export function createDefaultElemSnReport(
  student: Student,
  classObj: Class,
  academicYear: string,
  semester: string,
  midtermPeriod: string,
  currentUser: User
): ElementarySnMidtermReportDoc {
  const docId = getElemSnDocId(student.id, classObj.id, academicYear, semester, midtermPeriod);

  return {
    id: docId,
    reportType: 'SN',
    studentId: student.id,
    studentName: student.name || 'Siswa',
    nisn: (student as any).nisn || (student as any).nis || '',
    classId: classObj.id,
    className: classObj.name || '',
    academicYear,
    semester,
    midtermPeriod,
    subjects: JSON.parse(JSON.stringify(DEFAULT_ELEMENTARY_SN_SUBJECTS)),
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
    attendance: {
      sakit: 0,
      izin: 0,
      tanpaKeterangan: 0
    },
    createdAt: Date.now(),
    createdBy: currentUser?.uid || 'system',
    updatedAt: Date.now(),
    updatedBy: currentUser?.uid || 'system'
  };
}

export async function fetchElemSnMidtermReport(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): Promise<ElementarySnMidtermReportDoc | null> {
  if (!studentId || !classId || !academicYear || !semester || !midtermPeriod) {
    return null;
  }

  try {
    const docId = getElemSnDocId(studentId, classId, academicYear, semester, midtermPeriod);
    const docRef = doc(db, 'elem_sn_midterm_reports', docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data() as ElementarySnMidtermReportDoc;
      return {
        ...data,
        id: snap.id,
        subjects: Array.isArray(data.subjects) ? data.subjects : [],
        generalComment: data.generalComment || {
          finalComment: '',
          status: 'DRAFT',
          strengths: [],
          achievements: [],
          needsImprovement: []
        },
        reviewStatus: data.reviewStatus || 'DRAFT',
        reviewHistory: Array.isArray(data.reviewHistory) ? data.reviewHistory : [],
        attendance: data.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 }
      };
    }
    return null;
  } catch (err: any) {
    console.error('[elementarySnMidtermService] fetchElemSnMidtermReport error:', { studentId, classId, academicYear, semester, midtermPeriod }, err);
    handleFirestoreError(err, 'get', 'elem_sn_midterm_reports');
    return null;
  }
}

export async function saveElemSnMidtermReport(
  reportDoc: ElementarySnMidtermReportDoc,
  currentUser: User
): Promise<void> {
  if (!reportDoc?.studentId || !reportDoc?.classId || !reportDoc?.academicYear || !reportDoc?.semester || !reportDoc?.midtermPeriod) {
    throw new Error('Konteks dokumen rapor SN tidak lengkap.');
  }

  try {
    const docId = reportDoc.id || getElemSnDocId(
      reportDoc.studentId,
      reportDoc.classId,
      reportDoc.academicYear,
      reportDoc.semester,
      reportDoc.midtermPeriod
    );

    const docRef = doc(db, 'elem_sn_midterm_reports', docId);

    // Deep clean undefined fields to prevent Firestore serialization errors
    const cleanedSubjects = (reportDoc.subjects || []).map((s, sIdx) => ({
      subjectId: s.subjectId || `elem_subj_${sIdx}`,
      subjectName: s.subjectName || 'Subject',
      order: typeof s.order === 'number' ? s.order : sIdx + 1,
      category: s.category || (s.subjectName === 'Projects' ? 'PROJECTS' : 'ACADEMIC'),
      learningGoals: (s.learningGoals || []).map((g, gIdx) => ({
        goalId: g.goalId || `goal_${sIdx}_${gIdx}`,
        text: g.text || '',
        remark: g.remark || '',
        order: typeof g.order === 'number' ? g.order : gIdx + 1
      }))
    }));

    const cleanedGenCom = {
      finalComment: reportDoc.generalComment?.finalComment || '',
      status: reportDoc.generalComment?.status || 'DRAFT',
      manualNotes: reportDoc.generalComment?.manualNotes || '',
      aiDraft: reportDoc.generalComment?.aiDraft || '',
      strengths: Array.isArray(reportDoc.generalComment?.strengths) ? reportDoc.generalComment.strengths : [],
      achievements: Array.isArray(reportDoc.generalComment?.achievements) ? reportDoc.generalComment.achievements : [],
      needsImprovement: Array.isArray(reportDoc.generalComment?.needsImprovement) ? reportDoc.generalComment.needsImprovement : [],
      updatedAt: Date.now(),
      updatedBy: currentUser?.uid || reportDoc.generalComment?.updatedBy || 'system'
    };

    const cleanedPayload: ElementarySnMidtermReportDoc = {
      id: docId,
      reportType: 'SN',
      studentId: reportDoc.studentId,
      studentName: reportDoc.studentName || 'Siswa',
      nisn: reportDoc.nisn || '',
      classId: reportDoc.classId,
      className: reportDoc.className || '',
      academicYear: reportDoc.academicYear,
      semester: reportDoc.semester,
      midtermPeriod: reportDoc.midtermPeriod,
      subjects: cleanedSubjects,
      generalComment: cleanedGenCom,
      reviewStatus: reportDoc.reviewStatus || 'DRAFT',
      reviewHistory: Array.isArray(reportDoc.reviewHistory) ? reportDoc.reviewHistory : [],
      attendance: reportDoc.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 },
      createdAt: reportDoc.createdAt || Date.now(),
      createdBy: reportDoc.createdBy || currentUser?.uid || 'system',
      updatedAt: Date.now(),
      updatedBy: currentUser?.uid || 'system'
    };

    await setDoc(docRef, cleanedPayload, { merge: true });
  } catch (err: any) {
    console.error('[elementarySnMidtermService] saveElemSnMidtermReport error:', { id: reportDoc?.id }, err);
    handleFirestoreError(err, 'update', 'elem_sn_midterm_reports');
    throw err;
  }
}

// ----------------------------------------------------
// 3. ELEM SN PUBLISHED REPORTS (elem_sn_midterm_published_reports)
// ----------------------------------------------------

export async function fetchElemSnPublishedReports(
  classId: string,
  academicYear: string,
  semester: string,
  midtermPeriod: string
): Promise<ElementarySnPublishedMidtermReportDoc[]> {
  if (!classId || typeof classId !== 'string' || !academicYear || typeof academicYear !== 'string') {
    return [];
  }

  try {
    const constraints: QueryConstraint[] = [
      where('classId', '==', classId.trim()),
      where('academicYear', '==', academicYear.trim())
    ];

    if (semester && typeof semester === 'string') {
      constraints.push(where('semester', '==', semester.trim()));
    }
    if (midtermPeriod && typeof midtermPeriod === 'string') {
      constraints.push(where('midtermPeriod', '==', midtermPeriod.trim()));
    }

    const q = query(
      collection(db, 'elem_sn_midterm_published_reports'),
      ...constraints
    );

    const snap = await getDocs(q);
    const list: ElementarySnPublishedMidtermReportDoc[] = [];
    snap.docs.forEach((d) => {
      const data = d.data() as ElementarySnPublishedMidtermReportDoc;
      if (data) {
        list.push({ ...data, id: d.id });
      }
    });

    return list.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  } catch (err: any) {
    console.error('[elementarySnMidtermService] fetchElemSnPublishedReports error:', { classId, academicYear, semester, midtermPeriod }, err);
    handleFirestoreError(err, 'list', 'elem_sn_midterm_published_reports');
    return [];
  }
}

export async function publishElemSnMidtermReport(
  student: Student,
  classObj: Class,
  academicYear: string,
  semester: string,
  midtermPeriod: string,
  reportSnapshot: any,
  driveFileUrl: string,
  driveFileId: string,
  driveFolderId: string,
  reportVersion: number,
  currentUser: User
): Promise<void> {
  if (!student?.id || !classObj?.id || !academicYear || !semester || !midtermPeriod || !currentUser?.uid) {
    throw new Error('Parameter publish rapor SN tidak lengkap.');
  }

  try {
    const normYear = normalizeAcademicYear(academicYear);
    const docId = `${student.id}_${classObj.id}_${normYear}_S${semester}_T${midtermPeriod}_v${reportVersion}_SN`;
    const docRef = doc(db, 'elem_sn_midterm_published_reports', docId);

    const payload: ElementarySnPublishedMidtermReportDoc = {
      id: docId,
      reportType: 'SN',
      studentId: student.id,
      studentName: student.name || 'Siswa',
      classId: classObj.id,
      className: classObj.name || '',
      academicYear,
      semester,
      midtermPeriod,
      reportVersion,
      status: 'PUBLISHED',
      reportSnapshot,
      driveFileId: driveFileId || '',
      driveFolderId: driveFolderId || '',
      driveFileUrl: driveFileUrl || '',
      publishedAt: Date.now(),
      publishedBy: currentUser.uid,
      publishedByName: currentUser.displayName || currentUser.name || 'Admin',
      isOpened: false,
      firstOpenedAt: null as any,
      lastOpenedAt: null as any,
      openCount: 0
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    console.error('[elementarySnMidtermService] publishElemSnMidtermReport error:', { studentId: student?.id, classId: classObj?.id }, err);
    handleFirestoreError(err, 'create', 'elem_sn_midterm_published_reports');
    throw err;
  }
}

export async function updateElemSnPublishedReportOpenTracking(
  reportId: string,
  userEmail?: string
): Promise<void> {
  if (!reportId) return;

  try {
    const docRef = doc(db, 'elem_sn_midterm_published_reports', reportId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const currentCount = data.openCount || 0;
    const now = Date.now();

    await updateDoc(docRef, {
      isOpened: true,
      firstOpenedAt: data.firstOpenedAt || now,
      lastOpenedAt: now,
      openCount: currentCount + 1,
      openedByEmail: userEmail || data.openedByEmail || null
    });
  } catch (err) {
    console.warn('[elementarySnMidtermService] updateElemSnPublishedReportOpenTracking non-fatal:', err);
  }
}
