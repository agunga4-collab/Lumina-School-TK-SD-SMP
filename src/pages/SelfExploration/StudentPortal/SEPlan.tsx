import * as React from 'react';
import { 
  Sparkles, Brain, Dumbbell, ChevronRight, ChevronLeft, 
  Plus, Trash2, AlertCircle, CheckCircle2, Save, Info
} from 'lucide-react';
import { 
  getSEActivities, saveSEEnrollment, 
  getStudentById, getSEEnrollment, db, sendNotification
} from '../../../lib/firebase';
import { SEPeriod, SEActivity, SEStrand, Student, SEChoice, SEEnrollment } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

const STRANDS: { id: SEStrand, label: string, color: string, icon: React.ReactNode, desc: string }[] = [
  { id: 'Imaginal', label: 'Imaginal', color: 'bg-pink-100 text-pink-600', icon: <Sparkles size={24} />, desc: 'Imagination & Creativity' },
  { id: 'Rational', label: 'Rational', color: 'bg-blue-100 text-blue-600', icon: <Brain size={24} />, desc: 'Cognitive Flexibility' },
  { id: 'Physical', label: 'Physical', color: 'bg-amber-100 text-amber-600', icon: <Dumbbell size={24} />, desc: 'Physical Education' }
];

export default function SEPlan() {
  const { periodId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = React.useState(1);
  const [period, setPeriod] = React.useState<SEPeriod | null>(null);
  const [activities, setActivities] = React.useState<SEActivity[]>([]);
  const [student, setStudent] = React.useState<Student | null>(null);
  const [existingEnrollment, setExistingEnrollment] = React.useState<SEEnrollment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Form State
  const [choices, setChoices] = React.useState<Partial<SEChoice>[]>([]);

  const fetchInitial = React.useCallback(async () => {
    if (!profile?.email || !periodId) return;

    // Fetch Period
    const periods = await getDocs(query(collection(db, 'sePeriods'), where('id', '==', periodId), limit(1)));
    if (periods.empty) return;
    const p = { id: periods.docs[0].id, ...periods.docs[0].data() } as SEPeriod;
    setPeriod(p);

    // Fetch Student
    const sSnap = await getDocs(query(collection(db, 'students'), where('email', '==', profile.email), limit(1)));
    if (!sSnap.empty) {
      const s = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() } as Student;
      setStudent(s);

      // Default choices based on grade
      const isGrade9 = s.grade === 9;
      const numSlots = isGrade9 ? 1 : 2;

      // Check current enrollment
      const enroll = await getSEEnrollment(p.id, s.id);
      if (enroll) {
        setExistingEnrollment(enroll);
        setChoices(enroll.choices);
      } else {
        setChoices(Array.from({ length: numSlots }, (_, i) => ({
          slot: (i + 1) as 1 | 2,
          approvalStatus: 'PENDING',
          weeklyTargets: Array.from({ length: 4 }, (_, j) => ({ week: j + 1, target: '' }))
        })));
      }
    }

    // Fetch Activities
    const acts = await getSEActivities('JUNIOR_HIGH');
    setActivities(acts || []);

    setLoading(false);
  }, [profile?.email, periodId]);

  React.useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleSave = async (isSubmit: boolean) => {
    if (!student || !period) return;
    setSubmitting(true);
    try {
      const enrollment: Omit<SEEnrollment, 'id' | 'createdAt' | 'updatedAt'> = {
        studentId: student.id,
        studentName: student.name,
        classId: student.classId || '',
        grade: student.grade as 7 | 8 | 9,
        periodId: period.id,
        academicYear: period.academicYear,
        semester: period.semester,
        periodNumber: period.periodNumber,
        choices: choices as SEChoice[],
        status: isSubmit ? 'SUBMITTED' : 'PLANNING'
      };

      await saveSEEnrollment({
        ...enrollment,
        id: existingEnrollment?.id
      });

      if (isSubmit) {
        // Find Homeroom
        const hrSnap = await getDocs(query(collection(db, 'users'), where('unitId', '==', 'JUNIOR_HIGH'), where('role', '==', 'TEACHER'), where('isHomeroom', '==', true)));
        // Filter by class manually or via jobTitle in real app. For demo, alert to HR.
        sendNotification({
          userId: 'agunga4@gmail.com', // Demo receiver or find HR
          type: 'REPORT_SUBMITTED', // Reusing type for now or add SE_SUBMITTED
          message: `${student.name} submit rencana SE. Mohon review.`,
          link: `/self-exploration/class/${student.classId}`
        });
      }

      alert(isSubmit ? "Rencana berhasil dikirim!" : "Draft berhasil disimpan!");
      navigate('/self-exploration/my');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const updateChoice = (slot: number, updates: Partial<SEChoice>) => {
    setChoices(prev => prev.map(c => c.slot === slot ? { ...c, ...updates } : c));
  };

  if (loading) return <div className="p-20 text-center uppercase font-black text-[10px] tracking-widest text-gray-400">Memuat Form...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
       {/* Header */}
       <div className="flex items-center justify-between">
          <button onClick={() => navigate('/self-exploration/my')} className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-gray-400 hover:text-blue-600 transition-all border border-gray-100">
             <ChevronLeft size={24} />
          </button>
          <div className="text-center">
             <h1 className="text-2xl font-black italic uppercase text-gray-900 tracking-tight">Rencana Eksplorasi</h1>
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mt-1">{period?.label}</p>
          </div>
          <div className="w-12 h-12" />
       </div>

       {/* Steps */}
       <div className="flex items-center justify-between px-10 relative">
          <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-0.5 bg-gray-100" />
          {[1, 2, 3].map(step => (
            <div key={step} className={cn(
              "relative z-10 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition-all",
              activeStep === step ? "bg-blue-600 text-white shadow-xl shadow-blue-200 scale-125" : 
              activeStep > step ? "bg-emerald-500 text-white" : "bg-white text-gray-300 border-2 border-gray-100"
            )}>
              {activeStep > step ? <CheckCircle2 size={18} /> : step}
            </div>
          ))}
       </div>

       {/* Step Content */}
       <div className="min-h-[500px]">
          {activeStep === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
               {choices.map((choice, idx) => (
                 <div key={choice.slot} className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm space-y-8">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black italic text-lg">
                          0{idx + 1}
                       </div>
                       <div>
                          <h2 className="text-lg font-black uppercase italic tracking-tight">Pilih Kegiatan Slot {choice.slot}</h2>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pilih strand dan jenis kegiatan kamu</p>
                       </div>
                    </div>

                    <div className="space-y-6">
                       <div className="grid grid-cols-3 gap-4">
                          {STRANDS.map(s => (
                            <button
                               key={s.id}
                               onClick={() => updateChoice(choice.slot!, { strand: s.id, activityId: '', activityName: '' })}
                               className={cn(
                                 "relative p-6 rounded-[2.5rem] border-2 text-center transition-all",
                                 choice.strand === s.id ? "border-blue-600 bg-blue-50/50" : "border-gray-50 hover:border-gray-200"
                               )}
                            >
                               <div className={cn("w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center", s.color)}>
                                  {s.icon}
                               </div>
                               <p className="text-xs font-black uppercase tracking-widest text-gray-900">{s.id}</p>
                               <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mt-1 opacity-60">{s.desc}</p>
                            </button>
                          ))}
                       </div>

                       {choice.strand && (
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {activities
                              .filter(a => a.strand === choice.strand && a.isActive)
                              .map(act => (
                                <button
                                   key={act.id}
                                   onClick={() => updateChoice(choice.slot!, { activityId: act.id, activityName: act.name, requiresTemplate: act.requiresTemplate })}
                                   className={cn(
                                     "p-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                     choice.activityId === act.id ? "border-blue-600 bg-blue-600 text-white" : "border-gray-50 hover:border-gray-100 text-gray-500",
                                     act.isProhibited && "opacity-50 cursor-not-allowed"
                                   )}
                                   disabled={act.isProhibited}
                                >
                                   {act.name}
                                   {act.isProhibited && <AlertCircle size={12} className="inline-block ml-1 text-red-500" />}
                                </button>
                              ))}
                            <button
                               onClick={() => updateChoice(choice.slot!, { activityId: 'CUSTOM', activityName: 'Lainnya' })}
                               className={cn(
                                 "p-4 rounded-2xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                 choice.activityId === 'CUSTOM' ? "border-blue-600 bg-blue-600 text-white" : "border-gray-50 hover:border-gray-100 text-gray-500"
                               )}
                            >
                               Lainnya (Input Manual)
                            </button>
                         </div>
                       )}

                       {choice.activityId === 'CUSTOM' && (
                         <input 
                           type="text"
                           placeholder="Ketik nama kegiatan kamu di sini..."
                           value={choice.customActivity || ''}
                           onChange={e => updateChoice(choice.slot!, { customActivity: e.target.value, activityName: e.target.value })}
                           className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                         />
                       )}

                       {choice.activityId && (
                         <div className={cn(
                           "p-4 rounded-2xl border flex items-center gap-3",
                           choice.requiresTemplate ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
                         )}>
                            <Info size={16} />
                            <p className="text-[10px] font-black uppercase tracking-widest">
                               PROYEK INI {choice.requiresTemplate ? 'WAJIB' : 'TIDAK WAJIB'} MENGGUNAKAN TEMPLATE SLIDE PRESENTASI.
                            </p>
                         </div>
                       )}
                    </div>
                 </div>
               ))}
            </motion.div>
          )}

          {activeStep === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
               {choices.map((choice, idx) => (
                 <div key={choice.slot} className="bg-white p-10 rounded-[3.5rem] border border-gray-100 shadow-sm space-y-8">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black italic text-lg">
                          0{idx + 1}
                       </div>
                       <div>
                          <h2 className="text-lg font-black uppercase italic tracking-tight">{choice.activityName}</h2>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{choice.strand}</p>
                       </div>
                    </div>

                    <div className="space-y-8">
                       <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Target Akhir Periode</label>
                          <textarea 
                             placeholder="Apa yang ingin kamu capai di akhir periode?"
                             value={choice.finalTarget || ''}
                             onChange={e => updateChoice(choice.slot!, { finalTarget: e.target.value })}
                             className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-blue-600 resize-none"
                          />
                       </div>

                       <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Perlengkapan yang Dibutuhkan</label>
                          <textarea 
                             placeholder="Daftar perlengkapan yang harus kamu siapkan sendiri..."
                             value={choice.equipment || ''}
                             onChange={e => updateChoice(choice.slot!, { equipment: e.target.value })}
                             className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-blue-600 resize-none"
                          />
                       </div>

                       <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Target Per Sesi (Minimal 4 Sesi)</label>
                          <div className="space-y-3">
                             {choice.weeklyTargets?.map((wt, wIdx) => (
                               <div key={wIdx} className="flex gap-4">
                                  <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center shrink-0 text-[10px] font-black">
                                     S{wt.week}
                                  </div>
                                  <input 
                                     type="text"
                                     placeholder={`Target sesi ke-${wt.week}`}
                                     value={wt.target}
                                     onChange={e => {
                                       const newWT = [...(choice.weeklyTargets || [])];
                                       newWT[wIdx].target = e.target.value;
                                       updateChoice(choice.slot!, { weeklyTargets: newWT });
                                     }}
                                     className="flex-1 h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                                  />
                               </div>
                             ))}
                             <button 
                               onClick={() => {
                                 const nextWeek = (choice.weeklyTargets?.length || 0) + 1;
                                 updateChoice(choice.slot!, { weeklyTargets: [...(choice.weeklyTargets || []), { week: nextWeek, target: '' }] });
                               }}
                               className="w-full py-4 border-2 border-dashed border-gray-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:border-blue-200 hover:text-blue-600 transition-all"
                             >
                               + Tambah Target Sesi
                             </button>
                          </div>
                       </div>
                    </div>
                 </div>
               ))}
            </motion.div>
          )}

          {activeStep === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8 bg-white p-12 rounded-[4rem] border border-gray-100 text-center">
               <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8">
                  <CheckCircle2 size={48} />
               </div>
               <div>
                  <h2 className="text-3xl font-black italic uppercase text-gray-900 tracking-tight">Siap Dikirim!</h2>
                  <p className="text-gray-500 font-medium max-w-sm mx-auto mt-4 leading-relaxed">
                     Pastikan semua rencana kamu sudah matang. Setelah dikirim ke Homeroom, rencana tidak bisa diubah lagi.
                  </p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto pt-8">
                  <button 
                    onClick={() => handleSave(false)}
                    disabled={submitting}
                    className="flex-1 py-5 border-2 border-gray-200 rounded-2xl font-black uppercase text-[10px] tracking-widest text-gray-500 hover:bg-gray-50 transition-all"
                  >
                     Simpan Draft
                  </button>
                  <button 
                    onClick={() => handleSave(true)}
                    disabled={submitting}
                    className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                  >
                     Kirim Sekarang
                  </button>
               </div>
            </motion.div>
          )}
       </div>

       {/* Navigation Buttons */}
       <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 flex gap-4">
          {activeStep > 1 && (
            <button 
               onClick={() => setActiveStep(activeStep - 1)}
               className="w-20 h-20 bg-white border border-gray-100 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 transition-all shadow-xl"
            >
               <ChevronLeft size={24} />
            </button>
          )}
          {activeStep < 3 && (
            <button 
               onClick={() => setActiveStep(activeStep + 1)}
               className="flex-1 h-20 bg-blue-600 text-white rounded-[2.5rem] flex items-center justify-center gap-4 font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-2xl shadow-blue-200 group"
            >
               Lanjutkan <ChevronRight size={24} className="group-hover:translate-x-2 transition-transform" />
            </button>
          )}
       </div>
    </div>
  );
}
