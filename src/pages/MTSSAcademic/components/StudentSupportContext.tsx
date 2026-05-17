import * as React from 'react';
import { 
  ShieldAlert, 
  Clock, 
  TrendingUp, 
  FileText, 
  ExternalLink,
  AlertCircle,
  TrendingDown,
  Minus,
  CheckCircle2,
  Activity,
  UserCheck,
  MessageSquare
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MTSSAcademicStudentContext } from '../../../types';
import { format } from 'date-fns';

interface Props {
  context: MTSSAcademicStudentContext;
  studentName: string;
}

export default function StudentSupportContext({ context, studentName }: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Insight Tags Section */}
      <div className="flex flex-wrap gap-2">
        {context.insightTags.map(tag => (
          <div 
            key={tag}
            className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700">{tag}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Attendance Snapshot */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-6">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Clock size={24} />
            </div>
            <button 
              onClick={() => navigate('/attendance/lateness')}
              className="text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ExternalLink size={18} />
            </button>
          </div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Attendance & Tardy</h3>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-4xl font-black text-slate-900 italic tracking-tighter">{context.attendance?.absentCount || 0}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Absences</span>
          </div>
          <div className="space-y-3">
             <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-500 uppercase tracking-widest">Total Tardy</span>
                <span className={`px-2 py-0.5 rounded ${context.attendance?.thresholdWarning ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                   {context.attendance?.tardyCount || 0} Instances
                </span>
             </div>
             <p className="text-[10px] font-medium text-slate-500 italic">
                {context.attendance?.thresholdWarning 
                  ? "Terdapat pola keterlambatan yang perlu diperhatikan." 
                  : "Kehadiran dalam batas normal."}
             </p>
          </div>
        </div>

        {/* Behavior Snapshot */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex items-center justify-between mb-6">
            <div className={`p-3 rounded-2xl transition-colors ${
              context.behavior?.activeCaseId ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white'
            }`}>
              <ShieldAlert size={24} />
            </div>
            {context.behavior?.activeCaseId && (
              <button 
                onClick={() => navigate(`/mtss/cases/${context.behavior?.activeCaseId}`)}
                className="text-slate-400 hover:text-indigo-600 transition-colors"
              >
                <ExternalLink size={18} />
              </button>
            )}
          </div>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Behavior Support</h3>
          <div className="mb-4">
            {context.behavior?.activeCaseId ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600 italic tracking-tighter uppercase">{context.behavior.currentTier}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Case</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 size={18} />
                <span className="text-[10px] font-black uppercase tracking-widest">No Active Concern</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400">
              <span>CICO Tracker</span>
              <span className={context.behavior?.cicoActive ? 'text-amber-600' : 'text-slate-300'}>
                {context.behavior?.cicoActive ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            {context.behavior?.recentConcern && (
              <p className="text-[10px] font-medium text-slate-500 line-clamp-2 italic">
                "{context.behavior.recentConcern}"
              </p>
            )}
          </div>
        </div>

        {/* Assessment Snapshot */}
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-shadow group col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="p-3 bg-violet-50 text-violet-600 rounded-2xl group-hover:bg-violet-600 group-hover:text-white transition-colors">
              <TrendingUp size={24} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Academic Evidence Trend</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {context.assessments && context.assessments.length > 0 ? (
              context.assessments.map(asmt => (
                <div key={asmt.domain} className="space-y-4">
                   <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{asmt.domain}</h4>
                      <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                        asmt.trend === 'up' ? 'bg-emerald-50 text-emerald-600' :
                        asmt.trend === 'down' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-500'
                      }`}>
                         {asmt.trend === 'up' ? <TrendingUp size={10} className="inline mr-1" /> :
                          asmt.trend === 'down' ? <TrendingDown size={10} className="inline mr-1" /> :
                          <Minus size={10} className="inline mr-1" />}
                         {asmt.trend}
                      </div>
                   </div>
                   <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-1">
                         <span className="text-2xl font-black text-slate-900 italic tracking-tighter">
                            {asmt.recentScores[0]?.score.toFixed(0) || '-'}
                         </span>
                         <span className="text-[10px] font-black text-slate-400 uppercase">/ 100</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${
                        asmt.masteryLevel === 'HIGH' ? 'text-emerald-500' :
                        asmt.masteryLevel === 'MEDIUM' ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                         Mastery: {asmt.masteryLevel}
                      </span>
                   </div>
                   <div className="flex items-end gap-1 h-8">
                      {asmt.recentScores.slice().reverse().map((s, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-slate-100 rounded-sm relative group/bar"
                          style={{ height: `${s.score}%` }}
                        >
                           <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover/bar:block bg-slate-900 text-white text-[8px] font-bold px-1 rounded whitespace-nowrap z-10">
                              {s.score.toFixed(0)} ({format(s.date, 'MMM d')})
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">No assessment data links found for active domains.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rapor & Comment Snapshot */}
      <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-12 text-indigo-50 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <FileText size={160} />
         </div>
         <div className="relative z-10 flex flex-col md:flex-row gap-8">
            <div className="md:w-1/3">
               <div className="flex items-center gap-4 mb-6">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                     <Activity size={24} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Rapor Narrative Context</h3>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">{context.rapor?.period}</p>
                  </div>
               </div>
               <div className="space-y-4">
                  <div className={`p-4 rounded-2xl border ${context.rapor?.consistentWithMTSS ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                     <div className="flex items-center gap-2 mb-1">
                        {context.rapor?.consistentWithMTSS ? <AlertCircle size={14} className="text-amber-600" /> : <UserCheck size={14} className="text-emerald-600" />}
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Consistency Indicator</span>
                     </div>
                     <p className="text-[10px] font-medium text-slate-600">
                        {context.rapor?.consistentWithMTSS 
                          ? "Komentar rapor terakhir selaras dengan focus area intervensi MTSS."
                          : "Catatan rapor tidak menunjukkan concern akademik mendesak."}
                     </p>
                  </div>
                  <button className="w-full py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-100">
                     View Full Report Card <ExternalLink size={14} />
                  </button>
               </div>
            </div>
            <div className="flex-1">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <MessageSquare size={14} /> General Comments & Insights
               </h4>
               <div className="bg-slate-50/50 p-6 rounded-[32px] border border-slate-100/50 min-h-[140px] flex items-center justify-center relative">
                  <div className="absolute top-4 left-4 text-slate-200">
                     <MessageSquare size={40} className="fill-current opacity-20" />
                  </div>
                  <p className="text-sm font-medium text-slate-600 leading-relaxed italic text-center px-10">
                     "{context.rapor?.lastNarrative || 'No recent narrative found for this student.'}"
                  </p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
