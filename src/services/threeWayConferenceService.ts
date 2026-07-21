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
import { db, handleFirestoreError, getStudentById, getStudents, getClasses, auth } from '../lib/firebase';
import type {
  ConferencePeriod,
  StudentConferenceResponse,
  MentorAssignment,
  SmartGoalTrackerEntry,
  SmartGoal,
  User,
  Student,
  Class
} from '../types';

const PERIODS_COLLECTION = 'conferencePeriods';
const RESPONSES_COLLECTION = 'studentConferenceResponses';
const ASSIGNMENTS_COLLECTION = 'mentorAssignments';
const TRACKER_COLLECTION = 'smartGoalTrackerEntries';

export const threeWayConferenceService = {
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
      if (existingSnap.exists()) {
        const existing = existingSnap.data() as StudentConferenceResponse;
        if (existing.status !== 'DRAFT') {
          throw new Error('Submitted or completed responses cannot be edited.');
        }
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
        status: 'DRAFT',
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
        createdAt: existingSnap.exists() ? (existingSnap.data() as StudentConferenceResponse).createdAt : nowTime,
        updatedAt: nowTime,
      };

      await setDoc(responseRef, docPayload);
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
      if (existingSnap.exists()) {
        const existing = existingSnap.data() as StudentConferenceResponse;
        if (existing.status !== 'DRAFT') {
          throw new Error('Submitted or completed responses cannot be edited.');
        }
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
        createdAt: existingSnap.exists() ? (existingSnap.data() as StudentConferenceResponse).createdAt : nowTime,
        updatedAt: nowTime,
        submittedAt: nowTime,
        submittedBy: studentData.id || studentId,
      };

      // Run validation rules
      const validation = this.validateConferenceResponseForSubmission(docPayload);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(' '));
      }

      await setDoc(responseRef, docPayload);
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
        errors.push(`${prefix} "My Goal" is required.`);
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

    if (!response.unitActivityCategory || !response.unitActivityCategory.trim()) {
      errors.push('Unit Activity Field is required.');
    }
    if (!response.unitActivityName || !response.unitActivityName.trim()) {
      errors.push('Unit Activity Chosen is required.');
    }
    if (!response.unitActivityWorries || !response.unitActivityWorries.trim()) {
      errors.push('Your worries joining the Unit Activity is required.');
    }
    if (!response.unitActivityOvercomingPlan || !response.unitActivityOvercomingPlan.trim()) {
      errors.push('Your plan to overcome Unit Activity worries is required.');
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

      if (!targetPeriodId) {
        return null;
      }

      const qEnroll = query(
        collection(db, 'seEnrollments'),
        where('periodId', '==', targetPeriodId),
        where('studentId', '==', resolvedStudentId)
      );
      const enrollSnap = await getDocs(qEnroll);
      if (enrollSnap.empty) {
        return {
          periodLabel: targetPeriodLabel,
          enrollment: null
        };
      }

      const enrollDoc = enrollSnap.docs[0];
      return {
        periodLabel: targetPeriodLabel,
        enrollment: { id: enrollDoc.id, ...enrollDoc.data() }
      };
    } catch (err) {
      console.warn('Could not fetch student self exploration reference:', err);
      return null;
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
  async getConferenceWorkspaceStudents(periodId: string): Promise<Array<{
    student: Student;
    response: StudentConferenceResponse | null;
    assignment: MentorAssignment | null;
    className: string;
    grade: string | number;
  }>> {
    try {
      // 1. Fetch Junior High students
      const allStudents = (await getStudents()) || [];
      const jhStudents = allStudents.filter(s => {
        const unit = s.unitId || s.currentUnit || '';
        if (unit === 'JUNIOR_HIGH') return true;
        if (s.grade && [7, 8, 9].includes(s.grade)) return true;
        return false;
      });

      // 2. Fetch classes
      const classes = (await getClasses()) || [];
      const classMap = new Map<string, Class>();
      classes.forEach(c => classMap.set(c.id, c));

      // 3. Fetch responses
      const responses = await this.getConferenceResponsesForPeriod(periodId);
      const responseMap = new Map<string, StudentConferenceResponse>();
      responses.forEach(r => responseMap.set(r.studentId, r));

      // 4. Fetch assignments
      const assignments = await this.getMentorAssignmentsForPeriod(periodId);
      const assignmentMap = new Map<string, MentorAssignment>();
      assignments.forEach(a => {
        assignmentMap.set(a.studentId, a);
      });

      return jhStudents.map(s => {
        const cls = classMap.get(s.classId);
        const resp = responseMap.get(s.id) || null;
        const assign = assignmentMap.get(s.id) || null;
        return {
          student: s,
          response: resp,
          assignment: assign,
          className: cls?.name || 'Unknown Class',
          grade: s.grade || cls?.grade || '—'
        };
      });
    } catch (error) {
      return handleFirestoreError(error, 'list', 'conferenceWorkspace');
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
        where('status', '==', 'active')
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

      await runTransaction(db, async (transaction) => {
        // 1. Get current staff user
        const staffRef = doc(db, 'users', currentUid);
        const staffSnap = await transaction.get(staffRef);
        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        // 2. Get student details
        const studentRef = doc(db, 'students', studentId);
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists()) throw new Error('Student not found');
        const studentData = studentSnap.data() as Student;

        // 3. Get class details
        let className = 'Unknown Class';
        if (studentData.classId) {
          const classRef = doc(db, 'classes', studentData.classId);
          const classSnap = await transaction.get(classRef);
          if (classSnap.exists()) {
            className = classSnap.data().name || 'Unknown Class';
          }
        }

        // 4. Get mentor details
        const mentorRef = doc(db, 'users', mentorId);
        const mentorSnap = await transaction.get(mentorRef);
        if (!mentorSnap.exists()) throw new Error('Mentor not found');
        const mentorData = mentorSnap.data() as User;

        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
        }
        if (!eligibleRoles.includes(mentorData.role)) {
          throw new Error('Invalid Mentor: Selected user is not an eligible mentor.');
        }

        // 5. Get period details
        const periodRef = doc(db, PERIODS_COLLECTION, periodId);
        const periodSnap = await transaction.get(periodRef);
        if (!periodSnap.exists()) throw new Error('Conference period not found');
        const periodData = periodSnap.data() as ConferencePeriod;

        // 6. Check existing assignment to preserve history
        const assignmentSnap = await transaction.get(assignmentRef);
        let existingHistory = [];
        if (assignmentSnap.exists()) {
          const existingData = assignmentSnap.data() as MentorAssignment;
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
          mentorId,
          mentorName: mentorData.displayName || '',
          mentorEmail: mentorData.email || '',
          status: 'ACTIVE',
          assignedBy: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedBy : currentUid,
          assignedByName: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedByName : staffData.displayName || '',
          assignedAt: assignmentSnap.exists() ? (assignmentSnap.data() as MentorAssignment).assignedAt : now,
          updatedBy: currentUid,
          updatedAt: now,
          previousMentorId: assignmentSnap.exists() ? ((assignmentSnap.data() as MentorAssignment).mentorId || null) : null,
          reassignmentReason: note || null,
          assignmentHistory: updatedHistory
        };

        transaction.set(assignmentRef, newAssignment);
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

      await runTransaction(db, async (transaction) => {
        const assignmentSnap = await transaction.get(assignmentRef);
        if (!assignmentSnap.exists()) {
          throw new Error('Mentor assignment does not exist.');
        }
        const existingData = assignmentSnap.data() as MentorAssignment;

        // 1. Get current staff user
        const staffRef = doc(db, 'users', currentUid);
        const staffSnap = await transaction.get(staffRef);
        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        // 2. Get mentor details
        const mentorRef = doc(db, 'users', mentorId);
        const mentorSnap = await transaction.get(mentorRef);
        if (!mentorSnap.exists()) throw new Error('Mentor not found');
        const mentorData = mentorSnap.data() as User;

        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
        }
        if (!eligibleRoles.includes(mentorData.role)) {
          throw new Error('Invalid Mentor: Selected user is not an eligible mentor.');
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
          status: 'ACTIVE',
          updatedBy: currentUid,
          updatedAt: now,
          reassignmentReason: reason || null,
          assignmentHistory: updatedHistory
        };

        transaction.update(assignmentRef, updatedAssignment);
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

      await runTransaction(db, async (transaction) => {
        const assignmentSnap = await transaction.get(assignmentRef);
        if (!assignmentSnap.exists()) {
          throw new Error('Mentor assignment does not exist.');
        }
        const existingData = assignmentSnap.data() as MentorAssignment;

        // 1. Get current staff user
        const staffRef = doc(db, 'users', currentUid);
        const staffSnap = await transaction.get(staffRef);
        if (!staffSnap.exists()) throw new Error('Staff profile not found');
        const staffData = staffSnap.data() as User;

        const eligibleRoles = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'];
        if (!eligibleRoles.includes(staffData.role)) {
          throw new Error('Unauthorized: Role not allowed to manage mentor assignments.');
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
          status: 'REMOVED',
          updatedBy: currentUid,
          updatedAt: now,
          reassignmentReason: reason || null,
          assignmentHistory: updatedHistory
        };

        transaction.update(assignmentRef, updatedAssignment);
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
        updatedAt: now
      };

      await setDoc(entryRef, newEntry);
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

      const { entryDate, actionsTaken, progressMade, hinderingBehaviors, improvementPlan } = payload;

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

      // Update fields (excluding mentor comments and other immutable fields)
      await updateDoc(entryRef, {
        entryDate,
        actionsTaken,
        progressMade,
        hinderingBehaviors,
        improvementPlan,
        updatedAt: now
      });
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
  }
};
