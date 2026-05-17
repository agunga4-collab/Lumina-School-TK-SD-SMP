import * as React from 'react';
import { 
  MTSSAcademicCase, 
  MTSSAcademicGoal, 
  MTSSAcademicSession, 
  MTSSAcademicMeeting, 
  MTSSAcademicPlan,
  MTSSAcademicEvaluation
} from '../../../types';
import { 
  TrendingUp, 
  Target, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  Zap,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  mtssCase: MTSSAcademicCase;
  goals: MTSSAcademicGoal[];
  sessions: MTSSAcademicSession[];
  meetings: MTSSAcademicMeeting[];
  plans: MTSSAcademicPlan[];
  evaluations: MTSSAcademicEvaluation[];
}

export default function CaseOverview({ mtssCase, goals, sessions, meetings, plans, evaluations }: Props) {
  const activePlan = plans.find(p => p.status === 'ACTIVE');
  const activeGoals = goals.filter(g => g.status === 'ACTIVE');
  
  return (
    <div className="space-y-6">
      {/* Primary Concern & Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 text-indigo-50 opacity-20 -rotate-12 translate-x-8 -translate-y-8">
              <Zap size={120} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
              <Zap className="text-indigo-600" size={20} />
              Primary Concern
            </h3>
            <p className="text-slate-600 leading-relaxed text-lg font-medium">
              {mtssCase.primaryConcern}
            </p>
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referred At</span>
                <span className="font-bold text-slate-700">{format(mtssCase.createdAt, 'dd MMM yyyy')}</span>
              </div>
              <div className="flex flex-col border-l border-slate-100 pl-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Source</span>
                <span className="font-bold text-slate-700 capitalize">{mtssCase.sourceType.replace('_', ' ')}</span>
              </div>
              <div className="flex flex-col border-l border-slate-100 pl-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Homeroom</span>
                <span className="font-bold text-slate-700">T. Agung</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-lg shadow-indigo-100">
              <h4 className="text-sm font-black uppercase tracking-widest opacity-80 mb-4">Intervention Stats</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-3xl font-black">{sessions.length}</p>
                  <p className="text-xs font-bold opacity-80">Total Sessions</p>
                </div>
                <div>
                  <p className="text-3xl font-black">{activeGoals.length}</p>
                  <p className="text-xs font-bold opacity-80">Active Goals</p>
                </div>
              </div>
              <div className="mt-6 bg-white/10 p-3 rounded-2xl flex items-center justify-between group cursor-pointer hover:bg-white/20 transition-all">
                <span className="text-sm font-bold">Latest session: {sessions[0] ? format(sessions[0].date, 'dd MMM') : 'None'}</span>
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Current Plan</h4>
              {activePlan ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{activePlan.frequencyPerWeek}x / Week</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{activePlan.durationMinutes} mins per session</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                      <Target size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">Ends {format(activePlan.targetEndDate, 'dd MMM yyyy')}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Target completion</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 text-center">
                  <AlertCircle size={24} className="text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-400">No active intervention plan</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Timeline & Actions */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-full">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Program Timeline</h3>
            <div className="space-y-8 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
              <TimelineStep 
                label="Referral & Screening" 
                date={mtssCase.createdAt} 
                status="completed" 
                isLast={false}
              />
              <TimelineStep 
                label="Initial Meeting" 
                date={meetings.find(m => m.meetingType === 'INITIAL')?.date} 
                status={mtssCase.status === 'SCREENING' ? 'pending' : 'completed'} 
                isLast={false}
              />
              <TimelineStep 
                label="Tier 2 Intervention" 
                date={activePlan?.startDate} 
                status={mtssCase.currentTier === 'Tier 1' ? 'upcoming' : 'active'} 
                isLast={false}
              />
              <TimelineStep 
                label="Progress Review" 
                date={evaluations[0]?.date} 
                status="upcoming" 
                isLast={true}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Progress Analysis (Placeholder for Chart) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
          <TrendingUp className="text-indigo-600" size={20} />
          Progression Trend
        </h3>
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
          <TrendingUp size={48} className="opacity-20 mb-4" />
          <p className="text-sm font-medium">Progress chart visualization will be displayed here as more session data is collected.</p>
        </div>
      </div>
    </div>
  );
}

function TimelineStep({ label, date, status, isLast }: { label: string; date?: number; status: 'completed' | 'active' | 'pending' | 'upcoming'; isLast: boolean }) {
  const configs = {
    completed: { icon: CheckCircle2, iconColor: 'text-emerald-500 bg-emerald-50', dotColor: 'bg-emerald-500 ring-emerald-100' },
    active: { icon: TrendingUp, iconColor: 'text-indigo-600 bg-indigo-50', dotColor: 'bg-indigo-600 ring-indigo-100 animate-pulse' },
    pending: { icon: Clock, iconColor: 'text-amber-500 bg-amber-50', dotColor: 'bg-amber-500 ring-amber-100' },
    upcoming: { icon: Calendar, iconColor: 'text-slate-300 bg-slate-50', dotColor: 'bg-slate-200 ring-transparent' }
  };

  const { icon: Icon, iconColor, dotColor } = configs[status];

  return (
    <div className="relative pl-10">
      <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-white ring-4 ${dotColor} z-10 flex items-center justify-center`}>
        {status === 'completed' && <CheckCircle2 size={12} className="text-white" />}
      </div>
      <div>
        <p className={`text-sm font-black ${status === 'upcoming' ? 'text-slate-400' : 'text-slate-800'}`}>{label}</p>
        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tighter">
          {date ? format(date, 'dd MMM yyyy') : 'No date set'}
        </p>
      </div>
    </div>
  );
}
