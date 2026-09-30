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
  writeBatch,
  deleteField
} from 'firebase/firestore';
import type { 
  ElementaryMidtermMasterGoalDoc, 
  ElementaryMidtermStudentDataDoc, 
  ElementaryMidtermGoalItem, 
  ElementaryMidtermGeneralCommentData,
  ElementaryMidtermGenComReviewStatus,
  ElementaryMidtermReviewHistoryEntry,
  PublishedElementaryMidtermReport,
  ElementaryMidtermReportSnapshot,
  ElementaryMidtermClassCommentsConfig
} from '../types/elementaryMidtermReport';
import type { User, UnitActivityEnrollment, Class } from '../types';

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
  user?: User | null,
  activeGoalIds?: string[]
): Promise<void> {
  try {
    const docId = buildMasterGoalDocId(classId, academicYear, semester, midtermTerm, subjectKey);
    const docRef = doc(db, 'elem_midterm_master_goals', docId);
    
    const docData: Record<string, any> = {
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
      updatedBy: user?.uid || (user as any)?.id || 'system',
      updatedByName: user?.displayName || (user as any)?.name || 'System User'
    };

    if (activeGoalIds !== undefined) {
      docData.activeGoalIds = activeGoalIds;
    }

    await setDoc(docRef, docData, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_master_goals/${subjectKey}`);
  }
}

export async function saveElementaryMidtermActiveGoalIds(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  subjectKey: string,
  activeGoalIds: string[],
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMasterGoalDocId(classId, academicYear, semester, midtermTerm, subjectKey);
    const docRef = doc(db, 'elem_midterm_master_goals', docId);

    await setDoc(docRef, {
      activeGoalIds,
      updatedAt: Date.now(),
      updatedBy: user?.uid || (user as any)?.id || 'system',
      updatedByName: user?.displayName || (user as any)?.name || 'System User'
    }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_master_goals/${subjectKey}/activeGoalIds`);
  }
}

export async function saveBulkElementaryMidtermMasterGoalForClasses(
  targetClasses: Array<{ id: string; name: string }>,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  subjectKey: string,
  category: string,
  newGoalText: string,
  user?: User | null,
  useForMidterm: boolean = true
): Promise<{ successCount: number; totalClasses: number }> {
  try {
    const trimmedGoalText = newGoalText.trim();
    if (!trimmedGoalText || targetClasses.length === 0) {
      return { successCount: 0, totalClasses: targetClasses.length };
    }

    let successCount = 0;

    for (const targetCls of targetClasses) {
      if (!targetCls.id) continue;

      const docId = buildMasterGoalDocId(targetCls.id, academicYear, semester, midtermTerm, subjectKey);
      const docRef = doc(db, 'elem_midterm_master_goals', docId);

      const snap = await getDoc(docRef);
      let existingGoals: ElementaryMidtermGoalItem[] = [];
      let existingActiveGoalIds: string[] | undefined = undefined;

      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.goals)) {
          existingGoals = [...data.goals];
        }
        if (Array.isArray(data?.activeGoalIds)) {
          existingActiveGoalIds = [...data.activeGoalIds];
        }
      }

      // Check if goal text already exists in this class (case-insensitive trim check)
      const existingGoalMatch = existingGoals.find(
        g => g && typeof g.text === 'string' && g.text.trim().toLowerCase() === trimmedGoalText.toLowerCase()
      );

      let newGoalId = existingGoalMatch?.id;

      if (!existingGoalMatch) {
        newGoalId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const newGoalItem: ElementaryMidtermGoalItem = {
          id: newGoalId,
          text: trimmedGoalText,
          order: existingGoals.length + 1
        };

        existingGoals.push(newGoalItem);
      }

      // If activeGoalIds was previously undefined, initialize it with all existing goals
      let updatedActiveGoalIds: string[];
      if (existingActiveGoalIds === undefined) {
        updatedActiveGoalIds = existingGoals.map(g => g.id);
      } else {
        updatedActiveGoalIds = [...existingActiveGoalIds];
      }

      if (useForMidterm && newGoalId && !updatedActiveGoalIds.includes(newGoalId)) {
        updatedActiveGoalIds.push(newGoalId);
      }

      const docData: Record<string, any> = {
        id: docId,
        classId: targetCls.id,
        className: targetCls.name || '',
        academicYear,
        semester,
        midtermTerm,
        category,
        subjectKey,
        goals: existingGoals,
        activeGoalIds: updatedActiveGoalIds,
        updatedAt: Date.now(),
        updatedBy: user?.uid || (user as any)?.id || 'system',
        updatedByName: user?.displayName || (user as any)?.name || 'System User'
      };

      await setDoc(docRef, docData, { merge: true });

      successCount++;
    }

    return { successCount, totalClasses: targetClasses.length };
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_master_goals/bulk`);
    throw err;
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
    attendance: data?.attendance || { sakit: 0, izin: 0, tanpaKeterangan: 0 },
    performingArtsUA: data?.performingArtsUA || ''
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
    console.log(`[ElementaryMidtermRead] Querying path: elem_midterm_student_data, classId: ${classId}, year: ${academicYear}, sem: ${semester}, term: ${midtermTerm}`);
    const snap = await getDocs(q);
    const map: Record<string, ElementaryMidtermStudentDataDoc> = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (data && data.studentId) {
        console.log(`[ElementaryMidtermRead] Found doc for student: ${data.studentId}, ID: ${d.id}, remarks:`, data.remarks);
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
    console.log(`[ElementaryMidtermRead] Completed fetching. Loaded ${snap.docs.length} documents.`);
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
      updatedBy: user?.uid || (user as any)?.id || 'system'
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
        updatedBy: user?.uid || (user as any)?.id || 'system'
      }, { merge: true });
    }

    await batch.commit();
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/bulk`);
    throw err;
  }
}

/**
 * Delete a single student remark for a specific learning goal.
 * Uses deleteField() on `remarks.${goalId}` without modifying other fields or deleting the document.
 */
export async function deleteElementaryMidtermStudentRemark(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  user?: User | null
): Promise<void> {
  try {
    const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
    const docRef = doc(db, 'elem_midterm_student_data', docId);

    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const existing = snap.data();
    if (!existing?.remarks || existing.remarks[goalId] === undefined) {
      return;
    }

    await updateDoc(docRef, {
      [`remarks.${goalId}`]: deleteField(),
      updatedAt: Date.now(),
      updatedBy: user?.uid || (user as any)?.id || 'system'
    });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}`);
    throw err;
  }
}

/**
 * Bulk delete remark for a specific learning goal across students who currently have a value on that goal.
 * Uses writeBatch and deleteField() on `remarks.${goalId}` without deleting documents or other remarks.
 */
export async function deleteBulkElementaryMidtermStudentRemarks(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  studentIdsWithRemark: string[],
  user?: User | null
): Promise<number> {
  try {
    if (!studentIdsWithRemark || studentIdsWithRemark.length === 0) {
      return 0;
    }
    const batch = writeBatch(db);
    let count = 0;

    for (const studentId of studentIdsWithRemark) {
      if (!studentId) continue;
      const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
      const docRef = doc(db, 'elem_midterm_student_data', docId);

      batch.update(docRef, {
        [`remarks.${goalId}`]: deleteField(),
        updatedAt: Date.now(),
        updatedBy: user?.uid || (user as any)?.id || 'system'
      });
      count++;
    }

    if (count > 0) {
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/bulk_delete`);
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

    // Validate that comments already APPROVED cannot be edited or overwritten
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      if (existingData?.generalCommentReviewStatus === 'APPROVED') {
        throw new Error('General Comment yang sudah disetujui (APPROVED) tidak dapat diedit atau diubah.');
      }
      if (existingData?.generalCommentReviewStatus === 'SUBMITTED_FOR_REVIEW' || existingData?.generalCommentReviewStatus === 'PENDING_REVIEW') {
        throw new Error('General Comment sedang dalam peninjauan (Menunggu Review). Tarik kembali pengajuan terlebih dahulu jika ingin menyunting.');
      }
    }

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
      updatedBy: user?.uid || (user as any)?.id || 'system'
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}/genCom`);
    throw err;
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
    // Enforce strict access control: Only Head Unit Elementary and Super Admin can APPROVE or REQUEST_REVISION
    if (action === 'APPROVE' || action === 'REQUEST_REVISION') {
      if (!isElementaryHeadOrSuperAdmin(user)) {
        throw new Error('Akses ditolak: Hanya Head Unit Elementary dan Super Admin yang berhak menyetujui (Approve) atau meminta revisi General Comment.');
      }
    }

    const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
    const docRef = doc(db, 'elem_midterm_student_data', docId);

    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Student midterm document not found.');

    const data = snap.data();

    // Homeroom teacher cannot modify or withdraw an already APPROVED comment
    if (data?.generalCommentReviewStatus === 'APPROVED' && action !== 'RESET_DRAFT' && !isElementaryHeadOrSuperAdmin(user)) {
      throw new Error('General Comment yang sudah disetujui (APPROVED) tidak dapat diubah oleh Guru Kelas.');
    }

    const history = Array.isArray(data.reviewHistory) ? [...data.reviewHistory] : [];
    const now = Date.now();

    let newStatus: ElementaryMidtermGenComReviewStatus = data.generalCommentReviewStatus || 'DRAFT';
    let historyAction: any = 'DRAFT_SAVED';

    const updatePayload: any = {
      updatedAt: now,
      updatedBy: user.uid || (user as any).id
    };

    const approverName = user.displayName || (user as any).name || (user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Head Unit Elementary');

    if (action === 'SUBMIT_REVIEW') {
      newStatus = 'SUBMITTED_FOR_REVIEW';
      historyAction = 'SUBMITTED_FOR_REVIEW';
      updatePayload.submittedForReviewAt = now;
      updatePayload.submittedForReviewBy = user.uid || (user as any).id;
      updatePayload.submittedForReviewByName = user.displayName || (user as any).name || 'Guru Kelas';
    } else if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      historyAction = 'APPROVED';
      updatePayload.approvedAt = now;
      updatePayload.approvedBy = user.uid || (user as any).id;
      updatePayload.approvedByName = approverName;
    } else if (action === 'REQUEST_REVISION') {
      newStatus = 'REVISION_REQUESTED';
      historyAction = 'REVISION_REQUESTED';
      updatePayload.revisionRequestedAt = now;
      updatePayload.revisionRequestedBy = user.uid || (user as any).id;
      updatePayload.revisionRequestedByName = approverName;
      updatePayload.revisionFeedback = feedback || '';
    } else if (action === 'RESET_DRAFT') {
      newStatus = 'DRAFT';
      historyAction = 'DRAFT_SAVED';
    }

    updatePayload.generalCommentReviewStatus = newStatus;

    history.push({
      action: historyAction,
      actorId: user.uid || (user as any).id,
      actorName: approverName,
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

      generatedBy: payload.user?.uid || (payload.user as any)?.id || 'system',
      generatedByName: payload.user?.displayName || (payload.user as any)?.name || 'System User',
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

export async function saveElementaryMidtermStudentPerformingArtsUa(
  studentId: string,
  studentName: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  performingArtsUA: string,
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
      performingArtsUA,
      updatedAt: Date.now(),
      updatedBy: user?.uid || (user as any)?.id || 'system'
    };

    await setDoc(docRef, payload, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_student_data/${studentId}/performingArtsUA`);
    throw err;
  }
}

export async function saveBulkElementaryMidtermStudentPerformingArtsUa(
  assignments: Array<{
    studentId: string;
    studentName: string;
    classId: string;
    performingArtsUA: string;
  }>,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  user?: User | null
): Promise<void> {
  try {
    if (!assignments || assignments.length === 0) return;

    const chunkSize = 400;
    for (let i = 0; i < assignments.length; i += chunkSize) {
      const chunk = assignments.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach(item => {
        if (!item.studentId || !item.classId) return;
        const docId = buildStudentDataDocId(item.studentId, item.classId, academicYear, semester, midtermTerm);
        const docRef = doc(db, 'elem_midterm_student_data', docId);
        const payload = {
          id: docId,
          studentId: item.studentId,
          studentName: item.studentName || '',
          classId: item.classId,
          academicYear,
          semester,
          midtermTerm,
          performingArtsUA: item.performingArtsUA || '',
          updatedAt: Date.now(),
          updatedBy: user?.uid || (user as any)?.id || 'system'
        };
        batch.set(docRef, payload, { merge: true });
      });

      await batch.commit();
    }
  } catch (err: any) {
    handleFirestoreError(err, 'update', 'elem_midterm_student_data/bulk_performing_arts_ua');
    throw err;
  }
}

export async function fetchElementaryMidtermCustomUas(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<string[]> {
  try {
    const docId = buildMasterGoalDocId(classId, academicYear, semester, midtermTerm, 'performing_arts_custom_uas');
    const docRef = doc(db, 'elem_midterm_master_goals', docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.customUas)) return data.customUas;
    }
    return [];
  } catch (err) {
    console.warn("Could not fetch custom UAs:", err);
    return [];
  }
}

export async function saveElementaryMidtermCustomUas(
  classId: string,
  className: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  customUas: string[],
  user?: User | null
): Promise<void> {
  try {
    const docId = buildMasterGoalDocId(classId, academicYear, semester, midtermTerm, 'performing_arts_custom_uas');
    const docRef = doc(db, 'elem_midterm_master_goals', docId);
    await setDoc(docRef, {
      id: docId,
      classId,
      className,
      academicYear,
      semester,
      midtermTerm,
      category: 'CONFIG',
      subjectKey: 'performing_arts_custom_uas',
      customUas,
      updatedAt: Date.now(),
      updatedBy: user?.uid || (user as any)?.id || 'system'
    }, { merge: true });
  } catch (err: any) {
    handleFirestoreError(err, 'update', `elem_midterm_master_goals/performing_arts_custom_uas`);
  }
}

export const ELEM_STRENGTH_PROGRESS_BANK = [
  'Berpartisipasi aktif dalam diskusi kelas dan tugas kelompok kolaboratif',
  'Menunjukkan rasa ingin tahu yang tinggi, pemikiran kritis, dan antusiasme dalam belajar',
  'Menunjukkan sikap hormat, disiplin, dan interaksi positif dengan teman serta guru',
  'Konsisten menyelesaikan tugas harian dengan tekun dan penuh tanggung jawab',
  'Menampilkan adaptabilitas, kreativitas, dan inisiatif positif dalam kegiatan kelas',
  'Menunjukkan pengelolaan diri yang baik, konsistensi, dan fokus saat belajar mandiri',
  'Mampu mengekspresikan gagasan secara artikulatif dan mendengarkan pendapat orang lain dengan penuh perhatian',
  'Menunjukkan perkembangan akademis yang stabil dan menerima umpan balik dengan positif'
];

export const ELEM_ACHIEVEMENT_BANK = [
  'Berhasil menunjukkan pemahaman yang sangat baik dan kepemimpinan dalam pembelajaran berbasis proyek',
  'Berkontribusi aktif memberikan ide-ide cemerlang dan mengoordinasikan tim dengan efektif dalam kerja kelompok',
  'Mencapai peningkatan signifikan dalam pemecahan masalah dan konsistensi tugas',
  'Menampilkan kreativitas, pemikiran analitis, dan keterampilan presentasi yang sangat baik dalam proyek kelas',
  'Konsisten menghasilkan pekerjaan rumah dan tugas yang rapi serta terorganisasi dengan baik',
  'Dikenal memiliki sportivitas, empati, dan semangat kerja sama yang luar biasa'
];

export const ELEM_NEEDS_IMPROVEMENT_BANK = [
  'mempertahankan fokus yang konsisten dan pengelolaan waktu selama tugas mandiri',
  'lebih aktif mengutarakan pendapat dan berpartisipasi dengan percaya diri dalam diskusi kelas',
  'meningkatkan ketelitian terhadap detail dan memeriksa kembali tugas secara menyeluruh sebelum dikumpulkan',
  'meningkatkan keterampilan organisasi dalam mengelola materi pelajaran dan jadwal harian',
  'berani bertanya untuk meminta klarifikasi atau bimbingan guru ketika menghadapi konsep yang menantang',
  'memperkuat konsistensi dalam menyelesaikan tugas tepat waktu sesuai tenggat yang ditentukan'
];

/**
 * Checks if user is Head Unit Elementary or Super Admin
 */
export function isElementaryHeadOrSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || (user as any).roleId || '').toUpperCase();
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'HEAD_UNIT' || role === 'PRINCIPAL') {
    const unit = (user.unitId || '').toUpperCase();
    return !unit || unit === 'ELEMENTARY';
  }
  return false;
}

/**
 * Checks if user is the assigned homeroom teacher of this class
 */
export function isAssignedHomeroomTeacherOfClass(user: User | null | undefined, classData: Class | null | undefined): boolean {
  if (!user || !classData) return false;
  const uid = user.uid || (user as any).id;
  if (!uid) return false;

  if (classData.homeroomTeacherId === uid) return true;
  if (Array.isArray(classData.homeroomTeacherIds) && classData.homeroomTeacherIds.includes(uid)) return true;
  if (Array.isArray((classData as any).waliKelasIds) && (classData as any).waliKelasIds.includes(uid)) return true;
  if (Array.isArray(classData.assignedTeacherIds) && classData.assignedTeacherIds.includes(uid)) return true;
  if (Array.isArray(classData.teacherAssignments) && classData.teacherAssignments.some(ta => ta.userId === uid)) return true;

  return false;
}

/**
 * Checks if user is the authoring homeroom teacher of a student's general comment
 */
export function isAuthorHomeroomTeacher(
  user: User | null | undefined,
  classData: Class | null | undefined,
  studentData?: ElementaryMidtermStudentDataDoc | null
): boolean {
  if (!user) return false;
  const uid = user.uid || (user as any).id;
  if (!uid) return false;

  // If user is the submitter
  if (studentData?.submittedForReviewBy === uid) return true;

  // Or assigned homeroom teacher of the class
  if (isAssignedHomeroomTeacherOfClass(user, classData)) return true;

  // Or homeroom teacher role of class
  if (user.role === 'TEACHER' || user.role === 'HOMEROOM_TEACHER') {
    if (isHomeroomTeacherOfClass(user, classData)) return true;
  }

  return false;
}

/**
 * Checks if user is homeroom teacher of this class (or admin/head unit)
 */
export function isHomeroomTeacherOfClass(user: User | null | undefined, classData: Class | null | undefined): boolean {
  if (!user || !classData) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HEAD_UNIT') return true;

  const uid = user.uid || (user as any).id;
  if (classData.homeroomTeacherId === uid) return true;
  if (classData.homeroomTeacherIds && Array.isArray(classData.homeroomTeacherIds) && classData.homeroomTeacherIds.includes(uid)) return true;
  if ((classData as any).waliKelasIds && Array.isArray((classData as any).waliKelasIds) && (classData as any).waliKelasIds.includes(uid)) return true;
  if (classData.assignedTeacherIds && Array.isArray(classData.assignedTeacherIds) && classData.assignedTeacherIds.includes(uid)) return true;

  return false;
}

/**
 * Save custom category configurations for an elementary class context
 */
export async function saveElementaryMidtermClassCommentsConfig(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  configData: Partial<any>,
  userUid: string
): Promise<void> {
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${classId}_${normYear}_S${semester}_T${midtermTerm}`;
  const ref = doc(db, 'elem_midterm_class_comments_config', docId);

  const payload = {
    classId,
    academicYear,
    semester: String(semester),
    midtermTerm: String(midtermTerm),
    ...configData,
    updatedAt: Date.now(),
    updatedBy: userUid
  };

  await setDoc(ref, payload, { merge: true });
}

/**
 * Load custom category configurations for an elementary class context
 */
export async function getElementaryMidtermClassCommentsConfig(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<any | null> {
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${classId}_${normYear}_S${semester}_T${midtermTerm}`;
  const ref = doc(db, 'elem_midterm_class_comments_config', docId);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return snap.data();
}

/**
 * Submit Elementary General Comments for review by Homeroom Teacher
 */
export async function submitElementaryMidtermGeneralCommentForReview(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  userUid: string,
  userName: string,
  userRole: string,
  commentSnapshot: string
): Promise<void> {
  const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'elem_midterm_student_data', docId);

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as ElementaryMidtermStudentDataDoc) : null;

  if (existing?.generalCommentReviewStatus === 'APPROVED') {
    throw new Error('General Comment yang sudah disetujui (APPROVED) tidak dapat diajukan kembali.');
  }
  
  const history = Array.isArray(existing?.reviewHistory) ? [...existing.reviewHistory] : [];
  const previousStatus = existing?.generalCommentReviewStatus || 'DRAFT';
  const action = previousStatus === 'REVISION_REQUESTED' ? 'RESUBMITTED_FOR_REVIEW' : 'SUBMITTED_FOR_REVIEW';

  const entry: ElementaryMidtermReviewHistoryEntry = {
    action: 'SUBMITTED_FOR_REVIEW',
    actorId: userUid,
    actorName: userName,
    actorRole: userRole,
    timestamp: Date.now(),
    commentSnapshot: commentSnapshot || ''
  };
  history.push(entry);

  const currentVersion = Number(existing?.reviewVersion ?? 0);
  const nextVersion = action === 'SUBMITTED_FOR_REVIEW' ? currentVersion + 1 : currentVersion;

  await setDoc(ref, {
    generalCommentReviewStatus: 'SUBMITTED_FOR_REVIEW',
    submittedForReviewAt: Date.now(),
    submittedForReviewBy: userUid,
    submittedForReviewByName: userName,
    reviewVersion: nextVersion,
    reviewHistory: history,
    updatedAt: Date.now(),
    updatedBy: userUid
  }, { merge: true });
}

/**
 * Withdraw Elementary General Comments from review by Homeroom Teacher
 */
export async function withdrawElementaryMidtermGeneralCommentFromReview(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  user: User,
  classData?: Class | null
): Promise<void> {
  const docId = buildStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'elem_midterm_student_data', docId);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Data midterm siswa tidak ditemukan.');
  }

  const existing = snap.data() as ElementaryMidtermStudentDataDoc;
  const currentStatus = existing.generalCommentReviewStatus || 'DRAFT';

  if (currentStatus === 'APPROVED') {
    throw new Error('General Comment yang sudah disetujui (APPROVED) tidak dapat ditarik kembali.');
  }

  if (currentStatus !== 'SUBMITTED_FOR_REVIEW' && (currentStatus as string) !== 'PENDING_REVIEW') {
    throw new Error('Hanya General Comment dengan status Menunggu Review yang dapat ditarik kembali.');
  }

  const userUid = user.uid || (user as any).id;
  const isSubmitter = existing.submittedForReviewBy === userUid;
  const isClassTeacher = classData ? isHomeroomTeacherOfClass(user, classData) : false;
  const isHeadOrAdmin = isElementaryHeadOrSuperAdmin(user);

  if (!isSubmitter && !isClassTeacher && !isHeadOrAdmin) {
    throw new Error('Hanya Guru Kelas penyusun yang berhak menarik kembali pengajuan General Comment ini.');
  }

  const now = Date.now();
  const history = Array.isArray(existing.reviewHistory) ? [...existing.reviewHistory] : [];
  const commentSnapshot = existing.generalComment?.finalComment || existing.generalComment?.aiDraft || '';

  history.push({
    action: 'WITHDRAWN_FROM_REVIEW',
    actorId: userUid,
    actorName: user.displayName || (user as any).name || 'Guru Kelas',
    actorRole: user.role || 'Homeroom Teacher',
    timestamp: now,
    commentSnapshot
  });

  await updateDoc(ref, {
    generalCommentReviewStatus: 'DRAFT',
    submittedForReviewAt: null,
    submittedForReviewBy: null,
    submittedForReviewByName: null,
    reviewHistory: history,
    updatedAt: now,
    updatedBy: userUid
  });
}

/**
 * Generates General Comment draft using the secure server-side AI endpoint for Elementary
 */
export async function generateElementaryMidtermGeneralCommentAI(params: {
  studentName: string;
  nickname?: string;
  strengths: string[];
  achievements: string[];
  needsImprovement: string[];
  manualNotes?: string;
}): Promise<string> {
  const { auth } = await import('../lib/firebase');
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Sesi login telah berakhir. Silakan refresh halaman.');
  }

  const response = await fetch('/api/elementary/midterm/generate-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studentName: params.studentName,
      nickname: params.nickname,
      strengths: params.strengths,
      achievements: params.achievements,
      needsImprovement: params.needsImprovement,
      manualNotes: params.manualNotes,
    }),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.error || 'AI belum dapat digunakan. Silakan coba lagi atau isi komentar secara manual.');
  }

  return resJson.text || '';
}

/**
 * Polishes teacher comment draft using the secure server-side AI endpoint for Elementary
 */
export async function refineElementaryMidtermGeneralCommentAI(params: {
  draftText?: string;
  originalComment?: string;
  studentName?: string;
  nickname?: string;
}): Promise<string> {
  const { auth } = await import('../lib/firebase');
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Sesi login telah berakhir. Silakan refresh halaman.');
  }

  const originalComment = (params.originalComment || params.draftText || '').trim();
  if (!originalComment) {
    throw new Error('Teks komentar tidak boleh kosong.');
  }

  const response = await fetch('/api/elementary/midterm/refine-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studentName: params.studentName,
      nickname: params.nickname,
      originalComment,
    }),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.error || 'AI belum dapat digunakan. Silakan coba lagi.');
  }

  return resJson.text || '';
}
