import * as React from 'react';
import { 
  Plus, Calendar, Clock, CheckCircle2, AlertCircle, 
  ChevronLeft, Camera, Send, Info, Target, Sparkles, ExternalLink, PlayCircle
} from 'lucide-react';
import { 
  getSEEnrollmentById, getSESessionLogs, saveSESessionLog, 
  submitSESelfAssessment, getSESelfAssessments, db 
} from '../../../lib/firebase';
import { SEEnrollment, SESessionLog, SESelfAssessment, SEChoice } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { doc, getDoc } from 'firebase/firestore';

export default function SEDetails() {
  const { enrollmentId, slotId } = useParams();
  const slot = parseInt(slotId || '1') as 1 | 2;
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [enrollment, setEnrollment] = React.useState<SEEnrollment | null>(null);
  const [logs, setLogs] = React.useState<SESessionLog[]>([]);
  const [selfAssessment, setSelfAssessment] = React.useState<SESelfAssessment | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showLogModal, setShowLogModal] = React.useState(false);
  const [showSAModal, setShowSAModal] = React.useState(false);
  const [totalSessions, setTotalSessions] = React.useState(9);

  const fetchData = React.useCallback(async () => {
    if (!enrollmentId) return;
    const enroll = await getSEEnrollmentById(enrollmentId);
    if (!enroll) return;
    setEnrollment(enroll);

    const periodSnap = await getDoc(doc(db, 'sePeriods', enroll.periodId));
    if (periodSnap.exists()) {
      setTotalSessions(periodSnap.data().totalSessions || 9);
    }

    const logsData = await getSESessionLogs(enrollmentId, slot);
    setLogs(logsData);

    const assessments = await getSESelfAssessments(enrollmentId);
    setSelfAssessment(assessments.find(a => a.choiceSlot === slot) || null);

    setLoading(false);
  }, [enrollmentId, slot]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <div className="p-20 text-center uppercase font-black text-[10px] tracking-widest text-gray-400">Memuat Detail...</div>;
  if (!enrollment) return null;

  const choice = enrollment.choices.find(c => c.slot === slot);
  if (!choice) return null;

  const currentSessionNumber = logs.length + 1;
  const isFinished = logs.length >= totalSessions;

  return (
    <div className="space-y-8 pb-32 max-w-5xl mx-auto">
       {/* Header */}
       <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
             <button onClick={() => navigate('/self-exploration/my')} className="w-14 h-14 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:text-blue-600 transition-all shadow-sm">
                <ChevronLeft size={24} />
             </button>
             <div>
                <div className="flex items-center gap-3">
                   <div className="px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100">
                      Slot {slot} • {choice.strand}
                   </div>
                </div>
                <h1 className="text-3xl font-black italic uppercase text-gray-900 tracking-tight mt-1">{choice.activityName}</h1>
             </div>
          </div>

          <div className="flex items-center gap-3">
             {!isFinished && enrollment.status === 'APPROVED' && (
               <button 
                 onClick={() => setShowLogModal(true)}
                 className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
               >
                 <Plus size={16} /> Tambah Log Sesi {currentSessionNumber}
               </button>
             )}
             {isFinished && !selfAssessment && (
               <button 
                 onClick={() => setShowSAModal(true)}
                 className="flex items-center gap-3 bg-emerald-500 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-50"
               >
                 <CheckCircle2 size={16} /> Isi Self-Assessment
               </button>
             )}
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Plan Summary */}
          <div className="lg:col-span-4 space-y-8">
             <div className="bg-white p-8 rounded-[3rem] border border-gray-100 space-y-8">
                <div className="space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Target Akhir</p>
                   <p className="text-sm font-bold text-gray-800 leading-relaxed italic">"{choice.finalTarget}"</p>
                </div>
                <div className="space-y-4">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-t border-gray-50 pt-6">Rencana Per Sesi</p>
                   <div className="space-y-3">
                      {choice.weeklyTargets.map((wt, i) => (
                        <div key={i} className={cn(
                          "flex items-start gap-3 p-4 rounded-2xl text-[10px] font-bold transition-all",
                          logs.some(l => l.sessionNumber === wt.week) ? "bg-emerald-50 text-emerald-600/70" : "bg-gray-50 text-gray-500"
                        )}>
                           <div className={cn(
                             "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-black",
                             logs.some(l => l.sessionNumber === wt.week) ? "bg-emerald-500 text-white" : "bg-white text-gray-300"
                           )}>
                              {wt.week}
                           </div>
                           <p className="mt-1">{wt.target}</p>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>

          {/* Right Column: Timeline Logs */}
          <div className="lg:col-span-8 space-y-8">
             {selfAssessment && (
               <div className="bg-emerald-600 p-8 rounded-[3rem] text-white space-y-6 shadow-2xl shadow-emerald-200">
                  <div className="flex items-center justify-between">
                     <h3 className="text-lg font-black italic uppercase tracking-tight flex items-center gap-3">
                        <CheckCircle2 size={24} /> Hasil Self-Assessment
                     </h3>
                     <span className={cn(
                       "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest bg-white/20",
                       selfAssessment.goalAchievement === 'ACHIEVED' ? "text-white" : "text-emerald-100"
                     )}>
                        {selfAssessment.goalAchievement === 'ACHIEVED' ? 'Tercapai' : 
                         selfAssessment.goalAchievement === 'ALMOST' ? 'Hampir Tercapai' : 'Belum Tercapai'}
                     </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-4">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Insight Pembelajaran</label>
                        <p className="text-xs font-bold leading-relaxed">{selfAssessment.learnings}</p>
                     </div>
                     <div className="space-y-4">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Tantangan Terbesar</label>
                        <p className="text-xs font-bold leading-relaxed">{selfAssessment.challenges}</p>
                     </div>
                  </div>
               </div>
             )}

             <div className="space-y-6">
                <h3 className="px-6 text-sm font-black uppercase italic text-gray-400">Timeline Kegiatan</h3>
                
                {logs.length === 0 ? (
                  <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
                     <PlayCircle className="w-16 h-16 text-gray-200 mx-auto mb-6" />
                     <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum ada sesi yang dicatat.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                     {logs.map((log, idx) => (
                       <LogCard key={log.id} log={log} index={idx} />
                     ))}
                  </div>
                )}
             </div>
          </div>
       </div>

       {/* Log Modal */}
       <AnimatePresence>
          {showLogModal && (
            <LogModal 
              sessionNumber={currentSessionNumber} 
              enrollment={enrollment} 
              slot={slot}
              onClose={() => setShowLogModal(false)} 
              onSuccess={() => {
                setShowLogModal(false);
                fetchData();
              }}
            />
          )}
          {showSAModal && (
            <SelfAssessmentModal 
              enrollment={enrollment}
              slot={slot}
              onClose={() => setShowSAModal(false)}
              onSuccess={() => {
                setShowSAModal(false);
                fetchData();
              }}
            />
          )}
       </AnimatePresence>
    </div>
  );
}

function LogCard({ log, index, key }: { log: SESessionLog, index: number, key?: React.Key }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6"
    >
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center font-black italic text-base">
                S{log.sessionNumber}
             </div>
             <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                   {new Date(log.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs font-black uppercase italic text-gray-900 mt-0.5">{log.weeklyTarget}</p>
             </div>
          </div>
          
          <div className={cn(
             "px-6 py-2 rounded-full text-[9px] font-black uppercase tracking-widest",
             log.attendance === 'PRESENT' ? "bg-emerald-50 text-emerald-600" :
             log.attendance === 'ABSENT' ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600"
          )}>
             {log.attendance === 'PRESENT' ? 'Hadir' : log.attendance === 'ABSENT' ? 'Absen' : 'Tanpa Alat'}
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-gray-50">
          <div className="space-y-4">
             <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 italic">Aktivitas Hari Ini</label>
             <p className="text-xs font-medium text-gray-700 leading-relaxed">{log.workDone}</p>
          </div>
          <div className="space-y-4">
             <label className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 italic">Progress ke Target</label>
             <p className="text-xs font-bold text-gray-900 leading-relaxed italic">"{log.progressNote}"</p>
          </div>
       </div>

       {(log.photoUrl || log.supervisorNote) && (
         <div className="flex flex-wrap items-center gap-4 pt-6">
            {log.photoUrl && (
              <a 
                href={log.photoUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-3 px-6 py-3 bg-gray-50 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-50 transition-all border border-gray-100"
              >
                 <Camera size={16} /> Lihat Dokumentasi <ExternalLink size={12} />
              </a>
            )}
            {log.supervisorNote && (
              <div className="flex-1 p-4 bg-amber-50/50 rounded-2xl border border-amber-100/50 flex items-start gap-3">
                 <Info size={14} className="text-amber-500 mt-0.5" />
                 <p className="text-[10px] font-bold text-amber-700 italic">Supervisor: {log.supervisorNote}</p>
              </div>
            )}
         </div>
       )}
    </motion.div>
  );
}

function LogModal({ sessionNumber, enrollment, slot, onClose, onSuccess }: { 
  sessionNumber: number, enrollment: SEEnrollment, slot: 1 | 2, onClose: () => void, onSuccess: () => void 
}) {
  const choice = enrollment.choices.find(c => c.slot === slot);
  const [submitting, setSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState({
    date: new Date().toISOString().split('T')[0],
    weeklyTarget: choice?.weeklyTargets.find(wt => wt.week === sessionNumber)?.target || '',
    workDone: '',
    progressNote: '',
    photoUrl: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await saveSESessionLog({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        periodId: enrollment.periodId,
        choiceSlot: slot,
        sessionNumber,
        date: new Date(formData.date).getTime(),
        weeklyTarget: formData.weeklyTarget,
        workDone: formData.workDone,
        progressNote: formData.progressNote,
        photoUrl: formData.photoUrl || null,
        supervisorId: null,
        attendance: 'PRESENT', // Default
        supervisorNote: null,
        supervisorFilledAt: null
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
       <motion.div 
         initial={{ opacity: 0 }} 
         animate={{ opacity: 1 }} 
         exit={{ opacity: 0 }} 
         onClick={onClose} 
         className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
       />
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden"
       >
          <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <div>
                <h3 className="text-xl font-black italic uppercase tracking-tight">Log Sesi {sessionNumber}</h3>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">Catat aktivitas harian kamu</p>
             </div>
             <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white text-gray-400">
                <Plus size={24} className="rotate-45" />
             </button>
          </div>

          <form onSubmit={handleSubmit} className="p-10 space-y-6">
             <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Tanggal</label>
                   <input 
                     type="date" 
                     value={formData.date}
                     onChange={e => setFormData({...formData, date: e.target.value})}
                     className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                     required
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Target Sesi</label>
                   <input 
                     type="text" 
                     value={formData.weeklyTarget}
                     onChange={e => setFormData({...formData, weeklyTarget: e.target.value})}
                     className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                     required
                   />
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Yang dikerjakan hari ini</label>
                <textarea 
                   placeholder="Deskripsikan aktivitasmu singkat tapi jelas..."
                   value={formData.workDone}
                   onChange={e => setFormData({...formData, workDone: e.target.value})}
                   className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-blue-600 resize-none"
                   required
                />
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Perkembangan ke arah target akhir</label>
                <textarea 
                   placeholder="Bagaimana progresmu menuju target akhir periode?"
                   value={formData.progressNote}
                   onChange={e => setFormData({...formData, progressNote: e.target.value})}
                   className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-blue-600 resize-none"
                   required
                />
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Link Dokumentasi (Opsional)</label>
                <input 
                  type="url" 
                  placeholder="https://photos.google.com/..."
                  value={formData.photoUrl}
                  onChange={e => setFormData({...formData, photoUrl: e.target.value})}
                  className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-blue-600"
                />
             </div>

             <button 
               disabled={submitting}
               className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
             >
                {submitting ? 'Menyimpan...' : 'Simpan Log Sesi'}
             </button>
          </form>
       </motion.div>
    </div>
  );
}

function SelfAssessmentModal({ enrollment, slot, onClose, onSuccess }: { 
  enrollment: SEEnrollment, slot: 1 | 2, onClose: () => void, onSuccess: () => void 
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [formData, setFormData] = React.useState<Omit<SESelfAssessment, 'id' | 'submittedAt' | 'enrollmentId' | 'studentId' | 'periodId' | 'choiceSlot'>>({
    goalAchievement: 'ACHIEVED',
    goalAchievementNote: '',
    learnings: '',
    challenges: '',
    improvements: '',
    finalPhotoUrl: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("Setelah submit, kamu tidak bisa mengubah jawaban ini. Lanjutkan?")) return;
    setSubmitting(true);
    try {
      await submitSESelfAssessment({
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        periodId: enrollment.periodId,
        choiceSlot: slot,
        ...formData
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
       <motion.div 
         initial={{ opacity: 0 }} 
         animate={{ opacity: 1 }} 
         exit={{ opacity: 0 }} 
         onClick={onClose} 
         className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
       />
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh]"
       >
          <div className="p-10 bg-gray-50 border-b border-gray-100">
             <div className="flex items-center justify-between">
                <h3 className="text-xl font-black italic uppercase tracking-tight">Self-Assessment</h3>
                <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white text-gray-400">
                   <Plus size={24} className="rotate-45" />
                </button>
             </div>
             <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Refleksi Akhir Periode SE</p>
          </div>

          <form onSubmit={handleSubmit} className="p-10 space-y-8">
             <div className="space-y-4">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">1. Apakah kamu mencapai target akhirmu?</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   {[
                     { id: 'ACHIEVED', label: 'Tercapai', icon: <CheckCircle2 size={16} /> },
                     { id: 'ALMOST', label: 'Hampir', icon: <Info size={16} /> },
                     { id: 'NOT_YET', label: 'Belum', icon: <AlertCircle size={16} /> }
                   ].map(opt => (
                     <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFormData({...formData, goalAchievement: opt.id as any})}
                        className={cn(
                          "flex items-center justify-center gap-3 p-4 rounded-2xl border-2 font-black uppercase text-[10px] tracking-widest transition-all",
                          formData.goalAchievement === opt.id ? "border-emerald-500 bg-emerald-50 text-emerald-600" : "border-gray-50 text-gray-400 hover:border-gray-200"
                        )}
                     >
                        {opt.icon} {opt.label}
                     </button>
                   ))}
                </div>
                <textarea 
                   placeholder="Jelaskan pencapaianmu... (min. 30 karakter)"
                   value={formData.goalAchievementNote}
                   onChange={e => setFormData({...formData, goalAchievementNote: e.target.value})}
                   className="w-full h-24 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-emerald-500 resize-none mt-2"
                   required
                />
             </div>

             <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">2. Apa yang kamu pelajari dari kegiatan ini?</label>
                <textarea 
                   placeholder="Min. 50 karakter..."
                   value={formData.learnings}
                   onChange={e => setFormData({...formData, learnings: e.target.value})}
                   className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-emerald-500 resize-none"
                   required
                />
             </div>

             <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">3. Apa tantangan terbesar yang kamu hadapi?</label>
                <textarea 
                   placeholder="Ketik tantangan kamu di sini..."
                   value={formData.challenges}
                   onChange={e => setFormData({...formData, challenges: e.target.value})}
                   className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-emerald-500 resize-none"
                   required
                />
             </div>

             <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">4. Apa yang ingin kamu tingkatkan ke depannya?</label>
                <textarea 
                   placeholder="Rencana upgrade skill kamu..."
                   value={formData.improvements}
                   onChange={e => setFormData({...formData, improvements: e.target.value})}
                   className="w-full h-32 p-6 bg-gray-50 rounded-[2rem] border-none font-bold focus:ring-2 focus:ring-emerald-500 resize-none"
                   required
                />
             </div>

             <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">5. Dokumentasi Produk Akhir (Opsional)</label>
                <input 
                  type="url" 
                  placeholder="https://..."
                  value={formData.finalPhotoUrl || ''}
                  onChange={e => setFormData({...formData, finalPhotoUrl: e.target.value})}
                  className="w-full h-14 px-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-emerald-500"
                />
             </div>

             <button 
               disabled={submitting}
               className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50"
             >
                {submitting ? 'Mengirim...' : 'Submit Self-Assessment'}
             </button>
          </form>
       </motion.div>
    </div>
  );
}
