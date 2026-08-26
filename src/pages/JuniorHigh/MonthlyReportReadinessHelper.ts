import type { Student, ClassReportSummary, JuniorHighMonthlyReportComment } from '../../types';

export interface ReadinessContext {
  classId: string;
  academicYear: string;
  semester: string;
  periodKey: string; // YYYY-MM
  unit: string;      // 'JUNIOR_HIGH'
  reportType: string; // 'MONTHLY_PROGRESS'
}

export interface ReadinessLoading {
  loadingClasses: boolean;
  loadingStudents: boolean;
  loadingSummary: boolean;
  loadingComments: boolean;
  loadingAttendance: boolean;
}

export interface ReadinessError {
  studentsError: boolean;
  summaryError: boolean;
  commentsError: boolean;
  attendanceError: boolean;
}

export interface ReadinessData {
  students: Student[];
  classSummary: ClassReportSummary | null;
  commentsMap: Record<string, JuniorHighMonthlyReportComment>;
  attendanceAvailableForPeriod: boolean;
}

export type ChecklistItemState = 'Ready' | 'Missing' | 'Incomplete' | 'Unavailable' | 'Loading' | 'Error';

export interface ChecklistItem {
  key: string;
  label: string;
  state: ChecklistItemState;
  reason?: string;
}

export interface ReadinessResult {
  overallState: 'CHECKING' | 'NOT READY' | 'READY FOR FUTURE PUBLISH';
  checklist: ChecklistItem[];
  counts: {
    totalStudents: number;
    finalCommentsCount: number;
    draftCommentsCount: number;
    missingFinalCommentsCount: number;
    attendanceAvailable: boolean;
  };
}

export function validateReportReadiness(
  context: ReadinessContext,
  loading: ReadinessLoading,
  errors: ReadinessError,
  data: ReadinessData
): ReadinessResult {
  const { classId, academicYear, semester, periodKey, unit, reportType } = context;
  const { loadingClasses, loadingStudents, loadingSummary, loadingComments, loadingAttendance } = loading;
  const { studentsError, summaryError, commentsError, attendanceError } = errors;
  const { students, classSummary, commentsMap, attendanceAvailableForPeriod } = data;

  const isContextIncomplete = !classId || !academicYear || !semester || !periodKey || !/^\d{4}-\d{2}$/.test(periodKey);
  const isAnyLoading = loadingClasses || loadingStudents || loadingSummary || loadingComments || loadingAttendance;

  // 1. Report context selected
  let contextState: ChecklistItemState = 'Incomplete';
  let contextReason: string | undefined;
  if (!isContextIncomplete) {
    contextState = 'Ready';
  } else {
    contextReason = 'Report context is incomplete.';
  }

  // 2. Active roster loaded
  let rosterLoadedState: ChecklistItemState = 'Loading';
  let rosterLoadedReason: string | undefined;
  if (loadingClasses || loadingStudents) {
    rosterLoadedState = 'Loading';
  } else if (studentsError) {
    rosterLoadedState = 'Error';
    rosterLoadedReason = 'Roster could not be loaded.';
  } else {
    rosterLoadedState = 'Ready';
  }

  // 3. Active roster contains students
  let rosterHasStudentsState: ChecklistItemState = 'Loading';
  let rosterHasStudentsReason: string | undefined;
  if (loadingClasses || loadingStudents) {
    rosterHasStudentsState = 'Loading';
  } else if (studentsError) {
    rosterHasStudentsState = 'Unavailable';
  } else if (students.length === 0) {
    rosterHasStudentsState = 'Missing';
    rosterHasStudentsReason = 'No active students found in this class.';
  } else {
    rosterHasStudentsState = 'Ready';
  }

  // 4. Class summary is ready
  let summaryState: ChecklistItemState = 'Loading';
  let summaryReason: string | undefined;
  if (loadingSummary) {
    summaryState = 'Loading';
  } else if (summaryError) {
    summaryState = 'Error';
    summaryReason = 'Class summary could not be loaded.';
  } else if (!classSummary) {
    summaryState = 'Missing';
    summaryReason = 'Class summary has not been completed or is not READY.';
  } else {
    const summaryContextMatch =
      classSummary.unit === unit &&
      classSummary.reportType === reportType &&
      classSummary.classId === classId &&
      classSummary.academicYear === academicYear &&
      String(classSummary.semester) === String(semester) &&
      classSummary.periodKey === periodKey;

    if (summaryContextMatch && classSummary.status === 'READY') {
      summaryState = 'Ready';
    } else {
      summaryState = 'Incomplete';
      summaryReason = 'Class summary has not been completed or is not READY.';
    }
  }

  // 5. Final comments for all active students
  let commentsState: ChecklistItemState = 'Loading';
  let commentsReason: string | undefined;
  let finalCommentsCount = 0;
  let draftCommentsCount = 0;
  let missingFinalCommentsCount = 0;

  if (loadingComments || loadingStudents) {
    commentsState = 'Loading';
  } else if (commentsError || studentsError) {
    commentsState = 'Error';
    commentsReason = commentsError ? 'Comments could not be loaded.' : 'Comments unavailable due to roster load failure.';
  } else if (students.length === 0) {
    commentsState = 'Unavailable';
  } else {
    students.forEach(student => {
      const comment = commentsMap[student.id];
      if (comment) {
        if (comment.status === 'FINAL') {
          finalCommentsCount++;
        } else if (comment.status === 'DRAFT') {
          draftCommentsCount++;
          missingFinalCommentsCount++;
        }
      } else {
        missingFinalCommentsCount++;
      }
    });

    if (finalCommentsCount === students.length) {
      commentsState = 'Ready';
    } else if (finalCommentsCount === 0) {
      commentsState = 'Missing';
      commentsReason = `${missingFinalCommentsCount} students still need FINAL general comments.`;
    } else {
      commentsState = 'Incomplete';
      commentsReason = `${missingFinalCommentsCount} students still need FINAL general comments.`;
    }
  }

  // 6. Attendance recorded for this period
  let attendanceState: ChecklistItemState = 'Loading';
  let attendanceReason: string | undefined;
  if (loadingAttendance) {
    attendanceState = 'Loading';
  } else if (attendanceError) {
    attendanceState = 'Error';
    attendanceReason = 'Attendance data could not be accessed for this report period.';
  } else {
    if (attendanceAvailableForPeriod) {
      attendanceState = 'Ready';
    } else {
      attendanceState = 'Unavailable';
      attendanceReason = 'Attendance has not been recorded for this report period.';
    }
  }

  // 7. Required data sources accessible
  let healthState: ChecklistItemState = 'Loading';
  let healthReason: string | undefined;
  if (isAnyLoading) {
    healthState = 'Loading';
  } else if (studentsError || summaryError || commentsError || attendanceError) {
    healthState = 'Error';
    healthReason = 'One or more required data sources could not be accessed.';
  } else {
    healthState = 'Ready';
  }

  const checklist: ChecklistItem[] = [
    { key: 'context', label: 'Report context selected', state: contextState, reason: contextReason },
    { key: 'roster_loaded', label: 'Active roster loaded', state: rosterLoadedState, reason: rosterLoadedReason },
    { key: 'roster_students', label: 'Active roster contains students', state: rosterHasStudentsState, reason: rosterHasStudentsReason },
    { key: 'summary', label: 'Class summary is ready', state: summaryState, reason: summaryReason },
    { key: 'comments', label: 'Final comments for all active students', state: commentsState, reason: commentsReason },
    { key: 'attendance', label: 'Attendance recorded for this period', state: attendanceState, reason: attendanceReason },
    { key: 'health', label: 'Required data sources accessible', state: healthState, reason: healthReason },
  ];

  let overallState: 'CHECKING' | 'NOT READY' | 'READY FOR FUTURE PUBLISH' = 'NOT READY';
  if (isAnyLoading || isContextIncomplete) {
    overallState = 'CHECKING';
  } else if (checklist.every(item => item.state === 'Ready')) {
    overallState = 'READY FOR FUTURE PUBLISH';
  } else {
    overallState = 'NOT READY';
  }

  return {
    overallState,
    checklist,
    counts: {
      totalStudents: students.length,
      finalCommentsCount,
      draftCommentsCount,
      missingFinalCommentsCount,
      attendanceAvailable: attendanceAvailableForPeriod,
    },
  };
}
