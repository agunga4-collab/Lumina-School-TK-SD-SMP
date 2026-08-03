import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, getStudentById, getStudents, getClasses, auth, sendNotification, getUserProfile } from '../lib/firebase';
import { isTeacherAssignedToClass } from './classTeacherAssignmentService';
import type {
  ConferencePeriod,
  StudentConferenceResponse,
  MentorAssignment,
  SmartGoalTrackerEntry,
  SmartGoal,
  User,
  Student,
  Class,
  TrackerSectionReview,
  TrackerOverallStatus,
  Enrollment
} from '../types';

export interface ResolvedConferenceEnrollment {
  enrollmentId: string | null;
  studentId: string;
  academicYear: string;
  classId: string | null;
  className: string;
  gradeLevel: number;
  gradeLabel: string;
}

export async function resolveConferenceEnrollment({
  studentId,
  academicYear,
  conferenceId,
}: {
  studentId: string;
  academicYear: string;
  conferenceId?: string;
}): Promise<ResolvedConferenceEnrollment> {
  const emptyResult: ResolvedConferenceEnrollment = {
    enrollmentId: null,
    studentId,
    academicYear,
    classId: null,
    className: 'Kelas belum ditetapkan',
    gradeLevel: 0,
    gradeLabel: 'Grade —',
  };

  if (!studentId || !academicYear) {
    return emptyResult;
  }

  try {
    const eq = query(
      collection(db, 'enrollments'),
      where('studentId', '==', studentId),
      where('academicYear', '==', academicYear)
    );
    const eSnap = await getDocs(eq);
    const activeEnrollments = eSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as Enrollment & { id: string }))
      .filter(e => (e.status || '').toUpperCase() === 'ACTIVE');

    let selectedEnrollment: (Enrollment & { id: string }) | null = null;

    if (activeEnrollments.length > 1) {
      console.warn(
        `[resolveConferenceEnrollment] Warning: Multiple active enrollments found for student ${studentId} in academic year ${academicYear}.`,
        activeEnrollments
      );
      selectedEnrollment = activeEnrollments[0];
    } else if (activeEnrollments.length === 1) {
      selectedEnrollment = activeEnrollments[0];
    }

    if (selectedEnrollment && selectedEnrollment.classId) {
      const classRef = doc(db, 'classes', selectedEnrollment.classId);
      const classSnap = await getDoc(classRef);
      if (classSnap.exists()) {
        const classData = classSnap.data() as Class;
        const gradeVal = classData.grade ? String(classData.grade) : '—';
        const parsedGrade = parseInt(gradeVal, 10) || 0;
        return {
          enrollmentId: selectedEnrollment.id,
          studentId,
          academicYear,
          classId: classSnap.id,
          className: classData.name || 'Kelas belum ditetapkan',
          gradeLevel: parsedGrade,
          gradeLabel: parsedGrade ? `Grade ${parsedGrade}` : `Grade ${gradeVal}`,
        };
      } else {
        const cq = query(
          collection(db, 'classes'),
          where('name', '==', selectedEnrollment.classId)
        );
        const cqSnap = await getDocs(cq);
        if (!cqSnap.empty) {
          const classDoc = cqSnap.docs[0];
          const classData = classDoc.data() as Class;
          const gradeVal = classData.grade ? String(classData.grade) : '—';
          const parsedGrade = parseInt(gradeVal, 10) || 0;
          return {
            enrollmentId: selectedEnrollment.id,
            studentId,
            academicYear,
            classId: classDoc.id,
            className: classData.name || 'Kelas belum ditetapkan',
            gradeLevel: parsedGrade,
            gradeLabel: parsedGrade ? `Grade ${parsedGrade}` : `Grade ${gradeVal}`,
          };
        }
      }
    }

    if (conferenceId) {
      const confRef = doc(db, 'studentConferenceResponses', conferenceId);
      const confSnap = await getDoc(confRef);
      if (confSnap.exists()) {
        const confData = confSnap.data() as StudentConferenceResponse;
        if (confData.academicYear === academicYear && confData.className) {
          const parsedGrade = confData.gradeLevel ? Number(confData.gradeLevel) : 0;
          return {
            enrollmentId: null,
            studentId,
            academicYear,
            classId: confData.classId || null,
            className: confData.className,
            gradeLevel: parsedGrade,
            gradeLabel: parsedGrade ? `Grade ${parsedGrade}` : 'Grade —',
          };
        }
      }
    }

    const cq = query(
      collection(db, 'studentConferenceResponses'),
      where('studentId', '==', studentId),
      where('academicYear', '==', academicYear)
    );
    const cqSnap = await getDocs(cq);
    if (!cqSnap.empty) {
      const confData = cqSnap.docs[0].data() as StudentConferenceResponse;
      if (confData.className) {
        const parsedGrade = confData.gradeLevel ? Number(confData.gradeLevel) : 0;
        return {
          enrollmentId: null,
          studentId,
          academicYear,
          classId: confData.classId || null,
          className: confData.className,
          gradeLevel: parsedGrade,
          gradeLabel: parsedGrade ? `Grade ${parsedGrade}` : 'Grade —',
        };
      }
    }
  } catch (err) {
    console.error('[resolveConferenceEnrollment] Error during resolution:', err);
  }

  return emptyResult;
}

export type ApprovalSummary = {
  approvedCount: number;
  requiredCount: number;
  returnedCount: number;
  allRequiredApproved: boolean;
};

export function calculateConferenceStatus(response: any): {
  status: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED';
  summary: ApprovalSummary;
} {
  const summary: ApprovalSummary = {
    approvedCount: 0,
    requiredCount: 0,
    returnedCount: 0,
    allRequiredApproved: false,
  };

  if (!response) {
    return { status: 'DRAFT', summary };
  }

  const reviews = response.sectionReviews || {};

  const items = [
    {
      key: 'aboutMe',
      active: true,
      status: reviews.aboutMe?.status || reviews.reflection?.status || 'NOT_REVIEWED',
    },
    {
      key: 'strengths',
      active: true,
      status: reviews.strengths?.status || reviews.reflection?.status || 'NOT_REVIEWED',
    },
    {
      key: 'growthAreas',
      active: true,
      status: reviews.growthAreas?.status || reviews.reflection?.status || 'NOT_REVIEWED',
    },
    {
      key: 'selfExploration',
      active: !!(response.selfExplorationReferenceId || response.selfExplorationSnapshot),
      status: reviews.selfExploration?.status || 'NOT_REVIEWED',
    },
    {
      key: 'extracurricular',
      active: !!(response.unitActivity || (response.unitActivities && response.unitActivities.length > 0)),
      status: reviews.extracurricular?.status || 'NOT_REVIEWED',
    },
  ];

  items.forEach(item => {
    if (item.active) {
      summary.requiredCount++;
      if (item.status === 'APPROVED') {
        summary.approvedCount++;
      } else if (item.status === 'REVISION_REQUIRED') {
        summary.returnedCount++;
      }
    }
  });

  const goals = response.goals || [];
  const goalIds = goals.map((g: any) => g.id);
  const goalReviews = reviews.smartGoals || {};

  goalIds.forEach((id: string) => {
    summary.requiredCount++;
    const rev = goalReviews[id];
    if (rev?.status === 'APPROVED') {
      summary.approvedCount++;
    } else if (rev?.status === 'REVISION_REQUIRED') {
      summary.returnedCount++;
    }
  });

  summary.allRequiredApproved = summary.requiredCount > 0 && summary.approvedCount === summary.requiredCount;

  const hasReturnedRequiredItem = summary.returnedCount > 0;

  let calculatedStatus: 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED' = 'DRAFT';

  if (hasReturnedRequiredItem) {
    calculatedStatus = 'RETURNED';
  } else if (summary.allRequiredApproved) {
    calculatedStatus = 'APPROVED';
  } else if (response.status === 'SUBMITTED' || response.overallStatus === 'SUBMITTED' || response.isSubmitted) {
    calculatedStatus = 'SUBMITTED';
  }

  return {
    status: calculatedStatus,
    summary,
  };
}

const PERIODS_COLLECTION = 'conferencePeriods';
const RESPONSES_COLLECTION = 'studentConferenceResponses';
const ASSIGNMENTS_COLLECTION = 'mentorAssignments';
const TRACKER_COLLECTION = 'smartGoalTrackerEntries';

export const threeWayConferenceService = {
  resolveConferenceEnrollment,
  /**
   * Helper to generate deterministic response ID
   */
  getConferenceResponseId(periodId: string, studentId: string): string {
    return `${periodId}_${studentId}`;
  },

  /**
   * Helper to generate deterministic mentor assignment ID
   */
  getMentorAssignmentId(periodId: string, studentId: string): string {
    return `${periodId}_${studentId}`;
  },

  /**
   * Resolve Self-Exploration reference canonically for Response Detail and Presentation Mode
   */
  async resolveConferenceSelfExploration(params: {
    studentId: string;
    academicYear: string;
    semester: string | number;
    periodId: string;
  }): Promise<{
    available: boolean;
    periodId: string;
    periodLabel: string;
    academicYear: string;
    semester: string | number;
    choices: Array<{
      slot: number;
      domain: 'IMAGINAL' | 'RATIONAL' | string;
      domainLabel: string;
      activityId?: string;
      activityName: string;
    }>;
  }> {
    try {
      const { studentId, academicYear, semester, periodId } = params;
      const responseId = `${periodId}_${studentId}`;
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      const responseSnap = await getDoc(responseRef);
      const responseData = responseSnap.exists() ? responseSnap.data() as StudentConferenceResponse : null;

      let sourceEnrollment: any = null;

      // 1. Snapshot khusus conference bila tersedia
      if (responseData?.selfExplorationSnapshot) {
        sourceEnrollment = responseData.selfExplorationSnapshot;
      }

      // 2. Jika snapshot belum tersedia, gunakan resolver canonical untuk student + academicYear + semester
      if (!sourceEnrollment && academicYear && semester) {
        const qEnroll = query(
          collection(db, 'seEnrollments'),
          where('studentId', '==', studentId)
        );
        const enrollSnap = await getDocs(qEnroll);
        if (!enrollSnap.empty) {
          const semesterStr = String(semester);
          const match = enrollSnap.docs.find(d => {
            const data = d.data();
            return data.academicYear === academicYear && String(data.semester) === semesterStr;
          });
          if (match) {
            sourceEnrollment = { id: match.id, ...match.data() };
          }
        }
      }

      // Resolve periodLabel dynamically if available
      let periodLabel = `Periode 1 Semester ${semester} ${academicYear}`;
      try {
        const sePeriodsCol = collection(db, 'sePeriods');
        const qPeriods = query(sePeriodsCol, where('unitId', '==', 'JUNIOR_HIGH'));
        const periodsSnap = await getDocs(qPeriods);
        const matchingPeriodDoc = periodsSnap.docs.find(d => d.data().academicYear === academicYear && Number(d.data().semester) === Number(semester));
        if (matchingPeriodDoc) {
          periodLabel = matchingPeriodDoc.data().label || periodLabel;
        }
      } catch (e) {
        console.warn('Failed to load sePeriods dynamically in resolver:', e);
      }

      const choices = (sourceEnrollment?.choices || sourceEnrollment?.activityChoices || []).map((choice: any, idx: number) => {
        const domainStr = (choice.strand || choice.domain || '').toUpperCase();
        let domainVal = 'IMAGINAL';
        let domainLabelVal = 'Imaginal';
        
        if (domainStr === 'RATIONAL') {
          domainVal = 'RATIONAL';
          domainLabelVal = 'Rational';
        } else if (domainStr === 'IMAGINAL') {
          domainVal = 'IMAGINAL';
          domainLabelVal = 'Imaginal';
        } else {
          domainVal = domainStr;
          domainLabelVal = choice.strand || (domainStr ? domainStr.charAt(0) + domainStr.slice(1).toLowerCase() : '');
        }

        return {
          slot: Number(choice.slot || idx + 1),
          domain: domainVal,
          domainLabel: domainLabelVal,
          activityId: choice.activityId || undefined,
          activityName: choice.activityName || choice.customActivity || '-',
          finalTarget: choice.finalTarget || choice.personalTarget || ''
        };
      });

      const available = !!sourceEnrollment && choices.length > 0;

      return {
        available,
        periodId,
        periodLabel,
        academicYear,
        semester,
        choices
      };
    } catch (err) {
      console.warn('Could not resolve conference self-exploration canonically:', err);
      return {
        available: false,
        periodId: params.periodId,
        periodLabel: `Semester ${params.semester} ${params.academicYear}`,
        academicYear: params.academicYear,
        semester: params.semester,
        choices: []
      };
    }
  },

  /**
   * Create a new Conference Period
   */
  async createConferencePeriod(payload: Omit<ConferencePeriod, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const { academicYear, semester, label, status, goalSettingOpenDate, goalSettingCloseDate, trackerOpenDate, trackerCloseDate, createdBy, updatedBy } = payload;
      
      // Validation: academicYear and semester present
      if (!academicYear) throw new Error('Academic Year is required.');
      if (!semester) throw new Error('Semester is required.');
      if (!label) throw new Error('Label is required.');

      // Date validation
      if (goalSettingOpenDate && goalSettingCloseDate && goalSettingOpenDate > goalSettingCloseDate) {
        throw new Error('Goal setting open date cannot be after the close date.');
      }
      if (trackerOpenDate && trackerCloseDate && trackerOpenDate > trackerCloseDate) {
        throw new Error('Tracker open date cannot be after the close date.');
      }

      const q = query(
        collection(db, PERIODS_COLLECTION),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester)
      );

      // We use a transaction to safely check and write
      return await runTransaction(db, async (transaction) => {
        const snap = await getDocs(q);
        const activePeriod = snap.docs.find(d => d.data().status !== 'ARCHIVED');
        if (activePeriod) {
          throw new Error(`A non-archived conference period already exists for ${academicYear} Semester ${semester}.`);
        }

        const periodRef = doc(collection(db, PERIODS_COLLECTION));
        const now = Date.now();
        const newPeriod: ConferencePeriod = {
          id: periodRef.id,
          academicYear,
          semester,
          label,
          status,
          goalSettingOpenDate,
          goalSettingCloseDate,
          trackerOpenDate,
          trackerCloseDate,
          createdAt: now,
          updatedAt: now,
          createdBy,
          updatedBy
        };

        transaction.set(periodRef, newPeriod);
        return periodRef.id;
      });
    } catch (error) {
      return handleFirestoreError(error, 'create', PERIODS_COLLECTION);
    }
  },

  /**
   * Update an existing Conference Period
   */
  async updateConferencePeriod(periodId: string, payload: Partial<Omit<ConferencePeriod, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    try {
      const { academicYear, semester, goalSettingOpenDate, goalSettingCloseDate, trackerOpenDate, trackerCloseDate } = payload;

      // Date validation
      if (goalSettingOpenDate !== undefined || goalSettingCloseDate !== undefined) {
        const currentOpen = goalSettingOpenDate !== undefined ? goalSettingOpenDate : null;
        const currentClose = goalSettingCloseDate !== undefined ? goalSettingCloseDate : null;
        if (currentOpen && currentClose && currentOpen > currentClose) {
          throw new Error('Goal setting open date cannot be after the close date.');
        }
      }

      if (trackerOpenDate !== undefined || trackerCloseDate !== undefined) {
        const currentOpen = trackerOpenDate !== undefined ? trackerOpenDate : null;
        const currentClose = trackerCloseDate !== undefined ? trackerCloseDate : null;
        if (currentOpen && currentClose && currentOpen > currentClose) {
          throw new Error('Tracker open date cannot be after the close date.');
        }
      }

      const periodRef = doc(db, PERIODS_COLLECTION, periodId);
      
      // If academicYear, semester, or status is updated, ensure active uniqueness is not violated
      if ((academicYear && semester) || payload.status) {
        const currentDoc = await getDoc(periodRef);
        if (currentDoc.exists()) {
          const data = currentDoc.data() as ConferencePeriod;
          const targetAY = academicYear || data.academicYear;
          const targetSem = semester || data.semester;
          const targetStatus = payload.status || data.status;

          if (targetStatus !== 'ARCHIVED') {
            const q = query(
              collection(db, PERIODS_COLLECTION),
              where('academicYear', '==', targetAY),
              where('semester', '==', targetSem)
            );
            const snap = await getDocs(q);
            const activePeriod = snap.docs.find(d => d.id !== periodId && d.data().status !== 'ARCHIVED');
            if (activePeriod) {
              throw new Error(`A non-archived conference period already exists for ${targetAY} Semester ${targetSem}.`);
            }
          }
        }
      }

      await updateDoc(periodRef, {
        ...payload,
        updatedAt: Date.now()
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${PERIODS_COLLECTION}/${periodId}`);
    }
  },

  /**
   * Get a single Conference Period by ID
   */
  async getConferencePeriodById(periodId: string): Promise<ConferencePeriod | null> {
    try {
      const periodRef = doc(db, PERIODS_COLLECTION, periodId);
      const snap = await getDoc(periodRef);
      if (!snap.exists()) return null;
      return snap.data() as ConferencePeriod;
    } catch (error) {
      return handleFirestoreError(error, 'get', `${PERIODS_COLLECTION}/${periodId}`);
    }
  },

  /**
   * Get list of Conference Periods (optional status filter)
   */
  async getConferencePeriods(filters?: { status?: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED' }): Promise<ConferencePeriod[]> {
    try {
      const colRef = collection(db, PERIODS_COLLECTION);
      let q = query(colRef);
      if (filters?.status) {
        q = query(colRef, where('status', '==', filters.status));
      }
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as ConferencePeriod);
    } catch (error) {
      return handleFirestoreError(error, 'list', PERIODS_COLLECTION);
    }
  },

  /**
   * Get the current active/non-archived period for academicYear + semester
   */
  async getCurrentConferencePeriod(academicYear: string, semester: number): Promise<ConferencePeriod | null> {
    try {
      const q = query(
        collection(db, PERIODS_COLLECTION),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester)
      );
      const snap = await getDocs(q);
      const activePeriod = snap.docs.find(d => d.data().status !== 'ARCHIVED');
      return activePeriod ? (activePeriod.data() as ConferencePeriod) : null;
    } catch (error) {
      return handleFirestoreError(error, 'get', PERIODS_COLLECTION);
    }
  },

  /**
   * Update Status of a conference period
   */
  async updateConferencePeriodStatus(periodId: string, status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'ARCHIVED'): Promise<void> {
    try {
      await this.updateConferencePeriod(periodId, { status });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${PERIODS_COLLECTION}/${periodId}`);
    }
  },

  /**
   * Archive a Conference Period
   */
  async archiveConferencePeriod(periodId: string): Promise<void> {
    try {
      await this.updateConferencePeriodStatus(periodId, 'ARCHIVED');
    } catch (error) {
      return handleFirestoreError(error, 'update', `${PERIODS_COLLECTION}/${periodId}`);
    }
  },

  /**
   * Get Student Conference Response
   */
  async getStudentConferenceResponse(periodId: string, studentId: string): Promise<StudentConferenceResponse | null> {
    try {
      const id = this.getConferenceResponseId(periodId, studentId);
      const docRef = doc(db, RESPONSES_COLLECTION, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return snap.data() as StudentConferenceResponse;
    } catch (error) {
      return handleFirestoreError(error, 'get', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Get Mentor Assignment
   */
  async getMentorAssignment(periodId: string, studentId: string): Promise<MentorAssignment | null> {
    try {
      const id = this.getMentorAssignmentId(periodId, studentId);
      const docRef = doc(db, ASSIGNMENTS_COLLECTION, id);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return snap.data() as MentorAssignment;
    } catch (error) {
      return handleFirestoreError(error, 'get', `${ASSIGNMENTS_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Get Tracker Entries for a specific goal
   */
  async getTrackerEntriesForGoal(periodId: string, studentId: string, goalId: string): Promise<SmartGoalTrackerEntry[]> {
    try {
      const q = query(
        collection(db, TRACKER_COLLECTION),
        where('periodId', '==', periodId),
        where('studentId', '==', studentId),
        where('goalId', '==', goalId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as SmartGoalTrackerEntry);
    } catch (error) {
      return handleFirestoreError(error, 'list', TRACKER_COLLECTION);
    }
  },

  /**
   * Get current student conference response for the active period (alias of getStudentConferenceResponse)
   */
  async getCurrentStudentConferenceResponse(periodId: string, resolvedStudentId: string): Promise<StudentConferenceResponse | null> {
    return this.getStudentConferenceResponse(periodId, resolvedStudentId);
  },

  /**
   * Calculate overall status of a conference response based on its section-by-section reviews
   */
  calculateOverallStatus(response: StudentConferenceResponse): 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_APPROVED' | 'REVISION_REQUIRED' | 'FULLY_APPROVED' {
    const { status, summary } = calculateConferenceStatus(response);
    if (status === 'APPROVED') {
      return 'FULLY_APPROVED';
    }
    if (status === 'RETURNED') {
      return 'REVISION_REQUIRED';
    }
    if (summary.approvedCount > 0) {
      return 'PARTIALLY_APPROVED';
    }
    if (status === 'SUBMITTED') {
      return 'SUBMITTED';
    }
    return 'DRAFT';
  },

  /**
   * Save student conference response as a draft
   */
  async saveStudentConferenceDraft(
    periodId: string,
    studentId: string,
    responsePayload: Partial<StudentConferenceResponse>
  ): Promise<void> {
    try {
      // Validate dates and period status
      const periodRef = doc(db, PERIODS_COLLECTION, periodId);
      const periodSnap = await getDoc(periodRef);
      if (!periodSnap.exists()) throw new Error('Conference period does not exist.');
      const period = periodSnap.data() as ConferencePeriod;
      if (period.status !== 'OPEN') {
        throw new Error('Conference period is not open.');
      }
      const now = Date.now();
      if (period.goalSettingOpenDate && now < period.goalSettingOpenDate) {
        throw new Error('Goal Setting window is not open yet.');
      }
      if (period.goalSettingCloseDate && now > period.goalSettingCloseDate) {
        throw new Error('The Goal Setting window has closed.');
      }

      const responseId = this.getConferenceResponseId(periodId, studentId);
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      const existingSnap = await getDoc(responseRef);
      let existing: StudentConferenceResponse | null = null;
      let existingReviews: any = null;
      let status: 'DRAFT' | 'RETURNED' = 'DRAFT';
      let statusHistory: any[] = [];

      // Fetch trusted student details
      const studentData = await getStudentById(studentId);
      if (!studentData) {
        throw new Error('Student record not found.');
      }

      if (existingSnap.exists()) {
        existing = existingSnap.data() as StudentConferenceResponse;
        existingReviews = existing.sectionReviews || null;
        statusHistory = existing.statusHistory || [];
        if (existing.status !== 'DRAFT' && existing.status !== 'RETURNED') {
          throw new Error('Hanya workbook berstatus Draft atau Returned yang dapat diedit.');
        }
        status = existing.status as 'DRAFT' | 'RETURNED';
      } else {
        statusHistory = [{
          fromStatus: null,
          toStatus: 'DRAFT',
          action: 'DRAFT_SAVED',
          performedByUid: studentId,
          performedByName: studentData.name || 'Student',
          performedByRole: 'STUDENT',
          note: 'Workbook pertama kali disimpan sebagai draft.',
          createdAt: now
        }];
      }

      let className = studentData.classId || '';
      if (studentData.classId) {
        try {
          const classDoc = await getDoc(doc(db, 'classes', studentData.classId));
          if (classDoc.exists()) {
            className = classDoc.data()?.name || studentData.classId;
          }
        } catch (err) {
          console.warn('Could not fetch class details:', err);
        }
      }

      const nowTime = Date.now();
      const docPayload: StudentConferenceResponse = {
        id: responseId,
        periodId,
        studentId,
        studentName: studentData.name || '',
        studentLuminaId: studentData.id || studentId,
        classId: studentData.classId || '',
        className,
        gradeLevel: studentData.grade || 0,
        academicYear: period.academicYear,
        semester: period.semester as 1 | 2,
        status: status,
        aboutMe: responsePayload.aboutMe || '',
        strengths: responsePayload.strengths || '',
        areasForGrowth: responsePayload.areasForGrowth || '',
        goals: responsePayload.goals || [],
        selfExplorationReferenceId: responsePayload.selfExplorationReferenceId || null,
        selfExplorationSnapshot: responsePayload.selfExplorationSnapshot || null,
        karyaIlmiahReferenceId: responsePayload.karyaIlmiahReferenceId || null,
        unitActivity: responsePayload.unitActivity || '',
        unitActivityCategory: responsePayload.unitActivityCategory || '',
        unitActivityName: responsePayload.unitActivityName || '',
        unitActivityWorries: responsePayload.unitActivityWorries || '',
        unitActivityOvercomingPlan: responsePayload.unitActivityOvercomingPlan || '',
        unitActivities: responsePayload.unitActivities || [],
        createdAt: existing ? existing.createdAt : nowTime,
        updatedAt: nowTime,
        submittedAt: existing ? (existing.submittedAt || null) : null,
        submittedBy: existing ? (existing.submittedBy || null) : null,
        lastSubmittedAt: existing ? (existing.lastSubmittedAt || null) : null,
        revisionRound: existing ? (existing.revisionRound || 0) : 0,
        sectionReviews: existingReviews,
        overallStatus: existing ? (existing.overallStatus || 'DRAFT') : 'DRAFT',
        statusHistory: statusHistory,
        revisionRequest: existing ? (existing.revisionRequest || undefined) : undefined,
      };

      if (docPayload.sectionReviews === null || docPayload.sectionReviews === undefined) {
        delete (docPayload as any).sectionReviews;
      }

      await setDoc(responseRef, docPayload);
      await this.syncResponseToTracker(periodId, studentId, docPayload);
    } catch (error) {
      return handleFirestoreError(error, 'write', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Submit student conference response
   */
  async submitStudentConferenceResponse(
    periodId: string,
    studentId: string,
    responsePayload: Partial<StudentConferenceResponse>
  ): Promise<void> {
    try {
      // Validate dates and period status
      const periodRef = doc(db, PERIODS_COLLECTION, periodId);
      const periodSnap = await getDoc(periodRef);
      if (!periodSnap.exists()) throw new Error('Conference period does not exist.');
      const period = periodSnap.data() as ConferencePeriod;
      if (period.status !== 'OPEN') {
        throw new Error('Conference period is not open.');
      }
      const now = Date.now();
      if (period.goalSettingOpenDate && now < period.goalSettingOpenDate) {
        throw new Error('Goal Setting window is not open yet.');
      }
      if (period.goalSettingCloseDate && now > period.goalSettingCloseDate) {
        throw new Error('The Goal Setting window has closed.');
      }

      const responseId = this.getConferenceResponseId(periodId, studentId);
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      const existingSnap = await getDoc(responseRef);
      let existing: StudentConferenceResponse | null = null;
      let isRevision = false;
      let existingReviews: any = null;
      let revisionRound = 0;
      let existingStatusHistory: any[] = [];

      if (existingSnap.exists()) {
        existing = existingSnap.data() as StudentConferenceResponse;
        existingReviews = existing.sectionReviews || null;
        revisionRound = existing.revisionRound || 0;
        existingStatusHistory = existing.statusHistory || [];
        
        if (existing.status !== 'DRAFT' && existing.status !== 'RETURNED') {
          throw new Error('Hanya workbook berstatus Draft atau Returned yang dapat dikirim.');
        }
        isRevision = existing.status === 'RETURNED';
      }

      // Fetch trusted student details
      const studentData = await getStudentById(studentId);
      if (!studentData) {
        throw new Error('Student record not found.');
      }

      let className = studentData.classId || '';
      if (studentData.classId) {
        try {
          const classDoc = await getDoc(doc(db, 'classes', studentData.classId));
          if (classDoc.exists()) {
            className = classDoc.data()?.name || studentData.classId;
          }
        } catch (err) {
          console.warn('Could not fetch class details:', err);
        }
      }

      const nowTime = Date.now();
      
      // Build updated reviews if it is a revision submission
      let updatedReviews = existingReviews ? JSON.parse(JSON.stringify(existingReviews)) : null;
      if (isRevision && updatedReviews) {
        revisionRound += 1;
        // Reset only sections that were 'REVISION_REQUIRED' back to 'NOT_REVIEWED'
        const keys = ['aboutMe', 'strengths', 'growthAreas', 'selfExploration', 'extracurricular', 'karyaIlmiah'];
        keys.forEach(key => {
          if (updatedReviews[key] && updatedReviews[key].status === 'REVISION_REQUIRED') {
            updatedReviews[key].status = 'NOT_REVIEWED';
            updatedReviews[key].comment = updatedReviews[key].comment || '';
          }
        });
        if (updatedReviews.smartGoals) {
          Object.keys(updatedReviews.smartGoals).forEach(goalId => {
            if (updatedReviews.smartGoals[goalId] && updatedReviews.smartGoals[goalId].status === 'REVISION_REQUIRED') {
              updatedReviews.smartGoals[goalId].status = 'NOT_REVIEWED';
            }
          });
        }
      }

      // Add SUBMITTED status history
      const historyItem = {
        fromStatus: existing ? existing.status : null,
        toStatus: 'SUBMITTED' as const,
        action: 'SUBMITTED' as const,
        performedByUid: studentId,
        performedByName: studentData.name || 'Student',
        performedByRole: 'STUDENT' as const,
        note: isRevision ? 'Siswa mengirimkan revisi workbook.' : 'Siswa mengirimkan workbook.',
        createdAt: nowTime
      };
      const statusHistory = [...existingStatusHistory, historyItem];

      // Update revision request if exists and pending
      let revisionRequest = existing?.revisionRequest || undefined;
      if (revisionRequest && revisionRequest.status === 'PENDING') {
        revisionRequest = {
          ...revisionRequest,
          status: 'RETURNED',
          respondedAt: nowTime,
          respondedByUid: studentId
        };
      }

      const docPayload: StudentConferenceResponse = {
        id: responseId,
        periodId,
        studentId,
        studentName: studentData.name || '',
        studentLuminaId: studentData.id || studentId,
        classId: studentData.classId || '',
        className,
        gradeLevel: studentData.grade || 0,
        academicYear: period.academicYear,
        semester: period.semester as 1 | 2,
        status: 'SUBMITTED',
        aboutMe: responsePayload.aboutMe || '',
        strengths: responsePayload.strengths || '',
        areasForGrowth: responsePayload.areasForGrowth || '',
        goals: responsePayload.goals || [],
        selfExplorationReferenceId: responsePayload.selfExplorationReferenceId || null,
        selfExplorationSnapshot: responsePayload.selfExplorationSnapshot || null,
        karyaIlmiahReferenceId: responsePayload.karyaIlmiahReferenceId || null,
        unitActivity: responsePayload.unitActivity || '',
        unitActivityCategory: responsePayload.unitActivityCategory || '',
        unitActivityName: responsePayload.unitActivityName || '',
        unitActivityWorries: responsePayload.unitActivityWorries || '',
        unitActivityOvercomingPlan: responsePayload.unitActivityOvercomingPlan || '',
        unitActivities: responsePayload.unitActivities || [],
        createdAt: existing ? existing.createdAt : nowTime,
        updatedAt: nowTime,
        submittedAt: existing ? (existing.submittedAt || nowTime) : nowTime,
        submittedBy: studentData.id || studentId,
        lastSubmittedAt: nowTime,
        revisionRound,
        sectionReviews: updatedReviews,
        statusHistory,
        revisionRequest
      };

      // Recalculate overall status
      const { status: calculatedStatus, summary: approvalSummary } = calculateConferenceStatus(docPayload);
      docPayload.status = calculatedStatus === 'DRAFT' ? 'SUBMITTED' : calculatedStatus;
      docPayload.overallStatus = docPayload.status;
      docPayload.approvalSummary = approvalSummary;

      // Run validation rules
      const validation = this.validateConferenceResponseForSubmission(docPayload);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(' '));
      }

      if (docPayload.sectionReviews === null || docPayload.sectionReviews === undefined) {
        delete (docPayload as any).sectionReviews;
      }

      await setDoc(responseRef, docPayload);
      await this.syncResponseToTracker(periodId, studentId, docPayload);

      // In-app Notification triggered here
      if (isRevision) {
        try {
          const assignment = await this.getMentorAssignment(periodId, studentId);
          if (assignment && assignment.mentorEmail) {
            await sendNotification({
              userId: assignment.mentorEmail,
              type: 'REPORT_SUBMITTED',
              message: `${studentData.name || 'Siswa'} mengirim revisi Three-Way Conference.`,
              link: `/junior-high/conference/workspace`
            });
          }
        } catch (notifErr) {
          console.error('Failed to send submit revision notification:', notifErr);
        }
      } else {
        try {
          const assignment = await this.getMentorAssignment(periodId, studentId);
          if (assignment && assignment.mentorEmail) {
            await sendNotification({
              userId: assignment.mentorEmail,
              type: 'REPORT_SUBMITTED',
              message: `Response Three-Way Conference ${studentData.name || 'Siswa'} menunggu review.`,
              link: `/junior-high/conference/workspace`
            });
          }
        } catch (notifErr) {
          console.error('Failed to send submit notification:', notifErr);
        }
      }
    } catch (error) {
      return handleFirestoreError(error, 'write', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Validate conference response before submission
   */
  validateConferenceResponseForSubmission(response: Partial<StudentConferenceResponse>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!response.aboutMe || !response.aboutMe.trim()) {
      errors.push('About Me section is required.');
    }
    if (!response.strengths || !response.strengths.trim()) {
      errors.push('My Strengths section is required.');
    }
    if (!response.areasForGrowth || !response.areasForGrowth.trim()) {
      errors.push('My Areas for Growth section is required.');
    }

    const goals = response.goals || [];
    if (goals.length === 0) {
      errors.push('At least one goal is required.');
    }

    const strandCounts: Record<string, number> = {};
    goals.forEach((goal, index) => {
      const prefix = `Goal #${index + 1} (${goal.strand}):`;
      strandCounts[goal.strand] = (strandCounts[goal.strand] || 0) + 1;

      if (!goal.goal || !goal.goal.trim()) {
        errors.push(`${prefix} "My Final Smart Goal" is required.`);
      }
      if (!goal.startDate) {
        errors.push(`${prefix} Start Date is required.`);
      }
      if (!goal.targetDate) {
        errors.push(`${prefix} Target Date is required.`);
      }
      if (goal.startDate && goal.targetDate && goal.targetDate < goal.startDate) {
        errors.push(`${prefix} Target Date cannot be earlier than Start Date.`);
      }
      if (!goal.smartSpecific || !goal.smartSpecific.trim()) {
        errors.push(`${prefix} "Specific" description is required.`);
      }
      if (!goal.smartMeasurable || !goal.smartMeasurable.trim()) {
        errors.push(`${prefix} "Measurable" description is required.`);
      }
      if (!goal.smartAchievable || !goal.smartAchievable.trim()) {
        errors.push(`${prefix} "Achievable" description is required.`);
      }
      if (!goal.smartRelevant || !goal.smartRelevant.trim()) {
        errors.push(`${prefix} "Relevant" description is required.`);
      }
      if (!goal.smartTimeBound || !goal.smartTimeBound.trim()) {
        errors.push(`${prefix} "Time-Bound" description is required.`);
      }
      if (!goal.actions || !goal.actions.trim()) {
        errors.push(`${prefix} "Things I Have to Do" is required.`);
      }
      if (!goal.evidence || !goal.evidence.trim()) {
        errors.push(`${prefix} "Proof That My Effort Is Working" is required.`);
      }
    });

    Object.entries(strandCounts).forEach(([strand, count]) => {
      if (count > 2) {
        errors.push(`Maximum two goals are allowed for the ${strand} strand.`);
      }
    });

    const categories = ['Performing Arts', 'Arts & Makerspace', 'Physical Education', 'Digital Literacy'];
    const uas = response.unitActivities || [];
    categories.forEach(cat => {
      const ua = uas.find(u => u.category === cat);
      if (!ua) {
        errors.push(`Unit Activity block "${cat}" is missing.`);
      } else {
        if (!ua.activityName || !ua.activityName.trim()) {
          errors.push(`Unit Activity Chosen for "${cat}" is required.`);
        }
        if (!ua.worries || !ua.worries.trim()) {
          errors.push(`Your worries for "${cat}" is required.`);
        }
        if (!ua.overcomingPlan || !ua.overcomingPlan.trim()) {
          errors.push(`Your plan to overcome worries for "${cat}" is required.`);
        }
      }
    });

    if (response.gradeLevel === 9 && (!response.karyaIlmiahReferenceId || !response.karyaIlmiahReferenceId.trim())) {
      errors.push('Karya Ilmiah Reference is required for Grade 9 students.');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  },

  /**
   * Get Student Self-Exploration Reference (read-only)
   */
  async getStudentSelfExplorationReference(resolvedStudentId: string, academicYear: string, semester: number): Promise<any | null> {
    try {
      const sePeriodsCol = collection(db, 'sePeriods');
      const qPeriods = query(sePeriodsCol, where('unitId', '==', 'JUNIOR_HIGH'));
      const periodsSnap = await getDocs(qPeriods);

      let targetPeriodId: string | null = null;
      let targetPeriodLabel = '';

      const activePeriodDoc = periodsSnap.docs.find(d => d.data().isActive);
      const matchingPeriodDoc = periodsSnap.docs.find(d => d.data().academicYear === academicYear && Number(d.data().semester) === semester);

      const finalPeriodDoc = matchingPeriodDoc || activePeriodDoc;
      if (finalPeriodDoc) {
        targetPeriodId = finalPeriodDoc.id;
        targetPeriodLabel = finalPeriodDoc.data().label || '';
      }

      // Query seEnrollments by studentId to fetch all their records
      const qEnroll = query(
        collection(db, 'seEnrollments'),
        where('studentId', '==', resolvedStudentId)
      );
      const enrollSnap = await getDocs(qEnroll);
      
      let matchedEnrollment: any = null;
      if (!enrollSnap.empty) {
        // Try to find enrollment matching academicYear and semester
        const semesterStr = String(semester);
        const match = enrollSnap.docs.find(d => {
          const data = d.data();
          return data.academicYear === academicYear && String(data.semester) === semesterStr;
        });

        if (match) {
          matchedEnrollment = { id: match.id, ...match.data() };
        } else if (targetPeriodId) {
          // Fallback: match by periodId
          const matchByPeriod = enrollSnap.docs.find(d => d.data().periodId === targetPeriodId);
          if (matchByPeriod) {
            matchedEnrollment = { id: matchByPeriod.id, ...matchByPeriod.data() };
          }
        }
        
        // Final fallback: use the first one if nothing matches
        if (!matchedEnrollment) {
          matchedEnrollment = { id: enrollSnap.docs[0].id, ...enrollSnap.docs[0].data() };
        }
      }

      if (!matchedEnrollment) {
        return {
          periodLabel: targetPeriodLabel || 'Active Semester',
          enrollment: null
        };
      }

      return {
        periodLabel: targetPeriodLabel || matchedEnrollment.periodNumber || 'Active Semester',
        enrollment: matchedEnrollment
      };
    } catch (err) {
      console.warn('Could not fetch student self exploration reference:', err);
      return null;
    }
  },

  /**
   * Save the presentation theme selection
   */
  async savePresentationTheme(periodId: string, studentId: string, theme: 'LAZUARDI' | 'OCEAN' | 'COBALT' | 'BLOOM' | 'EARTH'): Promise<void> {
    try {
      const id = this.getConferenceResponseId(periodId, studentId);
      const docRef = doc(db, RESPONSES_COLLECTION, id);
      await updateDoc(docRef, {
        presentationTheme: theme,
        updatedAt: Date.now()
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Get Student Presentation Data for a specific period
   */
  async getStudentPresentationData(periodId: string, studentId: string): Promise<StudentConferenceResponse | null> {
    try {
      return await this.getStudentConferenceResponse(periodId, studentId);
    } catch (error) {
      return handleFirestoreError(error, 'get', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Get Current Student Presentation Data for the active academic year and semester
   */
  async getCurrentStudentPresentationData(
    activeAcademicYear: string,
    activeSemester: number,
    studentId: string
  ): Promise<{ response: StudentConferenceResponse | null; period: ConferencePeriod | null }> {
    try {
      const activePeriod = await this.getCurrentConferencePeriod(activeAcademicYear, activeSemester);
      if (!activePeriod) {
        return { response: null, period: null };
      }
      const response = await this.getStudentConferenceResponse(activePeriod.id, studentId);
      return { response, period: activePeriod };
    } catch (error) {
      return handleFirestoreError(error, 'get', RESPONSES_COLLECTION);
    }
  },

  /**
   * Get all Junior High students merged with their response and mentor assignment for the specified period.
   */
  async getConferenceWorkspaceStudents(
    periodId: string,
    academicYear?: string,
    gradeFilter?: string,
    classFilter?: string
  ): Promise<Array<{
    student: Student;
    response: StudentConferenceResponse | null;
    assignment: MentorAssignment | null;
    className: string;
    grade: string | number;
  }>> {
    try {
      // 1. Resolve Academic Year
      let activeYear = academicYear;
      if (!activeYear) {
        const periodDoc = await getDoc(doc(db, PERIODS_COLLECTION, periodId));
        if (periodDoc.exists()) {
          activeYear = periodDoc.data()?.academicYear || '';
        }
      }
      if (!activeYear) {
        throw new Error('Academic year could not be determined for period: ' + periodId);
      }

      // 2. Fetch JUNIOR_HIGH classes
      const classesList = (await getClasses()) || [];
      const jhClasses = classesList.filter(c => 
        (c.unitId === 'JUNIOR_HIGH' || ['7', '8', '9', 7, 8, 9].includes(c.grade)) &&
        c.academicYear === activeYear
      );
      const classMap = new Map<string, Class>();
      jhClasses.forEach(c => classMap.set(c.id, c));

      // 3. Determine class filter targets
      let targetClasses = [...jhClasses];
      if (classFilter && classFilter !== 'all') {
        targetClasses = jhClasses.filter(c => c.id === classFilter || c.name === classFilter);
      } else if (gradeFilter && gradeFilter !== 'all') {
        targetClasses = jhClasses.filter(c => String(c.grade) === String(gradeFilter));
      }

      // 4. Query active enrollments for target classes
      const targetClassKeys: string[] = [];
      targetClasses.forEach(c => {
        if (c.id) targetClassKeys.push(c.id);
        if (c.name && c.name !== c.id) targetClassKeys.push(c.name);
      });
      const uniqueClassKeys = Array.from(new Set(targetClassKeys));

      if (uniqueClassKeys.length === 0) {
        return [];
      }

      const enrollments: Enrollment[] = [];
      const chunks = [];
      for (let i = 0; i < uniqueClassKeys.length; i += 10) {
        chunks.push(uniqueClassKeys.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const eq = query(
          collection(db, 'enrollments'),
          where('academicYear', '==', activeYear),
          where('status', '==', 'active'),
          where('classId', 'in', chunk)
        );
        const eSnap = await getDocs(eq);
        eSnap.docs.forEach(doc => {
          enrollments.push(doc.data() as Enrollment);
        });
      }

      // 5. Fetch enrolled students from master
      const studentIds = Array.from(new Set(enrollments.map(e => e.studentId))).filter(Boolean);
      if (studentIds.length === 0) return [];

      const studentsMap = new Map<string, Student>();
      const sChunks = [];
      for (let i = 0; i < studentIds.length; i += 10) {
        sChunks.push(studentIds.slice(i, i + 10));
      }

      for (const chunk of sChunks) {
        const sq = query(collection(db, 'students'), where('__name__', 'in', chunk));
        const sSnap = await getDocs(sq);
        sSnap.docs.forEach(doc => {
          const data = doc.data();
          const name = data.name || data.fullName || '';
          if (!name || name.trim() === '') {
            console.warn(`[Audit] Master student record has empty name for ID: ${doc.id}`);
            return;
          }
          studentsMap.set(doc.id, {
            id: doc.id,
            name,
            ...data
          } as Student);
        });
      }

      // 6. Fetch responses and assignments
      const responses = await this.getConferenceResponsesForPeriod(periodId);
      const responseMap = new Map<string, StudentConferenceResponse>();
      responses.forEach(r => responseMap.set(r.studentId, r));

      const assignments = await this.getMentorAssignmentsForPeriod(periodId);
      const assignmentMap = new Map<string, MentorAssignment>();
      assignments.forEach(a => {
        assignmentMap.set(a.studentId, a);
      });

      // 7. Combine master data & details
      const result: Array<{
        student: Student;
        response: StudentConferenceResponse | null;
        assignment: MentorAssignment | null;
        className: string;
        grade: string | number;
      }> = [];

      enrollments.forEach(e => {
        const stud = studentsMap.get(e.studentId);
        if (!stud) {
          console.warn(`[Audit] Master student record missing for enrolled student ID: ${e.studentId}`);
          return;
        }

        const cls = classMap.get(e.classId) || jhClasses.find(c => c.name === e.classId || c.id === e.classId);
        const resp = responseMap.get(e.studentId) || null;
        const assign = assignmentMap.get(e.studentId) || null;

        result.push({
          student: stud,
          response: resp,
          assignment: assign,
          className: cls?.name || e.classId || 'Unknown Class',
          grade: cls?.grade || stud.grade || '—'
        });
      });

      return result;
    } catch (error) {
      return handleFirestoreError(error, 'list', 'conferenceWorkspace');
    }
  },

  /**
   * Sync a specific student conference response to the tracker entries (idempotent)
   */
  async syncResponseToTracker(periodId: string, studentId: string, response: StudentConferenceResponse): Promise<void> {
    try {
      const goals = response.goals || [];
      
      // Fetch mentor assignment
      let assignedMentorId = null;
      let assignedMentorName = null;
      try {
        const assignment = await this.getMentorAssignment(periodId, studentId);
        if (assignment && assignment.status === 'ACTIVE') {
          assignedMentorId = assignment.mentorId || null;
          assignedMentorName = assignment.mentorName || null;
        }
      } catch (e) {
        console.warn('Could not fetch mentor assignment for tracker sync:', e);
      }

      for (const goal of goals) {
        if (!goal.id) continue;
        const entryId = `${periodId}_${studentId}_${goal.id}`;
        const entryRef = doc(db, TRACKER_COLLECTION, entryId);
        const entrySnap = await getDoc(entryRef);

        if (entrySnap.exists()) {
          const existing = entrySnap.data() as SmartGoalTrackerEntry;
          const updatedEntry = {
            ...existing,
            goalStrand: goal.strand,
            goalSnapshot: goal,
            assignedMentorId: assignedMentorId || existing.assignedMentorId,
            assignedMentorName: assignedMentorName || existing.assignedMentorName,
            updatedAt: Date.now()
          };
          await setDoc(entryRef, updatedEntry);
        } else {
          const initialStatus = response.status === 'SUBMITTED' || response.status === 'CONFERENCE_COMPLETED' ? 'SUBMITTED' : 'DRAFT';
          const sectionReviews = {
            goal: { status: 'NOT_REVIEWED' as const, comment: '' },
            actionPlan: { status: 'NOT_REVIEWED' as const, comment: '' },
            progress: { status: 'NOT_REVIEWED' as const, comment: '' },
            reflection: { status: 'NOT_REVIEWED' as const, comment: '' }
          };
          
          const newEntry: SmartGoalTrackerEntry = {
            id: entryId,
            periodId,
            studentId,
            goalId: goal.id,
            goalStrand: goal.strand,
            goalSnapshot: goal,
            entryDate: Date.now(),
            actionsTaken: goal.actions || '',
            progressMade: goal.evidence || '',
            hinderingBehaviors: '',
            improvementPlan: '',
            mentorComment: null,
            commentedBy: null,
            commentedByName: null,
            commentedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            overallStatus: initialStatus,
            sectionReviews,
            assignedMentorId,
            assignedMentorName,
            submittedAt: initialStatus === 'SUBMITTED' ? Date.now() : null,
            lastSubmittedAt: initialStatus === 'SUBMITTED' ? Date.now() : null,
            revisionRound: 0,
            editingStartedAt: null,
            lastActiveAt: Date.now()
          };
          await setDoc(entryRef, newEntry);
        }
      }
    } catch (err) {
      console.error(`Failed to sync response to tracker for student ${studentId}:`, err);
    }
  },

  /**
   * Sync existing conference responses for a period to the tracker
   */
  async syncExistingConferenceResponsesToTracker(periodId: string): Promise<{ success: boolean; count: number }> {
    try {
      console.log(`[Sync] Starting sync of existing conference responses to tracker for period: ${periodId}`);
      const q = query(collection(db, RESPONSES_COLLECTION), where('periodId', '==', periodId));
      const snap = await getDocs(q);
      
      let count = 0;
      for (const d of snap.docs) {
        const resp = d.data() as StudentConferenceResponse;
        await this.syncResponseToTracker(periodId, resp.studentId, resp);
        count++;
      }
      
      console.log(`[Sync] Completed sync of existing conference responses. Synced ${count} student responses.`);
      return { success: true, count };
    } catch (error) {
      console.error('[Sync] Error syncing conference responses to tracker:', error);
      return { success: false, count: 0 };
    }
  },

  /**
   * Get all conference responses for a period
   */
  async getConferenceResponsesForPeriod(periodId: string): Promise<StudentConferenceResponse[]> {
    try {
      const q = query(
        collection(db, RESPONSES_COLLECTION),
        where('periodId', '==', periodId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as StudentConferenceResponse);
    } catch (error) {
      return handleFirestoreError(error, 'list', RESPONSES_COLLECTION);
    }
  },

  /**
   * Get all mentor assignments for a period
   */
  async getMentorAssignmentsForPeriod(periodId: string): Promise<MentorAssignment[]> {
    try {
      const q = query(
        collection(db, ASSIGNMENTS_COLLECTION),
        where('periodId', '==', periodId)
      );
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as MentorAssignment);
    } catch (error) {
      return handleFirestoreError(error, 'list', ASSIGNMENTS_COLLECTION);
    }
  },

  /**
   * Get eligible Junior High mentors from active users
   */
  async getEligibleJuniorHighMentors(): Promise<User[]> {
    try {
      const q = query(
        collection(db, 'users'),
        where('status', '==', 'active'),
        where('role', 'in', [
          'TEACHER',
          'HOMEROOM_TEACHER',
          'BK_MENTOR',
          'HEAD_JUNIOR',
          'HEAD_UNIT',
          'SUPER_ADMIN'
        ])
      );
      const snap = await getDocs(q);
      const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
      
      return snap.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as User))
        .filter(u => {
          if (!eligibleRoles.includes(u.role)) return false;
          
          const excludedRoles = ['HOMEROOM_TEACHER', 'COUNSELOR', 'STUDENT', 'PARENT'];
          if (excludedRoles.includes(u.role)) return false;

          const unit = u.unitId;
          const assigned = (u as any).assignedUnits || [];
          const hasJHAccess = unit === 'JUNIOR_HIGH' || assigned.includes('JUNIOR_HIGH') || u.role === 'SUPER_ADMIN';
          
          return hasJHAccess;
        })
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
    } catch (error) {
      return handleFirestoreError(error, 'list', 'users');
    }
  },

  /**
   * Get student detail view for workspace
   */
  async getStudentConferenceWorkspaceDetail(periodId: string, studentId: string): Promise<{
    student: Student | null;
    class: Class | null;
    response: StudentConferenceResponse | null;
    assignment: MentorAssignment | null;
  }> {
    try {
      const student = await getStudentById(studentId);
      let cls: Class | null = null;
      if (student?.classId) {
        const classes = (await getClasses()) || [];
        cls = classes.find(c => c.id === student.classId) || null;
      }
      const response = await this.getStudentConferenceResponse(periodId, studentId);
      const assignment = await this.getMentorAssignment(periodId, studentId);
      return {
        student,
        class: cls,
        response,
        assignment
      };
    } catch (error) {
      return handleFirestoreError(error, 'get', `studentWorkspaceDetail/${periodId}_${studentId}`);
    }
  },

  /**
   * Assign a mentor to a student
   */
  async assignMentorToStudent(periodId: string, studentId: string, mentorId: string, note?: string): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Unauthorized');

      const assignmentId = this.getMentorAssignmentId(periodId, studentId);
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const responseId = this.getConferenceResponseId(periodId, studentId);

      await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS FIRST ---
        const staffRef = doc(db, 'users', currentUid);
        const studentRef = doc(db, 'students', studentId);
        const mentorRef = doc(db, 'users', mentorId);
        const periodRef = doc(db, PERIODS_COLLECTION, periodId);
        const responseRef = doc(db, RESPONSES_COLLECTION, responseId);

        // Fetch primary Snaps concurrently before any write
        const [staffSnap, studentSnap, mentorSnap, periodSnap, assignmentSnap, responseSnap] = await Promise.all([
          transaction.get(staffRef),
          transaction.get(studentRef),
          transaction.get(mentorRef),
          transaction.get(periodRef),
          transaction.get(assignmentRef),
          transaction.get(responseRef)
        ]);

        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        if (staffData.status !== 'active') {
          throw new Error('Unauthorized: Staff profile is inactive.');
        }

        if (!studentSnap.exists()) throw new Error('Student not found');
        const studentData = studentSnap.data() as Student;

        // Fetch class details if classId exists (strictly before writes!)
        let className = 'Unknown Class';
        if (studentData.classId) {
          const classRef = doc(db, 'classes', studentData.classId);
          const classSnap = await transaction.get(classRef);
          if (classSnap.exists()) {
            className = classSnap.data().name || 'Unknown Class';
            const classData = classSnap.data() as Class;
            const isJHClass = classData.unitId === 'JUNIOR_HIGH' || ['7', '8', '9', 7, 8, 9].includes(classData.grade);
            if (!isJHClass) {
              throw new Error('Unauthorized: Lintas unit tidak diperbolehkan. Target request bukan JUNIOR_HIGH.');
            }
          }
        }

        if (!mentorSnap.exists()) throw new Error('Mentor not found');
        const mentorData = mentorSnap.data() as User;

        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
        }
        if (!eligibleRoles.includes(mentorData.role)) {
          throw new Error('Invalid Mentor: Selected user is not an eligible mentor.');
        }

        // Unit user access checks
        const staffAssigned = (staffData as any).assignedUnits || [];
        const hasStaffJHAccess = staffData.unitId === 'JUNIOR_HIGH' || staffAssigned.includes('JUNIOR_HIGH') || staffData.role === 'SUPER_ADMIN';
        if (!hasStaffJHAccess) {
          throw new Error('Unauthorized: Lintas unit tidak diperbolehkan.');
        }

        if (mentorData.status !== 'active') {
          throw new Error('Invalid Mentor: Selected mentor is inactive.');
        }
        const mentorAssigned = (mentorData as any).assignedUnits || [];
        const hasMentorJHAccess = mentorData.unitId === 'JUNIOR_HIGH' || mentorAssigned.includes('JUNIOR_HIGH') || mentorData.role === 'SUPER_ADMIN';
        if (!hasMentorJHAccess) {
          throw new Error('Invalid Mentor: Selected mentor must have Junior High access.');
        }

        if (!periodSnap.exists()) throw new Error('Conference period not found');
        const periodData = periodSnap.data() as ConferencePeriod;

        // --- 2. CALCULATE VALUES ---
        let existingHistory = [];
        let existingData: MentorAssignment | null = null;
        if (assignmentSnap.exists()) {
          existingData = assignmentSnap.data() as MentorAssignment;
          existingHistory = existingData.assignmentHistory || [];
        }

        const now = Date.now();
        const historyEntry = {
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorEmail: mentorData.email || '',
          action: 'ASSIGNED' as const,
          actionBy: currentUid,
          actionByName: staffData.displayName || '',
          actionAt: now,
          reason: note || null
        };

        const updatedHistory = [...existingHistory, historyEntry];

        const newAssignment: MentorAssignment = {
          id: assignmentId,
          periodId,
          academicYear: periodData.academicYear,
          semester: periodData.semester as (1 | 2),
          studentId,
          studentName: studentData.name || '',
          classId: studentData.classId || '',
          className,
          unit: 'JUNIOR_HIGH',
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorEmail: mentorData.email || '',
          mentorRole: mentorData.role || '',
          status: 'ACTIVE',
          assignedBy: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedBy : currentUid,
          assignedByUid: assignmentSnap.exists() ? ((assignmentSnap.data() as any).assignedByUid || (assignmentSnap.data() as MentorAssignment).assignedBy) : currentUid,
          assignedByName: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedByName : staffData.displayName || '',
          assignedAt: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedAt : now,
          updatedBy: currentUid,
          updatedAt: now,
          previousMentorId: assignmentSnap.exists() ? ((assignmentSnap.data() as MentorAssignment).mentorId || null) : null,
          reassignmentReason: note || null,
          assignmentHistory: updatedHistory
        };

        const responseData = {
          unit: 'JUNIOR_HIGH' as const,
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorRole: mentorData.role || '',
          assignedAt: now,
          assignedByUid: currentUid,
          assignedByName: staffData.displayName || '',
          updatedAt: now
        };

        // --- 3. ALL WRITES LAST ---
        // Write to assignments
        transaction.set(assignmentRef, newAssignment);

        // Write/Update studentConferenceResponse doc
        if (responseSnap.exists()) {
          transaction.update(responseRef, responseData);
        } else {
          const newResponse = {
            id: responseId,
            periodId,
            studentId,
            studentName: studentData.name || '',
            studentLuminaId: studentData.nis || studentId,
            classId: studentData.classId || '',
            className,
            gradeLevel: studentData.grade || 0,
            academicYear: periodData.academicYear,
            semester: periodData.semester as (1 | 2),
            status: 'DRAFT' as const,
            aboutMe: '',
            strengths: '',
            areasForGrowth: '',
            goals: [],
            selfExplorationReferenceId: null,
            karyaIlmiahReferenceId: null,
            createdAt: now,
            ...responseData
          };
          transaction.set(responseRef, newResponse);
        }

        // Add Audit Log
        const auditId = doc(collection(db, 'mentorAssignmentAudits')).id;
        const auditRef = doc(db, 'mentorAssignmentAudits', auditId);
        const auditEntry = {
          action: 'MENTOR_ASSIGNED',
          conferenceRequestId: responseId,
          unit: 'JUNIOR_HIGH',
          previousMentorId: existingData?.mentorId || null,
          newMentorId: mentorId,
          performedByUid: currentUid,
          performedByName: staffData.displayName || '',
          createdAt: now
        };
        transaction.set(auditRef, auditEntry);
      });
    } catch (error) {
      return handleFirestoreError(error, 'create', `${ASSIGNMENTS_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Reassign a mentor
   */
  async reassignMentorForStudent(periodId: string, studentId: string, mentorId: string, reason?: string): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Unauthorized');

      const assignmentId = this.getMentorAssignmentId(periodId, studentId);
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const responseId = this.getConferenceResponseId(periodId, studentId);

      await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS FIRST ---
        const staffRef = doc(db, 'users', currentUid);
        const mentorRef = doc(db, 'users', mentorId);
        const responseRef = doc(db, RESPONSES_COLLECTION, responseId);

        const [assignmentSnap, staffSnap, mentorSnap, responseSnap] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(staffRef),
          transaction.get(mentorRef),
          transaction.get(responseRef)
        ]);

        if (!assignmentSnap.exists()) {
          throw new Error('Mentor assignment does not exist.');
        }
        const existingData = assignmentSnap.data() as MentorAssignment;

        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        if (staffData.status !== 'active') {
          throw new Error('Unauthorized: Staff profile is inactive.');
        }

        if (!mentorSnap.exists()) throw new Error('Mentor not found');
        const mentorData = mentorSnap.data() as User;

        // --- 2. VALIDATIONS & CALCULATIONS ---
        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
        }
        if (!eligibleRoles.includes(mentorData.role)) {
          throw new Error('Invalid Mentor: Selected user is not an eligible mentor.');
        }

        // Unit user access checks
        const staffAssigned = (staffData as any).assignedUnits || [];
        const hasStaffJHAccess = staffData.unitId === 'JUNIOR_HIGH' || staffAssigned.includes('JUNIOR_HIGH') || staffData.role === 'SUPER_ADMIN';
        if (!hasStaffJHAccess) {
          throw new Error('Unauthorized: Lintas unit tidak diperbolehkan.');
        }

        if (mentorData.status !== 'active') {
          throw new Error('Invalid Mentor: Selected mentor is inactive.');
        }
        const mentorAssigned = (mentorData as any).assignedUnits || [];
        const hasMentorJHAccess = mentorData.unitId === 'JUNIOR_HIGH' || mentorAssigned.includes('JUNIOR_HIGH') || mentorData.role === 'SUPER_ADMIN';
        if (!hasMentorJHAccess) {
          throw new Error('Invalid Mentor: Selected mentor must have Junior High access.');
        }

        const now = Date.now();
        const historyEntry = {
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorEmail: mentorData.email || '',
          action: 'REASSIGNED' as const,
          actionBy: currentUid,
          actionByName: staffData.displayName || '',
          actionAt: now,
          reason: reason || null
        };

        const updatedHistory = [...(existingData.assignmentHistory || []), historyEntry];

        const updatedAssignment: Partial<MentorAssignment> = {
          previousMentorId: existingData.mentorId || null,
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorEmail: mentorData.email || '',
          mentorRole: mentorData.role || '',
          status: 'ACTIVE',
          updatedBy: currentUid,
          updatedAt: now,
          reassignmentReason: reason || null,
          assignmentHistory: updatedHistory
        };

        // --- 3. ALL WRITES LAST ---
        transaction.update(assignmentRef, updatedAssignment);

        // Update response doc
        if (responseSnap.exists()) {
          transaction.update(responseRef, {
            mentorId,
            mentorName: mentorData.displayName || '',
            mentorRole: mentorData.role || '',
            assignedAt: now,
            assignedByUid: currentUid,
            assignedByName: staffData.displayName || '',
            updatedAt: now
          });
        }

        // Add Audit Log
        const auditId = doc(collection(db, 'mentorAssignmentAudits')).id;
        const auditRef = doc(db, 'mentorAssignmentAudits', auditId);
        const auditEntry = {
          action: 'MENTOR_REASSIGNED',
          conferenceRequestId: responseId,
          unit: 'JUNIOR_HIGH',
          previousMentorId: existingData.mentorId || null,
          newMentorId: mentorId,
          performedByUid: currentUid,
          performedByName: staffData.displayName || '',
          createdAt: now
        };
        transaction.set(auditRef, auditEntry);
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${ASSIGNMENTS_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Remove a mentor assignment
   */
  async removeMentorFromStudent(periodId: string, studentId: string, reason?: string): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Unauthorized');

      const assignmentId = this.getMentorAssignmentId(periodId, studentId);
      const assignmentRef = doc(db, ASSIGNMENTS_COLLECTION, assignmentId);
      const responseId = this.getConferenceResponseId(periodId, studentId);

      await runTransaction(db, async (transaction) => {
        // --- 1. ALL READS FIRST ---
        const staffRef = doc(db, 'users', currentUid);
        const responseRef = doc(db, RESPONSES_COLLECTION, responseId);

        const [assignmentSnap, staffSnap, responseSnap] = await Promise.all([
          transaction.get(assignmentRef),
          transaction.get(staffRef),
          transaction.get(responseRef)
        ]);

        if (!assignmentSnap.exists()) {
          throw new Error('Mentor assignment does not exist.');
        }
        const existingData = assignmentSnap.data() as MentorAssignment;

        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        if (staffData.status !== 'active') {
          throw new Error('Unauthorized: Staff profile is inactive.');
        }

        // --- 2. VALIDATIONS & CALCULATIONS ---
        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
        }

        // Unit user access checks
        const staffAssigned = (staffData as any).assignedUnits || [];
        const hasStaffJHAccess = staffData.unitId === 'JUNIOR_HIGH' || staffAssigned.includes('JUNIOR_HIGH') || staffData.role === 'SUPER_ADMIN';
        if (!hasStaffJHAccess) {
          throw new Error('Unauthorized: Lintas unit tidak diperbolehkan.');
        }

        const now = Date.now();
        const historyEntry = {
          mentorId: null,
          mentorName: null,
          mentorEmail: null,
          action: 'REMOVED' as const,
          actionBy: currentUid,
          actionByName: staffData.displayName || '',
          actionAt: now,
          reason: reason || null
        };

        const updatedHistory = [...(existingData.assignmentHistory || []), historyEntry];

        const updatedAssignment: Partial<MentorAssignment> = {
          previousMentorId: existingData.mentorId || null,
          mentorId: null,
          mentorName: null,
          mentorEmail: null,
          mentorRole: null,
          status: 'REMOVED',
          updatedBy: currentUid,
          updatedAt: now,
          reassignmentReason: reason || null,
          assignmentHistory: updatedHistory
        };

        // --- 3. ALL WRITES LAST ---
        transaction.update(assignmentRef, updatedAssignment);

        // Update response doc
        if (responseSnap.exists()) {
          transaction.update(responseRef, {
            mentorId: null,
            mentorName: null,
            mentorRole: null,
            assignedAt: null,
            assignedByUid: null,
            assignedByName: null,
            updatedAt: now
          });
        }

        // Add Audit Log
        const auditId = doc(collection(db, 'mentorAssignmentAudits')).id;
        const auditRef = doc(db, 'mentorAssignmentAudits', auditId);
        const auditEntry = {
          action: 'MENTOR_REASSIGNED',
          conferenceRequestId: responseId,
          unit: 'JUNIOR_HIGH',
          previousMentorId: existingData.mentorId || null,
          newMentorId: '',
          performedByUid: currentUid,
          performedByName: staffData.displayName || '',
          createdAt: now
        };
        transaction.set(auditRef, auditEntry);
      });
    } catch (error) {
      return handleFirestoreError(error, 'update', `${ASSIGNMENTS_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Get trackable goals for a student from their submitted/completed conference response
   */
  async getStudentTrackableGoals(periodId: string, resolvedStudentId: string): Promise<SmartGoal[]> {
    try {
      const response = await this.getStudentConferenceResponse(periodId, resolvedStudentId);
      if (!response) return [];
      if (response.status !== 'SUBMITTED' && response.status !== 'CONFERENCE_COMPLETED') return [];
      return response.goals || [];
    } catch (error) {
      return handleFirestoreError(error, 'list', `${RESPONSES_COLLECTION}/${periodId}_${resolvedStudentId}`);
    }
  },

  /**
   * Get tracker progress timeline entries for a student, optionally filtered by goal ID
   */
  async getStudentTrackerEntries(periodId: string, resolvedStudentId: string, goalId?: string): Promise<SmartGoalTrackerEntry[]> {
    try {
      let q = query(
        collection(db, TRACKER_COLLECTION),
        where('periodId', '==', periodId),
        where('studentId', '==', resolvedStudentId)
      );
      if (goalId) {
        q = query(q, where('goalId', '==', goalId));
      }
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmartGoalTrackerEntry));
      return entries.sort((a, b) => b.entryDate - a.entryDate || b.createdAt - a.createdAt);
    } catch (error) {
      return handleFirestoreError(error, 'list', TRACKER_COLLECTION);
    }
  },

  /**
   * Get a specific tracker entry by ID for the student (secures access)
   */
  async getStudentTrackerEntryById(entryId: string, resolvedStudentId: string): Promise<SmartGoalTrackerEntry | null> {
    try {
      const docRef = doc(db, TRACKER_COLLECTION, entryId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      const data = snap.data() as SmartGoalTrackerEntry;
      if (data.studentId !== resolvedStudentId) {
        throw new Error('Unauthorized: This entry does not belong to you.');
      }
      return { id: snap.id, ...data };
    } catch (error) {
      return handleFirestoreError(error, 'get', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Create a student tracker progress entry with strict validation
   */
  async createStudentTrackerEntry(payload: {
    periodId: string;
    studentId: string;
    goalId: string;
    entryDate: number;
    actionsTaken: string;
    progressMade: string;
    hinderingBehaviors: string;
    improvementPlan: string;
    isSubmit?: boolean;
  }, resolvedStudentId: string): Promise<string> {
    try {
      const { periodId, studentId, goalId, entryDate, actionsTaken, progressMade, hinderingBehaviors, improvementPlan } = payload;
      
      if (studentId !== resolvedStudentId) {
        throw new Error('Unauthorized: studentId mismatch.');
      }

      // 1. Validate period exists and is open
      const period = await this.getConferencePeriodById(periodId);
      if (!period) throw new Error('Conference period not found.');
      
      const now = Date.now();
      if (period.status !== 'OPEN') {
        throw new Error('SMART Goal Tracker is not open.');
      }
      if (period.trackerOpenDate && now < period.trackerOpenDate) {
        throw new Error('The SMART Goal Tracker window is not open yet.');
      }
      if (period.trackerCloseDate && now > period.trackerCloseDate) {
        throw new Error('The SMART Goal Tracker window has closed.');
      }

      // Validate date inside active tracker window
      if (period.trackerOpenDate && entryDate < period.trackerOpenDate) {
        throw new Error('Entry date cannot be before the tracker window open date.');
      }
      if (period.trackerCloseDate && entryDate > period.trackerCloseDate) {
        throw new Error('Entry date cannot be after the tracker window close date.');
      }
      if (entryDate > now) {
        throw new Error('Entry date cannot be in the future.');
      }

      // 2. Validate response exists and status is SUBMITTED or CONFERENCE_COMPLETED
      const response = await this.getStudentConferenceResponse(periodId, studentId);
      if (!response) throw new Error('Goal Setting response not found.');
      if (response.status !== 'SUBMITTED' && response.status !== 'CONFERENCE_COMPLETED') {
        throw new Error('Submit your Goal Setting before starting SMART Goal Tracker.');
      }

      // 3. Find target goal and derive fields
      const goal = (response.goals || []).find(g => g.id === goalId);
      if (!goal) throw new Error('Selected goal does not exist in your conference response.');

      // Validation of required text fields
      if (!actionsTaken?.trim()) throw new Error('Actions taken is required.');
      if (!progressMade?.trim()) throw new Error('Progress made is required.');
      if (!hinderingBehaviors?.trim()) throw new Error('Hindering behaviors is required.');
      if (!improvementPlan?.trim()) throw new Error('Improvement plan is required.');

      // 4. Create document
      const entryRef = doc(collection(db, TRACKER_COLLECTION));
      const entryId = entryRef.id;

      let assignedMentorId = null;
      let assignedMentorName = null;
      try {
        const assignment = await this.getMentorAssignment(periodId, studentId);
        if (assignment && assignment.status === 'ACTIVE') {
          assignedMentorId = assignment.mentorId || null;
          assignedMentorName = assignment.mentorName || null;
        }
      } catch (e) {
        console.warn('Could not fetch mentor assignment for new tracker entry:', e);
      }

      const sectionReviews = {
        goal: { status: 'NOT_REVIEWED' as const, comment: '' },
        actionPlan: { status: 'NOT_REVIEWED' as const, comment: '' },
        progress: { status: 'NOT_REVIEWED' as const, comment: '' },
        reflection: { status: 'NOT_REVIEWED' as const, comment: '' }
      };

      const initialStatus = payload.isSubmit ? 'SUBMITTED' : 'DRAFT';

      const newEntry: SmartGoalTrackerEntry = {
        id: entryId,
        periodId,
        studentId,
        goalId,
        goalStrand: goal.strand,
        goalSnapshot: goal,
        entryDate,
        actionsTaken,
        progressMade,
        hinderingBehaviors,
        improvementPlan,
        mentorComment: null,
        commentedBy: null,
        commentedByName: null,
        commentedAt: null,
        createdAt: now,
        updatedAt: now,

        // NEW BACKWARD-COMPATIBLE FIELDS
        overallStatus: initialStatus,
        sectionReviews,
        assignedMentorId,
        assignedMentorName,
        submittedAt: payload.isSubmit ? now : null,
        lastSubmittedAt: payload.isSubmit ? now : null,
        revisionRound: 0,
        editingStartedAt: null,
        lastActiveAt: now
      };

      await setDoc(entryRef, newEntry);

      if (payload.isSubmit) {
        try {
          const assignment = await this.getMentorAssignment(periodId, studentId);
          if (assignment?.mentorEmail) {
            await sendNotification({
              userId: assignment.mentorEmail,
              type: 'REPORT_SUBMITTED',
              message: `Tracker ${response.studentName} menunggu review.`,
              link: `/junior-high/conference/tracker`
            });
          }
        } catch (notifErr) {
          console.error('Failed to send submit notification:', notifErr);
        }
      }

      return entryId;
    } catch (error) {
      return handleFirestoreError(error, 'write', TRACKER_COLLECTION);
    }
  },

  /**
   * Update student tracker progress entry with strict validation
   */
  async updateStudentTrackerEntry(entryId: string, payload: {
    entryDate: number;
    actionsTaken: string;
    progressMade: string;
    hinderingBehaviors: string;
    improvementPlan: string;
    isSubmit?: boolean;
  }, resolvedStudentId: string): Promise<void> {
    try {
      const entryRef = doc(db, TRACKER_COLLECTION, entryId);
      const snap = await getDoc(entryRef);
      if (!snap.exists()) throw new Error('Tracker entry not found.');
      
      const existingEntry = snap.data() as SmartGoalTrackerEntry;
      if (existingEntry.studentId !== resolvedStudentId) {
        throw new Error('Unauthorized: This entry does not belong to you.');
      }

      const { periodId } = existingEntry;

      // Validate period exists and is open for writing
      const period = await this.getConferencePeriodById(periodId);
      if (!period) throw new Error('Conference period not found.');
      
      const now = Date.now();
      if (period.status !== 'OPEN') {
        throw new Error('SMART Goal Tracker is not open.');
      }
      if (period.trackerOpenDate && now < period.trackerOpenDate) {
        throw new Error('The SMART Goal Tracker window is not open yet.');
      }
      if (period.trackerCloseDate && now > period.trackerCloseDate) {
        throw new Error('The SMART Goal Tracker window has closed.');
      }

      const { entryDate, actionsTaken, progressMade, hinderingBehaviors, improvementPlan, isSubmit } = payload;

      // Validate date inside active tracker window
      if (period.trackerOpenDate && entryDate < period.trackerOpenDate) {
        throw new Error('Entry date cannot be before the tracker window open date.');
      }
      if (period.trackerCloseDate && entryDate > period.trackerCloseDate) {
        throw new Error('Entry date cannot be after the tracker window close date.');
      }
      if (entryDate > now) {
        throw new Error('Entry date cannot be in the future.');
      }

      // Text fields validation
      if (!actionsTaken?.trim()) throw new Error('Actions taken is required.');
      if (!progressMade?.trim()) throw new Error('Progress made is required.');
      if (!hinderingBehaviors?.trim()) throw new Error('Hindering behaviors is required.');
      if (!improvementPlan?.trim()) throw new Error('Improvement plan is required.');

      // Determine new status
      let newOverallStatus: TrackerOverallStatus = existingEntry.overallStatus || 'DRAFT';
      let newRevisionRound = existingEntry.revisionRound || 0;
      let newSubmittedAt = existingEntry.submittedAt || null;
      let newLastSubmittedAt = existingEntry.lastSubmittedAt || null;

      if (isSubmit) {
        newOverallStatus = 'SUBMITTED';
        newLastSubmittedAt = now;
        if (!newSubmittedAt) {
          newSubmittedAt = now;
        }
        if (existingEntry.overallStatus === 'REVISION_REQUIRED' || existingEntry.overallStatus === 'PARTIALLY_APPROVED') {
          newRevisionRound = (existingEntry.revisionRound || 0) + 1;
        }
      }

      const updateData: any = {
        entryDate,
        actionsTaken,
        progressMade,
        hinderingBehaviors,
        improvementPlan,
        overallStatus: newOverallStatus,
        revisionRound: newRevisionRound,
        submittedAt: newSubmittedAt,
        lastSubmittedAt: newLastSubmittedAt,
        lastActiveAt: now,
        updatedAt: now
      };

      await updateDoc(entryRef, updateData);

      // Send notification to mentor if submitted
      if (isSubmit) {
        try {
          const assignment = await this.getMentorAssignment(periodId, resolvedStudentId);
          if (assignment?.mentorEmail) {
            await sendNotification({
              userId: assignment.mentorEmail,
              type: 'REPORT_SUBMITTED',
              message: `Tracker ${assignment.studentName} menunggu review.`,
              link: `/junior-high/conference/tracker`
            });
          }
        } catch (notifErr) {
          console.error('Failed to send submit notification:', notifErr);
        }
      }
    } catch (error) {
      return handleFirestoreError(error, 'write', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Start editing a student tracker progress entry (DRAFT or REVISION_REQUIRED -> EDITING)
   */
  async startEditingTrackerEntry(entryId: string, resolvedStudentId: string): Promise<void> {
    try {
      const entryRef = doc(db, TRACKER_COLLECTION, entryId);
      const snap = await getDoc(entryRef);
      if (!snap.exists()) throw new Error('Tracker entry not found.');
      
      const existingEntry = snap.data() as SmartGoalTrackerEntry;
      if (existingEntry.studentId !== resolvedStudentId) {
        throw new Error('Unauthorized: This entry does not belong to you.');
      }

      const now = Date.now();
      await updateDoc(entryRef, {
        overallStatus: 'EDITING',
        editingStartedAt: now,
        lastActiveAt: now,
        updatedAt: now
      });
    } catch (error) {
      return handleFirestoreError(error, 'write', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Save section reviews and update overall status for a student progress tracker entry
   */
  async saveSectionReviews(
    entryId: string,
    sectionReviews: {
      goal: TrackerSectionReview;
      actionPlan: TrackerSectionReview;
      progress: TrackerSectionReview;
      reflection: TrackerSectionReview;
    },
    currentUserProfile: User
  ): Promise<void> {
    try {
      const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
      if (!eligibleRoles.includes(currentUserProfile.role)) {
        throw new Error('Unauthorized: Role not allowed to write reviews.');
      }

      // Check Junior High Access
      const unit = currentUserProfile.unitId;
      const assigned = (currentUserProfile as any).assignedUnits || [];
      const hasJHAccess = unit === 'JUNIOR_HIGH' || assigned.includes('JUNIOR_HIGH') || currentUserProfile.role === 'SUPER_ADMIN';
      if (!hasJHAccess) {
        throw new Error('Unauthorized: You do not have Junior High workspace access.');
      }

      const entryRef = doc(db, TRACKER_COLLECTION, entryId);
      const entrySnap = await getDoc(entryRef);
      if (!entrySnap.exists()) {
        throw new Error('Tracker entry not found.');
      }
      const entryData = entrySnap.data() as SmartGoalTrackerEntry;

      // Validate period is not ARCHIVED
      const period = await this.getConferencePeriodById(entryData.periodId);
      if (!period) {
        throw new Error('Conference period not found.');
      }
      if (period.status === 'ARCHIVED') {
        throw new Error('Cannot add or edit reviews for an archived period.');
      }

      // Validate each section review (if status is REVISION_REQUIRED, comment is required)
      const sections: Array<'goal' | 'actionPlan' | 'progress' | 'reflection'> = ['goal', 'actionPlan', 'progress', 'reflection'];
      for (const sec of sections) {
        const rev = sectionReviews[sec];
        if (rev.status === 'REVISION_REQUIRED' && !rev.comment?.trim()) {
          throw new Error(`Komentar wajib diisi jika bagian "${sec}" membutuhkan revisi.`);
        }
      }

      // Calculate overallStatus based on section reviews
      const statuses = [
        sectionReviews.goal.status,
        sectionReviews.actionPlan.status,
        sectionReviews.progress.status,
        sectionReviews.reflection.status
      ];

      let overallStatus: TrackerOverallStatus = 'SUBMITTED';
      if (statuses.every(s => s === 'APPROVED')) {
        overallStatus = 'FULLY_APPROVED';
      } else if (statuses.includes('REVISION_REQUIRED')) {
        if (statuses.includes('APPROVED')) {
          overallStatus = 'PARTIALLY_APPROVED';
        } else {
          overallStatus = 'REVISION_REQUIRED';
        }
      } else {
        overallStatus = 'SUBMITTED';
      }

      const now = Date.now();
      // Add reviewer metadata to sections that were reviewed (status not NOT_REVIEWED)
      const updatedSectionReviews = { ...sectionReviews };
      for (const sec of sections) {
        const rev = updatedSectionReviews[sec];
        if (rev.status !== 'NOT_REVIEWED') {
          rev.reviewedByUid = currentUserProfile.uid;
          rev.reviewedByName = currentUserProfile.displayName || currentUserProfile.email;
          rev.reviewedAt = now;
        } else {
          rev.reviewedByUid = null;
          rev.reviewedByName = null;
          rev.reviewedAt = null;
        }
      }

      const updatePayload: Partial<SmartGoalTrackerEntry> = {
        sectionReviews: updatedSectionReviews,
        overallStatus,
        updatedAt: now
      };

      await updateDoc(entryRef, updatePayload);

      // Send notification to student
      try {
        const student = await getStudentById(entryData.studentId);
        if (student?.email) {
          const typeStr = overallStatus === 'FULLY_APPROVED' ? 'REPORT_APPROVED' : 'REPORT_REJECTED';
          const msgStr = overallStatus === 'FULLY_APPROVED' 
            ? `Smart Goal Tracker progress update kamu telah DISETUJUI PENUH!` 
            : `Smart Goal Tracker progress update kamu butuh revisi. Status: ${overallStatus === 'PARTIALLY_APPROVED' ? 'Disetujui Sebagian' : 'Perlu Revisi'}.`;

          await sendNotification({
            userId: student.email,
            type: typeStr,
            message: msgStr,
            link: '/student/smart-goal-tracker'
          });
        }
      } catch (notifErr) {
        console.error('Failed to send review notification:', notifErr);
      }
    } catch (error) {
      return handleFirestoreError(error, 'write', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Get all tracker entries for a period for staff view
   */
  async getTrackerEntriesForPeriod(periodId: string): Promise<SmartGoalTrackerEntry[]> {
    try {
      const q = query(
        collection(db, TRACKER_COLLECTION),
        where('periodId', '==', periodId)
      );
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmartGoalTrackerEntry));
      return entries.sort((a, b) => b.entryDate - a.entryDate || b.createdAt - a.createdAt);
    } catch (error) {
      return handleFirestoreError(error, 'list', TRACKER_COLLECTION);
    }
  },

  /**
   * Get a single tracker entry for staff view details
   */
  async getTrackerWorkspaceEntryDetail(entryId: string): Promise<SmartGoalTrackerEntry | null> {
    try {
      const docRef = doc(db, TRACKER_COLLECTION, entryId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as SmartGoalTrackerEntry;
    } catch (error) {
      return handleFirestoreError(error, 'get', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Get all mentor assignments for a period to join/filter tracker entries
   */
  async getTrackerMentorAssignmentsForPeriod(periodId: string): Promise<MentorAssignment[]> {
    return this.getMentorAssignmentsForPeriod(periodId);
  },

  /**
   * Save staff mentor comment on student progress entry
   */
  async saveMentorComment(entryId: string, comment: string, currentUserProfile: User): Promise<void> {
    try {
      const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
      if (!eligibleRoles.includes(currentUserProfile.role)) {
        throw new Error('Unauthorized: Role not allowed to write mentor comments.');
      }

      // Check Junior High Access
      const unit = currentUserProfile.unitId;
      const assigned = (currentUserProfile as any).assignedUnits || [];
      const hasJHAccess = unit === 'JUNIOR_HIGH' || assigned.includes('JUNIOR_HIGH') || currentUserProfile.role === 'SUPER_ADMIN';
      if (!hasJHAccess) {
        throw new Error('Unauthorized: You do not have Junior High workspace access.');
      }

      const entryRef = doc(db, TRACKER_COLLECTION, entryId);
      const entrySnap = await getDoc(entryRef);
      if (!entrySnap.exists()) {
        throw new Error('Tracker entry not found.');
      }
      const entryData = entrySnap.data() as SmartGoalTrackerEntry;

      // Validate period is not ARCHIVED
      const period = await this.getConferencePeriodById(entryData.periodId);
      if (!period) {
        throw new Error('Conference period not found.');
      }
      if (period.status === 'ARCHIVED') {
        throw new Error('Cannot add or edit comments for an archived period.');
      }

      if (!comment?.trim()) {
        throw new Error('Mentor comment cannot be empty.');
      }

      const now = Date.now();
      await updateDoc(entryRef, {
        mentorComment: comment.trim(),
        commentedBy: currentUserProfile.uid,
        commentedByName: currentUserProfile.displayName || currentUserProfile.email,
        commentedAt: now,
        updatedAt: now
      });
    } catch (error) {
      return handleFirestoreError(error, 'write', `${TRACKER_COLLECTION}/${entryId}`);
    }
  },

  /**
   * Save teacher reviews for a student's Three-Way Conference Response
   */
  async saveTeacherConferenceReview(
    periodId: string,
    studentId: string,
    reviewPayload: {
      reflectionStatus: 'APPROVED' | 'REVISION_REQUIRED';
      reflectionComment: string;
      extracurricularStatus: 'APPROVED' | 'REVISION_REQUIRED';
      extracurricularComment: string;
      smartGoals: Record<string, { status: 'APPROVED' | 'REVISION_REQUIRED'; comment: string }>;
      selfExplorationStatus?: 'APPROVED' | 'REVISION_REQUIRED';
      selfExplorationComment?: string;
      karyaIlmiahStatus?: 'APPROVED' | 'REVISION_REQUIRED';
      karyaIlmiahComment?: string;
      unitActivityStatus?: 'APPROVED' | 'REVISION_REQUIRED';
      unitActivityComment?: string;
    },
    currentUserUid: string,
    currentUserName: string
  ): Promise<void> {
    try {
      const responseId = `${periodId}_${studentId}`;
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      const snap = await getDoc(responseRef);
      if (!snap.exists()) {
        throw new Error('Conference response not found.');
      }
      const responseData = snap.data() as StudentConferenceResponse;
      const now = Date.now();
      
      const existingReviews = responseData.sectionReviews || {};

      // 1. Reflection (aboutMe, strengths, growthAreas)
      const reflectionStatus = reviewPayload.reflectionStatus;
      const reflectionComment = reviewPayload.reflectionComment;

      // 2. Self-Exploration
      const selfExplorationStatus = reviewPayload.selfExplorationStatus !== undefined
        ? reviewPayload.selfExplorationStatus
        : (existingReviews.selfExploration?.status || reviewPayload.extracurricularStatus);
      const selfExplorationComment = reviewPayload.selfExplorationComment !== undefined
        ? reviewPayload.selfExplorationComment
        : (existingReviews.selfExploration?.comment || reviewPayload.extracurricularComment);

      // 3. Karya Ilmiah
      const karyaIlmiahStatus = reviewPayload.karyaIlmiahStatus !== undefined
        ? reviewPayload.karyaIlmiahStatus
        : (existingReviews.karyaIlmiah?.status || reviewPayload.extracurricularStatus);
      const karyaIlmiahComment = reviewPayload.karyaIlmiahComment !== undefined
        ? reviewPayload.karyaIlmiahComment
        : (existingReviews.karyaIlmiah?.comment || reviewPayload.extracurricularComment);

      // 4. Unit Activity (stored in extracurricular for overallStatus mapping)
      const extracurricularStatus = reviewPayload.unitActivityStatus !== undefined
        ? reviewPayload.unitActivityStatus
        : (reviewPayload.extracurricularStatus !== undefined ? reviewPayload.extracurricularStatus : (existingReviews.extracurricular?.status || 'APPROVED'));
      const extracurricularComment = reviewPayload.unitActivityComment !== undefined
        ? reviewPayload.unitActivityComment
        : (reviewPayload.extracurricularComment !== undefined ? reviewPayload.extracurricularComment : (existingReviews.extracurricular?.comment || ''));

      // Build sectionReviews structured payload
      const sectionReviews: any = {
        aboutMe: {
          status: reflectionStatus,
          comment: reflectionComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        strengths: {
          status: reflectionStatus,
          comment: reflectionComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        growthAreas: {
          status: reflectionStatus,
          comment: reflectionComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        reflection: { // key for student UI component lock
          status: reflectionStatus,
          comment: reflectionComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        selfExploration: {
          status: selfExplorationStatus,
          comment: selfExplorationComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        karyaIlmiah: {
          status: karyaIlmiahStatus,
          comment: karyaIlmiahComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        extracurricular: { // Maps to Unit Activity
          status: extracurricularStatus,
          comment: extracurricularComment,
          reviewedByUid: currentUserUid,
          reviewedByName: currentUserName,
          reviewedAt: now
        },
        smartGoals: {}
      };

      // Map goals reviews (preserve existing reviews if not updated)
      const existingGoalsReviews = existingReviews.smartGoals || {};
      sectionReviews.smartGoals = { ...existingGoalsReviews };

      if (reviewPayload.smartGoals) {
        Object.entries(reviewPayload.smartGoals).forEach(([goalId, val]) => {
          sectionReviews.smartGoals[goalId] = {
            status: val.status,
            comment: val.comment,
            reviewedByUid: currentUserUid,
            reviewedByName: currentUserName,
            reviewedAt: now
          };
        });
      }

      // Build overall response object to calculate its status
      const mockResponse: StudentConferenceResponse = {
        ...responseData,
        sectionReviews
      };

      const { status: calculatedStatus, summary: approvalSummary } = calculateConferenceStatus(mockResponse);

      let nextStatus = calculatedStatus;
      let updatedHistory = responseData.statusHistory || [];
      if (calculatedStatus !== responseData.status) {
        const historyItem = {
          fromStatus: responseData.status || 'DRAFT',
          toStatus: calculatedStatus,
          action: (calculatedStatus === 'APPROVED' ? 'APPROVED' : (calculatedStatus === 'RETURNED' ? 'RETURNED_BY_TEACHER' : 'DRAFT_SAVED')) as any,
          performedByUid: currentUserUid,
          performedByName: currentUserName,
          performedByRole: 'TEACHER' as const,
          note: `Workbook status diperbarui otomatis menjadi ${calculatedStatus}.`,
          createdAt: now
        };
        updatedHistory = [...updatedHistory, historyItem];
      }

      // Save update to firestore
      await updateDoc(responseRef, {
        sectionReviews,
        overallStatus: calculatedStatus,
        status: nextStatus,
        approvalSummary,
        statusUpdatedAt: now,
        statusUpdatedBy: currentUserUid,
        statusHistory: updatedHistory,
        updatedAt: now
      });

      // Send real notification to student
      try {
        const student = await getStudentById(studentId);
        if (student?.email) {
          const typeStr = calculatedStatus === 'APPROVED' ? 'REPORT_APPROVED' : 'REPORT_REJECTED';
          const msgStr = calculatedStatus === 'APPROVED'
            ? `Workbook Three-Way Conference kamu telah DISETUJUI PENUH oleh guru!`
            : `Workbook Three-Way Conference kamu butuh revisi. Status: ${calculatedStatus === 'RETURNED' ? 'Perlu Revisi' : 'DRAFT'}.`;

          await sendNotification({
            userId: student.email,
            type: typeStr,
            message: msgStr,
            link: '/student/goal-setting'
          });
        }
      } catch (notifErr) {
        console.error('Failed to send review notification to student:', notifErr);
      }

    } catch (error) {
      return handleFirestoreError(error, 'write', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Request revision for student workbook (from student side)
   */
  async requestRevision(periodId: string, studentId: string, reason: string): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Unauthorized');
      
      const responseId = this.getConferenceResponseId(periodId, studentId);
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      
      const assignment = await this.getMentorAssignment(periodId, studentId);
      const studentData = await getStudentById(studentId);
      const userName = studentData?.name || auth.currentUser?.displayName || 'Student';
      const now = Date.now();

      await runTransaction(db, async (transaction) => {
        const responseSnap = await transaction.get(responseRef);
        if (!responseSnap.exists()) {
          throw new Error('Workbook response not found.');
        }
        
        const responseData = responseSnap.data() as StudentConferenceResponse;
        
        if (responseData.status !== 'SUBMITTED' && responseData.status !== 'APPROVED' && responseData.status !== 'CONFERENCE_COMPLETED') {
          throw new Error('Permintaan revisi hanya dapat diajukan saat status workbook Sudah Dikirim atau Disetujui.');
        }
        
        if (responseData.revisionRequest?.status === 'PENDING') {
          throw new Error('Anda sudah memiliki permintaan revisi yang sedang menunggu persetujuan guru.');
        }

        const historyItem = {
          fromStatus: responseData.status,
          toStatus: responseData.status,
          action: 'REVISION_REQUESTED' as const,
          performedByUid: currentUid,
          performedByName: userName,
          performedByRole: 'STUDENT' as const,
          note: reason,
          createdAt: now
        };

        const updatedHistory = [...(responseData.statusHistory || []), historyItem];

        const revisionRequest = {
          status: 'PENDING' as const,
          reason,
          requestedAt: now,
          respondedAt: null,
          respondedByUid: null,
          teacherNote: null
        };

        transaction.update(responseRef, {
          revisionRequest,
          statusHistory: updatedHistory,
          lastEditedAt: now,
          lastEditedByUid: currentUid
        });
      });

      // Send notification after successful transaction
      if (assignment && assignment.mentorEmail) {
        await sendNotification({
          userId: assignment.mentorEmail,
          type: 'REVISION_REQUESTED' as any,
          message: `${userName} mengajukan permintaan revisi untuk workbook mereka.`,
          link: `/junior-high/conference/workspace`
        });
      }
    } catch (error) {
      return handleFirestoreError(error, 'write', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Teacher responds to a student revision request or returns workbook
   */
  async respondToRevisionRequest(
    periodId: string,
    studentId: string,
    action: 'RETURN' | 'DECLINE',
    teacherNote: string
  ): Promise<void> {
    try {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error('Unauthorized');
      
      const responseId = this.getConferenceResponseId(periodId, studentId);
      const responseRef = doc(db, RESPONSES_COLLECTION, responseId);
      
      await runTransaction(db, async (transaction) => {
        const responseSnap = await transaction.get(responseRef);
        if (!responseSnap.exists()) {
          throw new Error('Workbook response not found.');
        }
        
        const responseData = responseSnap.data() as StudentConferenceResponse;
        const now = Date.now();
        const teacherName = auth.currentUser?.displayName || auth.currentUser?.email || 'Teacher';

        const nextStatus = action === 'RETURN' ? 'RETURNED' : responseData.status;
        const actionType = action === 'RETURN' ? ('RETURNED_BY_TEACHER' as const) : ('REVISION_DECLINED' as const);

        const historyItem = {
          fromStatus: responseData.status,
          toStatus: nextStatus as any,
          action: actionType,
          performedByUid: currentUid,
          performedByName: teacherName,
          performedByRole: 'TEACHER' as const,
          note: teacherNote,
          createdAt: now
        };

        const updatedHistory = [...(responseData.statusHistory || []), historyItem];

        const revisionRequest = {
          status: action === 'RETURN' ? ('RETURNED' as const) : ('DECLINED' as const),
          reason: responseData.revisionRequest?.reason || 'Guru mengembalikan workbook untuk revisi.',
          requestedAt: responseData.revisionRequest?.requestedAt || now,
          respondedAt: now,
          respondedByUid: currentUid,
          teacherNote
        };

        const updatePayload: any = {
          status: nextStatus,
          revisionRequest,
          statusHistory: updatedHistory,
          lastEditedAt: now,
          lastEditedByUid: currentUid
        };

        transaction.update(responseRef, updatePayload);

        const studentData = await getStudentById(studentId);
        if (studentData && studentData.email) {
          await sendNotification({
            userId: studentData.email,
            type: 'REVISION_RESPONDED' as any,
            message: action === 'RETURN' 
              ? `Workbook Anda telah dikembalikan untuk revisi: "${teacherNote}"`
              : `Permintaan revisi workbook Anda ditolak: "${teacherNote}"`,
            link: `/student/goal-setting`
          });
        }
      });
    } catch (error) {
      return handleFirestoreError(error, 'write', `${RESPONSES_COLLECTION}/${periodId}_${studentId}`);
    }
  },

  /**
   * Secure service to retrieve a conference presentation payload for a specific viewer with strict access control validation.
   */
  async getConferencePresentationForViewer(
    conferenceId: string,
    viewer: User
  ): Promise<{ conference: StudentConferenceResponse; student: Student }> {
    try {
      const ACCESS_DENIED_ERROR = `Anda tidak memiliki akses ke presentasi ini.

Presentasi hanya dapat dibuka oleh siswa terkait, tim pengajar kelas,
mentor yang ditugaskan, atau pihak sekolah yang berwenang.`;

      if (!viewer || viewer.status !== 'active') {
        throw new Error(ACCESS_DENIED_ERROR);
      }

      // 1. Fetch conference response record
      const conference = await getConferenceById(conferenceId);
      if (!conference) {
        throw new Error('Presentasi tidak ditemukan');
      }

      // 2. Fetch student and latest viewer profile in parallel
      const [latestViewer, student] = await Promise.all([
        getUserProfile(viewer.uid),
        getStudentById(conference.studentId),
      ]);

      if (!latestViewer || latestViewer.status !== 'active') {
        throw new Error(ACCESS_DENIED_ERROR);
      }

      if (!student) {
        throw new Error('Data siswa untuk conference ini tidak ditemukan.');
      }

      // 3. Resolve class and active mentor assignment in parallel
      const [classData, activeMentorAssignment] = await Promise.all([
        resolveConferenceClass(conference, student),
        getActiveMentorAssignmentForConference(conferenceId),
      ]);

      // 4. Validate unit of the student / conference is JUNIOR_HIGH
      const viewerRoleNormalized = (latestViewer.role || '').replace(/_/g, '');
      const isSuperAdmin = viewerRoleNormalized === 'SUPERADMIN';
      
      const studentGrade = student?.grade;
      const isJuniorHigh = isSuperAdmin ||
                           conference.unit === 'JUNIOR_HIGH' || 
                           (conference.gradeLevel && [7, 8, 9, '7', '8', '9'].includes(String(conference.gradeLevel))) ||
                           (studentGrade && [7, 8, 9, '7', '8', '9'].includes(String(studentGrade))) ||
                           (classData?.unitId === 'JUNIOR_HIGH') ||
                           (classData?.grade && [7, 8, 9, '7', '8', '9'].includes(String(classData.grade)));

      if (!isJuniorHigh) {
        throw new Error(ACCESS_DENIED_ERROR);
      }

      // 5. Evaluate complete access rules using the unified checker helper
      const { allowed, reason } = canViewConferencePresentationWithReason({
        viewer: latestViewer,
        conference,
        student,
        classData,
        activeMentorAssignment,
      });

      // Temporary debug logging for development-only (safely handles potential nulls)
      console.debug('[ConferencePresentationAccess]', {
        conferenceId,
        viewerUid: latestViewer.uid,
        viewerRole: latestViewer.role,
        conferenceStudentId: conference.studentId,
        resolvedClassId: classData?.id ?? null,
        homeroomTeacherId: classData?.homeroomTeacherId ?? null,
        assignedTeacherIds: getClassTeacherIds(classData),
        activeMentorId: activeMentorAssignment?.mentorId ?? null,
        decision: allowed ? 'ALLOW' : 'DENY',
        reason,
      });

      if (!allowed) {
        throw new Error(ACCESS_DENIED_ERROR);
      }

      return { conference, student };
    } catch (error: any) {
      if (error.message && (error.message.includes('akses') || error.message.includes('ditemukan') || error.message.includes('tidak memiliki akses'))) {
        throw error;
      }
      return handleFirestoreError(error, 'get', `${RESPONSES_COLLECTION}/${conferenceId}`);
    }
  },

  calculateConferenceStatus,

  async reconcileThreeWayConferenceStatuses(options: {
    academicYear?: string;
    semester?: number;
    conferenceId?: string;
  }): Promise<{
    scanned: number;
    updatedToApproved: number;
    updatedToReturned: number;
    updatedToDraft: number;
    updatedToSubmitted: number;
    unchanged: number;
    errors: number;
  }> {
    const results = {
      scanned: 0,
      updatedToApproved: 0,
      updatedToReturned: 0,
      updatedToDraft: 0,
      updatedToSubmitted: 0,
      unchanged: 0,
      errors: 0
    };

    try {
      let responsesRef = collection(db, RESPONSES_COLLECTION);
      let q: any = responsesRef;

      if (options.conferenceId) {
        const docRef = doc(db, RESPONSES_COLLECTION, options.conferenceId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as StudentConferenceResponse;
          await this.reconcileSingleResponse(data, results);
        } else {
          const pq = query(responsesRef, where('periodId', '==', options.conferenceId));
          const snap = await getDocs(pq);
          for (const d of snap.docs) {
            const data = { id: d.id, ...d.data() } as StudentConferenceResponse;
            await this.reconcileSingleResponse(data, results);
          }
        }
        return results;
      }

      const constraints: any[] = [];
      if (options.academicYear) {
        constraints.push(where('academicYear', '==', options.academicYear));
      }
      if (options.semester) {
        constraints.push(where('semester', '==', Number(options.semester)));
      }

      if (constraints.length > 0) {
        q = query(responsesRef, ...constraints);
      }

      const querySnap = await getDocs(q);
      for (const d of querySnap.docs) {
        const data = { id: d.id, ...(d.data() as any) } as StudentConferenceResponse;
        await this.reconcileSingleResponse(data, results);
      }
    } catch (err) {
      console.error('[Reconcile] Error in reconcileThreeWayConferenceStatuses:', err);
      results.errors++;
    }

    return results;
  },

  async reconcileSingleResponse(
    response: StudentConferenceResponse,
    results: any
  ): Promise<void> {
    try {
      results.scanned++;
      const { status: calculatedStatus, summary: approvalSummary } = calculateConferenceStatus(response);

      const statusChanged = response.status !== calculatedStatus;
      const overallStatusChanged = response.overallStatus !== calculatedStatus;
      
      const summaryChanged = !response.approvalSummary ||
        response.approvalSummary.approvedCount !== approvalSummary.approvedCount ||
        response.approvalSummary.requiredCount !== approvalSummary.requiredCount ||
        response.approvalSummary.returnedCount !== approvalSummary.returnedCount ||
        response.approvalSummary.allRequiredApproved !== approvalSummary.allRequiredApproved;

      if (statusChanged || overallStatusChanged || summaryChanged) {
        const responseRef = doc(db, RESPONSES_COLLECTION, response.id);
        const updatePayload: any = {
          status: calculatedStatus,
          overallStatus: calculatedStatus,
          approvalSummary,
          updatedAt: Date.now(),
          statusUpdatedAt: Date.now()
        };

        await updateDoc(responseRef, updatePayload);

        if (calculatedStatus === 'APPROVED') {
          results.updatedToApproved++;
        } else if (calculatedStatus === 'RETURNED') {
          results.updatedToReturned++;
        } else if (calculatedStatus === 'SUBMITTED') {
          results.updatedToSubmitted++;
        } else {
          results.updatedToDraft++;
        }
      } else {
        results.unchanged++;
      }
    } catch (e) {
      console.error(`[Reconcile] Error reconciling response ${response.id}:`, e);
      results.errors++;
    }
  }
};

/**
 * Helper to get teacher IDs assigned to a class, using canonical fallbacks.
 */
export function getClassTeacherIds(classData?: Class | null): string[] {
  if (!classData) return [];

  if (Array.isArray(classData.assignedTeacherIds)) {
    return classData.assignedTeacherIds.filter(Boolean);
  }

  if (Array.isArray(classData.teacherAssignments)) {
    return classData.teacherAssignments
      .map((assignment) => assignment.userId)
      .filter(Boolean);
  }

  return classData.homeroomTeacherId
    ? [classData.homeroomTeacherId]
    : [];
}

/**
 * Robustly resolve the Class document.
 */
export async function resolveConferenceClass(
  conference: StudentConferenceResponse,
  student: Student | null
): Promise<Class | null> {
  // 1. Resolve canonical enrollment first
  const studId = conference.studentId || student?.id;
  const acadYear = conference.academicYear;
  if (studId && acadYear) {
    const resEnrollment = await resolveConferenceEnrollment({
      studentId: studId,
      academicYear: acadYear,
      conferenceId: conference.id
    });
    if (resEnrollment.classId) {
      try {
        const classRef = doc(db, 'classes', resEnrollment.classId);
        const classSnap = await getDoc(classRef);
        if (classSnap.exists()) {
          return { id: classSnap.id, ...classSnap.data() } as Class;
        }
      } catch (e) {
        // Ignore
      }
    }
  }

  // Fallback for candidates
  const candidateIds = Array.from(new Set([
    conference.classId,
    student?.classId,
    (conference as any).classDocumentId,
    (student as any).classDocumentId,
  ].filter(Boolean) as string[]));

  // Direct document lookup for candidate IDs
  for (const id of candidateIds) {
    try {
      const classRef = doc(db, 'classes', id);
      const classSnap = await getDoc(classRef);
      if (classSnap.exists()) {
        return { id: classSnap.id, ...classSnap.data() } as Class;
      }
    } catch (e) {
      // Ignore
    }
  }

  // Fallback query by class name
  if (candidateIds.length > 0) {
    try {
      const q = query(
        collection(db, 'classes'),
        where('name', 'in', candidateIds)
      );
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const docSnap = qSnap.docs[0];
        return { id: docSnap.id, ...docSnap.data() } as Class;
      }
    } catch (e) {
      // Ignore
    }
  }

  return null;
}

/**
 * Fetch Conference Response safely.
 */
async function getConferenceById(conferenceId: string): Promise<StudentConferenceResponse | null> {
  const confRef = doc(db, RESPONSES_COLLECTION, conferenceId);
  const confSnap = await getDoc(confRef);
  if (confSnap.exists()) {
    return confSnap.data() as StudentConferenceResponse;
  }
  return null;
}

/**
 * Fetch active Mentor Assignment for a conference.
 */
async function getActiveMentorAssignmentForConference(conferenceId: string): Promise<MentorAssignment | null> {
  const docRef = doc(db, ASSIGNMENTS_COLLECTION, conferenceId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data() as MentorAssignment;
  }
  return null;
}

/**
 * Check if BK mentor is allowed for this conference.
 */
function isBkMentorAllowedForConference(
  viewer: User,
  conference: StudentConferenceResponse
): boolean {
  return true;
}

/**
 * Check if user's assigned unit or main unit scope aligns with the student/conference unit.
 */
export function hasValidUnitScope(
  viewer: User,
  conference: StudentConferenceResponse,
  student: Student | null,
  classData: Class | null
): boolean {
  const normRole = (viewer.role || '').replace(/_/g, '');
  if (normRole === 'SUPERADMIN') return true;

  const viewerUnit = (viewer.unitId || '').toUpperCase();
  if (!viewerUnit) return false;

  const targetUnits: string[] = [];
  if (conference.unit) targetUnits.push(conference.unit.toUpperCase());
  if (student?.unitId) targetUnits.push(student.unitId.toUpperCase());
  if (student?.currentUnit) targetUnits.push(student.currentUnit.toUpperCase());
  if (classData?.unitId) targetUnits.push(classData.unitId.toUpperCase());

  const gradeStr = String(conference.gradeLevel || student?.grade || '').trim();
  if (gradeStr) {
    if (['7', '8', '9'].includes(gradeStr)) {
      targetUnits.push('JUNIOR_HIGH');
    } else if (['1', '2', '3', '4', '5', '6'].includes(gradeStr)) {
      targetUnits.push('ELEMENTARY');
    }
  }

  if (targetUnits.length === 0) {
    return true; 
  }

  const cleanViewerUnit = viewerUnit.replace(/_/g, '');
  return targetUnits.some(t => {
    const cleanTargetUnit = t.replace(/_/g, '');
    return cleanTargetUnit === cleanViewerUnit;
  });
}

export type PresentationViewerAccessInput = {
  viewer: User;
  conference: StudentConferenceResponse;
  student: Student | null;
  classData: Class | null;
  activeMentorAssignment: MentorAssignment | null;
};

/**
 * Verifies view access with an explicit reason for debug auditing.
 */
export function canViewConferencePresentationWithReason({
  viewer,
  conference,
  student,
  classData,
  activeMentorAssignment,
}: PresentationViewerAccessInput): { allowed: boolean; reason: string } {
  const viewerId = viewer.uid;

  // 1. Student pemilik presentasi.
  const isStudentOwner =
    viewer.role === 'STUDENT' &&
    (
      viewer.luminaId === conference.studentId ||
      viewer.luminaId === conference.studentLuminaId ||
      viewerId === conference.studentId
    );

  if (isStudentOwner) {
    return { allowed: true, reason: 'STUDENT_OWNER' };
  }

  // 1.5. All Junior High Teachers/Staff can present/view Junior High students
  const normalizedViewerRole = (viewer.role || '').replace(/_/g, '');
  const isJuniorHighTeacher =
    ['TEACHER', 'HOMEROOMTEACHER', 'BKMENTOR', 'COUNSELOR', 'COORDINATOR', 'PRINCIPAL', 'VICEPRINCIPAL', 'HEADUNIT', 'HEADJUNIOR'].includes(normalizedViewerRole) &&
    viewer.unitId === 'JUNIOR_HIGH';

  if (isJuniorHighTeacher) {
    return { allowed: true, reason: 'JUNIOR_HIGH_TEACHER_ALL_ACCESS' };
  }

  // 2. Admin/head sesuai scope existing.
  const hasAdministrativeAccess =
    ['SUPERADMIN', 'HEADUNIT', 'HEADJUNIOR'].includes((viewer.role || '').replace(/_/g, '')) &&
    hasValidUnitScope(viewer, conference, student, classData);

  if (hasAdministrativeAccess) {
    return { allowed: true, reason: 'SCOPED_ADMIN' };
  }

  // 3. Guru tim kelas: Wali Kelas atau GPK.
  const teacherIds = getClassTeacherIds(classData);

  const isAssignedClassTeacher =
    teacherIds.includes(viewerId);

  if (isAssignedClassTeacher) {
    return { allowed: true, reason: 'CLASS_TEACHER' };
  }

  // 4. Kompatibilitas class legacy.
  const isLegacyHomeroomTeacher =
    classData?.homeroomTeacherId === viewerId;

  if (isLegacyHomeroomTeacher) {
    return { allowed: true, reason: 'LEGACY_HOMEROOM_TEACHER' };
  }

  // 5. Mentor yang memang ditugaskan ke conference.
  const isAssignedConferenceMentor =
    ['ACTIVE', 'ASSIGNED'].includes(activeMentorAssignment?.status || '') &&
    activeMentorAssignment?.mentorId === viewerId;

  if (isAssignedConferenceMentor) {
    return { allowed: true, reason: 'ASSIGNED_CONFERENCE_MENTOR' };
  }

  // 6. Fallback bila field conference lama sudah mengandung mentor ID.
  const isLegacyConferenceMentor =
    conference.mentorId === viewerId ||
    (conference as any).assignedMentorId === viewerId;

  if (isLegacyConferenceMentor) {
    return { allowed: true, reason: 'LEGACY_CONFERENCE_MENTOR' };
  }

  // 7. BK Mentor hanya bila policy existing mengizinkan dan unit sesuai.
  const isAuthorizedBkMentor =
    ['BKMENTOR', 'BK_MENTOR'].includes((viewer.role || '').replace(/_/g, '')) &&
    hasValidUnitScope(viewer, conference, student, classData) &&
    isBkMentorAllowedForConference(viewer, conference);

  if (isAuthorizedBkMentor) {
    return { allowed: true, reason: 'AUTHORIZED_BK_MENTOR' };
  }

  return { allowed: false, reason: 'NO_MATCH' };
}

/**
 * Standard access checker function.
 */
export function canViewConferencePresentation(input: PresentationViewerAccessInput): boolean {
  return canViewConferencePresentationWithReason(input).allowed;
}

