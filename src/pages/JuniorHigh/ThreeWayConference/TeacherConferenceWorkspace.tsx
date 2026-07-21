import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Calendar, Settings, ShieldAlert, BookOpen, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useAuth } from '../../../context/AuthContext';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { ConferenceWorkspaceFilters } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceWorkspaceFilters';
import { ConferenceResponsesTable } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceResponsesTable';
import { MentorAssignmentDialog } from '../../../components/JuniorHigh/ThreeWayConference/MentorAssignmentDialog';
import { ConferenceResponseDetailDialog } from '../../../components/JuniorHigh/ThreeWayConference/ConferenceResponseDetailDialog';
import type { Student, StudentConferenceResponse, MentorAssignment, ConferencePeriod, User } from '../../../types';

interface ConferenceWorkspaceRow {
  student: Student;
  response: StudentConferenceResponse | null;
  assignment: MentorAssignment | null;
  className: string;
  grade: string | number;
}

export default function TeacherConferenceWorkspace() {
  const { activeYear, activeSemester, isLoading: isYearLoading } = useAcademicYear();
  const { profile } = useAuth();

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
  const [classFilter, setClassFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mentorFilter, setMentorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name_asc');

  // Dialogs State
  const [selectedStudentForMentor, setSelectedStudentForMentor] = useState<Student | null>(null);
  const [selectedAssignmentForMentor, setSelectedAssignmentForMentor] = useState<MentorAssignment | null>(null);
  const [isMentorDialogOpen, setIsMentorDialogOpen] = useState<boolean>(false);

  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<Student | null>(null);
  const [selectedResponseForDetail, setSelectedResponseForDetail] = useState<StudentConferenceResponse | null>(null);
  const [selectedAssignmentForDetail, setSelectedAssignmentForDetail] = useState<MentorAssignment | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState<boolean>(false);

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

  // Load Students and Mentors Data
  const loadWorkspaceData = useCallback(async () => {
    if (!activePeriod) return;
    setIsLoadingData(true);
    setError(null);
    try {
      const [rows, mentorsList] = await Promise.all([
        threeWayConferenceService.getConferenceWorkspaceStudents(activePeriod.id),
        threeWayConferenceService.getEligibleJuniorHighMentors()
      ]);
      setStudents(rows);
      setEligibleMentors(mentorsList);
    } catch (err: any) {
      setError(err.message || 'Failed to load conference workspace students.');
    } finally {
      setIsLoadingData(false);
    }
  }, [activePeriod]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Handle Dialog Actions
  const handleViewResponse = (studentId: string) => {
    const row = students.find((r) => r.student.id === studentId);
    if (row) {
      setSelectedStudentForDetail(row.student);
      setSelectedResponseForDetail(row.response);
      setSelectedAssignmentForDetail(row.assignment);
      setIsDetailDialogOpen(true);
    }
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

  const handleClearFilters = () => {
    setSearch('');
    setGradeFilter('all');
    setClassFilter('all');
    setStatusFilter('all');
    setMentorFilter('all');
    setSortBy('name_asc');
  };

  // Extract unique filter dropdown values dynamically from current students list
  const availableGrades = Array.from(
    new Set(students.map((s) => s.grade).filter((g) => g !== undefined && g !== '—'))
  ).sort();

  const availableClasses = Array.from(
    new Set(students.map((s) => s.className).filter((c) => c !== undefined && c !== 'Unknown Class'))
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
      const status = row.response ? row.response.status : 'NOT_STARTED';
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
      case 'name_asc':
        return a.student.name.localeCompare(b.student.name);
      case 'name_desc':
        return b.student.name.localeCompare(a.student.name);
      case 'class_asc':
        return a.className.localeCompare(b.className);
      case 'updated_desc': {
        const timeA = a.response?.updatedAt || 0;
        const timeB = b.response?.updatedAt || 0;
        return timeB - timeA;
      }
      case 'status_desc': {
        const statusOrder = { CONFERENCE_COMPLETED: 4, SUBMITTED: 3, DRAFT: 2, NOT_STARTED: 1 };
        const statusA = statusOrder[a.response ? a.response.status : 'NOT_STARTED'];
        const statusB = statusOrder[b.response ? b.response.status : 'NOT_STARTED'];
        return statusB - statusA;
      }
      case 'mentor_asc': {
        const mentorA = a.assignment?.status !== 'REMOVED' ? (a.assignment?.mentorName || '') : 'ZZZZZZ';
        const mentorB = b.assignment?.status !== 'REMOVED' ? (b.assignment?.mentorName || '') : 'ZZZZZZ';
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

        {/* Configuration settings button for Admin */}
        {profile?.role === 'SUPER_ADMIN' && (
          <Link
            id="workspace-admin-settings-link"
            to="/junior-high/conference/admin"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 transition shadow-sm self-start md:self-center"
          >
            <Settings className="h-4 w-4" />
            Conference Settings
          </Link>
        )}
      </div>

      {/* Loading States */}
      {isPeriodLoading ? (
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
          />

          {/* Table Container */}
          {isLoadingData ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm" id="table-loading-state">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-500 mt-3 font-semibold">Loading students data...</p>
            </div>
          ) : (
            <ConferenceResponsesTable
              rows={sortedStudents}
              onViewResponse={handleViewResponse}
              onAssignMentor={handleAssignMentor}
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
        student={selectedStudentForMentor}
        currentAssignment={selectedAssignmentForMentor}
        onSaveSuccess={loadWorkspaceData}
      />

      {/* Response Detail Dialog (Read-only) */}
      <ConferenceResponseDetailDialog
        isOpen={isDetailDialogOpen}
        onClose={() => {
          setIsDetailDialogOpen(false);
          setSelectedStudentForDetail(null);
          setSelectedResponseForDetail(null);
          setSelectedAssignmentForDetail(null);
        }}
        student={selectedStudentForDetail}
        response={selectedResponseForDetail}
        assignment={selectedAssignmentForDetail}
        onAssignMentorClick={handleAssignMentorFromDetail}
      />

    </div>
  );
}
