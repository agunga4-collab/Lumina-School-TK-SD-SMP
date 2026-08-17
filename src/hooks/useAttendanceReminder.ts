import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, getActiveStudents } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useAcademicYear } from '../context/AcademicYearContext';
import { useTeacherAssignedClasses } from './useTeacherAssignedClasses';
import { Class } from '../types';
import { fetchAttendanceCalendarOverrides } from '../lib/attendanceCalendar';

export interface MissingAttendanceDay {
  classId: string;
  className: string;
  date: string;
  unstatusCount: number;
}

function getSchoolDaysSinceJuly20(holidays: string[], overridesMap: Map<string, any>): string[] {
  const dates: string[] = [];
  const start = new Date('2026-07-20');
  const now = new Date();
  
  // Format today as YYYY-MM-DD
  const todayStr = now.getFullYear() + '-' + 
                   String(now.getMonth() + 1).padStart(2, '0') + '-' + 
                   String(now.getDate()).padStart(2, '0');
                   
  // Check if today is a school day for this unit
  const todayOverride = overridesMap.get(todayStr);
  let isTodaySchoolDay: boolean;
  if (todayOverride) {
    isTodaySchoolDay = todayOverride.isSchoolDay;
  } else {
    const isTodayWeekend = now.getDay() === 0 || now.getDay() === 6;
    const isTodayHoliday = holidays.includes(todayStr);
    isTodaySchoolDay = !isTodayWeekend && !isTodayHoliday;
  }
  
  const end = new Date(now);
  // Cutoff is after 2 PM (14:00)
  const isAfterCutoff = now.getHours() >= 14;
  if (isTodaySchoolDay && !isAfterCutoff) {
    // If today is a school day but before 14:00, only check up to yesterday
    end.setDate(now.getDate() - 1);
  }
  
  const temp = new Date(start);
  while (temp <= end) {
    const dStr = temp.getFullYear() + '-' + 
                 String(temp.getMonth() + 1).padStart(2, '0') + '-' + 
                 String(temp.getDate()).padStart(2, '0');
                 
    const override = overridesMap.get(dStr);
    let isSchool: boolean;
    
    if (override) {
      isSchool = override.isSchoolDay;
    } else {
      const day = temp.getDay();
      const isWeekend = day === 0 || day === 6;
      const isHoliday = holidays.includes(dStr);
      isSchool = !isWeekend && !isHoliday;
    }
    
    if (isSchool && dStr >= '2026-07-20' && dStr <= todayStr) {
      dates.push(dStr);
    }
    temp.setDate(temp.getDate() + 1);
  }
  
  return dates;
}

export function useAttendanceReminder(activeUnit: string) {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  
  // Get assigned classes using the existing robust hook
  const { assignedClasses, loading: classesLoading } = useTeacherAssignedClasses({
    userId: profile?.uid,
    unit: activeUnit,
    academicYearId: activeYear
  });

  const [loading, setLoading] = useState(true);
  const [missingDays, setMissingDays] = useState<MissingAttendanceDay[]>([]);

  useEffect(() => {
    let active = true;
    
    if (classesLoading) return;
    
    if (!profile || !activeYear || !activeUnit) {
      setLoading(false);
      return;
    }
    
    // Only check for teacher roles
    const isTeacher = profile.role === 'TEACHER' || profile.role === 'HOMEROOM_TEACHER';
    if (!isTeacher) {
      setLoading(false);
      return;
    }

    if (assignedClasses.length === 0) {
      setMissingDays([]);
      setLoading(false);
      return;
    }

    async function checkAttendance() {
      try {
        setLoading(true);
        
        // 1. Fetch school holidays
        const holidaySnap = await getDocs(collection(db, 'school_holidays'));
        const holidays = holidaySnap.docs.map(d => d.data().date || d.id).filter(Boolean) as string[];
        
        // Fetch attendance calendar overrides
        const overridesMap = await fetchAttendanceCalendarOverrides(activeUnit as 'KINDERGARTEN' | 'ELEMENTARY' | 'JUNIOR_HIGH');
        
        // 2. Generate school days list
        const schoolDays = getSchoolDaysSinceJuly20(holidays, overridesMap);
        if (schoolDays.length === 0) {
          if (active) {
            setMissingDays([]);
            setLoading(false);
          }
          return;
        }

        const allMissing: MissingAttendanceDay[] = [];

        // 3. For each assigned class, perform the check
        for (const cls of assignedClasses) {
          const classId = cls.id;
          const className = cls.name || classId;
          
          // Get roster of active students
          const roster = await getActiveStudents(classId, activeYear);
          if (roster.length === 0) continue;

          const classKeys = [classId];
          if (className && className !== classId) {
            classKeys.push(className);
          }

          if (activeUnit === 'KINDERGARTEN') {
            // Kindergarten uses `attendance` collection
            // Format: document per class and date
            const attQ = query(
              collection(db, 'attendance'),
              where('classId', 'in', classKeys),
              where('academicYear', '==', activeYear)
            );
            const attSnap = await getDocs(attQ);
            
            // Map by date
            const attMap = new Map<string, any>();
            attSnap.docs.forEach(d => {
              const data = d.data();
              if (data.date) {
                attMap.set(data.date, data);
              }
            });

            // Check each school day
            schoolDays.forEach(dateStr => {
              const attDoc = attMap.get(dateStr);
              if (!attDoc) {
                // No record at all
                allMissing.push({
                  classId,
                  className,
                  date: dateStr,
                  unstatusCount: roster.length
                });
              } else {
                // Has record, check if any student in active roster has missing status
                const studentsInDoc = attDoc.students || [];
                const studentsInDocMap = new Map(studentsInDoc.map((s: any) => [s.studentId, s.status]));
                
                const missingStudents = roster.filter(s => {
                  const status = studentsInDocMap.get(s.id);
                  return !status || typeof status !== 'string' || status.trim() === '';
                });

                if (missingStudents.length > 0) {
                  allMissing.push({
                    classId,
                    className,
                    date: dateStr,
                    unstatusCount: missingStudents.length
                  });
                }
              }
            });

          } else {
            // Elementary and Junior High use `attendance_records`
            const attQ = query(
              collection(db, 'attendance_records'),
              where('classId', 'in', classKeys),
              where('academicYear', '==', activeYear)
            );
            const attSnap = await getDocs(attQ);
            const records = attSnap.docs
              .map(doc => doc.data())
              .filter(r => r.semester === undefined || r.semester === null || String(r.semester) === String(activeSemester));

            // Map records by date -> studentId
            const recordsByDate = new Map<string, Map<string, any>>();
            records.forEach(r => {
              if (r.date) {
                if (!recordsByDate.has(r.date)) {
                  recordsByDate.set(r.date, new Map());
                }
                recordsByDate.get(r.date)!.set(r.studentId, r);
              }
            });

            // Check each school day
            schoolDays.forEach(dateStr => {
              const dayRecordsMap = recordsByDate.get(dateStr) || new Map<string, any>();
              
              const missingStudents = roster.filter(student => {
                const record = dayRecordsMap.get(student.id);
                return !(record && record.status && typeof record.status === 'string' && record.status.trim() !== '');
              });

              if (missingStudents.length > 0) {
                allMissing.push({
                  classId,
                  className,
                  date: dateStr,
                  unstatusCount: missingStudents.length
                });
              }
            });
          }
        }

        if (active) {
          // Sort missing days: oldest first by default
          allMissing.sort((a, b) => a.date.localeCompare(b.date));
          setMissingDays(allMissing);
        }
      } catch (err) {
        console.error('[useAttendanceReminder] Error checking attendance:', err);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    checkAttendance();
    
    return () => {
      active = false;
    };
  }, [classesLoading, assignedClasses, activeYear, activeSemester, activeUnit, profile]);

  return {
    missingDays,
    loading
  };
}
