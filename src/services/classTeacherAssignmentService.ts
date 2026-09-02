import { Class, ClassTeacherAssignment, ClassTeacherRole } from '../types';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
  * Normalizes and retrieves the teacher assignments for a class.
  * Handles legacy homeroomTeacherId/homeroomTeacherName backward compatibility.
  */
export function getClassTeacherAssignments(
  classData: Class
): ClassTeacherAssignment[] {
  if (classData.teacherAssignments && Array.isArray(classData.teacherAssignments) && classData.teacherAssignments.length > 0) {
    return classData.teacherAssignments;
  }
  
  if (classData.homeroomTeacherId) {
    return [{
      userId: classData.homeroomTeacherId,
      displayName: classData.homeroomTeacherName ?? 'Wali Kelas',
      email: null,
      role: 'HOMEROOM_TEACHER',
      unitId: classData.unitId,
      isPrimary: true,
      assignedAt: classData.updatedAt ?? classData.createdAt ?? Date.now(),
      assignedBy: 'LEGACY_MIGRATION'
    }];
  }
  
  return [];
}

/**
  * Retrieves the primary homeroom teacher from assignments.
  */
export function getPrimaryHomeroomTeacher(
  assignments: ClassTeacherAssignment[]
): ClassTeacherAssignment | null {
  return assignments.find(a => a.role === 'HOMEROOM_TEACHER' && a.isPrimary) || null;
}

/**
  * Retrieves all GPK assignments.
  */
export function getGpkAssignments(
  assignments: ClassTeacherAssignment[]
): ClassTeacherAssignment[] {
  return assignments.filter(a => a.role === 'GPK');
}

/**
  * Gets all unique teacher user IDs assigned to the class.
  */
export function getClassTeacherIds(
  classData: Class
): string[] {
  const assignments = getClassTeacherAssignments(classData);
  return Array.from(new Set(assignments.map(a => a.userId)));
}

/**
  * Checks if a specific teacher is assigned to the class (as homeroom or GPK).
  */
export function isTeacherAssignedToClass(
  classData: Class,
  userId: string
): boolean {
  if (!userId) return false;
  if (classData.assignedTeacherIds && Array.isArray(classData.assignedTeacherIds)) {
    return classData.assignedTeacherIds.includes(userId);
  }
  const assignments = getClassTeacherAssignments(classData);
  return assignments.some(a => a.userId === userId);
}

/**
  * Validates teacher assignments before saving.
  */
export function validateTeacherAssignments(
  assignments: ClassTeacherAssignment[],
  classUnitId: string
): ValidationResult {
  const homeroomTeachers = assignments.filter(a => a.role === 'HOMEROOM_TEACHER');
  if (homeroomTeachers.length > 1) {
    return { isValid: false, error: 'Maksimal satu Wali Kelas (HOMEROOM_TEACHER) diizinkan.' };
  }
  
  for (const t of homeroomTeachers) {
    if (!t.isPrimary) {
      return { isValid: false, error: 'Wali Kelas (HOMEROOM_TEACHER) harus ditandai sebagai Primary.' };
    }
  }
  
  const gpks = assignments.filter(a => a.role === 'GPK');
  for (const g of gpks) {
    if (g.isPrimary) {
      return { isValid: false, error: 'Guru Pendamping Khusus (GPK) tidak boleh ditandai sebagai Primary.' };
    }
  }
  
  const userIds = assignments.map(a => a.userId);
  const uniqueUserIds = new Set(userIds);
  if (uniqueUserIds.size !== userIds.length) {
    return { isValid: false, error: 'Tidak boleh ada duplikasi pengajar dalam kelas yang sama.' };
  }
  
  // Normalize units for strict matching if they exist
  const normUnit = (u: string) => u?.toUpperCase().replace('_', '') || '';
  for (const a of assignments) {
    if (a.unitId && normUnit(a.unitId) !== normUnit(classUnitId)) {
      if (!a.userId.startsWith('INVITE_') && !a.userId.startsWith('INVITE:')) {
        return { isValid: false, error: `Pengajar ${a.displayName} tidak berada dalam unit yang sama dengan kelas.` };
      }
    }
  }
  
  return { isValid: true };
}

/**
  * Builds the denormalized indexes of teacher IDs for Firestore querying.
  */
export function buildTeacherAssignmentIndexes(
  assignments: ClassTeacherAssignment[]
): {
  assignedTeacherIds: string[];
  homeroomTeacherIds: string[];
  gpkTeacherIds: string[];
} {
  const assignedTeacherIds: string[] = [];
  const homeroomTeacherIds: string[] = [];
  const gpkTeacherIds: string[] = [];
  
  assignments.forEach(a => {
    if (!assignedTeacherIds.includes(a.userId)) {
      assignedTeacherIds.push(a.userId);
    }
    if (a.role === 'HOMEROOM_TEACHER') {
      if (!homeroomTeacherIds.includes(a.userId)) {
        homeroomTeacherIds.push(a.userId);
      }
    } else if (a.role === 'GPK') {
      if (!gpkTeacherIds.includes(a.userId)) {
        gpkTeacherIds.push(a.userId);
      }
    }
  });
  
  return {
    assignedTeacherIds,
    homeroomTeacherIds,
    gpkTeacherIds
  };
}

/**
 * Checks if a user has access to a specific class under the teacher/staff workflows.
 * 
 * Access rules:
 * - SUPER_ADMIN: has access to all classes.
 * - HEAD_UNIT / HEAD_JUNIOR: has view/access to all classes within their unitId.
 * - SECRETARY_KINDY: has full operational access to KINDERGARTEN classes only.
 * - SECRETARY_ELEM: has full operational access to ELEMENTARY classes only.
 * - SECRETARY_JH: has full operational access to JUNIOR_HIGH classes only.
 * - Standard teachers: restricted to their assigned classes.
 */
export function canAccessClassForTeacherWorkflow(profile: any, classData: any): boolean {
  if (!profile) return false;
  if (!classData) return false;

  const role = profile.role;
  const unit = classData.unitId;

  if (role === 'SUPER_ADMIN') {
    return true;
  }

  // HEAD_UNIT / HEAD_JUNIOR permissions
  if (role === 'HEAD_UNIT' && profile.unitId === 'KINDERGARTEN' && unit === 'KINDERGARTEN') {
    return true;
  }
  if (role === 'HEAD_UNIT' && profile.unitId === 'ELEMENTARY' && unit === 'ELEMENTARY') {
    return true;
  }
  if (role === 'HEAD_JUNIOR' && unit === 'JUNIOR_HIGH') {
    return true;
  }

  // Unit-scoped Secretaries
  if (role === 'SECRETARY_KINDY' && unit === 'KINDERGARTEN') {
    return true;
  }
  if (role === 'SECRETARY_ELEM' && unit === 'ELEMENTARY') {
    return true;
  }
  if (role === 'SECRETARY_JH' && unit === 'JUNIOR_HIGH') {
    return true;
  }

  // Delegate to existing assigned class check
  return isTeacherAssignedToClass(classData, profile.uid);
}

