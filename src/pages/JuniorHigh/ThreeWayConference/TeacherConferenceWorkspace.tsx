import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Calendar, Settings, ShieldAlert, BookOpen, UserCheck, RefreshCw } from 'lucide-react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useAuth } from '../../../context/AuthContext';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { getClasses } from '../../../lib/firebase';
import { ConferenceWorkspaceFilters } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceWorkspaceFilters';
import { ConferenceResponsesTable } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceResponsesTable';
import { MentorAssignmentDialog } from '../../../components/JuniorHigh/ThreeWayConference/MentorAssignmentDialog';
import { ConferenceResponseDetailDialog } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceResponseDetailDialog';
import type { Student, StudentConferenceResponse, MentorAssignment, ConferencePeriod, User, Class } from '../../../types';
import { toast } from 'sonner';

interface ConferenceWorkspaceRow {
  student: Student;
  response: StudentConferenceResponse | null;
  assignment: MentorAssignment | null;
  className: string;
  grade: string | number;
}

const mapResponseStatus = (response: StudentConferenceResponse | null): 'NOT_STARTED' | 'DRAFT' | 'RETURNED' | 'APPROVED' => {
  if (!response) {
    return 'NOT_STARTED';
  }
  const { status, summary } = threeWayConferenceService.calculateConferenceStatus(response);
  if (status === 'RETURNED') {
    return 'RETURNED';
  }
  if (status === 'APPROVED' || summary.allRequiredApproved) {
    return 'APPROVED';
  }
  return 'DRAFT';
};

export default function TeacherConferenceWorkspace() {
  const navigate = useNavigate();
  const { activeYear, activeSemester, isLoading: isYearLoading } = useAcademicYear();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get('studentId');
  const initialClassId = searchParams.get('classId');

  // Active Period State
  const [activePeriod, setActivePeriod] = useState<ConferencePeriod | null>(null);
  const [isPeriodLoading, setIsPeriodLoading] = useState<boolean>(true);

  // Student list and mentors state
  const [students, setStudents] = useState<ConferenceWorkspaceRow[]>([]);
  const [eligibleMentors, setEligibleMentors] = useState<User[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [search, setSearch] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>(initialClassId || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mentorFilter, setMentorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name_asc');

  const [hasLoadedDefaults, setHasLoadedDefaults] = useState<boolean>(false);
  const [hasMentorAssignments, setHasMentorAssignments] = useState<boolean>(true);

  const isUnitHead = profile?.role === 'HEAD_UNIT' || profile?.role === 'HEAD_JUNIOR';
  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';

  const canLoadStudents = !!(
    (mentorFilter && mentorFilter !== 'all') ||
    (gradeFilter && gradeFilter !== 'all') ||
    (classFilter && classFilter !== 'all') ||
    search.trim() !== '' ||
    isUnitHead ||
    isSuperAdmin
  );

  // Dialogs State
  const [selectedStudentForMentor, setSelectedStudentForMentor] = useState<Student | null>(null);
  const [selectedAssignmentForMentor, setSelectedAssignmentForMentor] = useState<MentorAssignment | null>(null);
  const [isMentorDialogOpen, setIsMentorDialogOpen] = useState<boolean>(false);

  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [selectedClassNameForDetail, setSelectedClassNameForDetail] = useState<string>('');
  const [selectedGradeForDetail, setSelectedGradeForDetail] = useState<string | number>('');
  const [selectedAssignmentForDetail, setSelectedAssignmentForDetail] = useState<MentorAssignment | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState<boolean>(false);

  // Classes list state for filter options
  const [classesList, setClassesList] = useState<Class[]>([]);

  useEffect(() => {
    if (!activeYear) return;
    const fetchClasses = async () => {
      try {
        const cls = await getClasses();
        const jhClasses = cls.filter(c => 
          (c.unitId === 'JUNIOR_HIGH' || ['7', '8', '9', 7, 8, 9].includes(c.grade)) &&
          c.academicYear === activeYear
        );
        setClassesList(jhClasses);
      } catch (err) {
        console.error('Failed to load classes for filter:', err);
      }
    };
    fetchClasses();
  }, [activeYear]);

  // Load Active Period
  useEffect(() => {
    const loadPeriod = async () => {
      setIsPeriodLoading(true);
      try {
        const period = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
        setActivePeriod(period);
      } catch (err: any) {
        console.error('Failed to load active conference period:', err);
      } finally {
        setIsPeriodLoading(false);
      }
    };

    if (!isYearLoading) {
      loadPeriod();
    }
  }, [activeYear, activeSemester, isYearLoading]);

  // Reset hasLoadedDefaults if active period/year changes
  useEffect(() => {
    setHasLoadedDefaults(false);
  }, [activePeriod, activeYear, activeSemester]);

  // Load defaults based on role and assignment of the user
  useEffect(() => {
    if (!activePeriod || !profile || hasLoadedDefaults) return;

    const initializeDefaults = async () => {
      try {
        const isUnitHead = profile.role === 'HEAD_UNIT' || profile.role === 'HEAD_JUNIOR';
        const isSuperAdmin = profile.role === 'SUPER_ADMIN';

        if (isUnitHead || isSuperAdmin) {
          setMentorFilter('all');
          setGradeFilter('all');
          setHasMentorAssignments(true);
          setHasLoadedDefaults(true);
        } else {
          // It's a standard teacher/mentor
          const assignments = await threeWayConferenceService.getMentorAssignmentsForPeriod(activePeriod.id);
          const myAssignments = assignments.filter(
            a => a.mentorId === profile.uid && a.status !== 'REMOVED'
          );

          // Set Mentor = currentUser.id
          setMentorFilter(profile.uid);

          if (myAssignments.length > 0) {
            setHasMentorAssignments(true);

            // Load workspace students to determine unique grades
            const allRows = await threeWayConferenceService.getConferenceWorkspaceStudents(activePeriod.id, activeYear, 'all', 'all');
            const myStudentRows = allRows.filter(row => 
              row.assignment?.mentorId === profile.uid && row.assignment?.status !== 'REMOVED'
            );

            const uniqueGrades = Array.from(new Set(myStudentRows.map(r => String(r.grade)).filter(Boolean)));

            if (uniqueGrades.length === 1) {
              setGradeFilter(uniqueGrades[0]);
            } else {
              setGradeFilter('all');
            }
          } else {
            setHasMentorAssignments(false);
            setGradeFilter('all');
          }
          setHasLoadedDefaults(true);
        }
      } catch (err) {
        console.error('Failed to initialize defaults:', err);
        setHasLoadedDefaults(true);
      }
    };

    initializeDefaults();
  }, [activePeriod, profile, activeYear, hasLoadedDefaults]);

  // Load Eligible Mentors independently when activePeriod changes
  useEffect(() => {
    const loadMentors = async () => {
      if (!activePeriod) return;
      try {
        const mentorsList = await threeWayConferenceService.getEligibleJuniorHighMentors();
        setEligibleMentors(mentorsList);
      } catch (err: any) {
        console.error('Failed to load eligible mentors:', err);
      }
    };
    loadMentors();
  }, [activePeriod]);

  // Load Students and Mentors Data
  const loadWorkspaceData = useCallback(async () => {
    if (!activePeriod || !hasLoadedDefaults) return;
    
    if (!canLoadStudents) {
      setStudents([]);
      return;
    }

    setIsLoadingData(true);
    setError(null);
    try {
      let rowsList: ConferenceWorkspaceRow[] = [];
      let mentorsList: User[] = [];

      const results = await Promise.allSettled([
        threeWayConferenceService.getConferenceWorkspaceStudents(activePeriod.id, activeYear, gradeFilter, classFilter),
        threeWayConferenceService.getEligibleJuniorHighMentors()
      ]);

      if (results[0].status === 'fulfilled') {
        rowsList = results[0].value;
        // Auto-reconcile loaded responses with discrepancies
        rowsList.forEach(async (row) => {
          if (row.response) {
            const { status: calculatedStatus, summary: approvalSummary } = threeWayConferenceService.calculateConferenceStatus(row.response);
            const statusChanged = row.response.status !== calculatedStatus;
            const summaryChanged = !row.response.approvalSummary ||
              row.response.approvalSummary.approvedCount !== approvalSummary.approvedCount ||
              row.response.approvalSummary.requiredCount !== approvalSummary.requiredCount;
            if (statusChanged || summaryChanged) {
              await threeWayConferenceService.reconcileThreeWayConferenceStatuses({ conferenceId: row.response.id });
            }
          }
        });
      } else {
        throw results[0].reason;
      }

      if (results[1].status === 'fulfilled') {
        mentorsList = results[1].value;
      } else {
        console.error('Failed to load eligible mentors:', results[1].reason);
      }

      setStudents(rowsList);
      setEligibleMentors(mentorsList);
    } catch (err: any) {
      setError(err.message || 'Failed to load conference workspace students.');
    } finally {
      setIsLoadingData(false);
    }
  }, [activePeriod, activeYear, gradeFilter, classFilter, mentorFilter, search, isUnitHead, isSuperAdmin, hasLoadedDefaults]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Auto-open student dialog if studentId query param exists and students loaded
  useEffect(() => {
    if (initialStudentId && students.length > 0 && !isDetailDialogOpen) {
      const row = students.find(r => r.student.id === initialStudentId);
      if (row) {
        setSelectedStudentForDetail(row.student);
        setSelectedClassNameForDetail(row.className);
        setSelectedGradeForDetail(row.grade);
        setSelectedAssignmentForDetail(row.assignment);
        setIsDetailDialogOpen(true);
      }
    }
  }, [initialStudentId, students, isDetailDialogOpen]);

  // Handle Dialog Actions
  const handleViewResponse = (studentId: string) => {
    const row = students.find((r) => r.student.id === studentId);
    if (row) {
      setSelectedStudentForDetail(row.student);
      setSelectedClassNameForDetail(row.className);
      setSelectedGradeForDetail(row.grade);
      setSelectedAssignmentForDetail(row.assignment);
      setIsDetailDialogOpen(true);
    }
  };

  const handlePresentConference = (studentId: string) => {
    if (!activePeriod) return;
    const responseId = threeWayConferenceService.getConferenceResponseId(activePeriod.id, studentId);
    navigate(`/conference/presentation/${responseId}`);
  };

  const handleAssignMentor = (student: Student, assignment: MentorAssignment | null) => {
    setSelectedStudentForMentor(student);
    setSelectedAssignmentForMentor(assignment);
    setIsMentorDialogOpen(true);
  };

  const handleAssignMentorFromDetail = () => {
    if (selectedStudentForDetail) {
      setIsDetailDialogOpen(false);
      setSelectedStudentForMentor(selectedStudentForDetail);
      setSelectedAssignmentForMentor(selectedAssignmentForDetail);
      setIsMentorDialogOpen(true);
    }
  };

  const handleClosePanel = () => {
    setIsDetailDialogOpen(false);
    setSelectedStudentForDetail(null);
    setSelectedClassNameForDetail('');
    setSelectedGradeForDetail('');
    setSelectedAssignmentForDetail(null);
    if (classFilter === initialClassId) {
      setClassFilter('all');
    }
    navigate("/junior-high/conference/workspace", { replace: true });
  };

  const handleClearFilters = () => {
    setSearch('');
    setGradeFilter('all');
    setClassFilter('all');
    setStatusFilter('all');
    setMentorFilter(isUnitHead || isSuperAdmin ? 'all' : (profile?.uid || 'all'));
    setSortBy('name_asc');
  };

  // Extract unique filter dropdown values dynamically from master classes list
  const availableGrades = Array.from(
    new Set(classesList.map((c) => c.grade).filter((g) => g !== undefined && g !== null))
  ).sort();

  const availableClasses = Array.from(
    new Set(classesList.map((c) => c.name).filter((n) => n !== undefined && n !== null))
  ).sort();

  const availableMentorsList = eligibleMentors.map((m) => ({
    id: m.uid,
    name: m.displayName || m.email || '',
  }));

  // Filtering Logic
  const filteredStudents = students.filter((row) => {
    // 1. Search Query (Name or NIS)
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      const nameMatch = row.student.name.toLowerCase().includes(q);
      const nisMatch = (row.student.nis || '').toLowerCase().includes(q);
      const idMatch = row.student.id.toLowerCase().includes(q);
      if (!nameMatch && !nisMatch && !idMatch) return false;
    }

    // 2. Grade Filter
    if (gradeFilter !== 'all') {
      if (String(row.grade) !== String(gradeFilter)) return false;
    }

    // 3. Class Filter
    if (classFilter !== 'all') {
      if (row.className !== classFilter) return false;
    }

    // 4. Response Status Filter
    if (statusFilter !== 'all') {
      const status = mapResponseStatus(row.response);
      if (status !== statusFilter) return false;
    }

    // 5. Mentor Filter
    if (mentorFilter !== 'all') {
      const assignedMentorId = row.assignment?.status !== 'REMOVED' ? row.assignment?.mentorId : null;
      if (mentorFilter === 'unassigned') {
        if (assignedMentorId) return false;
      } else {
        if (assignedMentorId !== mentorFilter) return false;
      }
    }

    return true;
  });

  // Sorting Logic
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    switch (sortBy) {
      case 'name_asc': {
        const nameA = a?.student?.name || '';
        const nameB = b?.student?.name || '';
        return nameA.localeCompare(nameB);
      }
      case 'name_desc': {
        const nameA = a?.student?.name || '';
        const nameB = b?.student?.name || '';
        return nameB.localeCompare(nameA);
      }
      case 'class_asc': {
        const classA = a?.className || '';
        const classB = b?.className || '';
        return classA.localeCompare(classB);
      }
      case 'updated_desc': {
        const timeA = a?.response?.updatedAt || 0;
        const timeB = b?.response?.updatedAt || 0;
        return timeB - timeA;
      }
      case 'status_desc': {
        const statusOrder = { APPROVED: 4, RETURNED: 3, DRAFT: 2, NOT_STARTED: 1 };
        const statusA = statusOrder[mapResponseStatus(a.response)] || 1;
        const statusB = statusOrder[mapResponseStatus(b.response)] || 1;
        return statusB - statusA;
      }
      case 'mentor_asc': {
        const mentorA = a?.assignment?.status !== 'REMOVED' ? (a?.assignment?.mentorName || '') : 'ZZZZZZ';
        const mentorB = b?.assignment?.status !== 'REMOVED' ? (b?.assignment?.mentorName || '') : 'ZZZZZZ';
        return mentorA.localeCompare(mentorB);
      }
      default:
        return 0;
    }
  });

  const getPeriodStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Open (Goal Setting Active)
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            Closed (Read-only)
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300">
            Draft
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            Archived
          </span>
        );
      default:
        return null;
    }
  };

  // Render Full Page Layout
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" id="teacher-conference-workspace-page">
      
      {/* Title & Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight" id="workspace-main-title">
            Three-Way Conference Workspace
          </h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">
            Review Junior High student Goal Setting responses and assign active mentor teachers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
          {activePeriod && (
            <button
              onClick={async () => {
                try {
                  toast.loading('Sinkronisasi status...', { id: 'reconcile-toast' });
                  const result = await threeWayConferenceService.reconcileThreeWayConferenceStatuses({
                    academicYear: activeYear,
                    semester: activeSemester
                  });
                  toast.success(`Sinkronisasi sukses! Memproses ${result.scanned} dokumen, mengupdate ${result.updatedToApproved} menjadi APPROVED.`, { id: 'reconcile-toast' });
                  loadWorkspaceData();
                } catch (e) {
                  toast.error('Gagal sinkronisasi data.', { id: 'reconcile-toast' });
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 bg-blue-50/50 hover:bg-blue-50 transition shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Sinkronisasi Status
            </button>
          )}

          {/* Configuration settings button for Admin */}
          {profile?.role === 'SUPER_ADMIN' && (
            <Link
              id="workspace-admin-settings-link"
              to="/junior-high/conference/admin"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 transition shadow-sm"
            >
              <Settings className="h-4 w-4" />
              Conference Settings
            </Link>
          )}
        </div>
      </div>

      {/* Loading States */}
      {isPeriodLoading || (activePeriod && !hasLoadedDefaults) ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm" id="period-loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500 mt-3 font-semibold">Checking conference periods...</p>
        </div>
      ) : !activePeriod ? (
        /* Empty State (No configured conference period) */
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center space-y-4 max-w-xl mx-auto" id="no-period-empty-state">
          <Calendar className="h-12 w-12 text-gray-300 mx-auto" />
          <h2 className="text-lg font-black text-gray-800 tracking-tight">No Conference Period Active</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
            There is currently no Junior High Three-Way Conference period configured or active for the active semester (<strong>{activeYear} - S{activeSemester}</strong>).
          </p>
          {profile?.role === 'SUPER_ADMIN' ? (
            <Link
              id="empty-workspace-settings-link"
              to="/junior-high/conference/admin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow"
            >
              <Settings className="h-4 w-4" />
              Configure Active Period
            </Link>
          ) : (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-3 max-w-md mx-auto font-medium">
              Please contact your school administrator or Head of Junior High to open a conference period for this semester.
            </p>
          )}
        </div>
      ) : (
        /* Core Dashboard Layout */
        <div className="space-y-6" id="workspace-dashboard-content">
          
          {/* Active Period Status Summary Bar */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Active Period Settings</span>
                <p className="text-sm font-bold text-gray-800 mt-0.5">{activePeriod.label}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {getPeriodStatusBadge(activePeriod.status)}
              <span className="text-xs text-gray-400 font-medium hidden sm:inline">•</span>
              <span className="text-xs text-gray-500 font-medium">
                Goal Window: <strong>{activePeriod.goalSettingOpenDate ? new Date(activePeriod.goalSettingOpenDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</strong> to <strong>{activePeriod.goalSettingCloseDate ? new Date(activePeriod.goalSettingCloseDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</strong>
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-700 text-sm">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Filtering Workspace */}
          <ConferenceWorkspaceFilters
            search={search}
            setSearch={setSearch}
            gradeFilter={gradeFilter}
            setGradeFilter={setGradeFilter}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            mentorFilter={mentorFilter}
            setMentorFilter={setMentorFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            availableGrades={availableGrades}
            availableClasses={availableClasses}
            availableMentors={availableMentorsList}
            onClear={handleClearFilters}
            resultsCount={sortedStudents.length}
            disableMentorFilter={!(isUnitHead || isSuperAdmin)}
            hideResultsCount={mentorFilter === profile?.uid && !hasMentorAssignments}
          />

          {/* Table Container */}
          {!canLoadStudents ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm space-y-4" id="select-grade-class-empty-state">
              <BookOpen className="h-10 w-10 text-gray-300 mx-auto" />
              <h3 className="text-base font-bold text-gray-800">Pilih Grade atau Class</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                Silakan pilih Grade atau Class terlebih dahulu pada panel filter di atas untuk menampilkan daftar siswa.
              </p>
            </div>
          ) : isLoadingData ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm" id="table-loading-state">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-500 mt-3 font-semibold">Loading students data...</p>
            </div>
          ) : mentorFilter === profile?.uid && !hasMentorAssignments ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm space-y-4" id="no-mentor-assignments-empty-state">
              <UserCheck className="h-10 w-10 text-gray-300 mx-auto" />
              <h3 className="text-base font-bold text-gray-800">Belum Ada Siswa</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                Belum ada siswa Three-Way Conference yang ditugaskan kepada Anda pada periode aktif.
              </p>
            </div>
          ) : (
            <ConferenceResponsesTable
              rows={sortedStudents}
              onViewResponse={handleViewResponse}
              onAssignMentor={handleAssignMentor}
              onPresentConference={handlePresentConference}
            />
          )}
        </div>
      )}

      {/* Mentor Assignment Dialog */}
      <MentorAssignmentDialog
        isOpen={isMentorDialogOpen}
        onClose={() => {
          setIsMentorDialogOpen(false);
          setSelectedStudentForMentor(null);
          setSelectedAssignmentForMentor(null);
        }}
        periodId={activePeriod?.id || ''}
        student={selectedStudentForMentor}
        currentAssignment={selectedAssignmentForMentor}
        onSaveSuccess={loadWorkspaceData}
      />

      {/* Response Detail Dialog (Read-only) */}
      {activePeriod && selectedStudentForDetail && (
        <ConferenceResponseDetailDialog
          isOpen={isDetailDialogOpen}
          onClose={handleClosePanel}
          student={selectedStudentForDetail}
          className={selectedClassNameForDetail}
          grade={selectedGradeForDetail}
          periodId={activePeriod.id}
          assignment={selectedAssignmentForDetail}
          onAssignMentorClick={handleAssignMentorFromDetail}
        />
      )}

    </div>
  );
}
