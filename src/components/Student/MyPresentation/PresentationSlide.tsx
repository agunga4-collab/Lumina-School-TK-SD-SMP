import * as React from 'react';
import { 
  Target, Sparkles, BookOpen, User, ShieldAlert, CheckCircle2,
  Calendar, Flame, ListChecks, HelpCircle, Award, Compass, MessageSquare
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { SmartGoal } from '../../../types';

export type SlideType = 
  | 'COVER'
  | 'ABOUT_ME'
  | 'STRENGTHS'
  | 'GROWTH'
  | 'GOAL_STRAND'
  | 'SELF_EXPLORATION'
  | 'KARYA_ILMIAH'
  | 'UNIT_ACTIVITY'
  | 'COMMITMENT'
  | 'CONFERENCE_NOTES';

export interface SlideData {
  type: SlideType;
  title: string;
  strand?: 'SPIRITUAL' | 'IMAGINAL' | 'RATIONAL' | 'MATERIAL';
  goals?: SmartGoal[];
  unitActivityCategory?: string;
  unitActivityName?: string;
  unitActivityWorries?: string;
  unitActivityOvercomingPlan?: string;
}

interface PresentationSlideProps {
  slide: SlideData;
  studentName: string;
  className: string;
  gradeLevel: number;
  academicYear: string;
  semester: number;
  aboutMe: string;
  strengths: string;
  areasForGrowth: string;
  unitActivity?: string;
  selfExplorationRef: any;
  status: 'DRAFT' | 'SUBMITTED' | 'CONFERENCE_COMPLETED';
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return 'No target date';
  try {
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return 'Invalid date';
  }
}

// Sub-component for Goal Card to track its own expanded state
function GoalCard({ goal }: { goal: SmartGoal; key?: string }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-gray-100 pb-3">
        <div>
          <h4 className="text-base font-black text-gray-900 tracking-tight leading-tight">
            {goal.goal}
          </h4>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
            <Calendar size={13} />
            <span>Target: {formatDate(goal.targetDate)}</span>
          </div>
        </div>
        {goal.status && (
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border self-start",
            goal.status === 'COMPLETED'
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : goal.status === 'ACTIVE'
                ? "bg-blue-50 text-blue-700 border-blue-100"
                : "bg-gray-50 text-gray-700 border-gray-100"
          )}>
            {goal.status.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
        <div className="space-y-1">
          <p className="font-black text-gray-800 uppercase tracking-wider text-[10px]">Things I Have to Do</p>
          <p className="bg-gray-50 p-3 rounded-xl italic leading-relaxed whitespace-pre-wrap">
            {goal.actions || 'No actions listed.'}
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-black text-gray-800 uppercase tracking-wider text-[10px]">Proof That My Effort Is Working</p>
          <p className="bg-gray-50 p-3 rounded-xl italic leading-relaxed whitespace-pre-wrap">
            {goal.evidence || 'No evidence listed.'}
          </p>
        </div>
      </div>

      {/* SMART Reflection Expander */}
      <div className="pt-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 cursor-pointer focus:outline-none"
        >
          <span>{expanded ? 'Hide' : 'View'} SMART Reflection</span>
          <span className="text-[10px] font-normal text-gray-400">
            ({expanded ? '▲' : '▼'})
          </span>
        </button>

        {expanded && (
          <div className="mt-3 p-4 bg-blue-50/40 rounded-2xl border border-blue-100/50 space-y-3 text-xs text-gray-700 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="font-black text-blue-800 uppercase text-[9px] tracking-wider block">Specific</span>
                <p className="mt-0.5 text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.smartSpecific}</p>
              </div>
              <div>
                <span className="font-black text-blue-800 uppercase text-[9px] tracking-wider block">Measurable</span>
                <p className="mt-0.5 text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.smartMeasurable}</p>
              </div>
              <div>
                <span className="font-black text-blue-800 uppercase text-[9px] tracking-wider block">Achievable</span>
                <p className="mt-0.5 text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.smartAchievable}</p>
              </div>
              <div>
                <span className="font-black text-blue-800 uppercase text-[9px] tracking-wider block">Relevant</span>
                <p className="mt-0.5 text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.smartRelevant}</p>
              </div>
            </div>
            <div className="border-t border-blue-100/50 pt-2">
              <span className="font-black text-blue-800 uppercase text-[9px] tracking-wider block">Time-Bound</span>
              <p className="mt-0.5 text-gray-600 whitespace-pre-wrap leading-relaxed">{goal.smartTimeBound}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function PresentationSlide({
  slide,
  studentName,
  className,
  gradeLevel,
  academicYear,
  semester,
  aboutMe,
  strengths,
  areasForGrowth,
  unitActivity,
  selfExplorationRef,
  status
}: PresentationSlideProps) {
  const renderContent = () => {
    switch (slide.type) {
      case 'COVER':
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-[1.5rem] text-[#002366] mb-2 shadow-sm">
              <Award size={36} />
            </div>
            <div className="space-y-3">
              <span className="text-[10px] font-mono font-extrabold text-blue-600 uppercase tracking-[0.3em] block">
                Three-Way Conference
              </span>
              <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight max-w-xl">
                My Three-Way Conference
              </h2>
            </div>

            <div className="h-0.5 w-16 bg-gray-200 my-4" />

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-800">{studentName}</h3>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500 font-medium">
                <span>Class: {className || '-'}</span>
                <span className="text-gray-300">•</span>
                <span>Grade: {gradeLevel}</span>
                <span className="text-gray-300">•</span>
                <span>Year: {academicYear}</span>
                <span className="text-gray-300">•</span>
                <span>Semester: {semester}</span>
              </div>
            </div>
          </div>
        );

      case 'ABOUT_ME':
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#002366] shrink-0">
                <User size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">About Me</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Who I am and my current reflection</p>
              </div>
            </div>

            <div className="text-sm md:text-base text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-2">
              {aboutMe.trim() ? (
                aboutMe
              ) : (
                <p className="text-gray-400 italic">Tell us a little about yourself in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'STRENGTHS':
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <Award size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Strengths</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Things I do well and proud of</p>
              </div>
            </div>

            <div className="text-sm md:text-base text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-2">
              {strengths.trim() ? (
                strengths
              ) : (
                <p className="text-gray-400 italic">Describe your strengths in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'GROWTH':
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                <Flame size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Areas for Growth</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Where I want to improve and learn more</p>
              </div>
            </div>

            <div className="text-sm md:text-base text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-2">
              {areasForGrowth.trim() ? (
                areasForGrowth
              ) : (
                <p className="text-gray-400 italic">Describe your areas for growth in Goal Setting.</p>
              )}
            </div>
          </div>
        );

      case 'GOAL_STRAND':
        const strandGoals = slide.goals || [];
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-[#002366] shrink-0">
                <Target size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                  My {slide.title}
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  SMART goals for {slide.title.toLowerCase()} development
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-h-[50vh] overflow-y-auto pr-2">
              {strandGoals.length > 0 ? (
                strandGoals.map((g) => <GoalCard key={g.id} goal={g} />)
              ) : (
                <p className="text-gray-400 italic col-span-2 text-center py-6">
                  No goals set for this strand.
                </p>
              )}
            </div>
          </div>
        );

      case 'SELF_EXPLORATION':
        const enrollment = selfExplorationRef?.enrollment;
        const periodLabel = selfExplorationRef?.periodLabel;
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Self-Exploration</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                    {periodLabel || 'Active Semester Period'}
                  </p>
                </div>
              </div>

              <a
                href="/self-exploration/my"
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-950 hover:bg-gray-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm self-start sm:self-auto cursor-pointer"
              >
                <span>Open Self-Exploration</span>
              </a>
            </div>

            {enrollment ? (
              <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-2">
                <div className="flex items-center gap-2 p-3 bg-blue-50/50 rounded-xl w-fit text-xs font-bold text-blue-700 uppercase">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                  <span>Status: {enrollment.status || 'PLANNING'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {enrollment.choices && enrollment.choices.map((choice: any, idx: number) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex items-center justify-between border-b border-gray-200/50 pb-1.5">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                          Choice Slot {choice.slot || idx + 1}
                        </span>
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500 uppercase">
                          {choice.strand}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-gray-400 uppercase">Activity</span>
                        <p className="text-xs font-bold text-gray-700">
                          {choice.activityName || choice.customActivity || '-'}
                        </p>
                      </div>
                      {choice.finalTarget && (
                        <div>
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Target</span>
                          <p className="text-xs text-gray-500 italic">"{choice.finalTarget}"</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 text-center space-y-2">
                <Compass className="text-gray-400 mx-auto" size={24} />
                <h4 className="text-xs font-black text-gray-700 uppercase italic">No self-exploration found</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  No Self-Exploration plan has been loaded for this conference period.
                </p>
              </div>
            )}
          </div>
        );

      case 'KARYA_ILMIAH':
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Karya Ilmiah</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Grade 9 Graduation Project Summary</p>
              </div>
            </div>

            <div className="p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-center space-y-2">
              <BookOpen className="text-gray-400 mx-auto" size={24} />
              <h4 className="text-xs font-black text-indigo-800 uppercase tracking-tight">
                Karya Ilmiah Project Active
              </h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                Your Karya Ilmiah registration is linked to this conference. You are working on your graduation thesis requirements.
              </p>
            </div>
          </div>
        );

      case 'UNIT_ACTIVITY':
        return (
          <div className="space-y-6 p-6 md:p-8 text-left">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
                <Compass size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">
                  {slide.unitActivityCategory ? `Unit Activity: ${slide.unitActivityCategory}` : 'My Unit Activity'}
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                  {slide.unitActivityCategory ? 'Reflection per chosen category' : 'Narrative reflection of school unit activities'}
                </p>
              </div>
            </div>

            {slide.unitActivityCategory ? (
              <div className="space-y-5">
                <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                  <span className="font-black text-gray-400 uppercase tracking-wider text-[10px]">Specific Activity Chosen</span>
                  <p className="text-gray-800 font-black mt-1 text-sm md:text-base">
                    {slide.unitActivityName || <em className="text-gray-300">None selected</em>}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-rose-50/30 border border-rose-100 rounded-2xl space-y-2">
                    <span className="font-black text-rose-500 uppercase tracking-wider text-[10px] block">My Worries</span>
                    <p className="text-xs md:text-sm text-gray-700 font-semibold leading-relaxed whitespace-pre-wrap max-h-[25vh] overflow-y-auto">
                      {slide.unitActivityWorries || <em className="text-gray-300">No worries entered</em>}
                    </p>
                  </div>
                  <div className="p-5 bg-teal-50/30 border border-teal-100 rounded-2xl space-y-2">
                    <span className="font-black text-teal-600 uppercase tracking-wider text-[10px] block">Plan to Overcome</span>
                    <p className="text-xs md:text-sm text-gray-700 font-semibold leading-relaxed whitespace-pre-wrap max-h-[25vh] overflow-y-auto">
                      {slide.unitActivityOvercomingPlan || <em className="text-gray-300">No plan entered</em>}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm md:text-base text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-2">
                {unitActivity && unitActivity.trim() ? (
                  unitActivity
                ) : (
                  <p className="text-gray-400 italic">No unit activity narrative added.</p>
                )}
              </div>
            )}
          </div>
        );

      case 'COMMITMENT':
        const goalsToDisplay = slide.goals || [];
        return (
          <div className="space-y-6 p-6 md:p-8 text-left flex flex-col justify-between min-h-[350px]">
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <ListChecks size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 uppercase italic tracking-tight">My Commitment</h3>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Selected key goals to focus on first</p>
                </div>
              </div>

              {goalsToDisplay.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Top Goals by Urgency</p>
                  {goalsToDisplay.map((g, idx) => (
                    <div key={g.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-[#002366] font-bold text-xs shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-black text-gray-800 leading-snug">{g.goal}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mt-1">
                          Strand: {g.strand} • Target: {formatDate(g.targetDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 italic text-center py-6">No goals available to display.</p>
              )}
            </div>

            <div className="mt-6 p-5 bg-blue-50 text-blue-800 border border-blue-100 rounded-2xl text-center">
              <p className="text-sm font-black tracking-tight leading-relaxed">
                "I am committed to taking small, consistent steps toward my goals."
              </p>
            </div>
          </div>
        );

      case 'CONFERENCE_NOTES':
        return (
          <div className="flex flex-col items-center justify-center min-h-[350px] text-center p-8 space-y-6">
            <div className="w-16 h-16 bg-blue-50 text-[#002366] rounded-[1.5rem] flex items-center justify-center shadow-sm">
              <MessageSquare size={36} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Conference Notes & Agreements</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Conference notes and agreements will be added in a later stage.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-400 font-bold uppercase tracking-wider">
              Read-Only Stage 3 Presentation
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div 
      className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden min-h-[450px] flex flex-col justify-between"
      id={`presentation-slide-${slide.type.toLowerCase()}`}
    >
      <div className="flex-1 overflow-y-auto max-h-[60vh] md:max-h-[70vh]">
        {renderContent()}
      </div>
    </div>
  );
}
