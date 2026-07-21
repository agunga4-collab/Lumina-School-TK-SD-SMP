import * as React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getStudentById } from '../../lib/firebase';
import { threeWayConferenceService } from '../../services/threeWayConferenceService';
import { Student, ConferencePeriod, StudentConferenceResponse, SmartGoal, UnitActivityItem } from '../../types';
import { toast } from 'sonner';

// Sub-components
import StudentProfileSection from '../../components/Student/GoalSetting/StudentProfileSection';
import ReflectionSection from '../../components/Student/GoalSetting/ReflectionSection';
import GoalsSection from '../../components/Student/GoalSetting/GoalsSection';
import SelfExplorationReferenceSection from '../../components/Student/GoalSetting/SelfExplorationReferenceSection';
import UnitActivitySection from '../../components/Student/GoalSetting/UnitActivitySection';

// Icons
import { 
  CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, 
  Save, Send, ChevronRight, Target, Sparkles, ClipboardCheck
} from 'lucide-react';

const STEPS = [
  { id: 'profile', name: 'Profile' },
  { id: 'reflection', name: 'Reflection' },
  { id: 'goals', name: 'Goals' },
  { id: 'self-exploration', name: 'Self-Exploration' },
  { id: 'unit-activity', name: 'Unit Activity' },
  { id: 'review', name: 'Review & Submit' }
];

export default function StudentGoalSettingPage() {
  const { profile } = useAuth();
  const { activeYear, activeSemester } = useAcademicYear();

  // Loading States
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Core Data State
  const [student, setStudent] = React.useState<Student | null>(null);
  const [period, setPeriod] = React.useState<ConferencePeriod | null>(null);
  const [response, setResponse] = React.useState<StudentConferenceResponse | null>(null);
  const [selfExplorationRef, setSelfExplorationRef] = React.useState<{ periodLabel: string; enrollment: any | null } | null>(null);
  const [seLoading, setSeLoading] = React.useState(false);

  // Form Field State (Tracks unsaved values locally)
  const [formData, setFormData] = React.useState<{
    aboutMe: string;
    strengths: string;
    areasForGrowth: string;
    goals: SmartGoal[];
    unitActivity: string;
    unitActivities: UnitActivityItem[];
  }>({
    aboutMe: '',
    strengths: '',
    areasForGrowth: '',
    goals: [],
    unitActivity: '',
    unitActivities: [],
  });

  // Track if we have unsaved local changes
  const [isDirty, setIsDirty] = React.useState(false);

  // Active step in the form stepper
  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);

  // Confirmation Modal
  const [showSubmitModal, setShowSubmitModal] = React.useState(false);

  // Validation Error List (For submit feedback)
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);

  // Period / Window Status Flags
  const [periodState, setPeriodState] = React.useState<{
    status: 'NO_PERIOD' | 'READ_ONLY_STATUS' | 'BEFORE_OPEN' | 'AFTER_CLOSE' | 'EDITABLE';
    message?: string;
    isEditable: boolean;
  }>({
    status: 'NO_PERIOD',
    isEditable: false
  });

  const studentId = profile?.luminaId || '';

  // 1. Initial Data Fetch
  const fetchData = React.useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Fetch student trusted records
      const sData = await getStudentById(studentId);
      setStudent(sData);

      // Fetch active conference period
      const activePeriod = await threeWayConferenceService.getCurrentConferencePeriod(activeYear, activeSemester);
      setPeriod(activePeriod);

      if (activePeriod) {
        // Fetch existing response document
        const existingResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(activePeriod.id, studentId);
        setResponse(existingResponse);

        if (existingResponse) {
          setFormData({
            aboutMe: existingResponse.aboutMe || '',
            strengths: existingResponse.strengths || '',
            areasForGrowth: existingResponse.areasForGrowth || '',
            goals: existingResponse.goals || [],
            unitActivity: existingResponse.unitActivity || '',
            unitActivities: existingResponse.unitActivities || [],
          });
        }

        // Fetch Self-Exploration References
        setSeLoading(true);
        const seRef = await threeWayConferenceService.getStudentSelfExplorationReference(studentId, activeYear, activeSemester);
        setSelfExplorationRef(seRef);
        setSeLoading(false);

        // Determine window/status constraints
        const now = Date.now();
        const { status, goalSettingOpenDate, goalSettingCloseDate } = activePeriod;

        if (existingResponse && (existingResponse.status === 'SUBMITTED' || existingResponse.status === 'CONFERENCE_COMPLETED')) {
          setPeriodState({
            status: 'READ_ONLY_STATUS',
            message: `Your response has been ${existingResponse.status.toLowerCase()} and is now read-only.`,
            isEditable: false
          });
        } else if (status !== 'OPEN') {
          setPeriodState({
            status: 'READ_ONLY_STATUS',
            message: `Goal Setting is not active for this period (Status: ${status}).`,
            isEditable: false
          });
        } else if (goalSettingOpenDate && now < goalSettingOpenDate) {
          const openDateStr = new Date(goalSettingOpenDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          setPeriodState({
            status: 'BEFORE_OPEN',
            message: `Goal Setting opens on ${openDateStr}.`,
            isEditable: false
          });
        } else if (goalSettingCloseDate && now > goalSettingCloseDate) {
          setPeriodState({
            status: 'AFTER_CLOSE',
            message: `The Goal Setting window has closed.`,
            isEditable: false
          });
        } else {
          setPeriodState({
            status: 'EDITABLE',
            isEditable: true
          });
        }
      } else {
        setPeriodState({
          status: 'NO_PERIOD',
          message: 'Goal Setting is not available yet. Please check back later.',
          isEditable: false
        });
      }
    } catch (err: any) {
      console.error('Error loading goal setting data:', err);
      toast.error('Failed to load goal setting modules.');
    } finally {
      setLoading(false);
    }
  }, [studentId, activeYear, activeSemester]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Form field change callback
  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
  };

  // 2. Draft Save
  const handleSaveDraft = async () => {
    if (!period || !studentId) return;

    try {
      setSaving(true);
      
      const payload: Partial<StudentConferenceResponse> = {
        aboutMe: formData.aboutMe,
        strengths: formData.strengths,
        areasForGrowth: formData.areasForGrowth,
        goals: formData.goals,
        unitActivity: formData.unitActivity,
        unitActivities: formData.unitActivities,
        selfExplorationReferenceId: selfExplorationRef?.enrollment?.id || null,
        selfExplorationSnapshot: selfExplorationRef?.enrollment || null,
      };

      await threeWayConferenceService.saveStudentConferenceDraft(period.id, studentId, payload);
      setIsDirty(false);
      toast.success('Your Goal Setting draft has been saved.');
      
      // Refresh local responses status
      const updatedResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(period.id, studentId);
      setResponse(updatedResponse);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save draft.');
    } finally {
      setSaving(false);
    }
  };

  // 3. Submit
  const handleSubmitResponse = async () => {
    if (!period || !studentId) return;

    try {
      setSaving(true);
      setShowSubmitModal(false);

      const payload: Partial<StudentConferenceResponse> = {
        aboutMe: formData.aboutMe,
        strengths: formData.strengths,
        areasForGrowth: formData.areasForGrowth,
        goals: formData.goals,
        unitActivity: formData.unitActivity,
        unitActivities: formData.unitActivities,
        selfExplorationReferenceId: selfExplorationRef?.enrollment?.id || null,
        selfExplorationSnapshot: selfExplorationRef?.enrollment || null,
      };

      await threeWayConferenceService.submitStudentConferenceResponse(period.id, studentId, payload);
      setIsDirty(false);
      toast.success('Your Goal Setting has been submitted for Three-Way Conference.');

      // Reload
      await fetchData();
      setCurrentStepIdx(STEPS.length - 1); // Go to final step to see submitted review
    } catch (err: any) {
      toast.error(err.message || 'Submission failed.');
    } finally {
      setSaving(false);
    }
  };

  // Local client validation trigger before showing submit confirmation
  const triggerSubmitValidation = () => {
    const payload: Partial<StudentConferenceResponse> = {
      aboutMe: formData.aboutMe,
      strengths: formData.strengths,
      areasForGrowth: formData.areasForGrowth,
      goals: formData.goals,
      unitActivity: formData.unitActivity,
      unitActivities: formData.unitActivities,
    };

    const validation = threeWayConferenceService.validateConferenceResponseForSubmission(payload);
    setValidationErrors(validation.errors);

    if (validation.isValid) {
      setShowSubmitModal(true);
    } else {
      toast.error('Please complete all required fields and goals before submitting.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-400 font-black uppercase tracking-widest">Loading Goal Setting workbook...</p>
      </div>
    );
  }

  // Handle No Student Mapping / Invalid State
  if (!studentId) {
    return (
      <div className="max-w-2xl mx-auto p-12 bg-white rounded-[3rem] border border-gray-100 text-center space-y-4 shadow-sm">
        <AlertTriangle size={48} className="text-amber-500 mx-auto" />
        <h2 className="text-xl font-black text-gray-900 uppercase italic">Access Restricted</h2>
        <p className="text-gray-500 font-medium text-sm">
          No student record is currently linked with your account profile (NIS missing). If you are a Super Admin or Staff, please access using a test student account.
        </p>
      </div>
    );
  }

  // Handle No Active Period State
  if (periodState.status === 'NO_PERIOD' && !response) {
    return (
      <div className="max-w-2xl mx-auto p-12 bg-white rounded-[3rem] border border-gray-100 text-center space-y-4 shadow-sm animate-in fade-in">
        <AlertTriangle size={48} className="text-amber-500 mx-auto" />
        <h2 className="text-xl font-black text-gray-900 uppercase italic">Goal Setting Unavailable</h2>
        <p className="text-gray-500 font-medium text-sm">
          {periodState.message}
        </p>
      </div>
    );
  }

  const activeStep = STEPS[currentStepIdx];
  const isEditable = periodState.isEditable;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
      
      {/* Page Title Header */}
      <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="space-y-3 relative z-10">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Three-Way Conference Workbook</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            Student Goal Setting
          </h1>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            {period?.label || 'Academic Period'} • Academic Year {activeYear} • Semester {activeSemester}
          </p>
        </div>

        {/* Save/Status Badges */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          {response?.status === 'SUBMITTED' ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              <CheckCircle2 size={14} /> Submitted Response
            </div>
          ) : isDirty ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              <AlertTriangle size={14} className="animate-bounce" /> Unsaved Changes
            </div>
          ) : (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 text-gray-400 border border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              <CheckCircle2 size={14} /> Draft Saved
            </div>
          )}
        </div>
      </div>

      {/* Date Window Banner */}
      {!isEditable && periodState.message && (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-[2rem] flex items-center gap-4 text-amber-800 shadow-sm">
          <AlertTriangle size={24} className="flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-xs font-black uppercase tracking-wider">Goal Setting Status Warning</p>
            <p className="text-xs font-medium mt-1">{periodState.message}</p>
          </div>
        </div>
      )}

      {/* Main Content Split (Navigation Sidebar + Active Section Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Navigation Sidebar / Stepper (Left-Side) */}
        <div className="lg:col-span-3 space-y-3 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">Workbook Navigation</p>
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStepIdx;
            const isCompleted = idx < currentStepIdx;

            return (
              <button
                key={step.id}
                onClick={() => {
                  setValidationErrors([]); // Clear validation errors list when browsing
                  setCurrentStepIdx(idx);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100 scale-[1.02]' 
                    : isCompleted 
                      ? 'text-emerald-600 hover:bg-gray-50' 
                      : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black ${
                  isActive 
                    ? 'bg-white text-blue-600' 
                    : isCompleted 
                      ? 'bg-emerald-50 text-emerald-600' 
                      : 'bg-gray-100 text-gray-400'
                }`}>
                  {idx + 1}
                </div>
                <span className="truncate">{step.name}</span>
                {isCompleted && <CheckCircle2 size={14} className="ml-auto text-emerald-500" />}
              </button>
            );
          })}
        </div>

        {/* Form Body Viewport (Right-Side) */}
        <div className="lg:col-span-9 space-y-8">
          
          {/* STEP 1: Profile */}
          {activeStep.id === 'profile' && (
            <StudentProfileSection 
              student={student} 
              academicYear={activeYear} 
              semester={activeSemester} 
            />
          )}

          {/* STEP 2: Reflection */}
          {activeStep.id === 'reflection' && (
            <ReflectionSection
              aboutMe={formData.aboutMe}
              strengths={formData.strengths}
              areasForGrowth={formData.areasForGrowth}
              disabled={!isEditable}
              onChange={handleFieldChange}
            />
          )}

          {/* STEP 3: Goals */}
          {activeStep.id === 'goals' && (
            <GoalsSection
              goals={formData.goals}
              disabled={!isEditable}
              onGoalsChange={(updatedGoals) => handleFieldChange('goals', updatedGoals)}
            />
          )}

          {/* STEP 4: Self-Exploration */}
          {activeStep.id === 'self-exploration' && (
            <SelfExplorationReferenceSection
              loading={seLoading}
              referenceData={selfExplorationRef}
              grade={student?.grade || response?.gradeLevel}
            />
          )}

          {/* STEP 5: Unit Activity */}
          {activeStep.id === 'unit-activity' && (
            <UnitActivitySection
              unitActivity={formData.unitActivity}
              unitActivities={formData.unitActivities}
              disabled={!isEditable}
              onChange={handleFieldChange}
            />
          )}

          {/* STEP 6: Review & Submit */}
          {activeStep.id === 'review' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              {/* Submission Information banner */}
              <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm space-y-4">
                <h2 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Review Workbook Summary</h2>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">
                  Carefully inspect all entered reflections and goals below. Once submitted, your workbook will be formatted for mentor reviews and cannot be directly modified.
                </p>

                {/* Local Validation Check Block */}
                {validationErrors.length > 0 && (
                  <div className="p-5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-800 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    <p className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-600">
                      <AlertTriangle size={14} /> Missing Required Workbook Entries
                    </p>
                    <ul className="list-disc list-inside text-xs font-semibold space-y-1 pl-1">
                      {validationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Read Only Full Workbook Preview */}
              <div className="space-y-6 bg-white p-8 md:p-12 rounded-[3rem] border border-gray-100 shadow-sm">
                <h3 className="text-xl font-black text-gray-900 uppercase italic border-b border-gray-100 pb-4">
                  Workbook Response Content
                </h3>

                <div className="space-y-8">
                  {/* About Me */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">About Me</h4>
                    <p className="text-sm font-semibold text-gray-700 leading-relaxed bg-gray-50 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap">
                      {formData.aboutMe || <em className="text-gray-300">No input provided</em>}
                    </p>
                  </div>

                  {/* Strengths & Growth Areas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Strengths</h4>
                      <p className="text-sm font-semibold text-gray-700 leading-relaxed bg-gray-50 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap">
                        {formData.strengths || <em className="text-gray-300">No input provided</em>}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Areas for Growth</h4>
                      <p className="text-sm font-semibold text-gray-700 leading-relaxed bg-gray-50 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap">
                        {formData.areasForGrowth || <em className="text-gray-300">No input provided</em>}
                      </p>
                    </div>
                  </div>

                  {/* Goals Count List */}
                  <div className="space-y-4 border-t border-gray-100 pt-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Configured SMART Goals</h4>
                    {formData.goals.length === 0 ? (
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider italic bg-gray-50 p-5 rounded-2xl border border-dashed border-gray-200 text-center">
                        No goals added to this workbook.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {formData.goals.map((g, idx) => (
                          <div key={g.id || idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-bold text-gray-700">
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black px-2 py-1 bg-white border border-gray-200 rounded-lg text-blue-600 uppercase">
                                {g.strand}
                              </span>
                              <span className="truncate max-w-[200px] md:max-w-md">
                                {g.goal || <em className="text-gray-300 font-medium normal-case">Untitled Goal text</em>}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                              Target: {g.targetDate ? new Date(g.targetDate).toLocaleDateString() : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Self-Exploration Reference */}
                  <div className="space-y-2 border-t border-gray-100 pt-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Self-Exploration Plan Mapping</h4>
                    <p className="text-sm font-semibold text-gray-700">
                      {selfExplorationRef?.enrollment ? (
                        <span className="text-xs font-black text-blue-600 uppercase">
                          Mapped to: {selfExplorationRef.periodLabel} (Enrollment ID: {selfExplorationRef.enrollment.id})
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-gray-400 uppercase">
                          No Self-Exploration enrollment referenced.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Unit Activity */}
                  <div className="space-y-4 border-t border-gray-100 pt-6">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">My Unit Activities</h4>
                    {formData.unitActivities && formData.unitActivities.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {formData.unitActivities.map((ua) => (
                          <div key={ua.category} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-3">
                            <div className="flex items-center justify-between border-b border-gray-200/50 pb-1.5">
                              <span className="text-[10px] font-black text-teal-950 uppercase tracking-wide">{ua.category}</span>
                              <span className="text-[8px] font-black px-1.5 py-0.5 bg-white border border-teal-500/10 rounded-md text-teal-600 uppercase tracking-wider">
                                Selected
                              </span>
                            </div>
                            <div className="space-y-2 text-xs">
                              <div>
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">Activity Chosen</span>
                                <p className="text-gray-800 font-bold mt-0.5">{ua.activityName || <em className="text-gray-300">None selected</em>}</p>
                              </div>
                              <div>
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">My Worries</span>
                                <p className="text-gray-700 font-semibold leading-relaxed whitespace-pre-wrap">{ua.worries || <em className="text-gray-300">No worries provided</em>}</p>
                              </div>
                              <div>
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">My Overcoming Plan</span>
                                <p className="text-gray-700 font-semibold leading-relaxed whitespace-pre-wrap">{ua.overcomingPlan || <em className="text-gray-300">No plan provided</em>}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-gray-700 leading-relaxed bg-gray-50 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap">
                        {formData.unitActivity || <em className="text-gray-300">No input provided</em>}
                      </p>
                    )}
                  </div>

                </div>
              </div>

            </div>
          )}

          {/* Persistent Action Bar at the Bottom of form cards */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2">
              {currentStepIdx > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setValidationErrors([]);
                    setCurrentStepIdx(prev => prev - 1);
                  }}
                  className="flex items-center gap-2 px-6 py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors border border-gray-100"
                >
                  <ArrowLeft size={14} /> Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Draft Save Button */}
              {isEditable && response?.status !== 'SUBMITTED' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveDraft}
                  className="flex items-center gap-2 px-6 py-3.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 hover:shadow-sm"
                >
                  <Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}
                </button>
              )}

              {/* Next Step / Validation Trigger */}
              {currentStepIdx < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setValidationErrors([]);
                    setCurrentStepIdx(prev => prev + 1);
                  }}
                  className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-md shadow-blue-100"
                >
                  Next <ArrowRight size={14} />
                </button>
              ) : (
                isEditable && response?.status !== 'SUBMITTED' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={triggerSubmitValidation}
                    className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-md shadow-indigo-100"
                  >
                    <Send size={14} /> Submit Goal Setting
                  </button>
                )
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl p-8 max-w-md w-full space-y-6 animate-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ClipboardCheck size={24} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Submit Goal Setting?</h3>
              <p className="text-xs text-gray-400 font-bold leading-relaxed">
                After submission, your responses will be ready for your Three-Way Conference and cannot be edited unless the period is reopened.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitResponse}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-md shadow-indigo-100"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
