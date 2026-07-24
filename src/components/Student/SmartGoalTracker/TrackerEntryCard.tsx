import * as React from 'react';
import { SmartGoalTrackerEntry } from '../../../types';
import { Calendar, User, MessageSquare, Edit2 } from 'lucide-react';

interface TrackerEntryCardProps {
  entry: SmartGoalTrackerEntry;
  canEdit: boolean;
  onEdit: (entry: SmartGoalTrackerEntry) => void;
}

export default function TrackerEntryCard({
  entry,
  canEdit,
  onEdit
}: TrackerEntryCardProps) {
  
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
    const s = status || 'DRAFT';
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

  const isEditable = canEdit && (
    !entry.overallStatus || 
    entry.overallStatus === 'DRAFT' || 
    entry.overallStatus === 'EDITING' || 
    entry.overallStatus === 'REVISION_REQUIRED'
  );

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden p-5 space-y-4" id={`tracker-entry-card-${entry.id}`}>
      {/* Top section: Date and goal identifier */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${getStrandBadgeClass(entry.goalStrand)}`}>
            {entry.goalStrand}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            <span className="font-medium">{formatDate(entry.entryDate)}</span>
          </div>
          {getOverallStatusBadge(entry.overallStatus)}
        </div>

        {isEditable && (
          <button
            onClick={() => onEdit(entry)}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 hover:text-gray-900 border border-gray-200 rounded-lg transition cursor-pointer"
          >
            <Edit2 className="h-3 w-3" />
            Edit Update
          </button>
        )}
      </div>

      {/* Linked Goal Context */}
      <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg space-y-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
          Linked Goal
        </span>
        <p className="text-xs text-gray-700 font-medium line-clamp-2">
          {entry.goalSnapshot?.goal || 'Original conference goal details loaded.'}
        </p>
      </div>

      {/* Tracker Details (The 4 core questions) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            Things I Have Done to Achieve My Goal
          </span>
          <p className="text-xs text-gray-900 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50 min-h-[50px] whitespace-pre-wrap">
            {entry.actionsTaken}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            Progress I Have Made
          </span>
          <p className="text-xs text-gray-900 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50 min-h-[50px] whitespace-pre-wrap">
            {entry.progressMade}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            What Behavior Hinders My Goal
          </span>
          <p className="text-xs text-gray-900 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50 min-h-[50px] whitespace-pre-wrap">
            {entry.hinderingBehaviors}
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
            My Improvement Plan
          </span>
          <p className="text-xs text-gray-900 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100/50 min-h-[50px] whitespace-pre-wrap">
            {entry.improvementPlan}
          </p>
        </div>
      </div>

      {/* Mentor Comment Section */}
      <div className="mt-2 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
          <MessageSquare className="h-4 w-4 text-gray-400" />
          <span>Mentor Comment</span>
        </div>
        
        {entry.mentorComment ? (
          <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
            <p className="text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">
              {entry.mentorComment}
            </p>
            <div className="flex items-center gap-1 text-[10px] text-blue-500 font-semibold pt-1 border-t border-blue-100/60">
              <User className="h-3 w-3" />
              <span>Commented by {entry.commentedByName} on {formatDate(entry.commentedAt)}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic pl-6">
            No mentor comment yet. Your assigned mentor or BK mentor will review and comment on your updates.
          </p>
        )}
      </div>
    </div>
  );
}
