import React, { useEffect, useState } from 'react';
import { X, Calendar, BookOpen, AlertCircle, Sparkles, Brain, Award, Heart, ShieldAlert, Loader2, UserPlus } from 'lucide-react';
import { threeWayConferenceService } from '../../../services/threeWayConferenceService';
import type { Student, StudentConferenceResponse, MentorAssignment, SmartGoal } from '../../../types';

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
  const [response, setResponse] = useState<StudentConferenceResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [seReference, setSeReference] = useState<any | null>(null);
  const [isLoadingSe, setIsLoadingSe] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && student && periodId) {
      const loadResponseAndReferences = async () => {
        setIsLoading(true);
        setError(null);
        setResponse(null);
        const responseId = `${periodId}_${student.id}`;
        try {
          console.log(`[ViewResponse] Fetching response from path: studentConferenceResponses/${responseId}`);
          const resp = await threeWayConferenceService.getStudentConferenceResponse(periodId, student.id);
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto font-sans" aria-labelledby="detail-modal-title" role="dialog" aria-modal="true" id="conference-detail-modal">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-500/75 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={onClose} />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Panel Container */}
        <div className="inline-block align-bottom bg-gray-50 rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-gray-100">
          
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
                  {getStatusBadge(response?.status)}
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
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Read-only References (Self-Exploration, Karya Ilmiah, Unit Activity) */}
                <div className="pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4" id="reference-cards-grid">
                  
                  {/* Self-Exploration Card */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Self-Exploration Reference</h4>
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
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2.5">
                          <div>
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dream Career / Aspiration</span>
                            <p className="text-sm font-semibold text-gray-800 mt-0.5">
                              {seReference.enrollment.careerGoal || 'No dream career set'}
                            </p>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Top Skills / Interests</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Array.isArray(seReference.enrollment.skills) && seReference.enrollment.skills.length > 0 ? (
                                seReference.enrollment.skills.map((skill: string) => (
                                  <span key={skill} className="bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded">
                                    {skill}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400 italic">No skills listed</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 italic py-2">
                        No Self-Exploration references linked for this active period.
                      </p>
                    )}
                  </div>

                  {/* Grade 9 Karya Ilmiah and Unit Activity */}
                  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                    {/* Karya Ilmiah */}
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Karya Ilmiah Reference (Grade 9)</h4>
                      {student.grade === 9 && response.karyaIlmiahReferenceId ? (
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700">
                          Linked Research Proposal ID: <strong className="text-gray-800 font-mono">{response.karyaIlmiahReferenceId}</strong>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          {student.grade === 9 ? 'No Karya Ilmiah topic has been linked yet.' : 'Only applicable for Grade 9 students.'}
                        </p>
                      )}
                    </div>

                    {/* Unit Activity */}
                    <div className="space-y-2.5 pt-3 border-t border-gray-100">
                      <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Extracurricular / Unit Activities</h4>
                      {response.unitActivities && response.unitActivities.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {response.unitActivities.map((ua) => (
                            <div key={ua.category} className="space-y-2 bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs">
                              <div className="flex justify-between items-center border-b border-gray-200/50 pb-1">
                                <span className="font-black text-teal-800 uppercase text-[9px]">{ua.category}</span>
                                <span className="text-[7px] font-black px-1 bg-teal-100 text-teal-700 rounded uppercase">Chosen</span>
                              </div>
                              <div>
                                <span className="font-black text-gray-400 uppercase tracking-wider text-[8px]">Activity Chosen</span>
                                <p className="text-gray-800 font-bold mt-0.5">{ua.activityName || <em className="text-gray-300">None selected</em>}</p>
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
                          ))}
                        </div>
                      ) : response.unitActivityCategory ? (
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
                      ) : response.unitActivity ? (
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 font-semibold text-gray-800 whitespace-pre-wrap">
                          {response.unitActivity}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          No extracurricular activities listed.
                        </p>
                      )}
                    </div>

                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Footer */}
          <div className="bg-white px-6 py-4 border-t border-gray-100 flex justify-end">
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
    </div>
  );
};
