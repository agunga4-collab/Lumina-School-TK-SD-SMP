import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  increment,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { 
  MidtermMasterGoalDoc, 
  MidtermStudentDataDoc, 
  PublishedMidtermReport,
  MidtermGeneralCommentData,
  MidtermReportStatus,
  MidtermClassCommentsConfig,
  MidtermReviewHistoryEntry,
  MidtermGenComReviewStatus
} from '../types/midtermReport';
import { JH_MIDTERM_CATEGORIES } from '../types/midtermReport';
import type { User, Class, Student } from '../types';

export const MIDTERM_REMARKS_CONFIG = [
  { code: 'A', label: 'Achieved', description: 'Menguasai' },
  { code: 'D', label: 'Developing', description: 'Sudah memahami, perlu peningkatan' },
  { code: 'B', label: 'Beginning', description: 'Masih perlu bantuan' },
] as const;

export const SPIRITUAL_HEALTH_OPTIONS = [
  'Sangat Baik',
  'Baik',
  'Cukup'
];

export const STRENGTH_PROGRESS_BANK = [
  'Actively participates in class discussions and collaborative group tasks',
  'Demonstrates strong curiosity, critical thinking, and enthusiasm for learning',
  'Shows a respectful attitude, discipline, and positive engagement with peers and teachers',
  'Consistently completes daily assignments with diligence and high responsibility',
  'Displays strong adaptability, creativity, and positive initiative during classroom activities',
  'Demonstrates good self-management, consistency, and focus during independent learning sessions',
  'Expresses ideas articulately and listens attentively to diverse perspectives',
  'Shows steady academic progress and takes constructive feedback positively'
];

export const ACHIEVEMENT_BANK = [
  'Successfully demonstrated excellent understanding and leadership in project-based learning',
  'Actively contributed insightful ideas and coordinated team efforts effectively in group work',
  'Achieved notable improvement in problem-solving and task consistency',
  'Showcased commendable creativity, analytical thinking, and presentation skills in class projects',
  'Consistently produced thorough, well-organized coursework across all learning units',
  'Recognized for exceptional sportsmanship, empathy, and collaborative spirit'
];

export const NEEDS_IMPROVEMENT_BANK = [
  'maintain consistent focus and time management during independent work',
  'actively express opinions and participate more confidently in classroom discussions',
  'improve attention to detail and review work thoroughly before submission',
  'enhance organizational skills in managing daily learning materials and schedules',
  'seek timely clarification and guidance from teachers when encountering challenging concepts',
  'strengthen consistency in completing tasks within designated deadlines'
];

/**
 * Checks if user is homeroom teacher of this class
 */
export function isHomeroomTeacherOfClass(user: User | null | undefined, classData: Class | null | undefined): boolean {
  if (!user || !classData) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'HEAD_JUNIOR') return true;

  const uid = user.uid;
  if (classData.homeroomTeacherId === uid) return true;
  if (classData.homeroomTeacherIds && Array.isArray(classData.homeroomTeacherIds) && classData.homeroomTeacherIds.includes(uid)) return true;
  if ((classData as any).waliKelasIds && Array.isArray((classData as any).waliKelasIds) && (classData as any).waliKelasIds.includes(uid)) return true;

  if (classData.teacherAssignments && Array.isArray(classData.teacherAssignments)) {
    const isPrimaryOrHomeroom = classData.teacherAssignments.some(
      a => a.userId === uid && a.role === 'HOMEROOM_TEACHER'
    );
    if (isPrimaryOrHomeroom) return true;
  }

  return false;
}

/**
 * Checks if a teacher is assigned to this class (homeroom, GPK, or assigned teacher)
 */
export function isTeacherAssignedToClass(user: User | null | undefined, classData: Class | null | undefined): boolean {
  if (!user || !classData) return false;
  if (['SUPER_ADMIN', 'HEAD_JUNIOR', 'HEAD_UNIT', 'SECRETARY_JH'].includes(user.role)) return true;
  if (isHomeroomTeacherOfClass(user, classData)) return true;

  const uid = user.uid;
  if (classData.assignedTeacherIds && Array.isArray(classData.assignedTeacherIds) && classData.assignedTeacherIds.includes(uid)) return true;
  if (classData.teacherAssignments && Array.isArray(classData.teacherAssignments) && classData.teacherAssignments.some(a => a.userId === uid)) return true;

  return false;
}

/**
 * Permission: Edit Learning Goals & Remarks
 */
export function canUserEditMidtermGoals(
  user: User | null | undefined, 
  classData: Class | null | undefined, 
  subjectKey?: string
): boolean {
  if (!user) return false;
  const role = user.role;
  const unitId = user.unitId || (user as any).unit || '';

  // Super Admin, Head JH, Secretary JH can edit all goals
  if (['SUPER_ADMIN', 'HEAD_JUNIOR', 'SECRETARY_JH'].includes(role)) {
    return true;
  }

  // BK Mentor, MTSS PJ are read-only
  if (['BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'COUNSELOR'].includes(role)) {
    return false;
  }

  // If unitId is JUNIOR_HIGH/ALL and role is TEACHER/HOMEROOM_TEACHER, allow editing for JH classes!
  if (
    (unitId === 'JUNIOR_HIGH' || unitId === 'ALL') &&
    (role === 'TEACHER' || role === 'HOMEROOM_TEACHER') &&
    (!classData || classData.unitId === 'JUNIOR_HIGH')
  ) {
    return true;
  }

  // Homeroom can edit goals for their class
  if (isHomeroomTeacherOfClass(user, classData)) {
    return true;
  }

  // Subject Teacher: can edit if assigned to class/subject
  if (role === 'TEACHER' || role === 'HOMEROOM_TEACHER') {
    // If teacher is assigned to this class, they can edit
    return isTeacherAssignedToClass(user, classData);
  }

  return false;
}

/**
 * Permission: Edit General Comments
 */
export function canUserEditMidtermGeneralComments(
  user: User | null | undefined, 
  classData: Class | null | undefined
): boolean {
  if (!user) return false;
  const role = user.role;
  const unitId = user.unitId;

  // New permission: allow if unitId is JUNIOR_HIGH/ALL or if role is SUPER_ADMIN/PRINCIPAL/HEAD_UNIT/HEAD_JUNIOR
  if (
    unitId === 'JUNIOR_HIGH' ||
    unitId === 'ALL' ||
    ['SUPER_ADMIN', 'PRINCIPAL', 'HEAD_UNIT', 'HEAD_JUNIOR'].includes(role)
  ) {
    return true;
  }

  // Homeroom Teacher can edit ONLY for their homeroom class
  if (isHomeroomTeacherOfClass(user, classData)) {
    return true;
  }

  // Secretary JH, Subject Teacher, BK Mentor, MTSS PJ: read-only
  return false;
}

/**
 * Permission: Publish Midterm PDF
 */
export function canUserPublishMidterm(
  user: User | null | undefined, 
  classData: Class | null | undefined
): boolean {
  if (!user) return false;
  const role = user.role;

  // Super Admin, Head JH, Secretary JH can publish all
  if (['SUPER_ADMIN', 'HEAD_JUNIOR', 'SECRETARY_JH'].includes(role)) {
    return true;
  }

  // Homeroom Teacher can publish ONLY for their homeroom class
  if (isHomeroomTeacherOfClass(user, classData)) {
    return true;
  }

  // Subject Teacher, BK Mentor, MTSS PJ: cannot publish
  return false;
}

/**
 * Helper to normalize academic year (e.g., '2025/2026' -> '2025-2026')
 */
export function normalizeAcademicYear(year: string): string {
  return (year || '').replace(/\//g, '-');
}

/**
 * Helper to create deterministic Master Goal doc ID
 */
export function getMasterGoalDocId(
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string, 
  subjectKey: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  const cleanSubject = subjectKey.replace(/[^a-zA-Z0-9]/g, '_');
  return `${classId}_${normYear}_sem${semester}_term${midtermTerm}_${cleanSubject}`;
}

/**
 * Helper to create deterministic Student Midterm Data doc ID
 */
export function getStudentDataDocId(
  studentId: string, 
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string
): string {
  const normYear = normalizeAcademicYear(academicYear);
  return `${studentId}_${classId}_${normYear}_sem${semester}_term${midtermTerm}`;
}

/**
 * Fetch master goals for a specific class, academic year, semester, and midterm term
 */
export async function fetchMidtermMasterGoals(
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string
): Promise<Record<string, MidtermMasterGoalDoc>> {
  if (!classId || !academicYear || !semester || !midtermTerm) return {};

  try {
    const q = query(
      collection(db, 'jh_midterm_master_goals'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', String(semester)),
      where('midtermTerm', '==', String(midtermTerm))
    );

    const snapshot = await getDocs(q);
    const goalsMap: Record<string, MidtermMasterGoalDoc> = {};
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as MidtermMasterGoalDoc;
      goalsMap[data.subjectKey] = {
        ...data,
        id: docSnap.id,
      };
    });

    return goalsMap;
  } catch (err) {
    console.error('Error fetching midterm master goals:', err);
    throw err;
  }
}

/**
 * Extract Grade level number for Junior High class (e.g. 7, 8, 9)
 */
export function getJHGradeLevelNumber(classObj: Class | null | undefined): number {
  if (!classObj) return 0;
  if (classObj.grade !== undefined && classObj.grade !== null && !isNaN(Number(classObj.grade))) {
    const num = Number(classObj.grade);
    if (num > 0) return num;
  }
  const match = (classObj.name || '').match(/\b(7|8|9|10|11|12|1|2|3|4|5|6)\b/);
  if (match) return parseInt(match[1], 10);
  const digitMatch = (classObj.name || '').match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0], 10);
  return 0;
}

/**
 * Save master goal document
 */
export async function saveMidtermMasterGoal(
  goalDoc: Omit<MidtermMasterGoalDoc, 'id' | 'updatedAt'> & { id?: string }
): Promise<void> {
  const docId = getMasterGoalDocId(
    goalDoc.classId, 
    goalDoc.academicYear, 
    goalDoc.semester, 
    goalDoc.midtermTerm, 
    goalDoc.subjectKey
  );

  const ref = doc(db, 'jh_midterm_master_goals', docId);
  const payload = {
    ...goalDoc,
    id: docId,
    updatedAt: Date.now()
  };

  await setDoc(ref, payload, { merge: true });
}

/**
 * Save bulk master goal across multiple classes in the same grade.
 * Does not overwrite existing goals, remarks, or general comments.
 * Avoids duplicate goals on target classes.
 */
export async function saveBulkMidtermMasterGoalForClasses(
  targetClasses: Class[],
  academicYear: string,
  semester: string,
  midtermTerm: string,
  category: string,
  subjectKey: string,
  newGoalText: string,
  currentUser: User
): Promise<void> {
  if (!targetClasses || targetClasses.length === 0 || !newGoalText.trim()) return;

  const cleanText = newGoalText.trim();

  for (const targetClass of targetClasses) {
    if (!targetClass || !targetClass.id) continue;

    const docId = getMasterGoalDocId(
      targetClass.id,
      academicYear,
      semester,
      midtermTerm,
      subjectKey
    );

    const ref = doc(db, 'jh_midterm_master_goals', docId);
    const snap = await getDoc(ref);

    let existingGoals: any[] = [];
    let existingData: Partial<MidtermMasterGoalDoc> = {};

    if (snap.exists()) {
      existingData = snap.data() as MidtermMasterGoalDoc;
      if (Array.isArray(existingData.goals)) {
        existingGoals = existingData.goals;
      }
    }

    // Check duplicate
    const isDuplicate = existingGoals.some(
      g => (g?.text || '').trim().toLowerCase() === cleanText.toLowerCase()
    );

    if (!isDuplicate) {
      const newGoal = {
        id: `goal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        text: cleanText,
        order: existingGoals.length + 1
      };

      const updatedGoals = [...existingGoals, newGoal];

      const payload: MidtermMasterGoalDoc = {
        id: docId,
        classId: targetClass.id,
        className: targetClass.name || 'Kelas',
        academicYear,
        semester: String(semester),
        midtermTerm: String(midtermTerm),
        category,
        subjectKey,
        goals: updatedGoals,
        updatedAt: Date.now(),
        updatedBy: currentUser.uid,
        updatedByName: currentUser.displayName || (currentUser as any).name || 'Guru'
      };

      await setDoc(ref, payload, { merge: true });
    }
  }
}

/**
 * Fetch student midterm data docs for a class
 */
export async function fetchMidtermStudentData(
  classId: string, 
  academicYear: string, 
  semester: string, 
  midtermTerm: string
): Promise<Record<string, MidtermStudentDataDoc>> {
  if (!classId || !academicYear || !semester || !midtermTerm) return {};

  try {
    const q = query(
      collection(db, 'jh_midterm_student_data'),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', String(semester)),
      where('midtermTerm', '==', String(midtermTerm))
    );

    const snapshot = await getDocs(q);
    const map: Record<string, MidtermStudentDataDoc> = {};

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      map[data.studentId] = normalizeMidtermStudentData(data, {
        studentId: data.studentId,
        studentName: data.studentName || 'Siswa',
        classId,
        academicYear,
        semester,
        midtermTerm
      });
    });

    return map;
  } catch (err) {
    console.error('Error fetching midterm student data:', err);
    throw err;
  }
}

/**
 * Save student remark for a specific learning goal
 */
export async function saveMidtermStudentRemark(
  studentId: string,
  studentName: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  remark: string,
  userUid: string,
  isSpiritualHealth?: boolean
): Promise<void> {
  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const existingSnap = await getDoc(ref);
  const existingData = existingSnap.exists() ? (existingSnap.data() as MidtermStudentDataDoc) : null;

  const currentRemarks = existingData?.remarks || {};
  const updatedRemarks = {
    ...currentRemarks,
    [goalId]: remark
  };

  const payload: Partial<MidtermStudentDataDoc> = {
    studentId,
    studentName,
    classId,
    academicYear,
    semester: String(semester),
    midtermTerm: String(midtermTerm),
    remarks: updatedRemarks,
    updatedAt: Date.now(),
    updatedBy: userUid
  };

  if (isSpiritualHealth) {
    payload.spiritualHealthRemark = remark;
  }

  if (!existingData) {
    payload.status = 'DRAFT';
    payload.generalComment = {
      strengths: [],
      achievements: [],
      needsImprovement: []
    };
  }

  await setDoc(ref, payload, { merge: true });
}

/**
 * Save bulk student remarks for a specific learning goal across all students in a class
 */
export async function saveBulkMidtermStudentRemarks(
  students: { id: string; name: string }[],
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  goalId: string,
  remark: string,
  userUid: string,
  studentDataMap?: Record<string, MidtermStudentDataDoc>,
  isSpiritualHealth?: boolean
): Promise<void> {
  if (!students || students.length === 0 || !classId) return;

  const batch = writeBatch(db);

  for (const student of students) {
    if (!student?.id) continue;

    const docId = getStudentDataDocId(student.id, classId, academicYear, semester, midtermTerm);
    const ref = doc(db, 'jh_midterm_student_data', docId);

    const existingData = studentDataMap ? studentDataMap[student.id] : null;
    const currentRemarks = existingData?.remarks || {};
    const updatedRemarks = {
      ...currentRemarks,
      [goalId]: remark
    };

    const payload: Partial<MidtermStudentDataDoc> = {
      studentId: student.id,
      studentName: student.name || 'Siswa',
      classId,
      academicYear,
      semester: String(semester),
      midtermTerm: String(midtermTerm),
      remarks: updatedRemarks,
      updatedAt: Date.now(),
      updatedBy: userUid
    };

    if (isSpiritualHealth) {
      payload.spiritualHealthRemark = remark;
    }

    if (!existingData) {
      payload.status = 'DRAFT';
      payload.generalComment = {
        strengths: [],
        achievements: [],
        needsImprovement: []
      };
    }

    batch.set(ref, payload, { merge: true });
  }

  await batch.commit();
}

/**
 * Save student general comments
 */
export async function saveMidtermStudentGeneralComment(
  studentId: string,
  studentName: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  commentData: MidtermGeneralCommentData,
  userUid: string,
  actorName?: string,
  actorRole?: string
): Promise<void> {
  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const existingSnap = await getDoc(ref);
  const existingData = existingSnap.exists() ? (existingSnap.data() as MidtermStudentDataDoc) : null;

  let reviewStatus = existingData?.generalCommentReviewStatus || 'DRAFT';
  const history = Array.isArray(existingData?.reviewHistory) ? [...existingData.reviewHistory] : [];

  if (reviewStatus === 'REVISION_REQUESTED') {
    reviewStatus = 'DRAFT';
    history.push({
      action: 'DRAFT_SAVED',
      actorId: userUid,
      actorName: actorName || 'Guru',
      actorRole: actorRole || 'Homeroom Teacher',
      timestamp: Date.now(),
      commentSnapshot: commentData.finalComment || ''
    });
  } else if (!existingData?.generalCommentReviewStatus) {
    reviewStatus = 'DRAFT';
  }

  const payload: Partial<MidtermStudentDataDoc> = {
    studentId,
    studentName,
    classId,
    academicYear,
    semester: String(semester),
    midtermTerm: String(midtermTerm),
    generalComment: {
      ...commentData,
      updatedAt: Date.now(),
      updatedBy: userUid
    },
    generalCommentReviewStatus: reviewStatus,
    reviewHistory: history,
    updatedAt: Date.now(),
    updatedBy: userUid
  };

  if (!existingData) {
    payload.status = 'DRAFT';
    payload.remarks = {};
  }

  await setDoc(ref, payload, { merge: true });
}

/**
 * Calculate completeness and status for a student report
 */
export function evaluateStudentMidtermStatus(
  student: Student | null | undefined,
  masterGoalsMap: Record<string, MidtermMasterGoalDoc> | null | undefined,
  studentDataDoc: MidtermStudentDataDoc | undefined | null,
  isPublishedAlready: boolean
): {
  status: MidtermReportStatus;
  isReady: boolean;
  totalGoals: number;
  completedGoals: number;
  missingGoalsSubjects: string[];
  hasFinalComment: boolean;
  issues: string[];
} {
  if (isPublishedAlready) {
    return {
      status: 'PUBLISHED',
      isReady: true,
      totalGoals: 0,
      completedGoals: 0,
      missingGoalsSubjects: [],
      hasFinalComment: true,
      issues: []
    };
  }

  const issues: string[] = [];
  const missingGoalsSubjects: string[] = [];
  let totalGoals = 0;
  let completedGoals = 0;

  const safeMasterGoals = masterGoalsMap && typeof masterGoalsMap === 'object' ? masterGoalsMap : {};
  const remarks = (studentDataDoc?.remarks && typeof studentDataDoc.remarks === 'object') ? studentDataDoc.remarks : {};

  // Check all subjects across all categories
  const categories = Array.isArray(JH_MIDTERM_CATEGORIES) ? JH_MIDTERM_CATEGORIES : [];
  for (const cat of categories) {
    const subjects = Array.isArray(cat?.subjects) ? cat.subjects : [];
    for (const subj of subjects) {
      if (!subj) continue;
      const masterGoal = safeMasterGoals[subj];
      const goals = Array.isArray(masterGoal?.goals) ? masterGoal.goals : [];
      if (!masterGoal || goals.length === 0) {
        missingGoalsSubjects.push(subj);
        issues.push(`Learning Goals untuk ${subj} belum diisi.`);
      } else {
        for (const g of goals) {
          if (!g) continue;
          totalGoals++;
          const rem = remarks[g.id];
          if (typeof rem === 'string' && rem.trim().length > 0) {
            completedGoals++;
          } else {
            const goalText = typeof g.text === 'string' ? g.text : '';
            issues.push(`Remark untuk "${goalText.slice(0, 30)}..." (${subj}) belum diisi.`);
          }
        }
      }
    }
  }

  const rawComment = studentDataDoc?.generalComment?.finalComment;
  const finalComment = typeof rawComment === 'string' ? rawComment.trim() : '';
  const hasFinalComment = Boolean(finalComment);
  if (!hasFinalComment) {
    issues.push('General Comments belum diisi atau belum difinalisasi.');
  }

  const isReady = missingGoalsSubjects.length === 0 && totalGoals > 0 && completedGoals === totalGoals && hasFinalComment;
  const status: MidtermReportStatus = isReady ? 'READY_TO_PUBLISH' : 'DRAFT';

  return {
    status,
    isReady,
    totalGoals,
    completedGoals,
    missingGoalsSubjects,
    hasFinalComment,
    issues
  };
}

/**
 * Generates General Comment draft using the secure server-side AI endpoint
 */
export async function generateMidtermGeneralCommentAI(params: {
  studentName: string;
  nickname?: string;
  gender: 'MALE' | 'FEMALE';
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

  const response = await fetch('/api/junior-high/midterm/generate-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studentName: params.studentName,
      nickname: params.nickname,
      gender: params.gender,
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
 * Polishes teacher comment draft using the secure server-side AI endpoint
 */
export async function refineMidtermGeneralCommentAI(params: {
  draftText?: string;
  originalComment?: string;
  gender: 'MALE' | 'FEMALE';
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

  const response = await fetch('/api/junior-high/midterm/refine-general-comment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      studentName: params.studentName,
      nickname: params.nickname,
      gender: params.gender,
      originalComment,
    }),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.error || 'AI belum dapat digunakan. Silakan coba lagi atau isi komentar secara manual.');
  }

  return resJson.refinedText || resJson.text || '';
}

/**
 * Calculates next version number for a student's published report
 */
export async function getNextMidtermReportVersion(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<number> {
  try {
    const q = query(
      collection(db, 'jh_midterm_published_reports'),
      where('studentId', '==', studentId),
      where('classId', '==', classId),
      where('academicYear', '==', academicYear),
      where('semester', '==', String(semester)),
      where('midtermTerm', '==', String(midtermTerm))
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return 1;

    let maxVer = 0;
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (typeof data.version === 'number' && data.version > maxVer) {
        maxVer = data.version;
      }
    });

    return maxVer + 1;
  } catch (err) {
    console.error('Error calculating next version:', err);
    return 1;
  }
}

/**
 * Saves published report snapshot to Firestore
 */
export async function savePublishedMidtermReport(
  report: Omit<PublishedMidtermReport, 'createdAt' | 'updatedAt' | 'isOpened' | 'firstOpenedAt' | 'lastOpenedAt' | 'openCount' | 'openedByEmail'>
): Promise<void> {
  const normYear = normalizeAcademicYear(report.academicYear);
  const docId = `JH_MIDTERM_REPORT_${report.studentId}_${report.classId}_${normYear}_sem${report.semester}_term${report.midtermTerm}_v${report.version}`;
  const ref = doc(db, 'jh_midterm_published_reports', docId);

  const fullPayload: PublishedMidtermReport = {
    ...report,
    id: docId,
    unit: 'JUNIOR_HIGH',
    reportType: 'MIDTERM_REPORT',
    isOpened: false,
    firstOpenedAt: null,
    lastOpenedAt: null,
    openCount: 0,
    openedByEmail: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await setDoc(ref, fullPayload);
}

/**
 * Fetch published reports for rekap or latest view
 */
export async function fetchPublishedMidtermReports(filters: {
  classId?: string;
  academicYear?: string;
  semester?: string;
  midtermTerm?: string;
  studentId?: string;
}): Promise<PublishedMidtermReport[]> {
  try {
    const constraints: any[] = [
      where('unit', '==', 'JUNIOR_HIGH'),
      where('reportType', '==', 'MIDTERM_REPORT')
    ];

    if (filters.classId) constraints.push(where('classId', '==', filters.classId));
    if (filters.academicYear) constraints.push(where('academicYear', '==', filters.academicYear));
    if (filters.semester) constraints.push(where('semester', '==', String(filters.semester)));
    if (filters.midtermTerm) constraints.push(where('midtermTerm', '==', String(filters.midtermTerm)));
    if (filters.studentId) constraints.push(where('studentId', '==', filters.studentId));

    const q = query(collection(db, 'jh_midterm_published_reports'), ...constraints);
    const snap = await getDocs(q);

    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PublishedMidtermReport));
  } catch (err) {
    console.error('Error fetching published reports:', err);
    return [];
  }
}

/**
 * Record Parent Open Tracking
 * Only increases if opened by authorized parent account.
 * Deduplicates multiple hits in the same browser session.
 */
export async function recordParentMidtermReportOpen(
  reportId: string, 
  parentEmail: string, 
  studentId: string
): Promise<boolean> {
  if (!reportId || !parentEmail || !studentId) return false;

  const sessionKey = `jh_midterm_opened_${reportId}_${parentEmail}`;
  if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey)) {
    // Already counted in this session
    return false;
  }

  try {
    const reportRef = doc(db, 'jh_midterm_published_reports', reportId);
    const reportSnap = await getDoc(reportRef);
    if (!reportSnap.exists()) return false;

    const reportData = reportSnap.data() as PublishedMidtermReport;
    if (reportData.studentId !== studentId) return false;

    const now = Date.now();
    const isFirstOpen = !reportData.isOpened;

    if (isFirstOpen) {
      await updateDoc(reportRef, {
        isOpened: true,
        firstOpenedAt: now,
        lastOpenedAt: now,
        openCount: 1,
        openedByEmail: parentEmail,
        updatedAt: now,
      });
    } else {
      await updateDoc(reportRef, {
        lastOpenedAt: now,
        openCount: increment(1),
        openedByEmail: parentEmail,
        updatedAt: now,
      });
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(sessionKey, '1');
    }
    return true;
  } catch (err) {
    console.error('Error recording parent midterm report open:', err);
    return false;
  }
}

export const recordMidtermReportOpen = (reportId: string, parentEmail: string, studentId: string = '') =>
  recordParentMidtermReportOpen(reportId, parentEmail, studentId || 'unknown');

/**
 * Normalizes raw Firestore document data for Midterm student record.
 * Ensures all nested objects and arrays are safely initialized to avoid runtime crashes.
 */
export function normalizeMidtermStudentData(
  raw: any, 
  context: { 
    studentId: string; 
    classId: string; 
    academicYear: string; 
    semester: string; 
    midtermTerm: string; 
    studentName: string;
  }
): MidtermStudentDataDoc {
  const remarks = raw?.remarks && typeof raw.remarks === 'object' ? raw.remarks : {};
  const spiritualRemark = typeof raw?.spiritualHealthRemark === 'string' 
    ? raw.spiritualHealthRemark 
    : '';

  // Safe comment builder / general comments object
  const rawGC = raw?.generalComment;
  const generalComment: MidtermGeneralCommentData = {
    studentName: typeof rawGC?.studentName === 'string' ? rawGC.studentName : context.studentName,
    nickname: typeof rawGC?.nickname === 'string' ? rawGC.nickname : '',
    gender: (rawGC?.gender === 'FEMALE' || rawGC?.gender === 'P') ? 'FEMALE' : 'MALE',
    strengths: Array.isArray(rawGC?.strengths) ? rawGC.strengths : [],
    achievements: Array.isArray(rawGC?.achievements) ? rawGC.achievements : [],
    needsImprovement: Array.isArray(rawGC?.needsImprovement) ? rawGC.needsImprovement : [],
    manualNotes: typeof rawGC?.manualNotes === 'string' ? rawGC.manualNotes : '',
    aiDraft: typeof rawGC?.aiDraft === 'string' ? rawGC.aiDraft : '',
    finalComment: typeof rawGC?.finalComment === 'string' ? rawGC.finalComment : '',
    isFinal: Boolean(rawGC?.isFinal)
  };

  const commentBuilder = {
    strengths: Array.isArray(raw?.commentBuilder?.strengths) 
      ? raw.commentBuilder.strengths 
      : (Array.isArray(rawGC?.strengths) ? rawGC.strengths : []),
    achievements: Array.isArray(raw?.commentBuilder?.achievements) 
      ? raw.commentBuilder.achievements 
      : (Array.isArray(rawGC?.achievements) ? rawGC.achievements : []),
    needsImprovement: Array.isArray(raw?.commentBuilder?.needsImprovement) 
      ? raw.commentBuilder.needsImprovement 
      : (Array.isArray(rawGC?.needsImprovement) ? rawGC.needsImprovement : []),
    manualNotes: typeof raw?.commentBuilder?.manualNotes === 'string' 
      ? raw.commentBuilder.manualNotes 
      : (typeof rawGC?.manualNotes === 'string' ? rawGC.manualNotes : ''),
    aiDraftText: typeof raw?.commentBuilder?.aiDraftText === 'string' 
      ? raw.commentBuilder.aiDraftText 
      : (typeof rawGC?.aiDraft === 'string' ? rawGC.aiDraft : '')
  };

  const attendance = {
    sakit: Number(raw?.attendance?.sakit ?? 0),
    izin: Number(raw?.attendance?.izin ?? 0),
    tanpaKeterangan: Number(raw?.attendance?.tanpaKeterangan ?? 0)
  };

  const status: MidtermReportStatus = (raw?.status === 'PUBLISHED' || raw?.status === 'READY_TO_PUBLISH' || raw?.status === 'DRAFT')
    ? raw.status
    : 'DRAFT';

  const reviewStatus: any = (raw?.generalCommentReviewStatus === 'APPROVED' || 
    raw?.generalCommentReviewStatus === 'SUBMITTED_FOR_REVIEW' || 
    raw?.generalCommentReviewStatus === 'REVISION_REQUESTED' || 
    raw?.generalCommentReviewStatus === 'DRAFT')
    ? raw.generalCommentReviewStatus
    : 'DRAFT';

  return {
    id: raw?.id ?? getStudentDataDocId(context.studentId, context.classId, context.academicYear, context.semester, context.midtermTerm),
    studentId: raw?.studentId ?? context.studentId,
    studentName: raw?.studentName ?? context.studentName,
    classId: raw?.classId ?? context.classId,
    academicYear: raw?.academicYear ?? context.academicYear,
    semester: String(raw?.semester ?? context.semester),
    midtermTerm: String(raw?.midtermTerm ?? context.midtermTerm),
    remarks,
    spiritualHealthRemark: spiritualRemark,
    generalComment,
    commentBuilder,
    attendance,
    status,
    generalCommentReviewStatus: reviewStatus,
    submittedForReviewAt: raw?.submittedForReviewAt ? Number(raw.submittedForReviewAt) : undefined,
    submittedForReviewBy: typeof raw?.submittedForReviewBy === 'string' ? raw.submittedForReviewBy : undefined,
    submittedForReviewByName: typeof raw?.submittedForReviewByName === 'string' ? raw.submittedForReviewByName : undefined,
    approvedAt: raw?.approvedAt ? Number(raw.approvedAt) : undefined,
    approvedBy: typeof raw?.approvedBy === 'string' ? raw.approvedBy : undefined,
    approvedByName: typeof raw?.approvedByName === 'string' ? raw.approvedByName : undefined,
    revisionRequestedAt: raw?.revisionRequestedAt ? Number(raw.revisionRequestedAt) : undefined,
    revisionRequestedBy: typeof raw?.revisionRequestedBy === 'string' ? raw.revisionRequestedBy : undefined,
    revisionRequestedByName: typeof raw?.revisionRequestedByName === 'string' ? raw.revisionRequestedByName : undefined,
    revisionFeedback: typeof raw?.revisionFeedback === 'string' ? raw.revisionFeedback : undefined,
    reviewVersion: raw?.reviewVersion ? Number(raw.reviewVersion) : undefined,
    reviewHistory: Array.isArray(raw?.reviewHistory) ? raw.reviewHistory : [],
    updatedAt: Number(raw?.updatedAt ?? Date.now()),
    updatedBy: typeof raw?.updatedBy === 'string' ? raw.updatedBy : ''
  };
}

/**
 * Utility to get a normalized draft document for a student when no Firestore record exists.
 */
export function getDraftMidtermStudentData(
  student: Student,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): MidtermStudentDataDoc {
  return normalizeMidtermStudentData(null, {
    studentId: student.id,
    studentName: student.name,
    classId,
    academicYear,
    semester,
    midtermTerm
  });
}

/**
 * Save custom category configurations for a class context
 */
export async function saveMidtermClassCommentsConfig(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  configData: Partial<MidtermClassCommentsConfig>,
  userUid: string
): Promise<void> {
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${classId}_${normYear}_${semester}_${midtermTerm}`;
  const ref = doc(db, 'jh_midterm_class_comments_config', docId);

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
 * Load custom category configurations for a class context
 */
export async function getMidtermClassCommentsConfig(
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string
): Promise<MidtermClassCommentsConfig | null> {
  const normYear = normalizeAcademicYear(academicYear);
  const docId = `${classId}_${normYear}_${semester}_${midtermTerm}`;
  const ref = doc(db, 'jh_midterm_class_comments_config', docId);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as MidtermClassCommentsConfig;
}

/**
 * Submit General Comments for review
 */
export async function submitMidtermGeneralCommentForReview(
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
  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as MidtermStudentDataDoc) : null;
  
  const history = Array.isArray(existing?.reviewHistory) ? [...existing.reviewHistory] : [];
  const previousStatus = existing?.generalCommentReviewStatus || 'DRAFT';
  const action = previousStatus === 'REVISION_REQUESTED' ? 'RESUBMITTED_FOR_REVIEW' : 'SUBMITTED_FOR_REVIEW';

  const entry: MidtermReviewHistoryEntry = {
    action,
    actorId: userUid,
    actorName: userName,
    actorRole: userRole,
    timestamp: Date.now(),
    commentSnapshot
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
 * Approve General Comments
 */
export async function approveMidtermGeneralComment(
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
  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as MidtermStudentDataDoc) : null;

  const history = Array.isArray(existing?.reviewHistory) ? [...existing.reviewHistory] : [];
  const entry: MidtermReviewHistoryEntry = {
    action: 'APPROVED',
    actorId: userUid,
    actorName: userName,
    actorRole: userRole,
    timestamp: Date.now(),
    commentSnapshot
  };
  history.push(entry);

  await setDoc(ref, {
    generalCommentReviewStatus: 'APPROVED',
    approvedAt: Date.now(),
    approvedBy: userUid,
    approvedByName: userName,
    reviewHistory: history,
    updatedAt: Date.now(),
    updatedBy: userUid
  }, { merge: true });
}

/**
 * Request Revision for General Comments
 */
export async function requestRevisionMidtermGeneralComment(
  studentId: string,
  classId: string,
  academicYear: string,
  semester: string,
  midtermTerm: string,
  userUid: string,
  userName: string,
  userRole: string,
  feedback: string,
  commentSnapshot: string
): Promise<void> {
  if (!feedback || !feedback.trim()) {
    throw new Error('Feedback revisi wajib diisi.');
  }

  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as MidtermStudentDataDoc) : null;

  const history = Array.isArray(existing?.reviewHistory) ? [...existing.reviewHistory] : [];
  const entry: MidtermReviewHistoryEntry = {
    action: 'REVISION_REQUESTED',
    actorId: userUid,
    actorName: userName,
    actorRole: userRole,
    timestamp: Date.now(),
    feedback,
    commentSnapshot
  };
  history.push(entry);

  await setDoc(ref, {
    generalCommentReviewStatus: 'REVISION_REQUESTED',
    revisionRequestedAt: Date.now(),
    revisionRequestedBy: userUid,
    revisionRequestedByName: userName,
    revisionFeedback: feedback,
    reviewHistory: history,
    updatedAt: Date.now(),
    updatedBy: userUid
  }, { merge: true });
}
