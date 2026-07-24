import React from 'react';
import { SmartGoalTrackerEntry, Student, TrackerSectionStatus, TrackerSectionReview } from '../../../types';
import { X, Calendar, User, MessageSquare, Target, Clipboard, ShieldAlert, Save } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import { toast } from 'sonner';

interface TrackerEntryDetailDialogProps {
  entry: (SmartGoalTrackerEntry & { studentDetail?: Student; mentorName?: string }) | null;
  onClose: () => void;
  onAddComment: (entry: SmartGoalTrackerEntry) => void;
  isArchived: boolean;
}

export const TrackerEntryDetailDialog: React.FC<TrackerEntryDetailDialogProps> = ({
  entry,
  onClose,
  onAddComment,
  isArchived
}) => {
  if (!entry) return null;

  const { profile } = useAuth();

  // Review states for each section
  const [goalStatus, setGoalStatus] = React.useState<TrackerSectionStatus>('NOT_REVIEWED');
  const [goalComment, setGoalComment] = React.useState('');

  const [actionPlanStatus, setActionPlanStatus] = React.useState<TrackerSectionStatus>('NOT_REVIEWED');
  const [actionPlanComment, setActionPlanComment] = React.useState('');

  const [progressStatus, setProgressStatus] = React.useState<TrackerSectionStatus>('NOT_REVIEWED');
  const [progressComment, setProgressComment] = React.useState('');

  const [reflectionStatus, setReflectionStatus] = React.useState<TrackerSectionStatus>('NOT_REVIEWED');
  const [reflectionComment, setReflectionComment] = React.useState('');

  const [savingReview, setSavingReview] = React.useState(false);

  // Initialize reviews
  React.useEffect(() => {
    if (entry?.sectionReviews) {
      setGoalStatus(entry.sectionReviews.goal?.status || 'NOT_REVIEWED');
      setGoalComment(entry.sectionReviews.goal?.comment || '');

      setActionPlanStatus(entry.sectionReviews.actionPlan?.status || 'NOT_REVIEWED');
      setActionPlanComment(entry.sectionReviews.actionPlan?.comment || '');

      setProgressStatus(entry.sectionReviews.progress?.status || 'NOT_REVIEWED');
      setProgressComment(entry.sectionReviews.progress?.comment || '');

      setReflectionStatus(entry.sectionReviews.reflection?.status || 'NOT_REVIEWED');
      setReflectionComment(entry.sectionReviews.reflection?.comment || '');
    } else {
      setGoalStatus('NOT_REVIEWED');
      setGoalComment('');
      setActionPlanStatus('NOT_REVIEWED');
      setActionPlanComment('');
      setProgressStatus('NOT_REVIEWED');
      setProgressComment('');
      setReflectionStatus('NOT_REVIEWED');
      setReflectionComment('');
    }
  }, [entry]);

  const canReview = !isArchived && ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'TEACHER', 'BK_MENTOR'].includes(profile?.role || '');

  const handleSaveAllReviews = async () => {
    if (!entry || !profile) return;

    // Validation
    if (goalStatus === 'REVISION_REQUIRED' && !goalComment.trim()) {
      toast.error('Komentar wajib diisi jika Goal membutuhkan revisi.');
      return;
    }
    if (actionPlanStatus === 'REVISION_REQUIRED' && !actionPlanComment.trim()) {
      toast.error('Komentar wajib diisi jika Action Plan membutuhkan revisi.');
      return;
    }
    if (progressStatus === 'REVISION_REQUIRED' && !progressComment.trim()) {
      toast.error('Komentar wajib diisi jika Progress membutuhkan revisi.');
      return;
    }
    if (reflectionStatus === 'REVISION_REQUIRED' && !reflectionComment.trim()) {
      toast.error('Komentar wajib diisi jika Reflection membutuhkan revisi.');
      return;
    }

    try {
      setSavingReview(true);
      const reviews = {
        goal: { status: goalStatus, comment: goalComment },
        actionPlan: { status: actionPlanStatus, comment: actionPlanComment },
        progress: { status: progressStatus, comment: progressComment },
        reflection: { status: reflectionStatus, comment: reflectionComment }
      };

      await threeWayConferenceService.saveSectionReviews(entry.id, reviews, profile);
      toast.success('Section reviews saved and tracker status updated!');
      
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save reviews.');
    } finally {
      setSavingReview(false);
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStrandBadgeClass = (strand: string) => {
    switch (strand) {
      case 'Spiritual': return 'bg-emerald-100 text-emerald-800';
      case 'Imaginal': return 'bg-purple-100 text-purple-800';
      case 'Rational': return 'bg-blue-100 text-blue-800';
      case 'Material/Physical': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOverallStatusBadge = (status: string | undefined) => {
    const s = status || 'SUBMITTED';
    switch (s) {
      case 'DRAFT':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200/50">
            Draft
          </span>
        );
      case 'EDITING':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/50 animate-pulse">
            Editing
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200/50">
            Waiting Review
          </span>
        );
      case 'PARTIALLY_APPROVED':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/50">
            Partially Approved
          </span>
        );
      case 'REVISION_REQUIRED':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200/50">
            Revision Required
          </span>
        );
      case 'FULLY_APPROVED':
        return (
          <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
            Fully Approved
          </span>
        );
      default:
        return null;
    }
  };

  const renderSectionReviewControl = (
    title: string,
    status: TrackerSectionStatus,
    setStatus: (s: TrackerSectionStatus) => void,
    comment: string,
    setComment: (c: string) => void,
    existingReview?: TrackerSectionReview
  ) => {
    if (!canReview) {
      if (!existingReview || existingReview.status === 'NOT_REVIEWED') return null;
      return (
        <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-500">{title} Status:</span>
            <span className={`font-bold uppercase px-2 py-0.5 rounded text-[9px] ${
              existingReview.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              {existingReview.status}
            </span>
          </div>
          {existingReview.comment && (
            <p className="mt-1 text-gray-600 italic">Feedback: "{existingReview.comment}"</p>
          )}
          {existingReview.reviewedByName && (
            <span className="text-[10px] text-gray-400 block mt-1">
              Reviewed by {existingReview.reviewedByName}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="mt-3 p-3 bg-gray-50/70 border border-gray-100/60 rounded-xl space-y-2 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="font-bold text-gray-700 uppercase tracking-wider text-[10px]">
            {title} Review
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatus('NOT_REVIEWED')}
              className={`px-2 py-1 rounded font-bold text-[10px] uppercase border transition cursor-pointer ${
                status === 'NOT_REVIEWED'
                  ? 'bg-gray-200 text-gray-800 border-gray-300'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              No Review
            </button>
            <button
              type="button"
              onClick={() => setStatus('APPROVED')}
              className={`px-2 py-1 rounded font-bold text-[10px] uppercase border transition cursor-pointer ${
                status === 'APPROVED'
                  ? 'bg-emerald-600 text-white border-emerald-700'
                  : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setStatus('REVISION_REQUIRED')}
              className={`px-2 py-1 rounded font-bold text-[10px] uppercase border transition cursor-pointer ${
                status === 'REVISION_REQUIRED'
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
              }`}
            >
              Revision
            </button>
          </div>
        </div>

        {status !== 'NOT_REVIEWED' && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">
              Reviewer Comments {status === 'REVISION_REQUIRED' && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={status === 'REVISION_REQUIRED' ? "Describe exactly what needs revision..." : "Feedback comment (optional)..."}
              className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        )}
        
        {existingReview?.reviewedByName && (
          <div className="text-[9px] text-gray-400 italic">
            Last reviewed by {existingReview.reviewedByName} on {formatDate(existingReview.reviewedAt || null)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto" id="entry-detail-dialog-overlay">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">Student Progress Update Details</h3>
              {getOverallStatusBadge(entry.overallStatus)}
            </div>
            <p className="text-xs text-gray-500">
              Submitted by <strong className="text-gray-700">{entry.studentDetail?.name}</strong> on {formatDate(entry.entryDate)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content body (scrollable) */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs text-gray-600 leading-relaxed">
          
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Student metadata */}
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-gray-700 uppercase tracking-wider">
                <User className="h-4 w-4 text-gray-400" />
                <span>Student Info</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-1 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Name</span>
                  <span className="font-semibold text-gray-800">{entry.studentDetail?.name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">NIS</span>
                  <span className="font-semibold text-gray-800">{entry.studentDetail?.nis || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Grade / Class</span>
                  <span className="font-semibold text-gray-800">
                    Grade {entry.studentDetail?.gradeLevel || '-'} / {entry.studentDetail?.className || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Assigned Mentor</span>
                  <span className="font-semibold text-gray-800 text-blue-600">
                    {entry.mentorName || 'Unassigned'}
                  </span>
                </div>
              </div>
            </div>

            {/* Goal Timeline Context */}
            <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-gray-700 uppercase tracking-wider">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>Tracker Timeline Context</span>
              </div>
              <div className="grid grid-cols-2 gap-y-2 gap-x-1 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Update Entry Date</span>
                  <span className="font-bold text-gray-900">{formatDate(entry.entryDate)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">System Created At</span>
                  <span className="font-semibold text-gray-800">{formatDate(entry.createdAt)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Goal Strand</span>
                  <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full mt-0.5 ${getStrandBadgeClass(entry.goalStrand)}`}>
                    {entry.goalStrand}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase">Goal Status</span>
                  <span className="font-semibold text-gray-800 uppercase text-[10px]">
                    {entry.goalSnapshot?.status?.replace('_', ' ') || 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Goal Description Section */}
          <div className="p-4 bg-blue-50/40 border border-blue-100/50 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-blue-800 uppercase tracking-wider">
              <Target className="h-4 w-4 text-blue-500" />
              <span>Original Three-Way Conference Goal</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-950">
                {entry.goalSnapshot?.goal}
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2.5 border-t border-blue-100/60 text-xs text-gray-700">
              <div>
                <span className="font-bold text-gray-500 block text-[10px] uppercase">Actions & Strategies</span>
                <p className="mt-0.5">{entry.goalSnapshot?.actions || '-'}</p>
              </div>
              <div>
                <span className="font-bold text-gray-500 block text-[10px] uppercase">Evidence of Success</span>
                <p className="mt-0.5">{entry.goalSnapshot?.evidence || '-'}</p>
              </div>
              <div>
                <span className="font-bold text-gray-500 block text-[10px] uppercase">Start Date</span>
                <p className="mt-0.5 font-medium">{formatDate(entry.goalSnapshot?.startDate)}</p>
              </div>
              <div>
                <span className="font-bold text-gray-500 block text-[10px] uppercase">Target Date</span>
                <p className="mt-0.5 font-medium">{formatDate(entry.goalSnapshot?.targetDate)}</p>
              </div>
            </div>
            {renderSectionReviewControl('Goal Setting', goalStatus, setGoalStatus, goalComment, setGoalComment, entry.sectionReviews?.goal)}
          </div>

          {/* Progress Update details */}
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 font-bold text-gray-800 uppercase tracking-wider pb-1.5 border-b border-gray-100">
              <Clipboard className="h-4 w-4 text-gray-400" />
              <span>Student Progress Responses</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Things I Have Done to Achieve My Goal
                </span>
                <p className="text-xs text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap min-h-[60px]">
                  {entry.actionsTaken}
                </p>
                {renderSectionReviewControl('Action Plan', actionPlanStatus, setActionPlanStatus, actionPlanComment, setActionPlanComment, entry.sectionReviews?.actionPlan)}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Progress I Have Made
                </span>
                <p className="text-xs text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap min-h-[60px]">
                  {entry.progressMade}
                </p>
                {renderSectionReviewControl('Progress', progressStatus, setProgressStatus, progressComment, setProgressComment, entry.sectionReviews?.progress)}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  What Behavior Hinders My Goal
                </span>
                <p className="text-xs text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap min-h-[60px]">
                  {entry.hinderingBehaviors}
                </p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  My Improvement Plan
                </span>
                <p className="text-xs text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap min-h-[60px]">
                  {entry.improvementPlan}
                </p>
              </div>
            </div>
            {renderSectionReviewControl('Reflection', reflectionStatus, setReflectionStatus, reflectionComment, setReflectionComment, entry.sectionReviews?.reflection)}
          </div>

          {/* Mentor Comment details */}
          <div className="pt-2">
            <div className="flex items-center gap-1.5 font-bold text-gray-800 uppercase tracking-wider mb-2">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              <span>Mentor Review Comment</span>
            </div>

            {entry.mentorComment ? (
              <div className="p-4 bg-emerald-50/55 border border-emerald-100/80 rounded-xl space-y-2">
                <p className="text-xs text-emerald-900 leading-relaxed whitespace-pre-wrap">
                  {entry.mentorComment}
                </p>
                <div className="text-[10px] text-emerald-600 font-bold border-t border-emerald-100/60 pt-1.5 flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-emerald-500" />
                  <span>
                    Commented by {entry.commentedByName} on {formatDate(entry.commentedAt)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50/40 border border-dashed border-amber-200/60 rounded-xl text-center text-amber-800/85">
                No mentor comment has been written for this update yet.
              </div>
            )}
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            {canReview && (
              <button
                onClick={handleSaveAllReviews}
                disabled={savingReview}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition rounded-lg shadow cursor-pointer disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingReview ? 'Saving Reviews...' : 'Save Section Reviews'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
            >
              Close Detail
            </button>
            
            {!isArchived && (
              <button
                onClick={() => {
                  onClose();
                  onAddComment(entry);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition rounded-lg shadow cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" />
                {entry.mentorComment ? 'Edit Mentor Comment' : 'Add Mentor Comment'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
