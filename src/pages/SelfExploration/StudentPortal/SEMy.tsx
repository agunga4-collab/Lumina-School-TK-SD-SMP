import * as React from 'react';
import { 
  Sparkles, Calendar, ChevronRight, Clock, 
  CheckCircle2, AlertCircle, PlayCircle, ClipboardList,
  Target, Info, Plus
} from 'lucide-react';
import { 
  getSEPeriods, getSEEnrollment, getSEActivities, 
  saveSEEnrollment, db 
} from '../../../lib/firebase';
import { SEPeriod, SEEnrollment, SEChoice, Student } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export default function SEMy() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activePeriod, setActivePeriod] = React.useState<SEPeriod | null>(null);
  const [enrollment, setEnrollment] = React.useState<SEEnrollment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [studentData, setStudentData] = React.useState<Student | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!profile?.email) return;

    // Get Active Period
    const periods = await getSEPeriods('JUNIOR_HIGH');
    const active = periods.find(p => p.isActive);
    setActivePeriod(active || null);

    // Get Student Profile to get NIS and Class
    const sSnap = await getDocs(query(collection(db, 'students'), where('email', '==', profile.email), limit(1)));
    if (!sSnap.empty) {
      const s = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() } as Student;
      setStudentData(s);
      
      if (active) {
        const enroll = await getSEEnrollment(active.id, s.id);
        setEnrollment(enroll);
      }
    }
    setLoading(false);
  }, [profile?.email]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Clock className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center space-y-4">
         <div className="w-16 h-16 bg-white rounded-3xl shadow-lg flex items-center justify-center mx-auto text-gray-400">
            <AlertCircle size={32} />
         </div>
         <h2 className="text-xl font-black text-gray-900 uppercase italic">Tidak Ada Periode Aktif</h2>
         <p className="text-gray-500 font-medium">Belum ada periode Self-Exploration yang dibuka oleh admin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Active Period Banner */}
      <div className="relative p-10 bg-blue-600 rounded-[3.5rem] overflow-hidden text-white shadow-2xl shadow-blue-200">
         <div className="absolute top-0 right-0 p-12 opacity-10">
            <Sparkles size={120} />
         </div>
         <div className="relative z-10 space-y-6">
            <div>
               <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                  <Calendar size={14} /> Periode Aktif • Junior High
               </div>
               <h1 className="text-4xl font-black italic uppercase tracking-tight mt-2">{activePeriod.label}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-8 pt-6 border-t border-white/10 uppercase font-black text-[10px] tracking-widest">
               <div className="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md">
                   <Clock size={16} /> Total: {activePeriod.totalSessions} Sesi
               </div>
               <div className="flex items-center gap-3">
                   Deadline Rencana: {new Date(activePeriod.planningDeadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}
               </div>
            </div>
         </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between px-6">
               <h2 className="text-lg font-black text-gray-900 uppercase italic">Kegiatan Saya</h2>
               {enrollment && (
                 <span className={cn(
                   "px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg",
                   enrollment.status === 'APPROVED' ? "bg-emerald-500 text-white" : 
                   enrollment.status === 'SUBMITTED' ? "bg-blue-600 text-white" :
                   "bg-gray-100 text-gray-400"
                 )}>
                   {enrollment.status.replace('_', ' ')}
                 </span>
               )}
            </div>

            {!enrollment ? (
              <div className="group relative bg-white p-12 rounded-[3.5rem] border-2 border-dashed border-gray-200 hover:border-blue-600 hover:bg-blue-50/20 transition-all text-center space-y-6 cursor-pointer"
                   onClick={() => navigate(`/self-exploration/my/${activePeriod.id}/plan`)}>
                 <div className="w-20 h-20 bg-blue-600 text-white rounded-3xl shadow-2xl flex items-center justify-center mx-auto transition-transform group-hover:scale-110">
                    <Plus size={40} />
                 </div>
                 <div>
                    <h3 className="text-xl font-black text-gray-900 uppercase italic">Mulai Rencana SE</h3>
                    <p className="text-gray-500 text-sm mt-1">Kamu belum mengisi rencana kegiatan untuk periode ini.</p>
                 </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {enrollment.choices.map(choice => (
                   <SECard 
                      key={choice.slot} 
                      choice={choice} 
                      enrollment={enrollment} 
                      activePeriod={activePeriod}
                      onClick={() => navigate(`/self-exploration/my/${activePeriod.id}/details/${choice.slot}`)} 
                   />
                 ))}
              </div>
            )}
         </div>

         <div className="lg:col-span-4 space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-gray-100 space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                     <AlertCircle size={20} />
                  </div>
                  <h3 className="font-black uppercase italic text-sm">Penting! Aturan Strand</h3>
               </div>
               
               <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Grade 7 & 8</p>
                     <p className="text-xs font-bold text-gray-700 leading-relaxed">Pilih 2 strand BERBEDA dalam 1 periode.</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Grade 9</p>
                     <p className="text-xs font-bold text-gray-700 leading-relaxed">Pilih 1 strand per periode. Periode 2 wajib strand berbeda dari Periode 1.</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                     <p className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-1">Dilarang!</p>
                     <p className="text-[10px] font-medium text-red-500 leading-relaxed italic">
                        Diamond Painting, Lego with Guide, Puzzles, Tennis Lapangan, Minecraft, dll.
                     </p>
                  </div>
               </div>
            </div>

            <div className="bg-gray-900 p-8 rounded-[3rem] shadow-2xl text-white space-y-6">
               <div className="flex items-center gap-3">
                  <ClipboardList size={20} />
                  <h3 className="font-black uppercase italic text-sm">Panduan Tahapan</h3>
               </div>
               <div className="space-y-6 relative ml-3">
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-white/20" />
                  <Step icon={<Plus size={12} />} label="Step 1" text="Pengisian Rencana" active={!enrollment || enrollment.status === 'PLANNING'} />
                  <Step icon={<Target size={12} />} label="Step 2" text="Persetujuan Homeroom" active={enrollment?.status === 'SUBMITTED'} />
                  <Step icon={<PlayCircle size={12} />} label="Step 3" text="Pelaksanaan & Log Sesi" active={enrollment?.status === 'APPROVED' || enrollment?.status === 'IN_PROGRESS'} />
                  <Step icon={<CheckCircle2 size={12} />} label="Step 4" text="Self-Assessment" active={enrollment?.status === 'SELF_ASSESSED'} />
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function SECard({ choice, enrollment, activePeriod, onClick }: { 
  choice: SEChoice, 
  enrollment: SEEnrollment, 
  activePeriod: SEPeriod,
  onClick: () => void,
  key?: React.Key
}) {
  const statusStyles: Record<string, string> = {
    'PLANNING': 'border-gray-200 text-gray-400',
    'SUBMITTED': 'border-blue-100 bg-blue-50/30 text-blue-600',
    'APPROVED': 'border-emerald-100 bg-emerald-50/30 text-emerald-600',
    'REVISION_NEEDED': 'border-red-100 bg-red-50/30 text-red-600',
    'IN_PROGRESS': 'border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-100',
    'SELF_ASSESSED': 'border-purple-100 bg-purple-50/30 text-purple-600',
    'COMPLETED': 'border-emerald-600 bg-emerald-600 text-white'
  };

  const strandIcon: Record<string, any> = {
    'Imaginal': <Sparkles size={16} />,
    'Rational': <Info size={16} />,
    'Physical': <Target size={16} />
  };

  const isLight = !['IN_PROGRESS', 'COMPLETED'].includes(enrollment.status);

  return (
    <button 
      onClick={onClick}
      className={cn(
        "relative p-8 rounded-[3rem] border-2 text-left transition-all hover:scale-[1.02] active:scale-95 group",
        statusStyles[choice.approvalStatus === 'REVISION_NEEDED' ? 'REVISION_NEEDED' : enrollment.status] || 'border-gray-50'
      )}
    >
       <div className="space-y-6">
          <div className="flex items-center justify-between">
             <div className={cn(
               "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2",
               isLight ? "bg-gray-100 text-gray-500" : "bg-white/20 text-white"
             )}>
                {strandIcon[choice.strand]} {choice.strand}
             </div>
             <ChevronRight size={20} className={cn(isLight ? "text-gray-300" : "text-white/50")} />
          </div>

          <div>
             <p className={cn("text-[10px] font-black uppercase tracking-widest", isLight ? "text-gray-400" : "text-white/60")}>Slot {choice.slot}</p>
             <h3 className="text-xl font-black italic uppercase leading-tight mt-1">{choice.activityName}</h3>
          </div>

          <div className="space-y-4 pt-4 border-t border-current/10">
             <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span>Progres Sesi</span>
                <span>0/{activePeriod.totalSessions}</span>
             </div>
             <div className={cn("h-2.5 rounded-full overflow-hidden", isLight ? "bg-gray-100" : "bg-white/20")}>
                <div className={cn("h-full transition-all duration-1000", isLight ? "bg-blue-600" : "bg-white")} style={{ width: '0%' }} />
             </div>
          </div>

          {choice.approvalStatus === 'REVISION_NEEDED' && (
            <div className="absolute inset-0 bg-red-500/90 backdrop-blur-sm rounded-[3rem] flex flex-col items-center justify-center p-8 text-center text-white scale-0 group-hover:scale-100 transition-transform">
               <AlertCircle size={40} className="mb-4" />
               <p className="text-xs font-black uppercase tracking-widest">Perlu Revisi</p>
               <p className="text-[10px] font-medium mt-2 leading-relaxed opacity-90 line-clamp-3">{choice.approvalNote}</p>
            </div>
          )}
       </div>
    </button>
  );
}

function Step({ icon, label, text, active }: { icon: React.ReactNode, label: string, text: string, active: boolean }) {
  return (
    <div className={cn(
      "relative pl-8 space-y-1 transition-opacity",
      active ? "opacity-100" : "opacity-40"
    )}>
       <div className={cn(
         "absolute -left-[18px] top-0 w-9 h-9 rounded-full flex items-center justify-center border-2 border-gray-900 bg-gray-900 transition-all",
         active ? "bg-blue-500 border-blue-500 scale-110 shadow-lg shadow-blue-500/20" : ""
       )}>
          {active ? icon : <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />}
       </div>
       <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
       <p className="text-[10px] font-black uppercase tracking-widest">{text}</p>
    </div>
  );
}
