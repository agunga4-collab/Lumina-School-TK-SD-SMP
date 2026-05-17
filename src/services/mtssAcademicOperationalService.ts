import { 
  addMTSSAcademicGoal as baseAddGoal,
  addMTSSAcademicSession as baseAddSession,
  addMTSSAcademicMeeting as baseAddMeeting,
  updateMTSSAcademicCase as baseUpdateCase
} from '../lib/firebase';
import { logMTSSAcademicAction } from './mtssAcademicAuditService';
import { MTSSAcademicGoal, MTSSAcademicSession, MTSSAcademicMeeting, MTSSAcademicCase, User } from '../types';

export async function addMTSSAcademicGoalHardened(
  caseId: string, 
  goalData: Omit<MTSSAcademicGoal, 'id' | 'caseId' | 'createdAt' | 'updatedAt'>,
  user: User
): Promise<string> {
  const goalId = await baseAddGoal(caseId, goalData);
  
  await logMTSSAcademicAction({
    caseId,
    action: 'GOAL_CREATED',
    entityType: 'GOAL',
    entityId: goalId,
    performedBy: user.displayName || user.email,
    performedByRole: user.role,
    afterSnapshot: goalData
  });
  
  return goalId;
}

export async function logMTSSAcademicSessionHardened(
  caseId: string,
  sessionData: Omit<MTSSAcademicSession, 'id' | 'caseId' | 'createdAt'>,
  user: User
): Promise<string> {
  const sessionId = await baseAddSession(caseId, sessionData);
  
  await logMTSSAcademicAction({
    caseId,
    action: 'SESSION_LOGGED',
    entityType: 'SESSION',
    entityId: sessionId,
    performedBy: user.displayName || user.email,
    performedByRole: user.role,
    afterSnapshot: sessionData
  });
  
  return sessionId;
}

export async function scheduleMTSSAcademicMeetingHardened(
  caseId: string,
  meetingData: Omit<MTSSAcademicMeeting, 'id' | 'caseId' | 'createdAt' | 'updatedAt'>,
  user: User
): Promise<string> {
  const meetingId = await baseAddMeeting(caseId, meetingData);
  
  await logMTSSAcademicAction({
    caseId,
    action: 'MEETING_CREATED',
    entityType: 'MEETING',
    entityId: meetingId,
    performedBy: user.displayName || user.email,
    performedByRole: user.role,
    afterSnapshot: meetingData
  });
  
  return meetingId;
}

export async function updateMTSSAcademicCaseHardened(
  id: string,
  updates: Partial<MTSSAcademicCase>,
  user: User,
  originalCase?: MTSSAcademicCase
): Promise<void> {
  // Concurrency Check
  if (originalCase && updates.updatedAt && originalCase.updatedAt > updates.updatedAt) {
    throw new Error('STALE_UPDATE_CONFLICT');
  }

  await baseUpdateCase(id, updates);
  
  let action: any = 'CASE_UPDATED';
  if (updates.status && originalCase?.status !== updates.status) {
    action = 'CASE_STATUS_CHANGED';
  }

  await logMTSSAcademicAction({
    caseId: id,
    action,
    entityType: 'CASE',
    entityId: id,
    performedBy: user.displayName || user.email,
    performedByRole: user.role,
    beforeSnapshot: originalCase ? { status: originalCase.status, currentTier: originalCase.currentTier } : undefined,
    afterSnapshot: updates
  });
}
