import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUnitClasses } from '../lib/kindergartenMetadataCache';
import { Class } from '../types';

export interface UseTeacherAssignedClassesParams {
  userId?: string | undefined;
  unit?: string;
  academicYearId: string;
}

export function useTeacherAssignedClasses({
  userId,
  unit = 'KINDERGARTEN',
  academicYearId,
}: UseTeacherAssignedClassesParams) {
  const { profile } = useAuth();
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  const effectiveUserId = userId || profile?.uid;
  const userRole = profile?.role;

  // Whether user is restricted to assigned classes
  const isRestrictedToAssignedClasses = useMemo(() => {
    if (!userRole) return true; // Default to restricted if no profile loaded yet
    
    // Check unit-scoped Secretaries
    if (userRole === 'SECRETARY_KINDY' && unit === 'KINDERGARTEN') {
      return false;
    }
    if (userRole === 'SECRETARY_ELEM' && unit === 'ELEMENTARY') {
      return false;
    }
    if (userRole === 'SECRETARY_JH' && unit === 'JUNIOR_HIGH') {
      return false;
    }

    const hasKgSubjectTeacherPermission = 
      userRole === 'kindergarten_subject_teacher' || 
      (profile?.permissions && profile.permissions.includes('kindergarten_observation_all_classes'));

    if (unit === 'KINDERGARTEN' && hasKgSubjectTeacherPermission) {
      return false;
    }

    return !['SUPER_ADMIN', 'HEAD_UNIT'].includes(userRole);
  }, [userRole, profile?.permissions, unit]);

  useEffect(() => {
    let active = true;
    if (!academicYearId) {
      setLoading(false);
      return;
    }

    async function loadClasses() {
      try {
        setLoading(true);
        // Using cached metadata call to save reads
        const classes = await getUnitClasses(unit, academicYearId);
        if (active) {
          setAllClasses(classes);
        }
      } catch (err) {
        console.error('[useTeacherAssignedClasses] Error fetching classes:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadClasses();
    return () => {
      active = false;
    };
  }, [unit, academicYearId]);

  // Determine if a class is assigned to this user
  const isClassAssigned = useCallback((c: Class, targetUserId: string) => {
    if (!targetUserId) return false;

    // Check waliKelasIds / gpkTeacherIds
    if ((c as any).waliKelasIds && Array.isArray((c as any).waliKelasIds)) {
      if ((c as any).waliKelasIds.includes(targetUserId)) return true;
    }
    if ((c as any).gpkTeacherIds && Array.isArray((c as any).gpkTeacherIds)) {
      if ((c as any).gpkTeacherIds.includes(targetUserId)) return true;
    }

    // Check modern field: assignedTeacherIds
    if (c.assignedTeacherIds && Array.isArray(c.assignedTeacherIds)) {
      if (c.assignedTeacherIds.includes(targetUserId)) return true;
    }

    // Check homeroomTeacherIds
    if (c.homeroomTeacherIds && Array.isArray(c.homeroomTeacherIds)) {
      if (c.homeroomTeacherIds.includes(targetUserId)) return true;
    }

    // Check legacy homeroomTeacherId
    if (c.homeroomTeacherId === targetUserId) return true;

    // Check teacherAssignments
    if (c.teacherAssignments && Array.isArray(c.teacherAssignments)) {
      if (c.teacherAssignments.some(a => a.userId === targetUserId)) return true;
    }

    return false;
  }, []);

  // Filter for assigned classes
  const assignedClasses = useMemo(() => {
    const activeClasses = allClasses.filter(c => c.status !== 'archived');
    if (!isRestrictedToAssignedClasses) {
      // Admins/Heads see all active classes in the unit & year
      return activeClasses;
    }
    if (!effectiveUserId) return [];
    return activeClasses.filter(c => isClassAssigned(c, effectiveUserId));
  }, [allClasses, isRestrictedToAssignedClasses, effectiveUserId, isClassAssigned]);

  const assignedClassIds = useMemo(() => {
    return assignedClasses.map(c => c.id);
  }, [assignedClasses]);

  // Sort assigned classes for default choice (first based on grade, then name)
  const sortedAssignedClasses = useMemo(() => {
    return [...assignedClasses].sort((a, b) => {
      const gradeA = String(a.grade || '');
      const gradeB = String(b.grade || '');
      const comp = gradeA.localeCompare(gradeB, undefined, { numeric: true });
      if (comp !== 0) return comp;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [assignedClasses]);

  // Last selected class ID logic (teacher preference)
  const lastSelectedKey = useMemo(() => {
    if (!effectiveUserId) return null;
    return `teacher_last_selected_class_${effectiveUserId}_${unit}_${academicYearId}`;
  }, [effectiveUserId, unit, academicYearId]);

  const lastSelectedClassId = useMemo(() => {
    if (!lastSelectedKey) return null;
    const item = localStorage.getItem(lastSelectedKey);
    if (!item) return null;
    try {
      const parsed = JSON.parse(item);
      // Validate structure & year & unit & userId
      if (
        parsed &&
        parsed.userId === effectiveUserId &&
        parsed.unit === unit &&
        parsed.academicYearId === academicYearId &&
        parsed.classId
      ) {
        return parsed.classId as string;
      }
    } catch {
      // ignore
    }
    return null;
  }, [lastSelectedKey, effectiveUserId, unit, academicYearId]);

  const setLastSelectedClassId = useCallback((classId: string) => {
    if (!lastSelectedKey || !effectiveUserId) return;
    const payload = {
      userId: effectiveUserId,
      unit,
      academicYearId,
      classId
    };
    localStorage.setItem(lastSelectedKey, JSON.stringify(payload));
  }, [lastSelectedKey, effectiveUserId, unit, academicYearId]);

  // primaryClassId definition
  const primaryClassId = useMemo(() => {
    if (sortedAssignedClasses.length === 0) return null;
    if (sortedAssignedClasses.length === 1) {
      return sortedAssignedClasses[0].id;
    }
    // Multiple classes assigned: use last selected if valid and still assigned
    if (lastSelectedClassId && assignedClassIds.includes(lastSelectedClassId)) {
      return lastSelectedClassId;
    }
    // Fallback to first assigned class after sorting by grade then name
    return sortedAssignedClasses[0].id;
  }, [sortedAssignedClasses, lastSelectedClassId, assignedClassIds]);

  return {
    assignedClasses: sortedAssignedClasses,
    assignedClassIds,
    primaryClassId,
    isRestrictedToAssignedClasses,
    loading,
    setLastSelectedClassId,
    allClasses
  };
}
