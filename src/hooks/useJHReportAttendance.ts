import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface JHReportAttendanceParams {
  selectedClassId: string;
  selectedClassName: string | undefined;
  selectedYear: string;
  selectedSemester: string;
  selectedMonth: string; // YYYY-MM
  studentIds: string[];  // Active student IDs
}

export interface StudentAttendanceTotals {
  sickLeave: number | null;
  excusedLeave: number | null;
  absent: number | null;
}

export interface JHReportAttendanceResult {
  loading: boolean;
  error: string | null;
  errorType: 'permission-denied' | 'generic' | null;
  attendanceAvailableForPeriod: boolean;
  studentAttendanceMap: Record<string, StudentAttendanceTotals>;
}

export function useJHReportAttendance({
  selectedClassId,
  selectedClassName,
  selectedYear,
  selectedSemester,
  selectedMonth,
  studentIds,
}: JHReportAttendanceParams): JHReportAttendanceResult {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'permission-denied' | 'generic' | null>(null);
  const [attendanceAvailableForPeriod, setAttendanceAvailableForPeriod] = useState<boolean>(false);
  const [studentAttendanceMap, setStudentAttendanceMap] = useState<Record<string, StudentAttendanceTotals>>({});

  // Ref to track the current query parameters to prevent race conditions (stale responses overriding newer selected context data)
  const activeQueryRef = useRef<string>('');

  useEffect(() => {
    // 9. On class/year/semester/period change, immediately clear state to prevent leakage of old totals
    setLoading(true);
    setError(null);
    setErrorType(null);
    setAttendanceAvailableForPeriod(false);
    setStudentAttendanceMap({});

    if (!selectedClassId || !selectedYear || !selectedSemester || !selectedMonth || !studentIds || studentIds.length === 0) {
      setLoading(false);
      return;
    }

    const currentQueryKey = `${selectedClassId}_${selectedYear}_${selectedSemester}_${selectedMonth}_${studentIds.join(',')}`;
    activeQueryRef.current = currentQueryKey;

    let isMounted = true;

    async function fetchAttendance() {
      try {
        // 1. Build class identifiers (current canonical and legacy class display name fallback)
        const classIdentifiers = [selectedClassId];
        if (selectedClassName && selectedClassName !== selectedClassId) {
          classIdentifiers.push(selectedClassName);
        }

        // 2. Query only attendance_records where classId in classIdentifiers and academicYear matches selected academic year
        const attQuery = query(
          collection(db, 'attendance_records'),
          where('classId', 'in', classIdentifiers),
          where('academicYear', '==', selectedYear)
        );

        const snap = await getDocs(attQuery);

        if (!isMounted || activeQueryRef.current !== currentQueryKey) return;

        const docs = snap.docs.map(d => d.data());

        // 3. Filter in memory:
        // - record.semester === selectedSemester
        // - record.date starts with selectedMonth plus "-" (e.g., "YYYY-MM-")
        // - record.studentId is in canonical active roster IDs (studentIds)
        const monthPrefix = `${selectedMonth}-`;
        const rosterSet = new Set(studentIds);

        const matchedRecords = docs.filter(record => {
          const dateStr = record.date || '';
          const recStudentId = record.studentId || '';
          const recStatus = record.status || '';
          const recSemester = String(record.semester || '');

          return (
            recSemester === String(selectedSemester) &&
            dateStr.startsWith(monthPrefix) &&
            rosterSet.has(recStudentId) &&
            ['HADIR', 'SAKIT', 'IZIN', 'ALPA', 'LATE'].includes(recStatus)
          );
        });

        // Determine availability at class/month level:
        // attendanceAvailableForPeriod is true only if at least one valid, context-matching attendance record exists for any active roster student in the selected month & semester.
        const isAvailable = matchedRecords.length > 0;

        const map: Record<string, StudentAttendanceTotals> = {};

        if (isAvailable) {
          // Initialize every active roster student with 0 values
          studentIds.forEach(sid => {
            map[sid] = {
              sickLeave: 0,
              excusedLeave: 0,
              absent: 0,
            };
          });

          // Aggregate totals per student
          matchedRecords.forEach(record => {
            const sid = record.studentId;
            const status = record.status;

            if (map[sid]) {
              if (status === 'SAKIT') {
                map[sid].sickLeave = (map[sid].sickLeave || 0) + 1;
              } else if (status === 'IZIN') {
                map[sid].excusedLeave = (map[sid].excusedLeave || 0) + 1;
              } else if (status === 'ALPA') {
                map[sid].absent = (map[sid].absent || 0) + 1;
              }
            }
          });
        } else {
          // Set all to null (renders as '-')
          studentIds.forEach(sid => {
            map[sid] = {
              sickLeave: null,
              excusedLeave: null,
              absent: null,
            };
          });
        }

        setAttendanceAvailableForPeriod(isAvailable);
        setStudentAttendanceMap(map);
        setLoading(false);
      } catch (err: any) {
        console.error('[useJHReportAttendance] Error loading attendance records:', err);
        if (!isMounted || activeQueryRef.current !== currentQueryKey) return;

        const isPermError = 
          err?.code === 'permission-denied' || 
          err?.message?.toLowerCase().includes('permission') ||
          err?.message?.toLowerCase().includes('denied');

        setError(err?.message || 'Unknown attendance loading error');
        setErrorType(isPermError ? 'permission-denied' : 'generic');
        setLoading(false);
      }
    }

    fetchAttendance();

    return () => {
      isMounted = false;
    };
  }, [selectedClassId, selectedClassName, selectedYear, selectedSemester, selectedMonth, studentIds]);

  return {
    loading,
    error,
    errorType,
    attendanceAvailableForPeriod,
    studentAttendanceMap,
  };
}
