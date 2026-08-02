import React from 'react';
import { Eye, UserPlus, UserCheck, Calendar, Tv } from 'lucide-react';
import type { Student, StudentConferenceResponse, MentorAssignment } from '../../../types';

interface ConferenceWorkspaceRow {
  student: Student;
  response: StudentConferenceResponse | null;
  assignment: MentorAssignment | null;
  className: string;
  grade: string | number;
}

interface ConferenceResponsesTableProps {
  rows: ConferenceWorkspaceRow[];
  onViewResponse: (studentId: string) => void;
  onAssignMentor: (student: Student, assignment: MentorAssignment | null) => void;
  onPresentConference?: (studentId: string) => void;
}

export const ConferenceResponsesTable: React.FC<ConferenceResponsesTableProps> = ({
  rows,
  onViewResponse,
  onAssignMentor,
  onPresentConference,
}) => {
  const getStatusBadge = (status: 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'CONFERENCE_COMPLETED') => {
    switch (status) {
      case 'NOT_STARTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
            Not Started
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            Draft
          </span>
        );
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Submitted
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Approved
          </span>
        );
      case 'RETURNED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            Returned
          </span>
        );
      case 'CONFERENCE_COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Completed
          </span>
        );
    }
  };

  const getStrandBadge = (strand: string) => {
    switch (strand) {
      case 'SPIRITUAL':
        return (
          <span key={strand} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
            Spi
          </span>
        );
      case 'IMAGINAL':
        return (
          <span key={strand} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100">
            Ima
          </span>
        );
      case 'RATIONAL':
        return (
          <span key={strand} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-100">
            Rat
          </span>
        );
      case 'MATERIAL_PHYSICAL':
        return (
          <span key={strand} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-100">
            Mat
          </span>
        );
      default:
        return null;
    }
  };

  const formatDate = (timestamp?: number | null) => {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getApprovedProgressText = (response: StudentConferenceResponse | null) => {
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
    const reviews = response.sectionReviews || {};

    applicableSections.forEach(sec => {
      const rev = (reviews as any)[sec];
      if (rev && rev.status === 'APPROVED') {
        approvedCount++;
      }
    });

    const goalReviews = reviews.smartGoals || {};
    goalIds.forEach(id => {
      const rev = goalReviews[id];
      if (rev && rev.status === 'APPROVED') {
        approvedCount++;
      }
    });

    return `${approvedCount}/${totalApplicable} approved`;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm" id="conference-table-card">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100" id="conference-responses-table">
          <thead className="bg-gray-50/70 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <tr>
              <th 
                scope="col" 
                className="sticky left-0 z-30 px-6 py-4 text-left font-semibold w-[220px] md:w-[300px] min-w-[220px] md:min-w-[300px] bg-slate-50 border-r border-gray-100 shadow-[4px_0_12px_-12px_rgba(15,23,42,0.34)]"
              >
                Student
              </th>
              <th scope="col" className="px-4 py-4 text-left font-semibold">Grade</th>
              <th scope="col" className="px-4 py-4 text-left font-semibold">Class</th>
              <th scope="col" className="px-4 py-4 text-left font-semibold">Response Status</th>
              <th scope="col" className="px-4 py-4 text-left font-semibold">Goal Summary</th>
              <th scope="col" className="px-6 py-4 text-left font-semibold">Assigned Mentor</th>
              <th scope="col" className="px-4 py-4 text-left font-semibold">Last Updated</th>
              <th scope="col" className="px-6 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-sm text-gray-700 bg-white">
            {rows.length === 0 ? (
              <tr id="empty-table-row">
                <td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                  No Junior High students found matching the filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const responseStatus = row.response ? row.response.status : 'NOT_STARTED';
                const goals = row.response?.goals || [];
                const mentorName = row.assignment?.status !== 'REMOVED' ? row.assignment?.mentorName : null;

                // Extract unique strands
                const uniqueStrands: string[] = Array.from(new Set(goals.map(g => g.strand as string)));

                return (
                  <tr key={row.student.id} className="group hover:bg-slate-50/40 transition" id={`row-${row.student.id}`}>
                    {/* Student Column */}
                    <td 
                      className="sticky left-0 z-20 px-6 py-4 w-[220px] md:w-[300px] min-w-[220px] md:min-w-[300px] bg-white group-hover:bg-slate-50 border-r border-gray-100 shadow-[4px_0_12px_-12px_rgba(15,23,42,0.34)] transition-colors"
                    >
                      <div className="flex flex-col max-w-[200px] md:max-w-[280px] whitespace-normal">
                        <span className="font-semibold text-gray-900 text-sm md:text-base line-clamp-2 break-words leading-snug">{row.student.name}</span>
                        <span className="text-xs text-gray-500 font-mono truncate mt-1">NIS: {row.student.nis || row.student.id}</span>
                      </div>
                    </td>

                    {/* Grade Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-gray-600 font-medium">
                      Grade {row.grade}
                    </td>

                    {/* Class Column */}
                    <td className="px-4 py-4 whitespace-nowrap text-gray-600 font-medium">
                      {row.className}
                    </td>

                    {/* Response Status */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(responseStatus)}
                        {row.response && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-500 bg-gray-50 border border-gray-200">
                            {getApprovedProgressText(row.response)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Goal Summary */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      {goals.length === 0 ? (
                        <span className="text-xs text-gray-400 italic">No goals yet</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-gray-700">
                            {goals.length} Goal{goals.length !== 1 ? 's' : ''}
                          </span>
                          <div className="flex gap-1">
                            {uniqueStrands.map(s => getStrandBadge(s))}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Assigned Mentor */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {mentorName ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-[10px] font-bold uppercase shrink-0">
                            {row.assignment?.mentorPhotoURL ? (
                              <img src={row.assignment.mentorPhotoURL} alt={mentorName} className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              mentorName.charAt(0)
                            )}
                          </div>
                          <div className="flex flex-col max-w-[150px]">
                            <span 
                              className="font-semibold text-gray-800 text-xs flex items-center gap-1.5 bg-blue-50/50 text-blue-800 border border-blue-100/50 px-2 py-0.5 rounded-md w-fit truncate"
                              title={mentorName}
                            >
                              {mentorName}
                            </span>
                            {row.assignment?.mentorEmail && (
                              <span className="text-[10px] text-gray-400 font-mono mt-0.5 truncate" title={row.assignment.mentorEmail}>{row.assignment.mentorEmail}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-100">
                          Unassigned
                        </span>
                      )}
                    </td>

                    {/* Last Updated */}
                    <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                      {row.response ? (
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-gray-400" />
                          {formatDate(row.response.updatedAt)}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        {onPresentConference && (
                          <button
                            id={`btn-teacher-present-${row.student.id}`}
                            onClick={() => onPresentConference(row.student.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-teal-200 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 transition shadow-sm"
                            title="Presentasikan Student Slides"
                          >
                            <Tv className="h-3.5 w-3.5" />
                            Presentasikan
                          </button>
                        )}

                        <button
                          id={`view-resp-btn-${row.student.id}`}
                          onClick={() => onViewResponse(row.student.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition shadow-sm"
                          title="View Student Response"
                        >
                          <Eye className="h-3.5 w-3.5 text-gray-500" />
                          View Response
                        </button>

                        <button
                          id={`assign-mentor-btn-${row.student.id}`}
                          onClick={() => onAssignMentor(row.student, row.assignment)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-transparent text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-sm"
                        >
                          {mentorName ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              Ganti Mentor
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3.5 w-3.5" />
                              Assign Mentor
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
