import React from 'react';
import { SmartGoalTrackerEntry, Student } from '../../../types';
import { Eye, MessageSquare, ClipboardList, CheckCircle2, AlertCircle } from 'lucide-react';

interface TrackerEntriesTableProps {
  entries: Array<SmartGoalTrackerEntry & { studentDetail?: Student; mentorName?: string }>;
  onViewDetail: (entry: SmartGoalTrackerEntry) => void;
  onAddComment: (entry: SmartGoalTrackerEntry) => void;
  isArchived: boolean;
}

export const TrackerEntriesTable: React.FC<TrackerEntriesTableProps> = ({
  entries,
  onViewDetail,
  onAddComment,
  isArchived
}) => {
  
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
      case 'Spiritual': return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'Imaginal': return 'bg-purple-50 text-purple-700 border border-purple-100';
      case 'Rational': return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'Material/Physical': return 'bg-amber-50 text-amber-700 border border-amber-100';
      default: return 'bg-gray-50 text-gray-700 border border-gray-100';
    }
  };

  const getOverallStatusBadge = (status: string | undefined) => {
    const s = status || 'SUBMITTED';
    switch (s) {
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
            Draft
          </span>
        );
      case 'EDITING':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full animate-pulse">
            Editing
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
            Submitted
          </span>
        );
      case 'PARTIALLY_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
            Partially Approved
          </span>
        );
      case 'REVISION_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
            Revision Req.
          </span>
        );
      case 'FULLY_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
            Approved
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
            {s}
          </span>
        );
    }
  };

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-12 text-center space-y-4" id="staff-tracker-table-empty">
        <div className="mx-auto w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900">No tracker entries found</h3>
          <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
            Try adjusting your search criteria or filter options to locate progress updates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden" id="staff-tracker-table-container">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/75 border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              <th className="px-5 py-3.5">Student</th>
              <th className="px-5 py-3.5">Grade / Class</th>
              <th className="px-5 py-3.5">Goal Type</th>
              <th className="px-5 py-3.5">Goal</th>
              <th className="px-5 py-3.5">Entry Date</th>
              <th className="px-5 py-3.5">Progress Summary</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Comment Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
            {entries.map((entry) => {
              const studentName = entry.studentDetail?.name || 'Loading Student...';
              const studentNis = entry.studentDetail?.nis || '';
              const gradeClass = `Grade ${entry.studentDetail?.gradeLevel || '-'} / ${entry.studentDetail?.className || '-'}`;
              const goalText = entry.goalSnapshot?.goal || 'No goal description.';
              const truncatedGoal = goalText.length > 50 ? `${goalText.substring(0, 50)}...` : goalText;
              
              const progressText = entry.progressMade || '';
              const truncatedProgress = progressText.length > 40 ? `${progressText.substring(0, 40)}...` : progressText;

              return (
                <tr key={entry.id} className="hover:bg-gray-50/50 transition">
                  {/* Student */}
                  <td className="px-5 py-4">
                    <div className="font-bold text-gray-900">{studentName}</div>
                    {studentNis && <div className="text-[10px] text-gray-400 font-medium">NIS: {studentNis}</div>}
                  </td>

                  {/* Grade / Class */}
                  <td className="px-5 py-4 text-gray-600 font-medium">
                    {gradeClass}
                  </td>

                  {/* Goal Type */}
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStrandBadgeClass(entry.goalStrand)}`}>
                      {entry.goalStrand}
                    </span>
                  </td>

                  {/* Goal */}
                  <td className="px-5 py-4">
                    <div className="max-w-[200px]" title={goalText}>
                      <p className="font-medium text-gray-700 truncate">{truncatedGoal}</p>
                    </div>
                  </td>

                  {/* Entry Date */}
                  <td className="px-5 py-4 text-gray-600 font-medium">
                    {formatDate(entry.entryDate)}
                  </td>

                  {/* Progress Summary */}
                  <td className="px-5 py-4 text-gray-500 italic max-w-[150px] truncate" title={progressText}>
                    {truncatedProgress || '-'}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    {getOverallStatusBadge(entry.overallStatus)}
                  </td>

                  {/* Comment Status */}
                  <td className="px-5 py-4">
                    {entry.mentorComment ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-max">
                          <CheckCircle2 className="h-3 w-3" />
                          Commented
                        </div>
                        {entry.commentedByName && (
                          <span className="text-[9px] text-gray-400 italic block pl-1">
                            By {entry.commentedByName}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-max">
                        <AlertCircle className="h-3 w-3" />
                        No Comment
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onViewDetail(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-700 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition font-semibold cursor-pointer"
                        title="View Full Entry"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>

                      {!isArchived && (
                        <button
                          onClick={() => onAddComment(entry)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition font-semibold cursor-pointer ${
                            entry.mentorComment
                              ? 'text-gray-700 hover:text-emerald-600 hover:bg-emerald-50/50'
                              : 'text-blue-700 bg-blue-50 hover:bg-blue-100/75'
                          }`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {entry.mentorComment ? 'Edit Comment' : 'Comment'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
