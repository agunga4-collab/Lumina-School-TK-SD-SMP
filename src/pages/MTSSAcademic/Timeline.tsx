import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Users, 
  BarChart3,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  History,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getMTSSAcademicTimeline, initializeMTSSAcademicTimeline, updateMTSSAcademicPhase } from '../../lib/firebase';
import { MTSSAcademicTimelinePhase } from '../../types';
import { format, isWithinInterval } from 'date-fns';

export default function Timeline() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { filters, setFilters } = useOutletContext<{ filters: any, setFilters: any }>();
  const [phases, setPhases] = useState<MTSSAcademicTimelinePhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(false);

  const { academicYear, semester } = filters;

  const canManage = profile ? ['SUPER_ADMIN', 'HEAD_UNIT', 'HEAD_JUNIOR', 'MTSS_ACADEMIC_PJ'].includes(profile.role) : false;

  useEffect(() => {
    fetchData();
  }, [academicYear, semester]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getMTSSAcademicTimeline('JUNIOR_HIGH', academicYear, semester);
      setPhases(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitialize = async () => {
    if (!canManage) return;
    setInitializing(true);
    try {
      await initializeMTSSAcademicTimeline('JUNIOR_HIGH', academicYear, semester);
      await fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setInitializing(false);
    }
  };

  const now = Date.now();

  return (
    <div className="space-y-8">
      {/* Header Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 font-medium">Shared timeline for Junior High • Semester {semester} • {academicYear}</span>
           </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
           <button 
             onClick={() => setFilters({ ...filters, semester: semester === '1' ? '2' : '1' })}
             className="px-4 py-2 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-600 transition-all flex items-center gap-2"
           >
              Semester {semester}
              <ChevronRight size={16} />
           </button>
           {canManage && (
             <>
                <div className="w-px h-6 bg-slate-200 mx-1" />
                <button 
                  onClick={() => {}} 
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all"
                >
                    Adjust Phases
                </button>
             </>
           )}
        </div>
      </div>

      {/* Header removed and replaced by parent layout */}

      {loading ? (
        <div className="p-20 text-center">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading roadmap...</p>
        </div>
      ) : phases.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
            <div className="p-6 bg-slate-50 rounded-3xl mb-6">
              <Calendar size={64} className="text-slate-200" />
            </div>
            
            {canManage ? (
              <>
                <h3 className="text-xl font-black text-slate-900 mb-2">Belum ada timeline MTSS Academic untuk semester ini.</h3>
                <p className="text-slate-500 max-w-sm font-medium">Inisialisasi siklus standar untuk mulai melacak screening, peluncuran, dan tinjauan program.</p>
                <button 
                  onClick={handleInitialize}
                  disabled={initializing}
                  className="mt-8 px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-200 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                    {initializing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Plus size={20} />
                    )}
                    Initialize Standard Cycle
                </button>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black text-slate-900 mb-2">Timeline MTSS Academic semester ini belum diinisialisasi oleh PIC MTSS.</h3>
                <p className="text-slate-500 max-w-sm font-medium leading-relaxed">Silakan hubungi Koordinator MTSS Academic atau Wakil Kepala Sekolah untuk informasi lebih lanjut mengenai jadwal program.</p>
                <div className="mt-8 flex items-center gap-2 text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest">
                  <AlertCircle size={16} />
                  Awaiting Inisialization
                </div>
              </>
            )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3">
             <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                <AlertCircle size={18} />
             </div>
             <div>
                <p className="text-sm font-bold text-amber-900">Program Wide Timeline</p>
                <p className="text-xs font-medium text-amber-700/80">
                  Timeline ini ditetapkan bersama untuk seluruh Junior High. Jika ada perubahan fase yang diperlukan, silakan hubungi PIC MTSS Academic.
                </p>
             </div>
          </div>

          <div className="relative space-y-12 pb-20">
            {/* Vertical Progress Line */}
            <div className="absolute left-6 md:left-1/2 top-4 bottom-4 w-1 bg-gradient-to-b from-indigo-500 via-indigo-100 to-transparent -translate-x-1/2 rounded-full hidden md:block opacity-30" />
            
            {phases.map((phase, idx) => {
              const isCurrent = isWithinInterval(now, { start: phase.startDate, end: phase.endDate });
              const isPast = now > phase.endDate;
              const isLeft = idx % 2 === 0;
  
              return (
                <div key={phase.id}>
                  <TimelinePhaseCard 
                    phase={phase} 
                    isLeft={isLeft} 
                    isCurrent={isCurrent} 
                    isPast={isPast} 
                    canManage={canManage}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Program Summary Context */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-12 border-t border-slate-100">
         <div className="bg-indigo-900 p-8 rounded-[40px] text-white overflow-hidden relative group">
            <div className="absolute bottom-0 right-0 p-8 text-white opacity-20 transform translate-x-4 translate-y-4 group-hover:scale-110 transition-transform duration-700">
               <ShieldCheck size={160} />
            </div>
            <h3 className="text-xl font-black mb-4 flex items-center gap-3">
               <div className="p-2 bg-white/20 rounded-2xl">
                 <Sparkles size={20} />
               </div>
               Quarterly Goal
            </h3>
            <p className="text-indigo-100 leading-relaxed mb-8 max-w-md font-medium">
               "Our MTSS Cycle ensures no student slips through the cracks. For Q1, we target 95% completion of initial screening by Week 4."
            </p>
            <div className="flex items-center gap-6">
               <div>
                  <p className="text-2xl font-black">24%</p>
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Global Progress</p>
               </div>
               <div className="w-px h-8 bg-white/20" />
               <div>
                  <p className="text-2xl font-black">12</p>
                  <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Active Cases</p>
               </div>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
               <h3 className="text-xl font-black text-slate-800 mb-2">School-wide Reports</h3>
               <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                  Generate aggregate reports to analyze program effectiveness and resource allocation across grades.
               </p>
            </div>
            <div className="space-y-3">
               <button className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-3xl transition-all group">
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-3">
                     <TrendingUp className="text-emerald-500" size={18} /> Cycle Success Analytics
                  </span>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-indigo-600 transition-all" />
               </button>
               <button className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-3xl transition-all group">
                  <span className="text-sm font-bold text-slate-600 flex items-center gap-3">
                     <Users className="text-indigo-500" size={18} /> Teacher Involvement PDF
                  </span>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-slate-600 transition-all" />
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}

function TimelinePhaseCard({ phase, isLeft, isCurrent, isPast, canManage }: { phase: MTSSAcademicTimelinePhase; isLeft: boolean; isCurrent: boolean; isPast: boolean; canManage: boolean }) {
  return (
    <div className={`flex flex-col md:flex-row items-center justify-center gap-8 ${isLeft ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
      {/* Content Section */}
      <motion.div 
        initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className={`w-full md:w-[42%] lg:w-[38%] ${isLeft ? 'md:text-right' : 'md:text-left'}`}
      >
        <div className={`bg-white p-6 md:p-8 rounded-[32px] border ${isCurrent ? 'border-indigo-400 shadow-xl shadow-indigo-100 ring-8 ring-indigo-50' : 'border-slate-100 shadow-sm'} relative group hover:scale-[1.02] transition-all duration-300`}>
          <div className="flex items-center gap-3 mb-4 md:mb-2 justify-start md:justify-start lg:justify-start flex-wrap">
             {isCurrent && (
               <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse">
                  Active Phase
               </span>
             )}
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                {phase.ownerRole}
             </span>
             {canManage && (
                <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline ml-auto">
                   Edit Phase
                </button>
             )}
          </div>
          <h4 className={`text-xl font-black mb-2 ${isCurrent ? 'text-indigo-600' : 'text-slate-900 group-hover:text-indigo-600 transition-colors'}`}>
            {phase.title}
          </h4>
          <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">
            {phase.description}
          </p>

          <div className={`bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-1 gap-2 ${isLeft ? 'md:items-end' : 'md:items-start'}`}>
             <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2 w-full">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">Key Actions:</p>
                {canManage && (
                  <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Manage</button>
                )}
             </div>
             <div className="space-y-1 w-full text-left">
                {phase.checklistItems.map((item, idx) => (
                   <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-indigo-400' : 'bg-slate-300'}`} />
                      {item}
                   </div>
                ))}
             </div>
          </div>
          
          {canManage && isCurrent && (
            <button 
              className="w-full mt-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg shadow-slate-200"
            >
              Mark Phase Complete
            </button>
          )}
        </div>
      </motion.div>

      {/* Central Indicator */}
      <div className={`relative hidden md:flex items-center justify-center z-20`}>
         <div className={`w-16 h-16 rounded-full border-8 border-slate-50 shadow-lg flex items-center justify-center transition-all duration-500 ${
           isPast ? 'bg-emerald-500 scale-90' : isCurrent ? 'bg-indigo-600 scale-110 ring-8 ring-indigo-100' : 'bg-slate-200'
         }`}>
            {isPast ? <CheckCircle2 size={24} className="text-white" /> : 
             isCurrent ? <Clock size={24} className="text-white animate-spin-slow" /> : 
             <div className="w-3 h-3 bg-slate-400 rounded-full" />}
         </div>
         {isCurrent && (
           <div className="absolute -top-10 whitespace-nowrap bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-200 animate-bounce">
              We are here
           </div>
         )}
      </div>

      {/* Spacer/Date Section for Opposite Side */}
      <div className={`hidden md:block w-[42%] lg:w-[38%] ${isLeft ? 'text-left' : 'text-right'}`}>
         <div className="inline-block p-4 bg-white/40 backdrop-blur-sm rounded-3xl border border-white/50">
           <p className="text-2xl font-black text-slate-400 opacity-60 leading-none">
             {format(phase.startDate, 'MMM')}
           </p>
           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
             {format(phase.startDate, 'dd')} - {format(phase.endDate, 'dd')}
           </p>
         </div>
      </div>
    </div>
  );
}
