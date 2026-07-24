import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { threeWayConferenceService } from '../../services/threeWayConferenceService';
import { ConferencePeriod, StudentConferenceResponse, SmartGoal, SmartGoalTrackerEntry } from '../../types';
import { toast } from 'sonner';

// Components
import StudentTrackerGoalSelector from '../../components/Student/SmartGoalTracker/StudentTrackerGoalSelector';
import TrackerEntryForm from '../../components/Student/SmartGoalTracker/TrackerEntryForm';
import StudentTrackerTimeline from '../../components/Student/SmartGoalTracker/StudentTrackerTimeline';

// Icons
import { 
  Target, AlertTriangle, ArrowRight, ClipboardCheck, 
  Calendar, Info, PlusCircle, Sparkles, Compass 
} from 'lucide-react';

export default function StudentSmartGoalTrackerPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();
  const navigate = useNavigate();

  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<ConferencePeriod | null>(null);
  const [response, setResponse] = React.useState<StudentConferenceResponse | null>(null);
  const [goals, setGoals] = React.useState<SmartGoal[]>([]);
  const [trackerEntries, setTrackerEntries] = React.useState<SmartGoalTrackerEntry[]>([]);

  // Selected goal filter
  const [selectedGoalId, setSelectedGoalId] = React.useState<string | null>(null);

  // Form toggles
  const [showForm, setShowForm] = React.useState(false);
  const [editingEntry, setEditingEntry] = React.useState<SmartGoalTrackerEntry | null>(null);

  const studentId = profile?.luminaId || '';

  const loadData = React.useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Fetch active conference period
      const activePeriod = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
      setPeriod(activePeriod);

      if (activePeriod) {
        // Fetch student conference response
        const resp = await threeWayConferenceService.getStudentConferenceResponse(activePeriod.id, studentId);
        setResponse(resp);

        if (resp) {
          const fetchedGoals = resp.goals || [];
          setGoals(fetchedGoals);

          // If submitted/completed, load tracker timeline entries
          if (resp.status === 'SUBMITTED' || resp.status === 'CONFERENCE_COMPLETED') {
            const entries = await threeWayConferenceService.getStudentTrackerEntries(activePeriod.id, studentId);
            setTrackerEntries(entries);
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to load tracker data:', error);
      toast.error('Failed to load SMART Goal Tracker.');
    } finally {
      setLoading(false);
    }
  }, [studentId, activeYear, activeSemester]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveEntry = async (payload: {
    goalId: string;
    entryDate: number;
    actionsTaken: string;
    progressMade: string;
    hinderingBehaviors: string;
    improvementPlan: string;
    isSubmit?: boolean;
  }) => {
    if (!period) return;
    try {
      if (editingEntry) {
        await threeWayConferenceService.updateStudentTrackerEntry(
          editingEntry.id,
          payload,
          studentId
        );
        toast.success(payload.isSubmit ? 'Your progress update has been submitted.' : 'Your progress update draft has been updated.');
      } else {
        await threeWayConferenceService.createStudentTrackerEntry(
          {
            periodId: period.id,
            studentId,
            ...payload
          },
          studentId
        );
        toast.success(payload.isSubmit ? 'Your progress update has been submitted.' : 'Your progress update draft has been saved.');
      }

      // Reload data
      setShowForm(false);
      setEditingEntry(null);
      
      // Refresh list
      const updatedEntries = await threeWayConferenceService.getStudentTrackerEntries(period.id, studentId);
      setTrackerEntries(updatedEntries);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tracker entry');
      throw err;
    }
  };

  const handleEditClick = async (entry: SmartGoalTrackerEntry) => {
    // If starting edit from DRAFT or REVISION_REQUIRED or if no status, set to EDITING
    if (!entry.overallStatus || entry.overallStatus === 'DRAFT' || entry.overallStatus === 'REVISION_REQUIRED') {
      try {
        await threeWayConferenceService.startEditingTrackerEntry(entry.id, studentId);
        entry.overallStatus = 'EDITING';
      } catch (err) {
        console.error('Failed to set status to EDITING:', err);
      }
    }
    setEditingEntry(entry);
    setShowForm(true);
    // Smooth scroll to form
    setTimeout(() => {
      document.getElementById('tracker-entry-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleAddProgressClick = () => {
    setEditingEntry(null);
    setShowForm(true);
    // Smooth scroll to form
    setTimeout(() => {
      document.getElementById('tracker-entry-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Not Set';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Status/Validation Flags for Window & Response
  const getTrackerStatus = () => {
    if (!period) return { status: 'NO_PERIOD' as const, message: 'SMART Goal Tracker is not available yet.', isWritable: false };
    
    if (period.status === 'ARCHIVED') {
      return { status: 'ARCHIVED' as const, message: 'This SMART Goal Tracker period has been archived.', isWritable: false };
    }
    
    const now = Date.now();
    
    if (period.status !== 'OPEN') {
      return { status: 'CLOSED' as const, message: 'The SMART Goal Tracker window has closed.', isWritable: false };
    }

    if (period.trackerOpenDate && now < period.trackerOpenDate) {
      return { 
        status: 'BEFORE_OPEN' as const, 
        message: `SMART Goal Tracker opens on ${formatDate(period.trackerOpenDate)}.`, 
        isWritable: false 
      };
    }

    if (period.trackerCloseDate && now > period.trackerCloseDate) {
      return { status: 'CLOSED' as const, message: 'The SMART Goal Tracker window has closed.', isWritable: false };
    }

    return { status: 'OPEN' as const, message: 'The tracker window is open.', isWritable: true };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" id="tracker-loading">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-500">Loading SMART Goal Tracker...</p>
        </div>
      </div>
    );
  }

  // 1. No active conference period
  if (!period) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="tracker-no-period">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">SMART Goal Tracker is not available yet</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              There is currently no active Three-Way Conference period configured for the current semester.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { status: trackerStatus, message: trackerStatusMessage, isWritable } = getTrackerStatus();

  // 2. Period exists but no response
  if (!response) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="tracker-no-response">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
            <Target className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-gray-900">Complete Goal Setting first to begin tracking your progress</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              You must have at least one goal set up in your Goal Setting response before tracking your progress.
            </p>
          </div>
          <button
            onClick={() => navigate('/student/goal-setting')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow cursor-pointer"
          >
            Go to Goal Setting
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 3. Response exists but is DRAFT
  if (response.status === 'DRAFT') {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="tracker-draft-response">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center text-purple-500">
            <ClipboardCheck className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-gray-900">Submit your Goal Setting before starting SMART Goal Tracker</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              The SMART Goal Tracker uses goals set during your Goal Setting. Please submit your Goal Setting response first.
            </p>
          </div>
          <button
            onClick={() => navigate('/student/goal-setting')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow cursor-pointer"
          >
            Continue Goal Setting
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // 4. Response submitted but no goals
  if (goals.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6" id="tracker-no-goals">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">No goals are available to track yet</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              You submitted your Goal Setting response, but no goals were included. Please consult your teacher.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" id="student-smart-goal-tracker-page">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2.5 py-1 rounded-md">
              {period.academicYear} - Semester {period.semester}
            </span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${
              isWritable ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
            }`}>
              {isWritable ? 'Tracker Window Open' : 'Tracker Window Closed'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SMART Goal Tracker</h1>
          <p className="text-sm text-gray-500">
            Track the small steps you take toward your Three-Way Conference goals.
          </p>
        </div>

        {isWritable && !showForm && (
          <button
            onClick={handleAddProgressClick}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition rounded-lg shadow cursor-pointer self-start md:self-center"
          >
            <PlusCircle className="h-4 w-4" />
            Add Progress Update
          </button>
        )}
      </div>

      {/* Date Window Banner if not Open or Active */}
      {!isWritable && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100/50 rounded-xl text-amber-800 text-sm">
          <Info className="h-5 w-5 shrink-0 text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">{trackerStatusMessage}</p>
            <p className="text-xs text-amber-700/95">
              You can view all past progress entries and mentor comments, but additions and edits are disabled outside the active tracker period window.
              <br />
              Window: <span className="font-semibold">{formatDate(period.trackerOpenDate)}</span> to <span className="font-semibold">{formatDate(period.trackerCloseDate)}</span>.
            </p>
          </div>
        </div>
      )}

      {/* Main layout split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Col: Goal summary area (Takes 1 Col) */}
        <div className="lg:col-span-1 space-y-6">
          <StudentTrackerGoalSelector
            goals={goals}
            trackerEntries={trackerEntries}
            selectedGoalId={selectedGoalId}
            onSelectGoal={(id) => {
              setSelectedGoalId(id);
              // Hide form when switching filters to keep layout uncluttered
              setShowForm(false);
              setEditingEntry(null);
            }}
          />
        </div>

        {/* Right Col: Form & Timeline (Takes 2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active tracker entry form */}
          {showForm && (
            <TrackerEntryForm
              goals={goals}
              period={period}
              editingEntry={editingEntry}
              preselectedGoalId={selectedGoalId}
              onSave={handleSaveEntry}
              onCancel={() => {
                setShowForm(false);
                setEditingEntry(null);
              }}
            />
          )}

          {/* Timeline of entries */}
          <StudentTrackerTimeline
            entries={trackerEntries}
            selectedGoalId={selectedGoalId}
            onClearFilter={() => setSelectedGoalId(null)}
            canEditEntries={isWritable}
            onEditEntry={handleEditClick}
          />
        </div>
      </div>
    </div>
  );
}
