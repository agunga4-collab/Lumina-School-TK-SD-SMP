import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { ConferencePeriod, SmartGoalTrackerEntry, Student, User } from '../../../types';
import { toast } from 'sonner';

// Components
import { TrackerWorkspaceFilters } from '../../../components/JuniorHigh/ThreeWayConference/TrackerWorkspaceFilters';
import { TrackerEntriesTable } from '../../../components/JuniorHigh/ThreeWayConference/TrackerEntriesTable';
import { TrackerEntryDetailDialog } from '../../../components/JuniorHigh/ThreeWayConference/TrackerEntryDetailDialog';
import { MentorCommentDialog } from '../../../components/JuniorHigh/ThreeWayConference/MentorCommentDialog';

// Icons
import { AlertCircle, ArrowLeft, Settings, ClipboardList, Info, Sparkles } from 'lucide-react';

export default function StaffSmartGoalTrackerPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester, isYearLoading } = useAcademicYear();
  const navigate = useNavigate();

  // Core Data
  const [activePeriod, setActivePeriod] = React.useState<ConferencePeriod | null>(null);
  const [trackerEntries, setTrackerEntries] = React.useState<SmartGoalTrackerEntry[]>([]);
  const [workspaceStudents, setWorkspaceStudents] = React.useState<any[]>([]);
  const [eligibleMentors, setEligibleMentors] = React.useState<User[]>([]);

  // Loading / Error
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters State
  const [search, setSearch] = React.useState('');
  const [gradeFilter, setGradeFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');
  const [goalTypeFilter, setGoalTypeFilter] = React.useState('all');
  const [mentorFilter, setMentorFilter] = React.useState('all');
  const [commentFilter, setCommentFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sortBy, setSortBy] = React.useState('date_desc');

  // Dialog State
  const [selectedEntryForDetail, setSelectedEntryForDetail] = React.useState<any | null>(null);
  const [selectedEntryForComment, setSelectedEntryForComment] = React.useState<any | null>(null);

  // Authorization check
  const isAuthorizedRole = ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'].includes(profile?.role || '');
  const userUnit = profile?.unitId;
  const userAssignedUnits = (profile as any)?.assignedUnits || [];
  const hasJHAccess = userUnit === 'JUNIOR_HIGH' || userAssignedUnits.includes('JUNIOR_HIGH') || profile?.role === 'SUPER_ADMIN';

  // Load Active Period & Reference Data
  React.useEffect(() => {
    const loadPeriod = async () => {
      try {
        setLoading(true);
        const period = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
        setActivePeriod(period);

        if (period) {
          // Load reference data
          const [entries, students, mentors] = await Promise.all([
            threeWayConferenceService.getTrackerEntriesForPeriod(period.id),
            threeWayConferenceService.getConferenceWorkspaceStudents(period.id),
            threeWayConferenceService.getEligibleJuniorHighMentors()
          ]);
          setTrackerEntries(entries);
          setWorkspaceStudents(students);
          setEligibleMentors(mentors);
        }
      } catch (err: any) {
        console.error('Failed to load staff tracker workspace:', err);
        setError(err.message || 'Failed to load tracker workspace.');
      } finally {
        setLoading(false);
      }
    };

    if (!isYearLoading && isAuthorizedRole && hasJHAccess) {
      loadPeriod();
    } else if (!isYearLoading) {
      setLoading(false);
    }
  }, [activeYear, activeSemester, isYearLoading, isAuthorizedRole, hasJHAccess]);

  // Handler for saving comment
  const handleSaveComment = async (commentText: string) => {
    if (!selectedEntryForComment || !profile) return;
    try {
      await threeWayConferenceService.saveMentorComment(selectedEntryForComment.id, commentText, profile);
      toast.success('Mentor comment has been saved.');
      
      // Close comment dialog
      setSelectedEntryForComment(null);

      // Reload tracker entries
      if (activePeriod) {
        const updatedEntries = await threeWayConferenceService.getTrackerEntriesForPeriod(activePeriod.id);
        setTrackerEntries(updatedEntries);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save mentor comment.');
      throw err;
    }
  };

  if (!isAuthorizedRole || !hasJHAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="staff-tracker-unauthorized">
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-50 flex items-center justify-center text-red-500">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">Access Denied</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              You are not authorized to access the Junior High SMART Goal Tracker workspace. Only Super Admins, Head of Units, BK Mentors, and Teachers with Junior High access are permitted.
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" id="staff-tracker-loading">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500">Loading Staff SMART Goal Tracker...</p>
        </div>
      </div>
    );
  }

  // If no active period
  if (!activePeriod) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="staff-tracker-no-period">
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">No Active Conference Period</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              There is currently no active Three-Way Conference period configured for the current semester.
            </p>
          </div>
          {profile?.role === 'SUPER_ADMIN' ? (
            <button
              onClick={() => navigate('/junior-high/conference/admin')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Open Conference Settings
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Create lookup maps for students and classes
  const studentMap = new Map<string, { student: Student; assignment: any; className: string; grade: any }>();
  workspaceStudents.forEach((row) => {
    studentMap.set(row.student.id, row);
    if (row.student.uid) {
      studentMap.set(row.student.uid, row);
    }
  });

  // Extract available filter values
  const availableGrades = Array.from(new Set(workspaceStudents.map(r => r.student.gradeLevel || r.grade).filter(Boolean))).sort();
  const availableClasses = Array.from(new Set(workspaceStudents.map(r => r.student.className || r.className).filter(Boolean))).sort();
  const availableMentors = eligibleMentors.map(m => ({ id: m.uid || m.id, name: m.displayName || m.email }));

  // Filter & Enrich Entries
  const enrichedEntries = trackerEntries.map((entry) => {
    const studentRow = studentMap.get(entry.studentId);
    return {
      ...entry,
      studentDetail: studentRow?.student,
      mentorName: studentRow?.assignment?.mentorName,
      mentorId: studentRow?.assignment?.mentorId
    };
  });

  const filteredEntries = enrichedEntries.filter((entry) => {
    const studentName = entry.studentDetail?.name || '';
    const studentNis = entry.studentDetail?.nis || '';
    const gradeLevel = entry.studentDetail?.gradeLevel;
    const className = entry.studentDetail?.className;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = studentName.toLowerCase().includes(q);
      const matchNis = studentNis.toLowerCase().includes(q);
      if (!matchName && !matchNis) return false;
    }

    // Grade filter
    if (gradeFilter !== 'all') {
      if (String(gradeLevel) !== String(gradeFilter)) return false;
    }

    // Class filter
    if (classFilter !== 'all') {
      if (className !== classFilter) return false;
    }

    // Goal Type filter
    if (goalTypeFilter !== 'all') {
      if (entry.goalStrand !== goalTypeFilter) return false;
    }

    // Mentor filter
    if (mentorFilter !== 'all') {
      if (mentorFilter === 'unassigned') {
        if (entry.mentorId) return false;
      } else {
        if (entry.mentorId !== mentorFilter) return false;
      }
    }

    // Comment filter
    if (commentFilter !== 'all') {
      if (commentFilter === 'commented') {
        if (!entry.mentorComment) return false;
      } else if (commentFilter === 'uncommented') {
        if (entry.mentorComment) return false;
      }
    }

    // Status filter
    if (statusFilter !== 'all') {
      const entryStatus = entry.overallStatus || 'SUBMITTED';
      if (entryStatus !== statusFilter) return false;
    }

    return true;
  });

  // Sort
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    switch (sortBy) {
      case 'date_desc':
        return b.entryDate - a.entryDate || b.createdAt - a.createdAt;
      case 'date_asc':
        return a.entryDate - b.entryDate || a.createdAt - b.createdAt;
      case 'student_asc':
        const nameA = a.studentDetail?.name || '';
        const nameB = b.studentDetail?.name || '';
        return nameA.localeCompare(nameB);
      case 'class_asc':
        const classA = a.studentDetail?.className || '';
        const classB = b.studentDetail?.className || '';
        return classA.localeCompare(classB);
      case 'goal_type_asc':
        return a.goalStrand.localeCompare(b.goalStrand);
      case 'mentor_asc':
        const mentorA = a.mentorName || '\uFFFF';
        const mentorB = b.mentorName || '\uFFFF';
        return mentorA.localeCompare(mentorB);
      default:
        return b.entryDate - a.entryDate;
    }
  });

  const handleClearFilters = () => {
    setSearch('');
    setGradeFilter('all');
    setClassFilter('all');
    setGoalTypeFilter('all');
    setMentorFilter('all');
    setCommentFilter('all');
    setStatusFilter('all');
    setSortBy('date_desc');
  };

  const isArchived = activePeriod.status === 'ARCHIVED';

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" id="staff-tracker-workspace-page">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md">
              JH {activePeriod.academicYear} - Semester {activePeriod.semester}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
              isArchived ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              {isArchived ? 'Archived Period' : 'Active Period'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SMART Goal Tracker</h1>
          <p className="text-sm text-gray-500">
            Review student progress updates and add mentor comments.
          </p>
        </div>
      </div>

      {/* Info Banner if archived */}
      {isArchived && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100/50 rounded-xl text-amber-800 text-sm">
          <Info className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Archived Period</p>
            <p className="text-xs text-amber-700/95">
              This Three-Way Conference and SMART Goal Tracker period is archived. You can view all progress entries and mentor comments, but additions and edits of mentor comments are disabled.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <TrackerWorkspaceFilters
        search={search}
        setSearch={setSearch}
        gradeFilter={gradeFilter}
        setGradeFilter={setGradeFilter}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        goalTypeFilter={goalTypeFilter}
        setGoalTypeFilter={setGoalTypeFilter}
        mentorFilter={mentorFilter}
        setMentorFilter={setMentorFilter}
        commentFilter={commentFilter}
        setCommentFilter={setCommentFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        availableGrades={availableGrades}
        availableClasses={availableClasses}
        availableMentors={availableMentors}
        onClear={handleClearFilters}
        resultsCount={sortedEntries.length}
      />

      {/* Main Entries Table */}
      <TrackerEntriesTable
        entries={sortedEntries}
        onViewDetail={(entry) => setSelectedEntryForDetail(entry)}
        onAddComment={(entry) => setSelectedEntryForComment(entry)}
        isArchived={isArchived}
      />

      {/* Entry Detail Dialog */}
      {selectedEntryForDetail && (
        <TrackerEntryDetailDialog
          entry={selectedEntryForDetail}
          onClose={() => setSelectedEntryForDetail(null)}
          onAddComment={(entry) => setSelectedEntryForComment(entry)}
          isArchived={isArchived}
        />
      )}

      {/* Mentor Comment Dialog */}
      {selectedEntryForComment && (
        <MentorCommentDialog
          entry={selectedEntryForComment}
          onClose={() => setSelectedEntryForComment(null)}
          onSave={handleSaveComment}
        />
      )}
    </div>
  );
}
