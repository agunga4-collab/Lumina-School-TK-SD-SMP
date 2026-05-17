import { User, MTSSAcademicCase, MTSSAcademicAlert } from '../types';

export function canViewAcademicCase(user: User, caseData: MTSSAcademicCase): boolean {
  if (['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'MTSS_ACADEMIC_PJ'].includes(user.role)) return true;
  
  if (user.role === 'BK_MENTOR') return true; 
  
  if (caseData.createdBy === user.uid) return true;
  if (caseData.assignedCounselorIds?.includes(user.uid)) return true;
  if (caseData.assignedTeacherIds?.includes(user.uid)) return true;
  
  return false;
}

export function canEditAcademicCase(user: User, caseData: MTSSAcademicCase): boolean {
  if (['SUPER_ADMIN', 'MTSS_ACADEMIC_PJ'].includes(user.role)) return true;
  if (caseData.status === 'CLOSED') return false;
  
  const isOwner = caseData.createdBy === user.uid;
  const isAssigned = caseData.assignedTeacherIds?.includes(user.uid) || caseData.assignedCounselorIds?.includes(user.uid);
  
  return isOwner || isAssigned;
}

export function canResolveAlert(user: User, alert: MTSSAcademicAlert): boolean {
  if (['SUPER_ADMIN', 'MTSS_ACADEMIC_PJ', 'HEAD_UNIT', 'HEAD_JUNIOR'].includes(user.role)) return true;
  if (alert.assignedTo === user.uid) return true;
  if (alert.assignedToUserIds?.includes(user.uid)) return true;
  
  return false;
}

export function canViewSupportContext(user: User, studentId: string): boolean {
  if (['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'MTSS_ACADEMIC_PJ', 'BK_MENTOR'].includes(user.role)) return true;
  if (user.role === 'TEACHER') return true; // assuming broadly for now
  
  return false;
}
