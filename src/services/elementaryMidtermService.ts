import { 
  db, 
  handleFirestoreError 
} from '../lib/firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  writeBatch
} from 'firebase/firestore';
import type { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc, 
  ElementaryMidtermGoalItem, 
  ElementaryMidtermGeneralCommentData,
  ElementaryMidtermGenComReviewStatus,
  PublishedElementaryMidtermReport,
  ElementaryMidtermReportSnapshot,
  ElementaryMidtermClassCommentsConfig
} from '../types/elementaryMidtermReport';
import type { User, UnitActivityEnrollment } from '../types';

export function normalizeAcademicYear(academicYear: string): string {
  return academicYear ? academicYear.replace(/\//g, '_') : '2025_2026';
}

export function buildMasterGoalDocId(
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string, 
  subjectKey: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  const normSubj = subjectKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${classId}_${normYear}_S${semester}_T${midtermTerm}_${normSubj}`;
}

export function buildStudentDataDocId(
  studentId: string, 
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_S${semester}_T${midtermTerm}`;
}

export function buildCommentsConfigDocId(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${classId}_${normYear}_S${semester}_T${midtermTerm}`;
}

export async function fetchElementaryMidtermMasterGoals(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<Record<string, ElementaryMidtermMasterGoalDoc>> {
  try {
    const normYear = normalizeAcademicYear(academicYear);
    const q = query(
      collection(db, 'elem_midterm_master_goals'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('midtermTerm', '==', midtermTerm)
    );
    const snap = await getDocs(q);
    const map: Record<string, ElementaryMidtermMasterGoalDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data() as ElementaryMidtermMasterGoalDoc;
      if (data && data.subjectKey) {
        map[data.subjectKey] = data;
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_midterm_master_goals');
    return {};
  }
}

export async function saveElementaryMidtermMasterGoals(
  classId: string,
  className: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  subjectKey: string,
  category: string,
  goals: ElementaryMidtermGoalItem[],
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMasterGoalDocId(classId, academicYear, semester, midtermTerm, subjectKey);
    const docRef = doc(db, 'elem_midterm_master_goals', docId);
    
    const docData: ElementaryMidtermMasterGoalDoc = {
      id: docId,
      classId,
      className,
      academicYear,
      semester,
      midtermTerm,
      category,
      subjectKey,
      goals,
      updatedAt: Date.now(),
      updatedBy: user?.id || 'system',
      updatedByName: user?.displayName || user?.name || 'System User'
    };

    await setDoc(docRef, docData, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_master_goals/${subjectKey}`);
  }
}

export function normalizeElementaryMidtermStudentData(
  data: any, 
  defaults: { studentId: string; studentName: string; classId: string; academicYear: string; semester: string; midtermTerm: string }
): ElementaryMidtermStudentDataDoc {
  return {
    id: data?.id || buildStudentDataDocId(defaults.studentId, defaults.classId, defaults.academicYear, defaults.semester, defaults.midtermTerm),
    studentId: defaults.studentId,
    studentName: data?.studentName || defaults.studentName,
    classId: defaults.classId,
    academicYear: defaults.academicYear,
    semester: defaults.semester,
    midtermTerm: defaults.midtermTerm,
    remarks: data?.remarks && typeof data.remarks === 'object' ? data.remarks : {},
    generalComment: {
      studentName: defaults.studentName,
      strengths: Array.isArray(data?.generalComment?.strengths) ? data.generalComment.strengths : [],
      achievements: Array.isArray(data?.generalComment?.achievements) ? data.generalComment.achievements : [],
      needsImprovement: Array.isArray(data?.generalComment?.needsImprovement) ? data.generalComment.needsImprovement : [],
      manualNotes: data?.generalComment?.manualNotes || '',
      aiDraft: data?.generalComment?.aiDraft || '',
      finalComment: data?.generalComment?.finalComment || '',
      isFinal: Boolean(data?.generalComment?.isFinal)
    },
    status: data?.status || 'DRAFT',
    generalCommentReviewStatus: data?.generalCommentReviewStatus || 'DRAFT',
    submittedForReviewAt: data?.submittedForReviewAt || null,
    submittedForReviewBy: data?.submittedForReviewBy || null,
    submittedForReviewByName: data?.submittedForReviewByName || null,
    approvedAt: data?.approvedAt || null,
    approvedBy: data?.approvedBy || null,
    approvedByName: data?.approvedByName || null,
    revisionRequestedAt: data?.revisionRequestedAt || null,
    revisionRequestedBy: data?.revisionRequestedBy || null,
    revisionRequestedByName: data?.revisionRequestedByName || null,
    revisionFeedback: data?.revisionFeedback || '',
    reviewVersion: data?.reviewVersion || 1,
    reviewHistory: Array.isArray(data?.reviewHistory) ? data.reviewHistory : [],
    updatedAt: data?.updatedAt || Date.now(),
    updatedBy: data?.updatedBy || '',
    attendance: data?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 }
  };
}

export async function fetchElementaryMidtermStudentData(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<Record<string, ElementaryMidtermStudentDataDoc>> {
  try {
    const q = query(
      collection(db, 'elem_midterm_student_data'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', semester),
      where('midtermTerm', '==', midtermTerm)
    );
    const snap = await getDocs(q);
    const map: Record<string, ElementaryMidtermStudentDataDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (data && data.studentId) {
        map[data.studentId] = normalizeElementaryMidtermStudentData(data, {
          studentId: data.studentId,
          studentName: data.studentName || 'Siswa',
          classId,
          academicYear,
          semester,
          midtermTerm
        });
      }
    });
    return map;
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_midterm_student_data');
    return {};
  }
}

export async function saveElementaryMidtermStudentRemark(
  studentId: string,
  studentName: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  remarkValue: string,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
    const docRef = doc(db, 'elem_midterm_student_data', docId);
    
    const existingSnap = await getDoc(docRef);
    let existingData: any = existingSnap.exists() ? existingSnap.data() : null;

    const currentRemarks = existingData?.remarks && typeof existingData.remarks === 'object' 
      ? { ...existingData.remarks } 
      : {};

    currentRemarks[goalId] = remarkValue;

    const payload = {
      id: docId,
      studentId,
      studentName,
      classId,
      academicYear,
      semester,
      midtermTerm,
      remarks: currentRemarks,
      updatedAt: Date.now(),
      updatedBy: user?.id || 'system'
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}`);
  }
}

export async function saveBulkElementaryMidtermStudentRemarks(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  remarkValue: string,
  studentList: Array<{ id: string; name: string }>,
  user?: User | null
): Promise<void> {
  try {
    const batch = writeBatch(db);
    
    for (const st of studentList) {
      if (!st.id) continue;
      const docId = buildStudentDataDocId(st.id, classId, academicYear, semester, midtermTerm);
      const docRef = doc(db, 'elem_midterm_student_data', docId);
      
      const snap = await getDoc(docRef);
      const existing = snap.exists() ? snap.data() : null;
      const currentRemarks = existing?.remarks && typeof existing.remarks === 'object'
        ? { ...existing.remarks }
        : {};
      
      currentRemarks[goalId] = remarkValue;

      batch.set(docRef, {
        id: docId,
        studentId: st.id,
        studentName: st.name || 'Siswa',
        classId,
        academicYear,
        semester,
        midtermTerm,
        remarks: currentRemarks,
        updatedAt: Date.now(),
        updatedBy: user?.id || 'system'
      }, { merge: true });
    }

    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/bulk`);
    throw err;
  }
}

export async function saveElementaryMidtermGeneralComment(
  studentId: string,
  studentName: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  generalCommentData: ElementaryMidtermGeneralCommentData,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
    const docRef = doc(db, 'elem_midterm_student_data', docId);

    const payload = {
      id: docId,
      studentId,
      studentName,
      classId,
      academicYear,
      semester,
      midtermTerm,
      generalComment: generalCommentData,
      updatedAt: Date.now(),
      updatedBy: user?.id || 'system'
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}/genCom`);
  }
}

export async function updateElementaryGenComReviewStatus(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  action: 'SUBMIT_REVIEW' | 'APPROVE' | 'REQUEST_REVISION' | 'RESET_DRAFT',
  user: User,
  feedback?: string,
  commentSnapshot?: string
): Promise<void> {
  try {
    const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
    const docRef = doc(db, 'elem_midterm_student_data', docId);

    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Student midterm document not found.');

    const data = snap.data();
    const history = Array.isArray(data.reviewHistory) ? [...data.reviewHistory] : [];
    const now = Date.now();

    let newStatus: ElementaryMidtermGenComReviewStatus = data.generalCommentReviewStatus || 'DRAFT';
    let historyAction: any = 'DRAFT_SAVED';

    const updatePayload: any = {
      updatedAt: now,
      updatedBy: user.id
    };

    if (action === 'SUBMIT_REVIEW') {
      newStatus = 'SUBMITTED_FOR_REVIEW';
      historyAction = 'SUBMITTED_FOR_REVIEW';
      updatePayload.submittedForReviewAt = now;
      updatePayload.submittedForReviewBy = user.id;
      updatePayload.submittedForReviewByName = user.displayName || user.name || 'Teacher';
    } else if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      historyAction = 'APPROVED';
      updatePayload.approvedAt = now;
      updatePayload.approvedBy = user.id;
      updatePayload.approvedByName = user.displayName || user.name || 'Reviewer';
    } else if (action === 'REQUEST_REVISION') {
      newStatus = 'REVISION_REQUESTED';
      historyAction = 'REVISION_REQUESTED';
      updatePayload.revisionRequestedAt = now;
      updatePayload.revisionRequestedBy = user.id;
      updatePayload.revisionRequestedByName = user.displayName || user.name || 'Reviewer';
      updatePayload.revisionFeedback = feedback || '';
    } else if (action === 'RESET_DRAFT') {
      newStatus = 'DRAFT';
      historyAction = 'DRAFT_SAVED';
    }

    updatePayload.generalCommentReviewStatus = newStatus;

    history.push({
      action: historyAction,
      actorId: user.id,
      actorName: user.displayName || user.name || 'User',
      actorRole: user.role,
      timestamp: now,
      feedback: feedback || '',
      commentSnapshot: commentSnapshot || data?.generalComment?.finalComment || ''
    });

    updatePayload.reviewHistory = history;

    await updateDoc(docRef, updatePayload);
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}/reviewStatus`);
    throw err;
  }
}

export async function fetchPublishedElementaryMidtermReports(params: {
  classId?: string;
  academicYear?: string;
  semester?: string;
  midtermTerm?: string;
  studentId?: string;
}): Promise<PublishedElementaryMidtermReport[]> {
  try {
    let q = query(collection(db, 'elem_midterm_published_reports'));
    if (params.classId) q = query(q, where('classId', '==', params.classId));
    if (params.academicYear) q = query(q, where('academicYear', '==', params.academicYear));
    if (params.semester) q = query(q, where('semester', '==', params.semester));
    if (params.midtermTerm) q = query(q, where('midtermTerm', '==', params.midtermTerm));
    if (params.studentId) q = query(q, where('studentId', '==', params.studentId));

    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PublishedElementaryMidtermReport));
  } catch (err: any) {
    handleFirestoreError(err, 'list', 'elem_midterm_published_reports');
    return [];
  }
}

export async function publishElementaryMidtermReport(payload: {
  studentId: string;
  studentName: string;
  nisn: string;
  classId: string;
  className: string;
  grade?: string | number;
  academicYear: string;
  semester: string;
  midtermTerm: string;
  reportSnapshot: ElementaryMidtermReportSnapshot;
  driveFolderId?: string;
  driveFileId?: string;
  driveFileUrl?: string;
  fileName?: string;
  user?: User | null;
}): Promise<PublishedElementaryMidtermReport> {
  try {
    const existingReports = await fetchPublishedElementaryMidtermReports({
      studentId: payload.studentId,
      classId: payload.classId,
      academicYear: payload.academicYear,
      semester: payload.semester,
      midtermTerm: payload.midtermTerm
    });

    const currentMaxVersion = existingReports.reduce((max, r) => Math.max(max, r.version || 0), 0);
    const newVersion = currentMaxVersion + 1;

    const normYear = normalizeAcademicYear(payload.academicYear);
    const docId = `ELEM_MIDTERM_${payload.studentId}_${payload.classId}_${normYear}_S${payload.semester}_T${payload.midtermTerm}_v${newVersion}`;
    const docRef = doc(db, 'elem_midterm_published_reports', docId);

    const now = Date.now();
    const publishedDoc: PublishedElementaryMidtermReport = {
      id: docId,
      unit: 'ELEMENTARY',
      reportType: 'MIDTERM_REPORT',

      studentId: payload.studentId,
      studentNameSnapshot: payload.studentName,
      nisnSnapshot: payload.nisn || '-',
      classId: payload.classId,
      classNameSnapshot: payload.className,
      gradeSnapshot: payload.grade || '',

      academicYear: payload.academicYear,
      semester: payload.semester,
      midtermTerm: payload.midtermTerm,
      periodLabel: `Mid Term ${payload.midtermTerm === '1' ? 'I' : 'II'} (${payload.academicYear})`,

      version: newVersion,

      driveFolderId: payload.driveFolderId || '',
      driveFileId: payload.driveFileId || '',
      driveFileUrl: payload.driveFileUrl || '',
      fileName: payload.fileName || `Midterm_Report_${payload.studentName.replace(/\s+/g, '_')}_T${payload.midtermTerm}.pdf`,

      reportSnapshot: payload.reportSnapshot,

      generatedBy: payload.user?.id || 'system',
      generatedByName: payload.user?.displayName || payload.user?.name || 'System User',
      generatedAt: now,

      isOpened: false,
      firstOpenedAt: null,
      lastOpenedAt: null,
      openCount: 0,
      openedByEmail: null,

      createdAt: now,
      updatedAt: now
    };

    await setDoc(docRef, publishedDoc);

    // Also update student status to PUBLISHED in elem_midterm_student_data
    const studentDocId = buildStudentDataDocId(payload.studentId, payload.classId, payload.academicYear, payload.semester, payload.midtermTerm);
    await updateDoc(doc(db, 'elem_midterm_student_data', studentDocId), {
      status: 'PUBLISHED',
      updatedAt: now
    }).catch(() => {});

    return publishedDoc;
  } catch (err: any) {
    handleFirestoreError(err, 'create', 'elem_midterm_published_reports');
    throw err;
  }
}

export async function fetchElementaryStudentUnitActivityEnrollment(
  studentId: string,
  academicYear: string,
  semester: string
): Promise<UnitActivityEnrollment | null> {
  try {
    // Check both unit_activity_enrollments and junior_high_unit_activity_enrollments
    const q1 = query(
      collection(db, 'unit_activity_enrollments'),
      where('studentId', '==', studentId),
      where('academicYear', '==', academicYear),
      where('status', '==', 'CONFIRMED')
    );
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      return { id: snap1.docs[0].id, ...snap1.docs[0].data() } as UnitActivityEnrollment;
    }

    const q2 = query(
      collection(db, 'junior_high_unit_activity_enrollments'),
      where('studentId', '==', studentId),
      where('academicYear', '==', academicYear),
      where('status', '==', 'CONFIRMED')
    );
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return { id: snap2.docs[0].id, ...snap2.docs[0].data() } as UnitActivityEnrollment;
    }

    return null;
  } catch (err) {
    console.warn(`[fetchElementaryStudentUnitActivityEnrollment] Error for student ${studentId}:`, err);
    return null;
  }
}
