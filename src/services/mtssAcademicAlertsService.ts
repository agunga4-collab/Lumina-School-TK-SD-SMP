import { 
  MTSSAcademicCase, 
  MTSSAcademicAlert, 
  MTSSAcademicGoal, 
  MTSSAcademicSession, 
  MTSSAcademicMeeting, 
  MTSSAcademicEvaluation, 
  MTSSAcademicParentDocument,
  UserRole,
  MTSSAcademicAlertType
} from '../types';
import { MTSS_ACADEMIC_ALERTS_CONFIG } from '../constants/mtssAcademicAlertsConfig';
import { upsertMTSSAcademicAlert, resolveMTSSAcademicAlert, getMTSSAcademicAlerts } from '../lib/firebase';

/**
 * MTSS Academic Alert Generation Engine
 * Scans data and identifies SOP deviations or pending items.
 */

export async function generateAlertsForCase(
  mtssCase: MTSSAcademicCase,
  context: {
    goals: MTSSAcademicGoal[];
    sessions: MTSSAcademicSession[];
    meetings: MTSSAcademicMeeting[];
    evaluations: MTSSAcademicEvaluation[];
    documents: MTSSAcademicParentDocument[];
  }
) {
  const alerts: Partial<MTSSAcademicAlert>[] = [];
  const now = Date.now();

  const addAlert = (type: MTSSAcademicAlertType, alertData: Partial<MTSSAcademicAlert>) => {
    alerts.push({
      id: `${type}-${mtssCase.id}`,
      type,
      caseId: mtssCase.id,
      studentId: mtssCase.studentId,
      studentName: mtssCase.studentName,
      classId: mtssCase.classId,
      className: mtssCase.className,
      academicYear: mtssCase.academicYear || '2023/2024',
      semester: mtssCase.semester || '1',
      status: 'OPEN',
      ...alertData
    });
  };

  // A. Case Status & Initiation
  if (mtssCase.status === 'SCREENING') {
    const daysSinceCreation = (now - mtssCase.createdAt) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation > MTSS_ACADEMIC_ALERTS_CONFIG.draftCaseIncompleteDays) {
      addAlert('DRAFT_CASE_INCOMPLETE', {
        severity: 'WARNING',
        title: 'Draft Case Incomplete',
        description: `Case for ${mtssCase.studentName} has been in draft for over ${Math.floor(daysSinceCreation)} days.`,
        recommendedAction: 'Complete the case details and set the appropriate tier.',
        assignedToRoles: ['HEAD_UNIT', 'HEAD_JUNIOR'],
        relatedEntityType: 'CASE'
      });
    }
  }

  // B. Meetings & Parent Communication
  const initialMeeting = context.meetings.find(m => m.meetingType === 'INITIAL');
  if (!initialMeeting && mtssCase.status !== 'CLOSED' && mtssCase.status !== 'SCREENING') {
    addAlert('INITIAL_MEETING_MISSING', {
      severity: 'CRITICAL',
      title: 'Initial Meeting Missing',
      description: `Case is active for ${mtssCase.studentName}, but no Initial Meeting is recorded.`,
      recommendedAction: 'Schedule and record an initial meeting with parents.',
      assignedToRoles: ['HEAD_JUNIOR', 'TEACHER'],
      relatedEntityType: 'MEETING'
    });
  }

  if (mtssCase.parentCommitmentStatus === 'NOT_SENT' && (mtssCase.currentTier === 'Tier 2' || mtssCase.currentTier === 'Tier 3')) {
    addAlert('PARENT_COMMITMENT_PENDING', {
      severity: 'WARNING',
      title: 'Parent Commitment Pending',
      description: `Commitment letter for ${mtssCase.studentName} hasn't been sent.`,
      recommendedAction: 'Process parent commitment in the Parent Hub.',
      assignedToRoles: ['HEAD_JUNIOR'],
      relatedEntityType: 'PARENT_DOC'
    });
  }

  // C. Sessions & Progress
  if (mtssCase.currentTier === 'Tier 2') {
    const sortedSessions = [...context.sessions].sort((a, b) => b.date - a.date);
    const latestSession = sortedSessions.length > 0 ? sortedSessions[0] : null;

    if (!latestSession) {
      const daysSinceCreation = (now - mtssCase.createdAt) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation > MTSS_ACADEMIC_ALERTS_CONFIG.firstSessionLogDueDays) {
        addAlert('SESSION_LOG_OVERDUE', {
          severity: 'CRITICAL',
          title: 'First Session Overdue',
          description: `No intervention sessions logged for ${mtssCase.studentName} after ${Math.floor(daysSinceCreation)} days.`,
          recommendedAction: 'Start and log the first intervention session.',
          assignedToRoles: ['TEACHER'],
          relatedEntityType: 'SESSION'
        });
      }
    } else {
      const daysSinceLastSession = (now - latestSession.date) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSession > MTSS_ACADEMIC_ALERTS_CONFIG.sessionGapMaxDays) {
        addAlert('SESSION_GAP_TOO_LONG', {
          severity: 'WARNING',
          title: 'Session Gap Too Long',
          description: `It has been ${Math.floor(daysSinceLastSession)} days since ${mtssCase.studentName}'s last session.`,
          recommendedAction: 'Resume intervention sessions immediately.',
          assignedToRoles: ['TEACHER'],
          relatedEntityType: 'SESSION'
        });
      }
    }

    // Attendance & Lateness Concerns (SOP Rule: > 2x)
    const absences = context.sessions.filter(s => s.attendanceStatus === 'ABSENT').length;
    const lateness = context.sessions.filter(s => s.attendanceStatus === 'LATE').length;

    if (absences >= MTSS_ACADEMIC_ALERTS_CONFIG.attendanceConcernThreshold) {
      addAlert('ATTENDANCE_CONCERN', {
        severity: 'CRITICAL',
        title: 'Attendance Concern',
        description: `${mtssCase.studentName} has missed ${absences} sessions. SOP requires parent follow-up meeting.`,
        recommendedAction: 'Schedule an urgent follow-up meeting with parents.',
        assignedToRoles: ['HEAD_JUNIOR', 'BK_MENTOR'],
        relatedEntityType: 'SESSION'
      });
      addAlert('PARENT_FOLLOWUP_REQUIRED', {
        severity: 'CRITICAL',
        title: 'Parent Follow-up Required',
        description: `Absence limit reached for ${mtssCase.studentName}. Mandatory parent re-engagement.`,
        recommendedAction: 'Coordinate with homeroom teacher and counselor for parent follow-up.',
        assignedToRoles: ['HEAD_UNIT', 'HEAD_JUNIOR'],
        relatedEntityType: 'MEETING'
      });
    }

    if (lateness >= MTSS_ACADEMIC_ALERTS_CONFIG.latenessConcernThreshold) {
      addAlert('LATENESS_CONCERN', {
        severity: 'WARNING',
        title: 'Lateness Concern',
        description: `${mtssCase.studentName} was late to ${lateness} sessions.`,
        recommendedAction: 'Discuss punctuality and impact on learning with student/parents.',
        assignedToRoles: ['HEAD_JUNIOR'],
        relatedEntityType: 'SESSION'
      });
    }
  }

  // D. Evaluation & Review
  if (mtssCase.currentTier === 'Tier 2') {
    const sessionsCount = context.sessions.length;
    const isCompletedCycle = sessionsCount >= MTSS_ACADEMIC_ALERTS_CONFIG.tier2DefaultSessions;
    const isNearEnd = sessionsCount >= MTSS_ACADEMIC_ALERTS_CONFIG.tier2DefaultSessions - 1;

    const evaluation = context.evaluations.find(e => e.evaluationType === 'TIER_2_REPORT');
    
    if (isNearEnd && !evaluation) {
      addAlert('TIER_2_CYCLE_NEAR_END', {
        severity: 'WARNING',
        title: 'Tier 2 Cycle Near End',
        description: `${mtssCase.studentName} is reaching the end of the 8-session Tier 2 cycle.`,
        recommendedAction: 'Start preparing the evaluation report.',
        assignedToRoles: ['TEACHER', 'HEAD_JUNIOR'],
        relatedEntityType: 'EVALUATION'
      });
    }

    if (isCompletedCycle && !evaluation) {
      addAlert('EVALUATION_PENDING', {
        severity: 'CRITICAL',
        title: 'Evaluation Overdue',
        description: `Tier 2 sessions completed for ${mtssCase.studentName}, but evaluation report is missing.`,
        recommendedAction: 'Finalize the evaluation and make a tier decision.',
        assignedToRoles: ['HEAD_JUNIOR'],
        relatedEntityType: 'EVALUATION'
      });
    }
  }

  // E. Sync with existing alerts - Auto-resolve if conditions cleared
  const existingAlerts = await getMTSSAcademicAlerts({ caseId: mtssCase.id, status: 'OPEN' });
  const commitmentLetter = context.documents.find(d => d.type === 'PARENT_COMMITMENT');
  
  for (const existing of existingAlerts) {
    const typeMatch = alerts.find(a => a.type === existing.type);
    if (!typeMatch) {
       // Check if it's an alert that can be auto-resolved
       // e.g. INITIAL_MEETING_MISSING is resolved if initial meeting exists
       let shouldResolve = false;
       if (existing.type === 'INITIAL_MEETING_MISSING' && initialMeeting) shouldResolve = true;
       if (existing.type === 'SESSION_LOG_OVERDUE' && context.sessions.length > 0) shouldResolve = true;
       if (existing.type === 'DRAFT_CASE_INCOMPLETE' && mtssCase.status !== 'SCREENING') shouldResolve = true;
       if (existing.type === 'PARENT_COMMITMENT_PENDING' && commitmentLetter) shouldResolve = true;
       if (existing.type === 'EVALUATION_PENDING' && context.evaluations.some(e => e.evaluationType === 'TIER_2_REPORT')) shouldResolve = true;

       if (shouldResolve) {
         await resolveMTSSAcademicAlert(existing.id);
       }
    }
  }

  // F. Save/Update new alerts
  for (const alert of alerts) {
    await upsertMTSSAcademicAlert(alert as MTSSAcademicAlert & { id: string });
  }

  return alerts;
}
