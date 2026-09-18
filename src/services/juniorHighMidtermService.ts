import { GoogleGenAI } from '@google/genai';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  increment 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { 
  MidtermMasterGoalDoc, 
  MidtermStudentDataDoc, 
  PublishedMidtermReport,
  MidtermGeneralCommentData,
  MidtermReportStatus
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

const AI_SYSTEM_PROMPT = `You are an academic progress-report writing assistant for Lazuardi GCS Junior High.

Write a general comment strictly from the teacher-provided inputs only.
Never invent, infer, exaggerate, or add facts that are not explicitly present.

Output rules:
1. Write in English only.
2. Produce exactly one paragraph.
3. Maximum 120 words.
4. Use simple, clear, professional, parent-friendly language.
5. Use third-person point of view.
6. Use the student's nickname when provided; otherwise use the student's name.
7. Use pronouns accurately:
   - MALE: he, him, his
   - FEMALE: she, her, hers
8. Start with positive strengths or developmental progress.
9. Mention achievements only when they are supplied.
10. State development needs constructively.
11. When an improvement item exists, use:
    "He is suggested to ..."
    or
    "She is suggested to ..."
12. Do not use the word "however".
13. Do not mention grades, scores, subjects, diagnoses, incidents, or attendance
    unless explicitly supplied in the teacher input.
14. End with an encouraging expectation for the remainder of the semester.
15. Return only the paragraph. Do not add a title, quotation marks, bullets,
    explanations, or labels.`;

const AI_POLISH_SYSTEM_PROMPT = `You are an academic progress-report editing assistant for Lazuardi GCS Junior High.

Your task is to refine and polish the teacher's comment draft strictly for grammar, clarity, professional tone, and flow.
Do not invent, add, or infer any new facts, subjects, scores, or achievements not in the input.

Output rules:
1. Write in English only.
2. Produce exactly one paragraph.
3. Maximum 120 words.
4. Use simple, clear, professional, parent-friendly language.
5. Use third-person point of view.
6. Use pronouns accurately:
   - MALE: he, him, his
   - FEMALE: she, her, hers
7. Do not use the word "however".
8. When an improvement suggestion exists, ensure it uses:
   "He is suggested to ..." or "She is suggested to ..."
9. Return only the revised paragraph. Do not add titles, quotes, bullets, or explanations.`;

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

  // Super Admin, Head JH, Secretary JH can edit all goals
  if (['SUPER_ADMIN', 'HEAD_JUNIOR', 'SECRETARY_JH'].includes(role)) {
    return true;
  }

  // BK Mentor, MTSS PJ are read-only
  if (['BK_MENTOR', 'MTSS_ACADEMIC_PJ', 'COUNSELOR'].includes(role)) {
    return false;
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

  // Super Admin & Head JH can edit general comments for any class
  if (['SUPER_ADMIN', 'HEAD_JUNIOR'].includes(role)) {
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
 * Save master goal document
 */
export async function saveMidtermMasterGoal(
  goalDoc: Omit<MidtermMasterGoalDoc, 'updatedAt'>
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
  userUid: string
): Promise<void> {
  const docId = getStudentDataDocId(studentId, classId, academicYear, semester, midtermTerm);
  const ref = doc(db, 'jh_midterm_student_data', docId);

  const existingSnap = await getDoc(ref);
  const existingData = existingSnap.exists() ? (existingSnap.data() as MidtermStudentDataDoc) : null;

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
  student: Student,
  masterGoalsMap: Record<string, MidtermMasterGoalDoc>,
  studentDataDoc: MidtermStudentDataDoc | undefined,
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

  const remarks = studentDataDoc?.remarks || {};

  // Check all subjects across all categories
  for (const cat of JH_MIDTERM_CATEGORIES) {
    for (const subj of cat.subjects) {
      const masterGoal = masterGoalsMap[subj];
      if (!masterGoal || !masterGoal.goals || masterGoal.goals.length === 0) {
        missingGoalsSubjects.push(subj);
        issues.push(`Learning Goals untuk ${subj} belum diisi.`);
      } else {
        for (const g of masterGoal.goals) {
          totalGoals++;
          const rem = remarks[g.id];
          if (rem && rem.trim()) {
            completedGoals++;
          } else {
            issues.push(`Remark untuk "${g.text.slice(0, 30)}..." (${subj}) belum diisi.`);
          }
        }
      }
    }
  }

  const finalComment = studentDataDoc?.generalComment?.finalComment?.trim() || '';
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
 * Generates General Comment draft using Gemini API
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const promptInput = `Teacher Inputs:
- Student Name: ${params.studentName}
- Nickname: ${params.nickname || params.studentName}
- Gender: ${params.gender}
- Strengths / Developmental Progress:
${params.strengths.length > 0 ? params.strengths.map(s => `  * ${s}`).join('\n') : '  * Shows positive engagement and enthusiasm for learning'}
- Achievements:
${params.achievements.length > 0 ? params.achievements.map(a => `  * ${a}`).join('\n') : '  * (None provided)'}
- Needs Improvement:
${params.needsImprovement.length > 0 ? params.needsImprovement.map(n => `  * ${n}`).join('\n') : '  * (None provided)'}
- Additional Teacher Notes:
  ${params.manualNotes?.trim() || '(None)'}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: promptInput,
    config: {
      systemInstruction: AI_SYSTEM_PROMPT,
      temperature: 0.3,
    },
  });

  return response.text?.trim() || '';
}

/**
 * Polishes teacher comment draft strictly fixing grammar and tone without inventing facts
 */
export async function refineMidtermGeneralCommentAI(params: {
  draftText: string;
  gender: 'MALE' | 'FEMALE';
  studentName?: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const promptInput = `Teacher Draft to Polish:
"""
${params.draftText}
"""
Student Gender: ${params.gender}
Student Name: ${params.studentName || ''}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: promptInput,
    config: {
      systemInstruction: AI_POLISH_SYSTEM_PROMPT,
      temperature: 0.2,
    },
  });

  return response.text?.trim() || '';
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
