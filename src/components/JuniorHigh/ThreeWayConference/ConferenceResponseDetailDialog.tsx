import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Calendar, BookOpen, AlertCircle, Sparkles, Brain, Award, Heart, ShieldAlert, Loader2, UserPlus, ClipboardList, CheckCircle2, Save, Check } from 'lucide-react';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { auth } from '../../../lib/firebase';
import type { Student, StudentConferenceResponse, MentorAssignment, SmartGoal } from '../../../types';
import { toast } from 'sonner';

interface ConferenceResponseDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  className: string;
  grade: string | number;
  periodId: string;
  assignment: MentorAssignment | null;
  onAssignMentorClick: () => void;
}

export const ConferenceResponseDetailDialog: React.FC<ConferenceResponseDetailDialogProps> = ({
  isOpen,
  onClose,
  student,
  className,
  grade,
  periodId,
  assignment,
  onAssignMentorClick,
}) => {
  const navigate = useNavigate();
  const [response, setResponse] = useState<StudentConferenceResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [seReference, setSeReference] = useState<any | null>(null);
  const [isLoadingSe, setIsLoadingSe] = useState<boolean>(false);

  // Teacher Review States
  const [isSavingReview, setIsSavingReview] = useState<boolean>(false);
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savingSections, setSavingSections] = useState<Record<string, boolean>>({});
  const [successSections, setSuccessSections] = useState<Record<string, boolean>>({});

  // Workflow & Revision request states
  const [teacherNote, setTeacherNote] = useState<string>('');
  const [isReturningWorkbook, setIsReturningWorkbook] = useState<boolean>(false);
  const [showDirectReturnForm, setShowDirectReturnForm] = useState<boolean>(false);
  const [showTeacherHistoryPanel, setShowTeacherHistoryPanel] = useState<boolean>(false);

  const [localReviews, setLocalReviews] = useState<{
    reflectionStatus: 'APPROVED' | 'REVISION_REQUIRED';
    reflectionComment: string;
    selfExplorationStatus: 'APPROVED' | 'REVISION_REQUIRED';
    selfExplorationComment: string;
    karyaIlmiahStatus: 'APPROVED' | 'REVISION_REQUIRED';
    karyaIlmiahComment: string;
    unitActivityStatus: 'APPROVED' | 'REVISION_REQUIRED';
    unitActivityComment: string;
    extracurricularStatus: 'APPROVED' | 'REVISION_REQUIRED';
    extracurricularComment: string;
    smartGoals: Record<string, { status: 'APPROVED' | 'REVISION_REQUIRED'; comment: string }>;
  }>({
    reflectionStatus: 'APPROVED',
    reflectionComment: '',
    selfExplorationStatus: 'APPROVED',
    selfExplorationComment: '',
    karyaIlmiahStatus: 'APPROVED',
    karyaIlmiahComment: '',
    unitActivityStatus: 'APPROVED',
    unitActivityComment: '',
    extracurricularStatus: 'APPROVED',
    extracurricularComment: '',
    smartGoals: {}
  });

  useEffect(() => {
    if (response) {
      const existingReviews = (response.sectionReviews || {}) as any;
      const goalsRev: Record<string, { status: 'APPROVED' | 'REVISION_REQUIRED'; comment: string }> = {};
      
      if (response.goals) {
        response.goals.forEach(g => {
          const id = g.id || '';
          const existing = existingReviews.smartGoals?.[id];
          goalsRev[id] = {
            status: existing?.status || 'APPROVED',
            comment: existing?.comment || ''
          };
        });
      }

      setLocalReviews({
        reflectionStatus: existingReviews.reflection?.status || 'APPROVED',
        reflectionComment: existingReviews.reflection?.comment || '',
        selfExplorationStatus: existingReviews.selfExploration?.status || existingReviews.extracurricular?.status || 'APPROVED',
        selfExplorationComment: existingReviews.selfExploration?.comment || existingReviews.extracurricular?.comment || '',
        karyaIlmiahStatus: existingReviews.karyaIlmiah?.status || existingReviews.extracurricular?.status || 'APPROVED',
        karyaIlmiahComment: existingReviews.karyaIlmiah?.comment || existingReviews.extracurricular?.comment || '',
        unitActivityStatus: existingReviews.unitActivity?.status || existingReviews.extracurricular?.status || 'APPROVED',
        unitActivityComment: existingReviews.unitActivity?.comment || existingReviews.extracurricular?.comment || '',
        extracurricularStatus: existingReviews.extracurricular?.status || 'APPROVED',
        extracurricularComment: existingReviews.extracurricular?.comment || '',
        smartGoals: goalsRev
      });
    }
  }, [response]);

  const handleSaveSection = async (
    sectionKey: 'reflection' | 'smartGoals' | 'selfExploration' | 'karyaIlmiah' | 'unitActivity',
    goalId?: string
  ) => {
    if (!response || !student) return;

    const saveId = goalId ? `goal_${goalId}` : sectionKey;

    // Validate specific section
    if (sectionKey === 'reflection') {
      if (localReviews.reflectionStatus === 'REVISION_REQUIRED' && !localReviews.reflectionComment.trim()) {
        setReviewError('Komentar wajib diisi jika bagian refleksi membutuhkan revisi.');
        return;
      }
    } else if (sectionKey === 'selfExploration') {
      if (localReviews.selfExplorationStatus === 'REVISION_REQUIRED' && !localReviews.selfExplorationComment.trim()) {
        setReviewError('Komentar wajib diisi jika bagian Self-Exploration membutuhkan revisi.');
        return;
      }
    } else if (sectionKey === 'karyaIlmiah') {
      if (localReviews.karyaIlmiahStatus === 'REVISION_REQUIRED' && !localReviews.karyaIlmiahComment.trim()) {
        setReviewError('Komentar wajib diisi jika bagian Karya Ilmiah membutuhkan revisi.');
        return;
      }
    } else if (sectionKey === 'unitActivity') {
      if (localReviews.unitActivityStatus === 'REVISION_REQUIRED' && !localReviews.unitActivityComment.trim()) {
        setReviewError('Komentar wajib diisi jika bagian Unit Activity membutuhkan revisi.');
        return;
      }
    } else if (sectionKey === 'smartGoals' && goalId) {
      const gRev = localReviews.smartGoals[goalId];
      if (gRev?.status === 'REVISION_REQUIRED' && !gRev.comment.trim()) {
        setReviewError('Komentar wajib diisi jika SMART Goal membutuhkan revisi.');
        return;
      }
    }

    try {
      setSavingSections(prev => ({ ...prev, [saveId]: true }));
      setReviewError(null);
      setReviewSuccessMsg(null);

      const authUser = auth.currentUser;
      const uid = authUser?.uid || 'unknown-staff';
      const email = authUser?.email || 'Staff';
      const displayName = authUser?.displayName || email;

      const extracurricularStatus = sectionKey === 'unitActivity' ? localReviews.unitActivityStatus : localReviews.extracurricularStatus;
      const extracurricularComment = sectionKey === 'unitActivity' ? localReviews.unitActivityComment : localReviews.extracurricularComment;

      await threeWayConferenceService.saveTeacherConferenceReview(
        periodId,
        student.id,
        {
          reflectionStatus: localReviews.reflectionStatus,
          reflectionComment: localReviews.reflectionComment,
          extracurricularStatus,
          extracurricularComment,
          selfExplorationStatus: localReviews.selfExplorationStatus,
          selfExplorationComment: localReviews.selfExplorationComment,
          karyaIlmiahStatus: localReviews.karyaIlmiahStatus,
          karyaIlmiahComment: localReviews.karyaIlmiahComment,
          unitActivityStatus: localReviews.unitActivityStatus,
          unitActivityComment: localReviews.unitActivityComment,
          smartGoals: localReviews.smartGoals
        },
        uid,
        displayName
      );

      setSuccessSections(prev => ({ ...prev, [saveId]: true }));
      setReviewSuccessMsg('Bagian ini berhasil disimpan!');
      setTimeout(() => {
        setSuccessSections(prev => ({ ...prev, [saveId]: false }));
      }, 3000);

      // Reload current response state
      const updatedResp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
      setResponse(updatedResp);
    } catch (err: any) {
      console.error('Failed to save section review:', err);
      setReviewError(err.message || 'Gagal menyimpan review bagian.');
    } finally {
      setSavingSections(prev => ({ ...prev, [saveId]: false }));
    }
  };

  const handleSaveAllReviews = async () => {
    if (!response || !student) return;
    
    // Check validation (REVISION_REQUIRED needs comments)
    if (localReviews.reflectionStatus === 'REVISION_REQUIRED' && !localReviews.reflectionComment.trim()) {
      setReviewError('Komentar wajib diisi jika bagian refleksi membutuhkan revisi.');
      return;
    }
    if (localReviews.selfExplorationStatus === 'REVISION_REQUIRED' && !localReviews.selfExplorationComment.trim()) {
      setReviewError('Komentar wajib diisi jika bagian Self-Exploration membutuhkan revisi.');
      return;
    }
    if (localReviews.karyaIlmiahStatus === 'REVISION_REQUIRED' && !localReviews.karyaIlmiahComment.trim()) {
      setReviewError('Komentar wajib diisi jika bagian Karya Ilmiah membutuhkan revisi.');
      return;
    }
    if (localReviews.unitActivityStatus === 'REVISION_REQUIRED' && !localReviews.unitActivityComment.trim()) {
      setReviewError('Komentar wajib diisi jika bagian Unit Activity membutuhkan revisi.');
      return;
    }
    
    let hasGoalError = false;
    Object.entries(localReviews.smartGoals).forEach(([id, val]) => {
      const goalVal = val as { status: 'APPROVED' | 'REVISION_REQUIRED'; comment: string };
      if (goalVal.status === 'REVISION_REQUIRED' && !goalVal.comment.trim()) {
        hasGoalError = true;
      }
    });
    if (hasGoalError) {
      setReviewError('Komentar wajib diisi untuk setiap goal yang membutuhkan revisi.');
      return;
    }

    try {
      setIsSavingReview(true);
      setReviewError(null);
      setReviewSuccessMsg(null);

      const authUser = auth.currentUser;
      const uid = authUser?.uid || 'unknown-staff';
      const email = authUser?.email || 'Staff';
      const displayName = authUser?.displayName || email;

      await threeWayConferenceService.saveTeacherConferenceReview(
        periodId,
        student.id,
        {
          reflectionStatus: localReviews.reflectionStatus,
          reflectionComment: localReviews.reflectionComment,
          extracurricularStatus: localReviews.unitActivityStatus,
          extracurricularComment: localReviews.unitActivityComment,
          selfExplorationStatus: localReviews.selfExplorationStatus,
          selfExplorationComment: localReviews.selfExplorationComment,
          karyaIlmiahStatus: localReviews.karyaIlmiahStatus,
          karyaIlmiahComment: localReviews.karyaIlmiahComment,
          unitActivityStatus: localReviews.unitActivityStatus,
          unitActivityComment: localReviews.unitActivityComment,
          smartGoals: localReviews.smartGoals
        },
        uid,
        displayName
      );

      setReviewSuccessMsg('Semua Review & Status berhasil diperbarui!');
      
      // Reload current response state
      const updatedResp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
      setResponse(updatedResp);
    } catch (err: any) {
      console.error('Failed to save reviews:', err);
      setReviewError(err.message || 'Gagal menyimpan review.');
    } finally {
      setIsSavingReview(false);
    }
  };

  const renderInlineReviewBox = (
    title: string,
    status: 'APPROVED' | 'REVISION_REQUIRED',
    comment: string,
    onStatusChange: (status: 'APPROVED' | 'REVISION_REQUIRED') => void,
    onCommentChange: (comment: string) => void,
    onSave?: () => void,
    saveId?: string
  ) => {
    const isSaving = saveId ? !!savingSections[saveId] : false;
    const isSuccess = saveId ? !!successSections[saveId] : false;

    return (
      <div className="bg-gray-100/50 rounded-2xl border border-gray-200 p-5 mt-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200/20 pb-3">
          <span className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-blue-600" />
            Review: {title}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onStatusChange('APPROVED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                status === 'APPROVED'
                  ? 'bg-emerald-50 border-emerald-500/30 text-emerald-700 shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
              }`}
            >
              <CheckCircle2 size={14} /> Disetujui
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('REVISION_REQUIRED')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                status === 'REVISION_REQUIRED'
                  ? 'bg-rose-50 border-rose-500/30 text-rose-700 shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
              }`}
            >
              <AlertCircle size={14} /> Butuh Revisi
            </button>
          </div>
        </div>
        <div>
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder={`Masukkan komentar guru / umpan balik untuk ${title.toLowerCase()}...`}
            className="w-full min-h-[60px] p-3 text-xs font-medium bg-white border border-gray-200 rounded-xl outline-none focus:border-teal-500 transition shadow-sm leading-relaxed"
          />
          {status === 'REVISION_REQUIRED' && !comment.trim() && (
            <p className="text-[10px] text-rose-500 font-bold mt-1">
              * Komentar / alasan wajib ditulis bila memerlukan revisi.
            </p>
          )}
        </div>

        {onSave && (
          <div className="flex justify-end pt-2 border-t border-gray-200/20">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving || (status === 'REVISION_REQUIRED' && !comment.trim())}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm border ${
                isSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700 border-transparent text-white'
                  : 'bg-blue-600 hover:bg-blue-700 border-transparent text-white disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : isSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Berhasil Disimpan!
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Simpan Bagian Ini
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    console.log('[Debug-DetailDialog] Dialog Open State:', isOpen, 'Student ID:', student?.id, 'Period ID:', periodId);
    if (isOpen && student && periodId) {
      const loadResponseAndReferences = async () => {
        setIsLoading(true);
        setError(null);
        setResponse(null);
        const responseId = `${periodId}_${student.id}`;
        try {
          console.log(`[ViewResponse] Fetching response with consistent ID: ${responseId}`);
          const resp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
          console.log('[Debug-DetailDialog] Response document exists:', !!resp);
          if (resp) {
            console.log('[Debug-DetailDialog] Response document keys:', Object.keys(resp));
          }
          setResponse(resp);

          if (resp) {
            setIsLoadingSe(true);
            try {
              const ref = await threeWayConferenceService.getStudentSelfExplorationReference(
                student.id,
                resp.academicYear,
                resp.semester
              );
              setSeReference(ref);
            } catch (err) {
              console.warn('Failed to load SE reference:', err);
            } finally {
              setIsLoadingSe(false);
            }
          }
        } catch (err: any) {
          console.error(`[ViewResponse] Error loading response doc ID ${responseId} for period ${periodId}:`, err);
          setError(`Failed to load response for ID ${responseId}. Please verify network connection or permissions.`);
        } finally {
          setIsLoading(false);
        }
      };
      loadResponseAndReferences();
    } else {
      setResponse(null);
      setSeReference(null);
      setError(null);
    }
  }, [isOpen, student, periodId]);

  if (!isOpen || !student) return null;

  const formatDate = (timestamp?: number | null) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getApprovedProgressText = () => {
    if (!response) return '';
    
    const applicableSections: string[] = [];
    if (response.aboutMe && response.aboutMe.trim() !== '') {
      applicableSections.push('aboutMe');
    }
    if (response.strengths && response.strengths.trim() !== '') {
      applicableSections.push('strengths');
    }
    if (response.areasForGrowth && response.areasForGrowth.trim() !== '') {
      applicableSections.push('growthAreas');
    }
    
    const hasSelfExploration = response.selfExplorationReferenceId || response.selfExplorationSnapshot;
    if (hasSelfExploration) {
      applicableSections.push('selfExploration');
    }

    const hasExtracurricular = response.unitActivity || (response.unitActivities && response.unitActivities.length > 0);
    if (hasExtracurricular) {
      applicableSections.push('extracurricular');
    }

    const goals = response.goals || [];
    const goalIds = goals.map(g => g.id);

    const totalApplicable = applicableSections.length + goalIds.length;
    if (totalApplicable === 0) return '';

    let approvedCount = 0;
    
    // Count reflection fields
    applicableSections.forEach(sec => {
      if (sec === 'aboutMe' || sec === 'strengths' || sec === 'growthAreas') {
        if (localReviews.reflectionStatus === 'APPROVED') {
          approvedCount++;
        }
      } else if (sec === 'selfExploration') {
        if (localReviews.selfExplorationStatus === 'APPROVED') {
          approvedCount++;
        }
      } else if (sec === 'extracurricular') {
        if (localReviews.unitActivityStatus === 'APPROVED') {
          approvedCount++;
        }
      }
    });

    // Count goals
    goalIds.forEach(id => {
      const rev = localReviews.smartGoals[id];
      if (rev && rev.status === 'APPROVED') {
        approvedCount++;
      }
    });

    return `${approvedCount}/${totalApplicable} approved`;
  };

  const getStatusBadge = (status?: string) => {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          Not Started
        </span>
      );
    }
    switch (status) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Draft
          </span>
        );
      case 'RETURNED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Returned
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Approved
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Submitted
          </span>
        );
      case 'CONFERENCE_COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  const getGoalStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100">
            Completed
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
            Active
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-50 text-gray-600 border border-gray-100">
            {status}
          </span>
        );
    }
  };

  const getStrandIcon = (strand: string) => {
    switch (strand) {
      case 'SPIRITUAL':
        return <Heart className="h-5 w-5 text-purple-500" />;
      case 'IMAGINAL':
        return <Sparkles className="h-5 w-5 text-rose-500" />;
      case 'RATIONAL':
        return <Brain className="h-5 w-5 text-sky-500" />;
      case 'MATERIAL_PHYSICAL':
        return <Award className="h-5 w-5 text-teal-500" />;
      default:
        return <BookOpen className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStrandLabel = (strand: string) => {
    switch (strand) {
      case 'SPIRITUAL':
        return 'Spiritual Strand';
      case 'IMAGINAL':
        return 'Imaginal Strand';
      case 'RATIONAL':
        return 'Rational Strand';
      case 'MATERIAL_PHYSICAL':
        return 'Material / Physical Strand';
      default:
        return strand;
    }
  };

  // Group goals by strand
  const goalsByStrand: Record<string, SmartGoal[]> = {
    SPIRITUAL: [],
    IMAGINAL: [],
    RATIONAL: [],
    MATERIAL_PHYSICAL: [],
  };

  if (response?.goals) {
    response.goals.forEach((g) => {
      if (goalsByStrand[g.strand]) {
        goalsByStrand[g.strand].push(g);
      } else {
        goalsByStrand[g.strand] = [g];
      }
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto font-sans" aria-labelledby="detail-modal-title" role="dialog" aria-modal="true" id="conference-detail-modal">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-600/60 backdrop-blur-md transition-opacity z-40" aria-hidden="true" onClick={onClose} />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Panel Container */}
        <div className="relative z-50 inline-block align-bottom bg-gray-50 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-gray-100">
          
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between shadow-sm">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight" id="detail-modal-title">
                Three-Way Conference Response Detail
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Read-only view of student-owned goal setting responses.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 hover:bg-gray-100 p-1.5 rounded-lg transition"
              id="close-detail-modal-btn"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-6 max-h-[80vh] overflow-y-auto">
            
            {/* Student Profiles Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Profile Card */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-start gap-3 md:col-span-2">
                <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-base font-bold text-gray-900">{student.name}</h4>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500 font-medium">
                    <span>ID / NIS: <strong className="text-gray-700 font-mono">{student.nis || student.id}</strong></span>
                    <span>Class: <strong className="text-gray-700">{className}</strong></span>
                    <span>Grade: <strong className="text-gray-700">Grade {grade}</strong></span>
                    {response?.academicYear && (
                      <span>Academic Year: <strong className="text-gray-700">{response.academicYear} (S{response.semester})</strong></span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and Mentor Info Card */}
              <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-bold uppercase tracking-wider">Response Status:</span>
                  <div className="flex items-center gap-1.5">
                    {response && (
                      <span className="text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-150 px-2 py-0.5 rounded-md">
                        {getApprovedProgressText()}
                      </span>
                    )}
                    {getStatusBadge(response?.status)}
                  </div>
                </div>
                <div className="pt-2.5 border-t border-gray-50 flex flex-col justify-between h-full">
                  <div className="text-xs">
                    <span className="text-gray-500 font-bold uppercase tracking-wider block mb-1">Assigned Mentor:</span>
                    {assignment && assignment.status !== 'REMOVED' ? (
                      <span className="font-semibold text-gray-800 text-xs bg-blue-50 text-blue-800 px-2.5 py-1 rounded-md border border-blue-100 inline-block">
                        {assignment.mentorName}
                      </span>
                    ) : (
                      <span className="font-semibold text-gray-500 text-xs bg-gray-50 text-gray-600 px-2.5 py-1 rounded-md border border-gray-100 inline-block">
                        Unassigned
                      </span>
                    )}
                  </div>
                  <button
                    id="detail-modal-manage-mentor-btn"
                    onClick={onAssignMentorClick}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 bg-blue-50/50 hover:bg-blue-50 transition"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Manage Mentor
                  </button>
                </div>
              </div>
            </div>

            {/* Check loading/error/response exists */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-gray-100 shadow-sm" id="detail-loading-state">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-gray-500 mt-3 font-semibold">Loading student response...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3 text-red-700 text-sm" id="detail-error-state">
                <ShieldAlert className="h-5 w-5 shrink-0 text-red-500" />
                <p>{error}</p>
              </div>
            ) : !response ? (
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-8 text-center space-y-3" id="no-response-warning">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
                <h4 className="text-base font-bold text-amber-800">Siswa belum mengirim Goal Setting untuk periode ini.</h4>
                <p className="text-sm text-amber-700 max-w-md mx-auto">
                  Siswa ini belum memulai Goal Setting atau mengklik Submit. Anda tetap dapat mengelola tugas mentor mereka melalui panel di atas.
                </p>
              </div>
            ) : (
              /* Core Student Content Section */
              <div className="space-y-6">

                {/* Workflow & Revision Request Panel */}
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-gray-800 uppercase italic tracking-tight">Status & Alur Kerja Workbook</h4>
                      <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                        <span>Status saat ini:</span>
                        {getStatusBadge(response.status)}
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                          {getApprovedProgressText()}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      {response.status !== 'DRAFT' && response.status !== 'RETURNED' && (
                        <button
                          type="button"
                          onClick={() => setShowDirectReturnForm(!showDirectReturnForm)}
                          className="px-3.5 py-1.5 border border-rose-200 text-rose-700 bg-rose-50/50 hover:bg-rose-50 text-[10px] font-black uppercase tracking-wider rounded-lg transition shadow-sm"
                        >
                          {showDirectReturnForm ? 'Batal Mengembalikan' : 'Kembalikan Workbook (Return)'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowTeacherHistoryPanel(!showTeacherHistoryPanel)}
                        className="px-3.5 py-1.5 border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 text-[10px] font-black uppercase tracking-wider rounded-lg transition shadow-sm"
                      >
                        {showTeacherHistoryPanel ? 'Sembunyikan Riwayat' : 'Lihat Riwayat Status'}
                      </button>
                    </div>
                  </div>

                  {/* Direct Return Workbook Form */}
                  {showDirectReturnForm && (
                    <div className="p-4 bg-rose-50/30 border border-rose-100 rounded-xl space-y-3 animate-in slide-in-from-top duration-200">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-rose-800">Catatan Pengembalian ke Siswa *</label>
                        <textarea
                          value={teacherNote}
                          onChange={(e) => setTeacherNote(e.target.value)}
                          placeholder="Masukkan catatan revisi atau instruksi perbaikan untuk siswa..."
                          className="w-full min-h-[80px] p-3 text-xs font-semibold bg-white border border-gray-200 rounded-xl focus:border-rose-500 outline-none transition"
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={isReturningWorkbook || !teacherNote.trim()}
                          onClick={async () => {
                            try {
                              setIsReturningWorkbook(true);
                              setReviewError(null);
                              await threeWayConferenceService.respondToRevisionRequest(periodId, student.id, 'RETURN', teacherNote);
                              toast.success('Workbook berhasil dikembalikan ke siswa.');
                              setTeacherNote('');
                              setShowDirectReturnForm(false);
                              // Reload current response state
                              const updatedResp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
                              setResponse(updatedResp);
                            } catch (err: any) {
                              setReviewError(err.message || 'Gagal mengembalikan workbook.');
                            } finally {
                              setIsReturningWorkbook(false);
                            }
                          }}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-lg transition disabled:opacity-50 shadow-sm cursor-pointer"
                        >
                          {isReturningWorkbook ? 'Mengembalikan...' : 'Konfirmasi Kembalikan Workbook'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Active Pending Student Revision Request */}
                  {response.revisionRequest && response.revisionRequest.status === 'PENDING' && (
                    <div className="p-5 bg-blue-50 border border-blue-100 rounded-xl space-y-4 animate-in pulse">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="text-blue-600 mt-0.5 shrink-0" size={18} />
                        <div className="space-y-1">
                          <h5 className="text-xs font-black text-blue-900 uppercase tracking-wider">Siswa Mengajukan Permintaan Revisi Workbook</h5>
                          <p className="text-xs font-semibold text-gray-700">
                            Alasan: <span className="italic">"{response.revisionRequest.reason}"</span>
                          </p>
                          <p className="text-[10px] text-gray-400">Diajukan pada {new Date(response.revisionRequest.requestedAt || 0).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-blue-100">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-wider text-gray-500">Pesan / Catatan Balasan Guru *</label>
                          <textarea
                            value={teacherNote}
                            onChange={(e) => setTeacherNote(e.target.value)}
                            placeholder="Tuliskan catatan persetujuan atau alasan penolakan permintaan revisi..."
                            className="w-full min-h-[80px] p-3 text-xs font-semibold bg-white border border-gray-200 rounded-xl focus:border-blue-500 outline-none transition"
                          />
                        </div>

                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            disabled={isReturningWorkbook || !teacherNote.trim()}
                            onClick={async () => {
                              try {
                                setIsReturningWorkbook(true);
                                setReviewError(null);
                                await threeWayConferenceService.respondToRevisionRequest(periodId, student.id, 'DECLINE', teacherNote);
                                toast.success('Permintaan revisi berhasil ditolak.');
                                setTeacherNote('');
                                // Reload current response state
                                const updatedResp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
                                setResponse(updatedResp);
                              } catch (err: any) {
                                setReviewError(err.message || 'Gagal merespons permintaan revisi.');
                              } finally {
                                setIsReturningWorkbook(false);
                              }
                            }}
                            className="px-4 py-2 border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 text-xs font-black uppercase tracking-wider rounded-lg transition disabled:opacity-50"
                          >
                            Tolak Permintaan
                          </button>
                          
                          <button
                            type="button"
                            disabled={isReturningWorkbook || !teacherNote.trim()}
                            onClick={async () => {
                              try {
                                setIsReturningWorkbook(true);
                                setReviewError(null);
                                await threeWayConferenceService.respondToRevisionRequest(periodId, student.id, 'RETURN', teacherNote);
                                toast.success('Permintaan revisi disetujui. Workbook telah dikembalikan.');
                                setTeacherNote('');
                                // Reload current response state
                                const updatedResp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
                                setResponse(updatedResp);
                              } catch (err: any) {
                                setReviewError(err.message || 'Gagal menyetujui permintaan revisi.');
                              } finally {
                                setIsReturningWorkbook(false);
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded-lg transition disabled:opacity-50 shadow-md shadow-blue-100"
                          >
                            Setujui & Kembalikan (Return)
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Audit Trail / History timeline */}
                  {showTeacherHistoryPanel && (
                    <div className="border-t border-gray-100 pt-4 space-y-4 animate-in slide-in-from-top duration-200">
                      <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Riwayat Status Workbook (Audit Trail)</h5>
                      {!response.statusHistory || response.statusHistory.length === 0 ? (
                        <p className="text-xs text-gray-400 font-semibold italic">Belum ada riwayat aktivitas yang tercatat.</p>
                      ) : (
                        <div className="relative border-l border-gray-200 pl-5 ml-2.5 space-y-5">
                          {response.statusHistory.map((item, idx) => (
                            <div key={idx} className="relative">
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

                {/* About Me & Reflections Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="reflections-grid">
                  {/* About Me */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">About Me</h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap italic">
                      {response.aboutMe ? `"${response.aboutMe}"` : <span className="text-gray-400 italic">No response provided</span>}
                    </p>
                  </div>

                  {/* My Strengths */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">My Strengths</h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap italic">
                      {response.strengths ? `"${response.strengths}"` : <span className="text-gray-400 italic">No response provided</span>}
                    </p>
                  </div>

                  {/* My Areas for Growth */}
                  <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">My Areas for Growth</h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap italic">
                      {response.areasForGrowth ? `"${response.areasForGrowth}"` : <span className="text-gray-400 italic">No response provided</span>}
                    </p>
                  </div>
                </div>

                {renderInlineReviewBox(
                  'Reflection',
                  localReviews.reflectionStatus,
                  localReviews.reflectionComment,
                  (status) => setLocalReviews(prev => ({ ...prev, reflectionStatus: status })),
                  (comment) => setLocalReviews(prev => ({ ...prev, reflectionComment: comment })),
                  () => handleSaveSection('reflection'),
                  'reflection'
                )}

                {/* SMART Goals Heading */}
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-base font-bold text-gray-900 tracking-tight mb-4">
                    SMART Goals
                  </h3>

                  {/* Render goals grouped by strand */}
                  <div className="space-y-6">
                    {Object.entries(goalsByStrand).map(([strand, strandGoals]) => (
                      <div key={strand} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
                        <div className="flex items-center gap-2 pb-3 border-b border-gray-50">
                          {getStrandIcon(strand)}
                          <h4 className="text-sm font-extrabold text-gray-800 uppercase tracking-wider">
                            {getStrandLabel(strand)}
                          </h4>
                          <span className="text-xs text-gray-400 font-semibold ml-auto">
                            {strandGoals.length} Goal{strandGoals.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {strandGoals.length === 0 ? (
                          <p className="text-xs text-gray-400 italic py-2">
                            No goals set for this strand.
                          </p>
                        ) : (
                          <div className="space-y-6 divide-y divide-gray-100">
                            {strandGoals.map((goal, index) => (
                              <div key={goal.id || index} className={index > 0 ? 'pt-6' : ''}>
                                {/* Goal Title and Dates Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3.5">
                                  <div className="space-y-1">
                                    <h5 className="text-base font-bold text-gray-900">
                                      {goal.goal}
                                    </h5>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 font-medium">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                        Start: <strong>{formatDate(goal.startDate)}</strong>
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                        Target: <strong>{formatDate(goal.targetDate)}</strong>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="self-start sm:self-center">
                                    {getGoalStatusBadge(goal.status)}
                                  </div>
                                </div>

                                {/* SMART Criteria Breakdown */}
                                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-gray-50/70 p-3.5 rounded-xl border border-gray-100 mb-4">
                                  <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Specific</span>
                                    <p className="text-xs text-gray-700 mt-1 font-medium">{goal.smartSpecific || '—'}</p>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Measurable</span>
                                    <p className="text-xs text-gray-700 mt-1 font-medium">{goal.smartMeasurable || '—'}</p>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Achievable</span>
                                    <p className="text-xs text-gray-700 mt-1 font-medium">{goal.smartAchievable || '—'}</p>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Relevant</span>
                                    <p className="text-xs text-gray-700 mt-1 font-medium">{goal.smartRelevant || '—'}</p>
                                  </div>
                                  <div>
                                    <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">Time-bound</span>
                                    <p className="text-xs text-gray-700 mt-1 font-medium">{goal.smartTimeBound || '—'}</p>
                                  </div>
                                </div>

                                {/* Action Plan and Evidence */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="bg-blue-50/20 border border-blue-50 rounded-xl p-3.5">
                                    <span className="block text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">Things I Have to Do (Action Plan)</span>
                                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{goal.actions || '—'}</p>
                                  </div>
                                  <div className="bg-emerald-50/20 border border-emerald-50 rounded-xl p-3.5">
                                    <span className="block text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1">Proof My Effort Is Working (Evidence)</span>
                                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{goal.evidence || '—'}</p>
                                  </div>
                                </div>

                                {goal.id && renderInlineReviewBox(
                                  `SMART Goal: ${goal.goal}`,
                                  localReviews.smartGoals[goal.id]?.status || 'APPROVED',
                                  localReviews.smartGoals[goal.id]?.comment || '',
                                  (status) => setLocalReviews(prev => ({
                                    ...prev,
                                    smartGoals: {
                                      ...prev.smartGoals,
                                      [goal.id!]: {
                                        status,
                                        comment: prev.smartGoals[goal.id!]?.comment || ''
                                      }
                                    }
                                  })),
                                  (comment) => setLocalReviews(prev => ({
                                    ...prev,
                                    smartGoals: {
                                      ...prev.smartGoals,
                                      [goal.id!]: {
                                        status: prev.smartGoals[goal.id!]?.status || 'APPROVED',
                                        comment
                                      }
                                    }
                                  })),
                                  () => handleSaveSection('smartGoals', goal.id),
                                  `goal_${goal.id}`
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Read-only References (Self-Exploration, Karya Ilmiah, Unit Activity) */}
                <div className="pt-4 border-t border-gray-100 space-y-6" id="reference-cards-list">
                  
                  {/* Self-Exploration Card */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 tracking-tight">Self-Exploration Reference</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Data pilihan aktivitas Self-Exploration siswa.</p>
                    </div>
                    {isLoadingSe ? (
                      <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        Fetching self-exploration data...
                      </div>
                    ) : seReference?.enrollment ? (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 font-medium">
                          Period: <strong className="text-gray-700">{seReference.periodLabel || 'Active Semester'}</strong>
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {seReference.enrollment.choices && seReference.enrollment.choices.length > 0 ? (
                            seReference.enrollment.choices.map((choice: any, idx: number) => (
                              <div key={idx} className="p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-1.5 text-xs" id={`se-choice-${idx}`}>
                                <div className="flex items-center justify-between border-b border-gray-200/40 pb-1">
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Choice Slot {choice.slot || idx + 1}</span>
                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500 uppercase">{choice.strand}</span>
                                </div>
                                <div>
                                  <span className="block text-[8px] font-black text-gray-400 uppercase">Selected Activity</span>
                                  <p className="font-bold text-gray-700 mt-0.5">{choice.activityName || choice.customActivity || '-'}</p>
                                </div>
                                {choice.finalTarget && (
                                  <div>
                                    <span className="block text-[8px] font-black text-gray-400 uppercase">Final Goal/Target</span>
                                    <p className="text-[10px] text-gray-500 italic mt-0.5 leading-relaxed">"{choice.finalTarget}"</p>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-gray-400 italic py-2">
                              Self-Exploration has not been chosen yet.
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">
                        Self-Exploration has not been chosen yet.
                      </p>
                    )}

                    {/* Self-Exploration Review Box */}
                    {renderInlineReviewBox(
                      'Self-Exploration Reference',
                      localReviews.selfExplorationStatus,
                      localReviews.selfExplorationComment,
                      (status) => setLocalReviews(prev => ({ ...prev, selfExplorationStatus: status })),
                      (comment) => setLocalReviews(prev => ({ ...prev, selfExplorationComment: comment })),
                      () => handleSaveSection('selfExploration'),
                      'selfExploration'
                    )}
                  </div>

                  {/* Grade 9 Karya Ilmiah Card */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 tracking-tight">Karya Ilmiah Reference (Grade 9)</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Rujukan proposal karya ilmiah bagi siswa Kelas 9.</p>
                    </div>
                    {student.grade === 9 && response.karyaIlmiahReferenceId ? (
                      <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700">
                        Linked Research Proposal ID: <strong className="text-gray-800 font-mono">{response.karyaIlmiahReferenceId}</strong>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic">
                        {student.grade === 9 ? 'No Karya Ilmiah topic has been linked yet.' : 'Only applicable for Grade 9 students.'}
                      </p>
                    )}

                    {/* Karya Ilmiah Review Box */}
                    {renderInlineReviewBox(
                      'Karya Ilmiah',
                      localReviews.karyaIlmiahStatus,
                      localReviews.karyaIlmiahComment,
                      (status) => setLocalReviews(prev => ({ ...prev, karyaIlmiahStatus: status })),
                      (comment) => setLocalReviews(prev => ({ ...prev, karyaIlmiahComment: comment })),
                      () => handleSaveSection('karyaIlmiah'),
                      'karyaIlmiah'
                    )}
                  </div>

                  {/* Unit Activity Card */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 tracking-tight">Unit Activity</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Rencana aktivitas unit, kekhawatiran siswa, dan rencana mengatasinya.</p>
                    </div>
                    <div>
                      {(() => {
                        const categories = ['Performing Arts', 'Arts & Makerspace', 'Physical Education', 'Digital Literacy'];
                        
                        const hasActivities = (response.unitActivities && response.unitActivities.length > 0) || 
                                              (seReference?.enrollment?.choices && seReference.enrollment.choices.length > 0);
                                              
                        if (!hasActivities) {
                          if (response.unitActivityCategory) {
                            return (
                              <div className="space-y-2 bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs">
                                <div>
                                  <span className="font-black text-gray-400 uppercase tracking-wider text-[9px]">Activity Choice</span>
                                  <p className="text-gray-800 font-bold mt-0.5">{response.unitActivityCategory} &mdash; {response.unitActivityName}</p>
                                </div>
                                <div className="pt-2 border-t border-gray-200/50">
                                  <span className="font-black text-gray-400 uppercase tracking-wider text-[9px]">Student Worries</span>
                                  <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-wrap">{response.unitActivityWorries}</p>
                                </div>
                                <div className="pt-2 border-t border-gray-200/50">
                                  <span className="font-black text-gray-400 uppercase tracking-wider text-[9px]">Plan to Overcome</span>
                                  <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-wrap">{response.unitActivityOvercomingPlan}</p>
                                </div>
                              </div>
                            );
                          } else if (response.unitActivity) {
                            return (
                              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 font-semibold text-gray-800 whitespace-pre-wrap">
                                {response.unitActivity}
                              </div>
                            );
                          } else {
                            return (
                              <p className="text-xs text-gray-400 italic">
                                No Unit Activity listed.
                              </p>
                            );
                          }
                        }

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {categories.map((cat) => {
                              const ua = response.unitActivities?.find((item: any) => item.category === cat) || { category: cat, activityName: '', worries: '', overcomingPlan: '' };
                              const seChoice = seReference?.enrollment?.choices?.find((c: any) => c.strand === cat);
                              const resolvedActivityName = seChoice ? (seChoice.activityName || seChoice.customActivity || '') : '';
                              const finalActivityName = resolvedActivityName || ua.activityName;
                              
                              return (
                                <div key={cat} className="space-y-2 bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs" id={`ua-cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}>
                                  <div className="flex justify-between items-center border-b border-gray-200/50 pb-1">
                                    <span className="font-black text-teal-800 uppercase text-[9px]">{cat}</span>
                                    {seChoice ? (
                                      <span className="text-[7px] font-black px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded uppercase">From Self-Exploration</span>
                                    ) : finalActivityName ? (
                                      <span className="text-[7px] font-black px-1 bg-teal-100 text-teal-700 rounded uppercase">Chosen</span>
                                    ) : (
                                      <span className="text-[7px] font-black px-1 bg-amber-100 text-amber-700 rounded uppercase">Not Chosen</span>
                                    )}
                                  </div>
                                  <div>
                                    <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">Activity Chosen</span>
                                    <p className="text-gray-800 font-bold mt-0.5">{finalActivityName || <em className="text-gray-300">None selected</em>}</p>
                                  </div>
                                  <div className="pt-1.5 border-t border-gray-200/30">
                                    <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">Student Worries</span>
                                    <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-wrap">{ua.worries || <em className="text-gray-300">None</em>}</p>
                                  </div>
                                  <div className="pt-1.5 border-t border-gray-200/30">
                                    <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">Plan to Overcome</span>
                                    <p className="text-gray-700 font-medium mt-0.5 whitespace-pre-wrap">{ua.overcomingPlan || <em className="text-gray-300">None</em>}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Unit Activity Review Box */}
                    {renderInlineReviewBox(
                      'Unit Activity',
                      localReviews.unitActivityStatus,
                      localReviews.unitActivityComment,
                      (status) => setLocalReviews(prev => ({ ...prev, unitActivityStatus: status })),
                      (comment) => setLocalReviews(prev => ({ ...prev, unitActivityComment: comment })),
                      () => handleSaveSection('unitActivity'),
                      'unitActivity'
                    )}
                  </div>

                </div>

                {/* Save Feedback status messages */}
                {reviewSuccessMsg && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
                    <CheckCircle2 size={16} className="text-emerald-500 animate-pulse" />
                    {reviewSuccessMsg}
                  </div>
                )}
                {reviewError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle size={16} className="text-rose-500" />
                    {reviewError}
                  </div>
                )}

                {/* Main submit button for teacher reviews */}
                <div className="bg-blue-50/50 border border-blue-100 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="space-y-0.5 text-left">
                    <h4 className="text-sm font-black text-blue-900 uppercase italic tracking-tight">Kirim Penilaian Guru</h4>
                    <p className="text-[11px] text-blue-700/80 font-semibold">Tinjau semua umpan balik, lalu kirimkan keputusan persetujuan/revisi ke siswa.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveAllReviews}
                    disabled={isSavingReview}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-md cursor-pointer"
                  >
                    {isSavingReview ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Simpan & Update Review
                      </>
                    )}
                  </button>
                </div>

              </div>
            )}

          </div>

          {/* Footer */}
          <div className="bg-white px-6 py-4 border-t border-gray-100 flex justify-end items-center gap-3">
            <button
              id="close-detail-modal-footer-btn"
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition shadow-sm"
            >
              Close Panel
            </button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};
