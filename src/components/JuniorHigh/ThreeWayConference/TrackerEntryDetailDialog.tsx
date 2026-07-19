import React from 'react';
import { SmartGoalTrackerEntry, Student } from '../../../types';
import { X, Calendar, User, MessageSquare, Target, Clipboard, ShieldAlert } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto" id="entry-detail-dialog-overlay">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-gray-900">Student Progress Update Details</h3>
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
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Progress I Have Made
                </span>
                <p className="text-xs text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100 whitespace-pre-wrap min-h-[60px]">
                  {entry.progressMade}
                </p>
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
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50/50">
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
  );
};
