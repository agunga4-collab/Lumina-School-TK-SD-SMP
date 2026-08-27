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
import KaryaIlmiahSection from '../../components/Student/GoalSetting/KaryaIlmiahSection';

// Icons
import { 
  CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, 
  Save, Send, ChevronRight, Target, Sparkles, ClipboardCheck,
  Loader2
} from 'lucide-react';

const STEPS_STATIC = [
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
    karyaIlmiahReferenceId: string;
  }>({
    aboutMe: '',
    strengths: '',
    areasForGrowth: '',
    goals: [],
    unitActivity: '',
    unitActivities: [],
    karyaIlmiahReferenceId: '',
  });

  const steps = React.useMemo(() => {
    const list = [
      { id: 'profile', name: 'Profile' },
      { id: 'reflection', name: 'Reflection' },
      { id: 'goals', name: 'Goals' },
      { id: 'self-exploration', name: 'Self-Exploration' },
    ];
    if (student?.grade === 9 || response?.gradeLevel === 9) {
      list.push({ id: 'karya-ilmiah', name: 'Karya Ilmiah' });
    }
    list.push({ id: 'unit-activity', name: 'Unit Activity' });
    list.push({ id: 'review', name: 'Review & Submit' });
    return list;
  }, [student?.grade, response?.gradeLevel]);

  // Track if we have unsaved local changes
  const [isDirty, setIsDirty] = React.useState(false);

  // Active step in the form stepper
  const [currentStepIdx, setCurrentStepIdx] = React.useState(0);

  // Confirmation Modal
  const [showSubmitModal, setShowSubmitModal] = React.useState(false);

  // Revision Modal states
  const [showRevisionModal, setShowRevisionModal] = React.useState(false);
  const [revisionReason, setRevisionReason] = React.useState('');
  const [isSubmittingRevision, setIsSubmittingRevision] = React.useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = React.useState(false);

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
        if (existingResponse) {
          const { status: calculatedStatus } = threeWayConferenceService.calculateConferenceStatus(existingResponse);
          existingResponse.status = calculatedStatus;
        }
        setResponse(existingResponse);

        // Fetch Self-Exploration References FIRST so we can merge it
        setSeLoading(true);
        const seRef = await threeWayConferenceService.getStudentSelfExplorationReference(studentId, activeYear, activeSemester);
        setSelfExplorationRef(seRef);
        setSeLoading(false);

        // Build list of unit activities by merging Self Exploration choices if available
        let initialUnitActivities: any[] = [];
        if (existingResponse?.unitActivities && existingResponse.unitActivities.length > 0) {
          initialUnitActivities = [...existingResponse.unitActivities];
        }

        const categories = ['Performing Arts', 'Arts & Makerspace', 'Physical Education', 'Digital Literacy'];
        
        if (seRef?.enrollment?.choices && seRef.enrollment.choices.length > 0) {
          const seChoices = seRef.enrollment.choices;
          categories.forEach(cat => {
            const seChoice = seChoices.find((c: any) => c.strand === cat);
            const resolvedActivityName = seChoice ? (seChoice.activityName || seChoice.customActivity || '') : '';
            
            const existingIdx = initialUnitActivities.findIndex(item => item.category === cat);
            if (existingIdx >= 0) {
              // Only overwrite or set if empty
              if (resolvedActivityName && !initialUnitActivities[existingIdx].activityName) {
                initialUnitActivities[existingIdx].activityName = resolvedActivityName;
              }
            } else {
              initialUnitActivities.push({
                category: cat,
                activityName: resolvedActivityName,
                worries: '',
                overcomingPlan: ''
              });
            }
          });
        } else {
          // If no Self-Exploration data, ensure we still have the 4 categories
          categories.forEach(cat => {
            const existingIdx = initialUnitActivities.findIndex(item => item.category === cat);
            if (existingIdx < 0) {
              initialUnitActivities.push({
                category: cat,
                activityName: '',
                worries: '',
                overcomingPlan: ''
              });
            }
          });
        }

        if (existingResponse) {
          setFormData({
            aboutMe: existingResponse.aboutMe || '',
            strengths: existingResponse.strengths || '',
            areasForGrowth: existingResponse.areasForGrowth || '',
            goals: existingResponse.goals || [],
            unitActivity: existingResponse.unitActivity || '',
            unitActivities: initialUnitActivities,
            karyaIlmiahReferenceId: existingResponse.karyaIlmiahReferenceId || '',
          });
        } else {
          // Prefill empty response form data with initial unit activities
          setFormData(prev => ({
            ...prev,
            unitActivities: initialUnitActivities,
          }));
        }

        // Determine window/status constraints
        const now = Date.now();
        const { status, goalSettingOpenDate, goalSettingCloseDate } = activePeriod;

        const dbStatus = existingResponse?.status || 'DRAFT';

        let isEditable = true;
        let msg = '';

        if (status !== 'OPEN') {
          isEditable = false;
          msg = `Goal Setting is not active for this period (Status: ${status}).`;
        } else if (goalSettingOpenDate && now < goalSettingOpenDate) {
          const openDateStr = new Date(goalSettingOpenDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          isEditable = false;
          msg = `Goal Setting opens on ${openDateStr}.`;
        } else if (goalSettingCloseDate && now > goalSettingCloseDate) {
          isEditable = false;
          msg = `The Goal Setting window has closed.`;
        } else if (dbStatus === 'SUBMITTED') {
          isEditable = false;
          msg = `Workbook Anda sudah dikirim dan sedang dalam peninjauan oleh guru.`;
        } else if (dbStatus === 'APPROVED') {
          isEditable = false;
          msg = `Workbook Anda telah disetujui oleh guru.`;
        } else if (dbStatus === 'CONFERENCE_COMPLETED') {
          isEditable = false;
          msg = `Workbook Anda telah diselesaikan (Conference Completed).`;
        } else if (dbStatus === 'RETURNED') {
          isEditable = true;
          msg = `Workbook Anda telah dikembalikan oleh guru untuk direvisi. Silakan lakukan perubahan dan kirim kembali.`;
        } else {
          isEditable = true;
          msg = '';
        }

        setPeriodState({
          status: isEditable ? 'EDITABLE' : 'READ_ONLY_STATUS',
          message: msg,
          isEditable: isEditable
        });
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

  // Autosave State & Refs for student reflection text fields
  const [autosaveStatus, setAutosaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autosaveTimerRef = React.useRef<any>(null);
  const formDataRef = React.useRef(formData);

  React.useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Clean up autosave timer on unmount
  React.useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const triggerAutosave = React.useCallback(() => {
    if (!period || !studentId || !periodState.isEditable) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(async () => {
      try {
        setAutosaveStatus('saving');
        const currentData = formDataRef.current;
        const payload: Partial<StudentConferenceResponse> = {
          aboutMe: currentData.aboutMe,
          strengths: currentData.strengths,
          areasForGrowth: currentData.areasForGrowth,
          goals: currentData.goals,
          unitActivity: currentData.unitActivity,
          unitActivities: currentData.unitActivities,
          selfExplorationReferenceId: selfExplorationRef?.enrollment?.id || null,
          selfExplorationSnapshot: selfExplorationRef?.enrollment || null,
          karyaIlmiahReferenceId: currentData.karyaIlmiahReferenceId || null,
        };

        await threeWayConferenceService.saveStudentConferenceDraft(period.id, studentId, payload);
        setIsDirty(false);
        setAutosaveStatus('saved');

        // Quietly refresh local response state to avoid losing edit status
        const updatedResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(period.id, studentId);
        if (updatedResponse) {
          const { status: calculatedStatus } = threeWayConferenceService.calculateConferenceStatus(updatedResponse);
          updatedResponse.status = calculatedStatus;
          setResponse(updatedResponse);
        }

        // Return to idle after a brief visual display period
        setTimeout(() => {
          setAutosaveStatus(prev => prev === 'saved' ? 'idle' : prev);
        }, 3000);
      } catch (err: any) {
        console.error('Autosave failed:', err);
        setAutosaveStatus('error');
      }
    }, 1000);
  }, [period, studentId, periodState.isEditable, selfExplorationRef]);

  // Form field change callback
  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);

    if (field === 'aboutMe' || field === 'strengths' || field === 'areasForGrowth') {
      triggerAutosave();
    }
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
        karyaIlmiahReferenceId: formData.karyaIlmiahReferenceId || null,
      };

      await threeWayConferenceService.saveStudentConferenceDraft(period.id, studentId, payload);
      setIsDirty(false);
      toast.success('Your Goal Setting draft has been saved.');
      
      // Refresh local responses status
      const updatedResponse = await threeWayConferenceService.getCurrentStudentConferenceResponse(period.id, studentId);
      if (updatedResponse) {
        const { status: calculatedStatus } = threeWayConferenceService.calculateConferenceStatus(updatedResponse);
        updatedResponse.status = calculatedStatus;
      }
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
        karyaIlmiahReferenceId: formData.karyaIlmiahReferenceId || null,
      };

      await threeWayConferenceService.submitStudentConferenceResponse(period.id, studentId, payload);
      setIsDirty(false);
      toast.success('Your Goal Setting has been submitted for Three-Way Conference.');

      // Reload
      await fetchData();
      setCurrentStepIdx(steps.length - 1); // Go to final step to see submitted review
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
      gradeLevel: student?.grade || response?.gradeLevel || 0,
      karyaIlmiahReferenceId: formData.karyaIlmiahReferenceId || null,
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

  const activeStep = steps[currentStepIdx] || steps[0];
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
          ) : autosaveStatus === 'saving' ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-2xl text-[10px] font-black uppercase tracking-widest animate-pulse">
              <Loader2 size={14} className="animate-spin" /> Menyimpan…
            </div>
          ) : autosaveStatus === 'saved' ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              <CheckCircle2 size={14} /> Tersimpan
            </div>
          ) : autosaveStatus === 'error' ? (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-[10px] font-black uppercase tracking-widest">
              <AlertTriangle size={14} /> Gagal menyimpan
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

      {/* Workbook Status Banner */}
      {response && (
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4 animate-in slide-in-from-top duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${
                response.status === 'APPROVED' ? 'bg-emerald-500 animate-pulse' :
                response.status === 'SUBMITTED' ? 'bg-amber-500 animate-pulse' :
                response.status === 'RETURNED' ? 'bg-rose-500' : 'bg-gray-400'
              }`} />
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status Workbook</span>
                <h4 className="text-sm font-black text-gray-800 uppercase italic tracking-tight">
                  {response.status === 'DRAFT' && 'Draft (Belum Dikirim)'}
                  {response.status === 'SUBMITTED' && 'Submitted (Menunggu Review Guru)'}
                  {response.status === 'RETURNED' && 'Returned (Butuh Revisi)'}
                  {response.status === 'APPROVED' && 'Approved (Sudah Disetujui Guru)'}
                  {response.status === 'CONFERENCE_COMPLETED' && 'Conference Completed'}
                </h4>
              </div>
            </div>

            <div className="flex gap-2 w-full sm:w-auto justify-end">
              {/* Show "Request Revision" if status is SUBMITTED or APPROVED */}
              {(response.status === 'SUBMITTED' || response.status === 'APPROVED') && (
                <button
                  type="button"
                  onClick={() => setShowRevisionModal(true)}
                  disabled={response.revisionRequest?.status === 'PENDING'}
                  className="px-4 py-2 border border-blue-200 text-blue-600 bg-blue-50/50 hover:bg-blue-50 text-[10px] font-black uppercase tracking-wider rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {response.revisionRequest?.status === 'PENDING' ? 'Permintaan Revisi Pending' : 'Ajukan Permintaan Revisi'}
                </button>
              )}
              
              <button
                type="button"
                onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                className="px-4 py-2 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 text-[10px] font-black uppercase tracking-wider rounded-xl transition shadow-sm"
              >
                {showHistoryPanel ? 'Sembunyikan Log Status' : 'Lihat Log Status'}
              </button>
            </div>
          </div>

          {/* If there's an active pending revision request */}
          {response.revisionRequest && response.revisionRequest.status === 'PENDING' && (
            <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl text-xs font-semibold text-amber-800 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
              <div>
                <p className="font-black uppercase tracking-wider text-[9px] text-amber-700">Permintaan Revisi Sedang Menunggu Persetujuan Guru</p>
                <p className="mt-0.5 text-gray-600">Alasan diajukan: <span className="italic">"{response.revisionRequest.reason}"</span></p>
                <p className="text-[10px] text-gray-400 mt-1">Diajukan pada {new Date(response.revisionRequest.requestedAt || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* If revision was DECLINED */}
          {response.revisionRequest && response.revisionRequest.status === 'DECLINED' && (
            <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-800 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-500 mt-0.5" />
              <div>
                <p className="font-black uppercase tracking-wider text-[9px] text-rose-700">Permintaan Revisi Belum Disetujui Oleh Guru</p>
                <p className="mt-0.5 text-gray-600">Catatan guru: <span className="italic">"{response.revisionRequest.teacherNote}"</span></p>
                <p className="text-[10px] text-gray-400 mt-1">Ditolak pada {new Date(response.revisionRequest.respondedAt || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* If returned by teacher (via direct action or responded request) */}
          {response.status === 'RETURNED' && response.revisionRequest?.teacherNote && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-800 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-rose-600 mt-0.5" />
              <div>
                <p className="font-black uppercase tracking-wider text-[9px] text-rose-700">Catatan Revisi Dari Guru</p>
                <p className="mt-0.5 text-gray-700">Pesan: <span className="font-bold">"{response.revisionRequest.teacherNote}"</span></p>
                <p className="text-[10px] text-gray-400 mt-1">Dikembalikan pada {new Date(response.revisionRequest.respondedAt || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* History Panel */}
          {showHistoryPanel && (
            <div className="border-t border-gray-100 pt-5 space-y-4 animate-in slide-in-from-top duration-300">
              <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Riwayat Status Workbook & Audit Trail</h5>
              
              {!response.statusHistory || response.statusHistory.length === 0 ? (
                <p className="text-xs text-gray-400 font-semibold italic">Belum ada riwayat aktivitas yang tercatat.</p>
              ) : (
                <div className="relative border-l border-gray-200 pl-5 ml-2.5 space-y-6">
                  {response.statusHistory.map((item, idx) => (
                    <div key={idx} className="relative">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[26px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 ring-4 ring-white" />
                      
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-black text-gray-800">
                            {item.performedByName} ({item.performedByRole})
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          <span className="text-[9px] font-black px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 uppercase tracking-wide">
                            {item.action.replace(/_/g, ' ')}
                          </span>
                        </div>
                        
                        {item.note && (
                          <p className="text-xs font-semibold text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100 mt-1 max-w-xl italic leading-relaxed">
                            "{item.note}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content Split (Navigation Sidebar + Active Section Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Navigation Sidebar / Stepper (Left-Side) */}
        <div className="lg:col-span-3 space-y-3 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2">Workbook Navigation</p>
          {steps.map((step, idx) => {
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
              reviews={response?.sectionReviews}
            />
          )}

          {/* STEP 3: Goals */}
          {activeStep.id === 'goals' && (
            <GoalsSection
              goals={formData.goals}
              disabled={!isEditable}
              onGoalsChange={(updatedGoals) => handleFieldChange('goals', updatedGoals)}
              onSaveDraft={handleSaveDraft}
              reviews={response?.sectionReviews}
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

          {/* STEP: Karya Ilmiah (Conditional for Grade 9) */}
          {activeStep.id === 'karya-ilmiah' && (
            <KaryaIlmiahSection
              karyaIlmiahReferenceId={formData.karyaIlmiahReferenceId}
              disabled={!isEditable}
              onChange={handleFieldChange}
              reviews={response?.sectionReviews}
            />
          )}

          {/* STEP 5: Unit Activity */}
          {activeStep.id === 'unit-activity' && (
            <UnitActivitySection
              unitActivity={formData.unitActivity}
              unitActivities={formData.unitActivities}
              disabled={!isEditable}
              onChange={handleFieldChange}
              reviews={response?.sectionReviews}
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

                  {/* Karya Ilmiah Preview */}
                  {(student?.grade === 9 || response?.gradeLevel === 9) && (
                    <div className="space-y-2 border-t border-gray-100 pt-6">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Karya Ilmiah Reference (Grade 9)</h4>
                      <p className="text-sm font-semibold text-gray-700 leading-relaxed bg-gray-50 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap">
                        {formData.karyaIlmiahReferenceId || <em className="text-gray-300">No Karya Ilmiah reference provided</em>}
                      </p>
                    </div>
                  )}

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
              {currentStepIdx < steps.length - 1 ? (
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

      {/* Revision Request Dialog Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-2xl p-8 max-w-md w-full space-y-6 animate-in zoom-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ClipboardCheck size={24} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">Ajukan Permintaan Revisi</h3>
              <p className="text-xs text-gray-400 font-bold leading-relaxed">
                Tuliskan alasan valid mengapa Anda memerlukan perubahan pada workbook ini. Guru akan meninjau dan menentukan persetujuan pembukaan revisi.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Alasan Pengajuan *</label>
              <textarea
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Tuliskan alasan lengkap Anda di sini (minimal 10 karakter)..."
                className="w-full min-h-[100px] p-4 text-xs font-semibold bg-gray-50 border border-gray-100 rounded-2xl focus:border-blue-500 outline-none transition leading-relaxed"
              />
              {revisionReason.trim().length < 10 && (
                <p className="text-[10px] text-rose-500 font-bold">* Alasan minimal harus terdiri dari 10 karakter.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmittingRevision}
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionReason('');
                }}
                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmittingRevision || revisionReason.trim().length < 10}
                onClick={async () => {
                  if (!period || !studentId) return;
                  try {
                    setIsSubmittingRevision(true);
                    await threeWayConferenceService.requestRevision(period.id, studentId, revisionReason);
                    toast.success('Permintaan revisi berhasil diajukan ke guru.');
                    setShowRevisionModal(false);
                    setRevisionReason('');
                    await fetchData();
                  } catch (err: any) {
                    toast.error(err.message || 'Gagal mengajukan permintaan revisi.');
                  } finally {
                    setIsSubmittingRevision(false);
                  }
                }}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-md shadow-blue-100 disabled:opacity-50"
              >
                {isSubmittingRevision ? 'Mengirim...' : 'Kirim Permintaan'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
