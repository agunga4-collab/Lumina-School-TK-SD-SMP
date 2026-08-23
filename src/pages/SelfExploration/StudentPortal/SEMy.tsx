import * as React from 'react';
import { 
  Sparkles, Calendar, ChevronRight, Clock, 
  CheckCircle2, AlertCircle, PlayCircle, ClipboardList,
  Target, Info, Plus, UploadCloud, Trash2, FileText, 
  Eye, Loader2, ArrowRight
} from 'lucide-react';
import { 
  getSEPeriods, getSEEnrollment, getSEActivities, 
  saveSEEnrollment, db, getSEMonthlyReflection, saveSEMonthlyReflection,
  getActiveSEReflectionCycle, resolveStudentGrade
} from '../../../lib/firebase';
import { SEPeriod, SEEnrollment, SEChoice, Student, SEStrand, SEMonthlyReflection, SEMonthlyReflectionSlot, SEReflectionCycle } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import MonthlyReflectionModal from '../../../components/MonthlyReflectionModal';
import { cn } from '../../../lib/utils';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

export function getCurrentPeriodKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getPeriodLabel(key: string) {
  const [year, month] = key.split('-');
  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const idx = parseInt(month, 10) - 1;
  return `${monthNames[idx]} ${year}`;
}

const STRANDS_CONFIG: { id: SEStrand; label: string; color: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'Imaginal', label: 'Imaginal', color: 'bg-pink-100 text-pink-600 border-pink-200', icon: <Sparkles size={24} />, desc: 'Imagination & Creativity' },
  { id: 'Rational', label: 'Rational', color: 'bg-blue-100 text-blue-600 border-blue-200', icon: <BrainIcon size={24} />, desc: 'Cognitive Flexibility' },
  { id: 'Physical', label: 'Material/Physical', color: 'bg-amber-100 text-amber-600 border-amber-200', icon: <DumbbellIcon size={24} />, desc: 'Physical fitness & practical skills' }
];

function BrainIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
      <path d="M12 6v12"/>
      <path d="M8 10c0-2.21 1.79-4 4-4"/>
      <path d="M12 18c2.21 0 4-1.79 4-4"/>
    </svg>
  );
}

function DumbbellIcon(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || 24} height={props.size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6.5 6.5h11"/>
      <path d="M18.5 9v6a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 15V9A1.5 1.5 0 0 1 7 7.5h10a1.5 1.5 0 0 1 1.5 1.5z"/>
      <path d="M2 12h3.5"/>
      <path d="M18.5 12H22"/>
    </svg>
  );
}

export default function SEMy() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activePeriod, setActivePeriod] = React.useState<SEPeriod | null>(null);
  const [enrollment, setEnrollment] = React.useState<SEEnrollment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [studentData, setStudentData] = React.useState<Student | null>(null);
  const [activities, setActivities] = React.useState<any[]>([]);
  
  // Modal Editor state
  const [selectedSlot, setSelectedSlot] = React.useState<number | null>(null);

  // Reflection state
  const [showReflectionModal, setShowReflectionModal] = React.useState(false);
  const [monthlyReflection, setMonthlyReflection] = React.useState<SEMonthlyReflection | null>(null);
  const [activeCycle, setActiveCycle] = React.useState<SEReflectionCycle | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!profile?.email) return;

    try {
      // Get Active Period
      const periods = await getSEPeriods('JUNIOR_HIGH');
      const active = periods.find(p => p.isActive);
      setActivePeriod(active || null);

      // Get Student Profile
      const sSnap = await getDocs(query(collection(db, 'students'), where('email', '==', profile.email), limit(1)));
      if (!sSnap.empty) {
        const s = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() } as Student;
        
        if (active) {
          const res = await resolveStudentGrade(s.id, s, active.academicYear, active.id);
          if (res.finalNormalizedGrade !== null) {
            s.grade = res.finalNormalizedGrade as 7 | 8 | 9;
          }
        }
        
        setStudentData(s);
        
        if (active) {
          const enroll = await getSEEnrollment(active.id, s.id);
          setEnrollment(enroll);

          // Fetch Active Configured Cycle
          const cycle = await getActiveSEReflectionCycle(active.id, active.academicYear, active.semester, s.id, s);
          setActiveCycle(cycle);

          if (cycle) {
            // Fetch Monthly Reflection using activeCycle's ID
            const refl = await getSEMonthlyReflection(s.id, active.academicYear, active.semester, cycle.id!, true);
            setMonthlyReflection(refl);
          } else {
            setMonthlyReflection(null);
          }
        }
      }

      // Fetch official SE activities
      const acts = await getSEActivities('JUNIOR_HIGH');
      setActivities(acts || []);
    } catch (err) {
      console.error("Error fetching SE data:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.email]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        <p className="text-sm font-semibold text-gray-500">Memuat data pilihan Self Exploration...</p>
      </div>
    );
  }

  if (!activePeriod) {
    return (
      <div className="p-20 bg-gray-50 rounded-[3rem] border border-gray-200 text-center space-y-4 max-w-2xl mx-auto mt-10">
         <div className="w-16 h-16 bg-white rounded-3xl shadow-lg flex items-center justify-center mx-auto text-gray-400">
            <AlertCircle size={32} />
         </div>
         <h2 className="text-xl font-black text-gray-900 uppercase italic">Tidak Ada Periode Aktif</h2>
         <p className="text-gray-500 font-medium">Belum ada periode Self-Exploration yang dibuka oleh admin.</p>
      </div>
    );
  }

  const isGrade9 = studentData?.grade === 9;
  const numSlots = activeCycle 
    ? (activeCycle.requiredSlotsByGrade[studentData?.grade as 7 | 8 | 9]?.length || (isGrade9 ? 1 : 2))
    : (isGrade9 ? 1 : 2);

  // Helper to determine if a choice is missing for a slot
  const isChoiceMissing = (slotNum: 1 | 2) => {
    if (!enrollment || !enrollment.choices) return true;
    const choice = enrollment.choices.find(c => c.slot === slotNum);
    return !choice || !choice.strand || !choice.activityName;
  };

  const getReflectionStatusInfo = () => {
    const missing1 = isChoiceMissing(1);
    const missing2 = numSlots === 2 ? isChoiceMissing(2) : false;
    const isMissing = missing1 || missing2;

    if (isMissing) {
      return {
        status: 'NOT_AVAILABLE' as const,
        label: 'Belum Dapat Diisi',
        bgColor: 'bg-red-50 text-red-600 border-red-200',
        icon: <AlertCircle size={14} />
      };
    }

    if (!monthlyReflection) {
      return {
        status: 'NOT_STARTED' as const,
        label: 'Belum Diisi',
        bgColor: 'bg-amber-50 text-amber-600 border-amber-200',
        icon: <Clock size={14} />
      };
    }

    const status = monthlyReflection.overallStatus;
    const styles: Record<string, { label: string; bgColor: string; icon: React.ReactNode }> = {
      'DRAFT': { label: 'Draft', bgColor: 'bg-gray-50 text-gray-500 border-gray-200', icon: <FileText size={14} /> },
      'SUBMITTED': { label: 'Menunggu Review', bgColor: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Loader2 className="animate-spin" size={14} /> },
      'REVISION_REQUESTED': { label: 'Perlu Revisi', bgColor: 'bg-red-50 text-red-600 border-red-200', icon: <AlertCircle size={14} /> },
      'APPROVED': { label: 'Selesai', bgColor: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <CheckCircle2 size={14} /> }
    };

    return styles[status] || { label: status, bgColor: 'bg-gray-50 text-gray-500 border-gray-200', icon: <FileText size={14} /> };
  };

  // Initialize or mock choices list
  const displayChoices: SEChoice[] = Array.from({ length: numSlots }, (_, i) => {
    const slotNum = (i + 1) as 1 | 2;
    const existing = enrollment?.choices?.find(c => c.slot === slotNum);
    if (existing) return existing;
    return {
      slot: slotNum,
      strand: '' as SEStrand,
      activityId: '',
      activityName: '',
      customActivity: null,
      requiresTemplate: false,
      status: 'DRAFT',
      formAttachments: []
    };
  });

  return (
    <div className="space-y-8 pb-20 max-w-6xl mx-auto px-4 sm:px-6">
      {/* Active Period Banner */}
      <div className="relative p-10 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-[3rem] overflow-hidden text-white shadow-xl">
         <div className="absolute top-0 right-0 p-12 opacity-10">
            <Sparkles size={120} />
         </div>
         <div className="relative z-10 space-y-6">
            <div>
               <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] opacity-80">
                  <Calendar size={14} /> Periode Aktif • Junior High
               </div>
               <h1 className="text-4xl font-black mt-2 leading-none">{activePeriod.label}</h1>
            </div>

            <div className="flex flex-wrap items-center gap-8 pt-6 border-t border-white/15 uppercase font-black text-[10px] tracking-widest">
               <div className="flex items-center gap-3 bg-white/10 px-6 py-3 rounded-2xl backdrop-blur-md">
                   <Clock size={16} /> Total: {activePeriod.totalSessions} Sesi
               </div>
               <div className="flex items-center gap-3">
                   Deadline Pengisian: {new Date(activePeriod.planningDeadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
               </div>
            </div>
         </div>
      </div>

      {/* CTA Card for My Plan (17 Minggu) */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
         <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-100">
               <ClipboardList size={24} />
            </div>
            <div>
               <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-gray-900 uppercase italic">Weekly Target Plan (My Plan 17 Minggu)</h3>
                  <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest rounded-full border border-blue-100">Baru</span>
               </div>
               <p className="text-xs text-gray-500 font-medium mt-0.5">Buat target, scan lembar tulisan fisik via AI, dan kelola target mingguan Anda untuk periode ini.</p>
            </div>
         </div>
         <button 
            onClick={() => navigate(`/self-exploration/my/${activePeriod.id}/plan`)}
            className="w-full md:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 hover:shadow-indigo-200 shrink-0"
         >
            Kelola My Plan <ChevronRight size={14} />
         </button>
      </div>

      {/* Refleksi Self-Exploration Card */}
      <div className={cn(
        "bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6",
        !activeCycle && "opacity-75 bg-gray-50/50"
      )}>
         <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg",
              activeCycle 
                ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-indigo-100" 
                : "bg-gray-200 text-gray-400 shadow-none"
            )}>
               <FileText size={24} />
            </div>
            <div>
               <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-gray-900 uppercase italic">Refleksi Self-Exploration</h3>
                  <span className={cn(
                    "px-2.5 py-1 text-[8px] font-black uppercase tracking-widest rounded-full border flex items-center gap-1", 
                    activeCycle ? getReflectionStatusInfo().bgColor : "bg-gray-100 text-gray-500 border-gray-200"
                  )}>
                     {activeCycle ? getReflectionStatusInfo().icon : <Clock size={10} />}
                     {activeCycle ? getReflectionStatusInfo().label : "Belum Dapat Diisi"}
                  </span>
               </div>
               <p className="text-xs text-gray-500 font-medium mt-0.5">
                  {activeCycle ? (
                    <>
                      {activeCycle.title} • Batas Pengisian: <strong className="text-gray-800">{new Date(activeCycle.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                    </>
                  ) : (
                    <span className="text-red-500 font-bold">Refleksi belum dibuka oleh sekolah.</span>
                  )}
               </p>
            </div>
         </div>
         {activeCycle ? (
           <button 
              onClick={() => setShowReflectionModal(true)}
              className="w-full md:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:shadow-indigo-200 shrink-0"
           >
              Isi Refleksi <ChevronRight size={14} />
           </button>
         ) : (
           <button 
              disabled
              className="w-full md:w-auto px-8 py-3.5 bg-gray-100 text-gray-400 font-black uppercase text-[10px] tracking-widest rounded-xl shrink-0 cursor-not-allowed flex items-center justify-center gap-2"
           >
              Isi Refleksi <ChevronRight size={14} />
           </button>
         )}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
         <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between px-2">
               <h2 className="text-lg font-black text-gray-900 uppercase italic">Pilihan Kegiatan Saya</h2>
               {enrollment && (
                 <span className="px-5 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[9px] font-black uppercase tracking-widest">
                   {enrollment.choices.every(c => c.status === 'APPROVED' || c.approvalStatus === 'APPROVED') ? 'Semua Disetujui' : 'Dalam Proses'}
                 </span>
               )}
            </div>

            {/* Slots Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {displayChoices.map((choice) => {
                 const currentStatus = choice.status || (
                   choice.approvalStatus === 'APPROVED' ? 'APPROVED' :
                   choice.approvalStatus === 'REVISION_NEEDED' ? 'REVISION_REQUIRED' :
                   enrollment?.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT'
                 );

                 return (
                   <div 
                     key={choice.slot}
                     className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6 relative overflow-hidden"
                     id={`se-card-slot-${choice.slot}`}
                   >
                     <div>
                       <div className="flex items-center justify-between mb-4">
                         <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                           Slot {choice.slot}
                         </span>
                         <StatusBadge status={currentStatus} />
                       </div>

                       {choice.strand ? (
                         <div className="space-y-2">
                           <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                             {choice.strand === 'Physical' ? 'Material/Physical' : choice.strand}
                           </div>
                           <h3 className="text-xl font-extrabold text-gray-900 leading-tight">
                             {choice.activityName}
                           </h3>
                           {choice.formAttachments && choice.formAttachments.length > 0 && (
                             <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 mt-2">
                               <CheckCircle2 size={14} /> Bukti Form Terlampir ({choice.formAttachments.length})
                             </p>
                           )}
                         </div>
                       ) : (
                         <div className="space-y-2 py-4">
                           <p className="text-xs text-gray-400 font-bold uppercase italic">Belum memilih kegiatan</p>
                           <p className="text-xs text-gray-400 font-medium">Klik tombol di bawah untuk mengisi pilihan dan mengunggah form.</p>
                         </div>
                       )}
                     </div>

                     <div className="pt-4 border-t border-gray-50 flex items-center gap-2">
                       <button
                         onClick={() => setSelectedSlot(choice.slot)}
                         className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold uppercase text-[9px] tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                         id={`btn-edit-slot-${choice.slot}`}
                       >
                         {choice.strand ? 'Ubah Pilihan' : 'Pilih Kegiatan'}
                         <ArrowRight size={12} />
                       </button>

                       {currentStatus === 'APPROVED' && enrollment && (
                         <button
                           onClick={() => navigate(`/self-exploration/my/${enrollment.id}/details/${choice.slot}`)}
                           className="py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold uppercase text-[9px] tracking-widest rounded-xl transition-all"
                           title="Catat Sesi & Log"
                           id={`btn-log-slot-${choice.slot}`}
                         >
                           Sesi & Log
                         </button>
                       )}
                     </div>
                   </div>
                 );
               })}
            </div>
         </div>

         {/* Sidebar with guidelines */}
         <div className="lg:col-span-4 space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                     <AlertCircle size={20} />
                  </div>
                  <h3 className="font-black uppercase italic text-sm">Mohon Perhatikan Info Berikut:</h3>
               </div>
               
               <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Grade 7 & 8</p>
                     <p className="text-xs font-bold text-gray-700 leading-relaxed">Wajib memilih 2 strand BERBEDA dalam 1 periode.</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl space-y-2">
                     <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Grade 9</p>
                     <p className="text-xs font-bold text-gray-700 leading-relaxed">Pilih 1 strand per periode.</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                     <p className="text-[10px] font-black uppercase text-red-600 tracking-widest mb-1">Mohon Tidak Memilih SE Berikut:</p>
                     <p className="text-[10px] font-medium text-red-500 leading-relaxed italic">
                        Diamond Painting, Lego with Guide, Puzzles, Tennis Lapangan, Minecraft, dll.
                     </p>
                  </div>
               </div>
            </div>

            <div className="bg-gray-900 p-8 rounded-[2.5rem] text-white space-y-6">
               <div className="flex items-center gap-3">
                  <ClipboardList size={20} />
                  <h3 className="font-black uppercase italic text-sm">Panduan Alur</h3>
               </div>
               <div className="space-y-4 relative ml-3 border-l border-white/10 pl-5">
                  <div className="relative space-y-0.5">
                    <p className="text-[9px] font-black uppercase text-blue-400">Langkah 1</p>
                    <p className="text-xs font-bold">Pilih strand & aktivitas, lalu unggah foto form pemilihan fisik (PDF/JPG).</p>
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="text-[9px] font-black uppercase text-blue-400">Langkah 2</p>
                    <p className="text-xs font-bold">Kirim untuk verifikasi. Tunggu hingga disetujui guru pembimbing.</p>
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="text-[9px] font-black uppercase text-blue-400">Langkah 3</p>
                    <p className="text-xs font-bold">Setelah disetujui, tombol "Sesi & Log" akan aktif untuk mengisi jurnal mingguan.</p>
                  </div>
               </div>
            </div>
         </div>
      </div>

      {/* Slide-over or Dialog Modal for Slot Editor */}
      <AnimatePresence>
        {selectedSlot !== null && (
          <SlotEditorModal 
            slot={selectedSlot}
            studentData={studentData}
            activePeriod={activePeriod}
            enrollment={enrollment}
            activities={activities}
            onClose={() => {
              setSelectedSlot(null);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>

      {/* Slide-over or Dialog Modal for Monthly Reflection */}
      <AnimatePresence>
        {showReflectionModal && studentData && activePeriod && (
          <MonthlyReflectionModal
            studentData={studentData}
            activePeriod={activePeriod}
            enrollment={enrollment}
            monthlyReflection={monthlyReflection}
            activeCycle={activeCycle}
            onClose={() => {
              setShowReflectionModal(false);
              fetchData();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    'DRAFT': 'bg-gray-50 text-gray-500 border-gray-200',
    'SUBMITTED': 'bg-blue-50 text-blue-600 border-blue-200',
    'APPROVED': 'bg-emerald-50 text-emerald-600 border-emerald-200',
    'REVISION_REQUIRED': 'bg-red-50 text-red-600 border-red-200',
    'CHANGE_REQUESTED': 'bg-amber-50 text-amber-600 border-amber-200'
  };

  const label: Record<string, string> = {
    'DRAFT': 'Draft',
    'SUBMITTED': 'Menunggu Verifikasi',
    'APPROVED': 'Disetujui',
    'REVISION_REQUIRED': 'Perlu Revisi',
    'CHANGE_REQUESTED': 'Ajukan Perubahan'
  };

  return (
    <span className={cn(
      "px-3 py-1 text-[8px] font-black uppercase tracking-widest border rounded-full",
      styles[status] || styles['DRAFT']
    )}>
      {label[status] || status}
    </span>
  );
}

interface SlotEditorModalProps {
  slot: number;
  studentData: Student | null;
  activePeriod: SEPeriod;
  enrollment: SEEnrollment | null;
  activities: any[];
  onClose: () => void;
}

function SlotEditorModal({ slot, studentData, activePeriod, enrollment, activities, onClose }: SlotEditorModalProps) {
  const { profile } = useAuth();
  const [strand, setStrand] = React.useState<SEStrand | ''>('');
  const [activityId, setActivityId] = React.useState<string>('');
  const [customActivity, setCustomActivity] = React.useState<string>('');
  const [attachments, setAttachments] = React.useState<any[]>([]);
  const [status, setStatus] = React.useState<string>('DRAFT');
  const [revisionNote, setRevisionNote] = React.useState<string>('');
  
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Load existing slot choices
  React.useEffect(() => {
    if (enrollment) {
      const choice = enrollment.choices?.find(c => c.slot === slot);
      if (choice) {
        setStrand(choice.strand || '');
        setActivityId(choice.activityId || '');
        setCustomActivity(choice.customActivity || '');
        setAttachments(choice.formAttachments || []);
        setRevisionNote(choice.revisionNote || choice.approvalNote || '');
        setStatus(choice.status || (
          choice.approvalStatus === 'APPROVED' ? 'APPROVED' :
          choice.approvalStatus === 'REVISION_NEEDED' ? 'REVISION_REQUIRED' :
          enrollment.status === 'SUBMITTED' ? 'SUBMITTED' : 'DRAFT'
        ));
      }
    }
  }, [enrollment, slot]);

  // Handle strand selection change
  const handleStrandChange = (selected: SEStrand) => {
    setStrand(selected);
    setActivityId(''); // reset activity selection
    setCustomActivity('');
  };

  // Filter activities matching the selected strand
  const filteredActivities = React.useMemo(() => {
    if (!strand) return [];
    return activities.filter(act => act.strand === strand && act.isActive);
  }, [activities, strand]);

  // Selected activity object
  const selectedActivityObj = React.useMemo(() => {
    return filteredActivities.find(a => a.id === activityId);
  }, [filteredActivities, activityId]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // File Upload Logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!studentData) return;

    if (attachments.length + files.length > 3) {
      alert("Maksimal 3 file bukti yang dapat diunggah per slot.");
      return;
    }

    setUploading(true);
    const newAttachments = [...attachments];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Size check (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert(`File "${file.name}" melebihi batas ukuran 5MB.`);
          continue;
        }

        // MIME check
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          alert(`Format file "${file.name}" tidak didukung. Harap unggah format JPG, PNG, atau PDF.`);
          continue;
        }

        const fileId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        const base64 = await fileToBase64(file);

        // Upload to server-side endpoint (Google Drive)
        const uploadRes = await fetch("/api/self-exploration/upload-attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64File: base64,
            fileName: `${studentData.id}_slot${slot}_${fileId}_${file.name}`,
            mimeType: file.type
          })
        });

        if (!uploadRes.ok) {
          throw new Error("Server gagal mengunggah file ke Google Drive.");
        }

        const uploadData = await uploadRes.json();
        if (!uploadData.success) {
          throw new Error(uploadData.error || "Gagal mengunggah.");
        }

        newAttachments.push({
          id: fileId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          driveFileId: uploadData.driveFileId,
          downloadUrl: uploadData.downloadUrl,
          uploadedAt: Date.now(),
          uploadedByUid: profile?.uid || 'student'
        });
      }

      setAttachments(newAttachments);
    } catch (err: any) {
      console.error("Upload failed:", err);
      alert("Terjadi kesalahan saat mengunggah file: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  // Delete attachment
  const handleFileDelete = (attachmentId: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus file ini?")) {
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    }
  };

  // Check if strand mismatch warning is needed (Grade 7 & 8 only)
  const isGrade78 = studentData?.grade === 7 || studentData?.grade === 8;
  const isStrandConflict = React.useMemo(() => {
    if (!isGrade78 || !strand || !enrollment) return false;
    const otherSlot = slot === 1 ? 2 : 1;
    const otherChoice = enrollment.choices?.find(c => c.slot === otherSlot);
    return otherChoice && otherChoice.strand && otherChoice.strand === strand;
  }, [isGrade78, strand, enrollment, slot]);

  // Form Validity check
  const isValid = React.useMemo(() => {
    if (!strand) return false;
    if (!activityId) return false;
    if (activityId === 'CUSTOM' && !customActivity.trim()) return false;
    if (attachments.length === 0) return false;
    if (isStrandConflict) return false;
    return true;
  }, [strand, activityId, customActivity, attachments, isStrandConflict]);

  // Is editing permitted
  const isReadOnly = status === 'SUBMITTED' || status === 'APPROVED';

  // Save to Database
  const handleSaveDb = async (isSubmit: boolean) => {
    if (!studentData) return;
    setSaving(true);

    try {
      const activityName = activityId === 'CUSTOM' ? customActivity : (selectedActivityObj?.name || '');
      const requiresTemplate = activityId === 'CUSTOM' ? false : (selectedActivityObj?.requiresTemplate || false);

      const updatedChoice: SEChoice = {
        slot: slot as 1 | 2,
        strand: strand as SEStrand,
        activityId,
        activityName,
        customActivity: activityId === 'CUSTOM' ? customActivity : null,
        requiresTemplate,
        formAttachments: attachments,
        status: isSubmit ? 'SUBMITTED' : 'DRAFT',
        // Preserve legacy fields if editing
        finalTarget: enrollment?.choices?.find(c => c.slot === slot)?.finalTarget || '',
        equipment: enrollment?.choices?.find(c => c.slot === slot)?.equipment || '',
        weeklyTargets: enrollment?.choices?.find(c => c.slot === slot)?.weeklyTargets || [],
        // Map to legacy approvalStatus for teacher compatibility
        approvalStatus: isSubmit ? 'PENDING' : 'PENDING'
      };

      // Merge choices
      let currentChoices = enrollment ? [...enrollment.choices] : [];
      const index = currentChoices.findIndex(c => c.slot === slot);
      if (index >= 0) {
        currentChoices[index] = updatedChoice;
      } else {
        currentChoices.push(updatedChoice);
      }

      // Keep them sorted by slot
      currentChoices.sort((a, b) => a.slot - b.slot);

      // Compute overall enrollment status safely
      let overallStatus: SEEnrollment['status'] = 'PLANNING';
      if (currentChoices.every(c => c.status === 'APPROVED')) {
        overallStatus = 'APPROVED';
      } else if (currentChoices.some(c => c.status === 'SUBMITTED')) {
        overallStatus = 'SUBMITTED';
      }

      await saveSEEnrollment({
        id: enrollment?.id || undefined,
        studentId: studentData.id,
        studentName: studentData.name,
        classId: studentData.classId || '',
        grade: studentData.grade as 7 | 8 | 9,
        periodId: activePeriod.id,
        academicYear: activePeriod.academicYear,
        semester: activePeriod.semester,
        periodNumber: activePeriod.periodNumber,
        choices: currentChoices,
        status: overallStatus
      });

      alert(isSubmit ? "Pilihan berhasil dikirim untuk verifikasi!" : "Pilihan disimpan sebagai draft.");
      onClose();
    } catch (err: any) {
      console.error("Failed to save SE Choice:", err);
      alert("Gagal menyimpan pilihan. Silakan coba kembali.");
    } finally {
      setSaving(false);
    }
  };

  const handleAjukanPerubahan = async () => {
    if (confirm("Ajukan perubahan untuk pilihan ini? Status akan kembali menjadi Draft sehingga Anda dapat mengedit kembali.")) {
      setSaving(true);
      try {
        let currentChoices = enrollment ? [...enrollment.choices] : [];
        const index = currentChoices.findIndex(c => c.slot === slot);
        if (index >= 0) {
          currentChoices[index] = {
            ...currentChoices[index],
            status: 'CHANGE_REQUESTED',
            approvalStatus: 'PENDING'
          };
        }

        await saveSEEnrollment({
          id: enrollment?.id,
          studentId: studentData?.id || '',
          studentName: studentData?.name || '',
          classId: studentData?.classId || '',
          grade: studentData?.grade as 7 | 8 | 9,
          periodId: activePeriod.id,
          academicYear: activePeriod.academicYear,
          semester: activePeriod.semester,
          periodNumber: activePeriod.periodNumber,
          choices: currentChoices,
          status: 'PLANNING'
        });

        setStatus('CHANGE_REQUESTED');
      } catch (err) {
        console.error("Request change error:", err);
        alert("Gagal mengajukan perubahan.");
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" id="slot-editor-modal">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
        onClick={onClose} 
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-8 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Editor Pilihan</span>
            <h3 className="text-xl font-extrabold text-gray-900 mt-1">Slot {slot} — Self Exploration</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white hover:bg-gray-100 text-gray-400 hover:text-gray-900 border border-gray-100 transition-all"
            id="btn-close-modal"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="p-8 space-y-8 overflow-y-auto flex-1">
          {/* Revision note if any */}
          {status === 'REVISION_REQUIRED' && revisionNote && (
            <div className="p-5 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3">
              <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Catatan Revisi Guru</p>
                <p className="text-xs font-semibold text-red-600 italic">"{revisionNote}"</p>
              </div>
            </div>
          )}

          {/* Read Only notice */}
          {isReadOnly && (
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center gap-2.5">
              <Info className="text-blue-600" size={16} />
              <p className="text-[10px] font-black uppercase text-blue-800 tracking-widest">
                {status === 'APPROVED' ? 'PILIHAN DISETUJUI. DATA DIKUNCI.' : 'MENUNGGU VERIFIKASI. DATA DIKUNCI.'}
              </p>
            </div>
          )}

          {/* 1. Pilih Strand */}
          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pilih Strand</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {STRANDS_CONFIG.map(s => {
                const isSelected = strand === s.id;
                return (
                  <button
                    key={s.id}
                    disabled={isReadOnly}
                    onClick={() => handleStrandChange(s.id)}
                    className={cn(
                      "p-5 rounded-2xl border-2 text-left transition-all relative flex flex-col items-start space-y-3",
                      isSelected ? "border-blue-600 bg-blue-50/20" : "border-gray-50 hover:border-gray-200 bg-white",
                      isReadOnly && "opacity-60 cursor-not-allowed"
                    )}
                    id={`btn-strand-${s.id}`}
                  >
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", s.color)}>
                      {s.icon}
                    </div>
                    <div>
                      <p className="text-xs font-black text-gray-900">{s.label}</p>
                      <p className="text-[9px] font-semibold text-gray-400 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Strand conflict message */}
            {isStrandConflict && (
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mt-2 bg-red-50 p-2.5 rounded-xl inline-block">
                ⚠️ Strand harus berbeda dari Slot {slot === 1 ? '2' : '1'}! (Syarat Grade 7 & 8)
              </p>
            )}
          </div>

          {/* 2. Pilih Aktivitas */}
          {strand && (
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pilih Aktivitas</label>
              <select
                disabled={isReadOnly}
                value={activityId}
                onChange={e => {
                  setActivityId(e.target.value);
                  setCustomActivity('');
                }}
                className="w-full h-14 px-5 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 disabled:opacity-60"
                id="select-activity"
              >
                <option value="">-- Pilih Aktivitas --</option>
                {filteredActivities.map(act => (
                  <option key={act.id} value={act.id}>{act.name}</option>
                ))}
                <option value="CUSTOM">Lainnya (Ketik Manual)</option>
              </select>

              {activityId === 'CUSTOM' && (
                <input
                  type="text"
                  placeholder="Ketik nama aktivitas kamu..."
                  disabled={isReadOnly}
                  value={customActivity}
                  onChange={e => setCustomActivity(e.target.value)}
                  className="w-full h-14 px-5 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600 mt-2 disabled:opacity-60"
                  id="input-custom-activity"
                />
              )}
            </div>
          )}

          {/* 3. Unggah Bukti Form Pemilihan */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Unggah Foto Form Pilihan</label>
              <span className="text-[9px] font-bold text-gray-400">{attachments.length}/3 File</span>
            </div>

            {/* File list */}
            {attachments.length > 0 && (
              <div className="space-y-2.5">
                {attachments.map((file) => (
                  <div key={file.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 truncate">
                      <FileText className="text-gray-400 shrink-0" size={18} />
                      <div className="truncate text-left">
                        <p className="text-xs font-bold text-gray-800 truncate">{file.fileName}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{(file.sizeBytes / 1024).toFixed(0)} KB • {file.mimeType.split('/')[1]?.toUpperCase()}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a 
                        href={file.downloadUrl} 
                        target="_blank" 
                        rel="noreferrer referrer" 
                        className="p-2 hover:bg-white text-gray-500 hover:text-blue-600 rounded-lg transition-all border border-transparent hover:border-gray-200"
                        title="Lihat Form"
                      >
                        <Eye size={14} />
                      </a>
                      {!isReadOnly && (
                        <button 
                          onClick={() => handleFileDelete(file.id)}
                          className="p-2 hover:bg-white text-red-500 rounded-lg transition-all border border-transparent hover:border-gray-200"
                          title="Hapus Form"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Zone */}
            {!isReadOnly && attachments.length < 3 && (
              <div className="relative group">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  id="file-input-upload"
                />
                <div className="p-8 border-2 border-dashed border-gray-200 hover:border-blue-500 hover:bg-blue-50/10 rounded-2xl text-center transition-all flex flex-col items-center justify-center space-y-3">
                  {uploading ? (
                    <Loader2 className="animate-spin text-blue-600" size={28} />
                  ) : (
                    <UploadCloud className="text-gray-400 group-hover:text-blue-500 transition-colors" size={28} />
                  )}
                  <div>
                    <p className="text-xs font-black text-gray-700">Pilih berkas atau seret ke sini</p>
                    <p className="text-[10px] font-semibold text-gray-400 mt-1 leading-normal">Mendukung format JPG, PNG, atau PDF (Maks. 5MB per berkas)</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4">
          <div>
            {status === 'APPROVED' && (
              <button
                disabled={saving}
                onClick={handleAjukanPerubahan}
                className="py-3.5 px-6 border-2 border-amber-500 text-amber-600 hover:bg-amber-50 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all"
                id="btn-request-change"
              >
                Ajukan Perubahan
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {!isReadOnly && (
              <>
                <button
                  disabled={saving || uploading}
                  onClick={() => handleSaveDb(false)}
                  className="py-3.5 px-6 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-600 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all"
                  id="btn-save-draft"
                >
                  Simpan Draft
                </button>

                <button
                  disabled={!isValid || saving || uploading}
                  onClick={() => handleSaveDb(true)}
                  className="py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-widest rounded-xl transition-all shadow-lg shadow-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  id="btn-submit-verification"
                >
                  {saving ? 'Mengirim...' : 'Kirim untuk Verifikasi'}
                </button>
              </>
            )}

            {isReadOnly && (
              <button
                onClick={onClose}
                className="py-3.5 px-8 bg-gray-200 hover:bg-gray-300 text-gray-700 font-black uppercase text-[10px] tracking-widest rounded-xl transition-all"
                id="btn-close-readonly"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
