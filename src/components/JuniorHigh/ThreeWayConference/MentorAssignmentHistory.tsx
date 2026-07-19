import React from 'react';
import { UserCheck, RefreshCw, Trash2, Calendar, User } from 'lucide-react';
import type { MentorAssignment } from '../../../types';

interface MentorAssignmentHistoryProps {
  assignment: MentorAssignment | null;
}

export const MentorAssignmentHistory: React.FC<MentorAssignmentHistoryProps> = ({ assignment }) => {
  const history = assignment?.assignmentHistory || [];

  const getActionIcon = (action: 'ASSIGNED' | 'REASSIGNED' | 'REMOVED') => {
    switch (action) {
      case 'ASSIGNED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 ring-4 ring-white">
            <UserCheck className="h-4 w-4" />
          </span>
        );
      case 'REASSIGNED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 border border-blue-100 ring-4 ring-white">
            <RefreshCw className="h-4 w-4" />
          </span>
        );
      case 'REMOVED':
        return (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-red-600 border border-red-100 ring-4 ring-white">
            <Trash2 className="h-4 w-4" />
          </span>
        );
    }
  };

  const getActionLabel = (action: 'ASSIGNED' | 'REASSIGNED' | 'REMOVED') => {
    switch (action) {
      case 'ASSIGNED':
        return 'Mentor Assigned';
      case 'REASSIGNED':
        return 'Mentor Reassigned';
      case 'REMOVED':
        return 'Mentor Removed';
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (history.length === 0) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-center border border-dashed border-gray-200" id="empty-history-container">
        <p className="text-sm text-gray-500 font-medium">No mentor assignment history available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="mentor-history-container">
      <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Assignment History</h4>
      <div className="flow-root">
        <ul role="list" className="-mb-8">
          {history.map((entry, idx) => (
            <li key={idx} id={`history-item-${idx}`}>
              <div className="relative pb-8">
                {/* Visual Connector Line */}
                {idx !== history.length - 1 && (
                  <span className="absolute top-4 left-3.5 -ml-px h-full w-0.5 bg-gray-100" aria-hidden="true" />
                )}
                
                <div className="relative flex space-x-3">
                  {/* Action Icon */}
                  <div>{getActionIcon(entry.action)}</div>
                  
                  {/* Event Details */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {getActionLabel(entry.action)}
                      </p>
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                        <Calendar className="h-3 w-3" />
                        {formatDate(entry.actionAt)}
                      </div>
                    </div>

                    <div className="mt-1 text-sm text-gray-600 space-y-1">
                      {entry.mentorName ? (
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          <User className="h-3.5 w-3.5 text-gray-400" />
                          <span>Mentor: <strong className="text-gray-900">{entry.mentorName}</strong></span>
                          {entry.mentorEmail && (
                            <span className="text-[10px] text-gray-400 font-mono">({entry.mentorEmail})</span>
                          )}
                        </div>
                      ) : (
                        entry.action === 'REMOVED' && (
                          <div className="text-xs text-red-500 font-medium italic">
                            Assignment Cleared (Student Unassigned)
                          </div>
                        )
                      )}

                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <span>Performed by: </span>
                        <strong className="text-gray-700">{entry.actionByName || 'System'}</strong>
                      </p>

                      {entry.reason && (
                        <div className="mt-1.5 bg-gray-50 border border-gray-100 rounded-lg p-2.5 text-xs text-gray-600 italic">
                          "{entry.reason}"
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
