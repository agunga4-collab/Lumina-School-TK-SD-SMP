import * as React from 'react';
import { 
  Search, Filter, CheckCircle2, AlertCircle, Eye, 
  ChevronRight, MessageSquare, User, Calendar, Clock, Plus
} from 'lucide-react';
import { 
  getSEPeriods, getSEEnrollmentsByClass, approveSEEnrollment, 
  requestSERevision, saveSETeacherComment, getSESelfAssessments,
  db
} from '../../../lib/firebase';
import { SEPeriod, SEEnrollment, SEChoice, SESelfAssessment } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { collection, getDocs } from 'firebase/firestore';

export default function SEClassView() {
  const { classId } = useParams();
  const { profile } = useAuth();
  const [activePeriod, setActivePeriod] = React.useState<SEPeriod | null>(null);
  const [enrollments, setEnrollments] = React.useState<SEEnrollment[]>([]);
  const [classes, setClasses] = React.useState<any[]>([]);
  const [currentClassId, setCurrentClassId] = React.useState(classId || '');
  const [loading, setLoading] = React.useState(true);
  const [selectedEnrollment, setSelectedEnrollment] = React.useState<SEEnrollment | null>(null);
  const [showApprovalModal, setShowApprovalModal] = React.useState(false);
  const [showCommentModal, setShowCommentModal] = React.useState(false);
  const [assessments, setAssessments] = React.useState<SESelfAssessment[]>([]);

  const fetchInitial = React.useCallback(async () => {
    // Get Classes
    const cSnap = await getDocs(collection(db, 'classes'));
    setClasses(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    // Get Active Period
    const periods = await getSEPeriods('JUNIOR_HIGH');
    const active = periods.find(p => p.isActive);
    setActivePeriod(active || null);

    if (active && currentClassId) {
      const data = await getSEEnrollmentsByClass(currentClassId, active.id);
      setEnrollments(data);
    }
    setLoading(false);
  }, [currentClassId]);

  React.useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const handleOpenApproval = (enroll: SEEnrollment) => {
    setSelectedEnrollment(enroll);
    setShowApprovalModal(true);
  };

  const handleOpenComment = async (enroll: SEEnrollment) => {
    const sa = await getSESelfAssessments(enroll.id);
    setAssessments(sa);
    setSelectedEnrollment(enroll);
    setShowCommentModal(true);
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-black text-gray-900 tracking-tight italic uppercase">Pantau Kelas SE</h1>
           <p className="text-sm text-gray-500 font-medium mt-1">Review rencana dan hasil eksplorasi siswa.</p>
        </div>
        <div className="flex items-center gap-3">
           <select 
             value={currentClassId}
             onChange={e => setCurrentClassId(e.target.value)}
             className="h-14 px-8 bg-white rounded-[2rem] border-none font-black uppercase text-[10px] tracking-widest shadow-sm focus:ring-2 focus:ring-blue-600"
           >
              <option value="">Pilih Kelas</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
           </select>
        </div>
      </div>

      {!currentClassId ? (
         <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Pilih kelas untuk melihat data.</p>
         </div>
      ) : loading ? (
        <div className="py-20 text-center">
           <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin inline-block" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
           {enrollments.map(enroll => {
             const pendingApproval = enroll.choices.some(c => c.approvalStatus === 'PENDING');
             const needsComment = enroll.status === 'SELF_ASSESSED';

             return (
               <div key={enroll.id} className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all space-y-6">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                           <User size={20} />
                        </div>
                        <div>
                           <h3 className="font-black uppercase italic text-sm">{enroll.studentName}</h3>
                           <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Grade {enroll.grade}</p>
                        </div>
                     </div>
                     <span className={cn(
                       "px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                       enroll.status === 'COMPLETED' ? "bg-emerald-50 text-emerald-600" :
                       enroll.status === 'APPROVED' ? "bg-blue-50 text-blue-600" :
                       "bg-amber-50 text-amber-600"
                     )}>
                        {enroll.status}
                     </span>
                  </div>

                  <div className="space-y-3">
                     {enroll.choices.map(c => (
                       <div key={c.slot} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between group">
                          <div className="space-y-0.5">
                             <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">{c.strand}</p>
                             <p className="text-[10px] font-bold text-gray-900 uppercase italic truncate max-w-[150px]">{c.activityName}</p>
                          </div>
                          {c.approvalStatus === 'PENDING' && (
                            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                          )}
                          {c.approvalStatus === 'REVISION_NEEDED' && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                          {c.approvalStatus === 'APPROVED' && (
                            <CheckCircle2 size={14} className="text-emerald-500" />
                          )}
                       </div>
                     ))}
                  </div>

                  <div className="flex items-center gap-2 pt-4 border-t border-gray-50">
                     {pendingApproval ? (
                        <button 
                          onClick={() => handleOpenApproval(enroll)}
                          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100"
                        >
                           Review Rencana
                        </button>
                     ) : needsComment ? (
                        <button 
                           onClick={() => handleOpenComment(enroll)}
                           className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-emerald-600 shadow-lg shadow-emerald-100"
                        >
                           Isi Komentar Rapor
                        </button>
                     ) : (
                        <button className="flex-1 py-3 bg-gray-50 text-gray-400 rounded-xl font-black uppercase text-[9px] tracking-widest cursor-default">
                           No Action Needed
                        </button>
                     )}
                     <button className="w-10 h-10 flex items-center justify-center bg-gray-50 text-gray-400 rounded-xl hover:bg-gray-100">
                        <Eye size={16} />
                     </button>
                  </div>
               </div>
             );
           })}
        </div>
      )}

      {/* Approval Modal */}
      <AnimatePresence>
         {showApprovalModal && selectedEnrollment && (
           <ApprovalModal 
             enrollment={selectedEnrollment} 
             onClose={() => setShowApprovalModal(false)}
             onSuccess={() => { setShowApprovalModal(false); fetchInitial(); }}
           />
         )}
         {showCommentModal && selectedEnrollment && (
            <CommentModal 
              enrollment={selectedEnrollment}
              assessments={assessments}
              onClose={() => setShowCommentModal(false)}
              onSuccess={() => { setShowCommentModal(false); fetchInitial(); }}
            />
         )}
      </AnimatePresence>
    </div>
  );
}

function ApprovalModal({ enrollment, onClose, onSuccess }: { enrollment: SEEnrollment, onClose: () => void, onSuccess: () => void }) {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [revisionNote, setRevisionNote] = React.useState('');

  const handleApprove = async (slot: 1 | 2) => {
    setSubmitting(true);
    await approveSEEnrollment(enrollment.id, slot, profile?.email || 'System');
    setSubmitting(false);
    onSuccess();
  };

  const handleRevision = async (slot: 1 | 2) => {
    if (!revisionNote) return alert("Beri catatan revisi!");
    setSubmitting(true);
    await requestSERevision(enrollment.id, slot, revisionNote);
    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-3xl bg-white rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh]"
       >
          <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <h3 className="text-xl font-black italic uppercase tracking-tight">Review Rencana SE</h3>
             <button onClick={onClose} className="text-gray-400"><Plus className="rotate-45" size={24} /></button>
          </div>

          <div className="p-10 space-y-10">
             {enrollment.choices.map(choice => (
               <div key={choice.slot} className="space-y-6">
                  <div className="flex items-center justify-between">
                     <h4 className="text-lg font-black uppercase italic text-gray-900">Slot {choice.slot}: {choice.activityName}</h4>
                     <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">{choice.strand}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-8 bg-gray-50 p-6 rounded-3xl">
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Target Akhir</label>
                        <p className="text-xs font-bold italic">"{choice.finalTarget}"</p>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Perlengkapan</label>
                        <p className="text-xs font-bold italic">"{choice.equipment}"</p>
                     </div>
                  </div>

                  {choice.approvalStatus === 'PENDING' && (
                    <div className="space-y-4 pt-4">
                       <textarea 
                         placeholder="Masukan catatan jika butuh revisi..."
                         value={revisionNote}
                         onChange={e => setRevisionNote(e.target.value)}
                         className="w-full h-24 p-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-red-500 resize-none"
                       />
                       <div className="flex gap-4">
                          <button 
                             disabled={submitting}
                             onClick={() => handleRevision(choice.slot)}
                             className="flex-1 py-4 border-2 border-red-500 text-red-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50"
                          >
                             Minta Revisi
                          </button>
                          <button 
                             disabled={submitting}
                             onClick={() => handleApprove(choice.slot)}
                             className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100"
                          >
                             Approve Rencana
                          </button>
                       </div>
                    </div>
                  )}
               </div>
             ))}
          </div>
       </motion.div>
    </div>
  );
}

function CommentModal({ enrollment, assessments, onClose, onSuccess }: { enrollment: SEEnrollment, assessments: SESelfAssessment[], onClose: () => void, onSuccess: () => void }) {
  const [comments, setComments] = React.useState<Record<number, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const handleSave = async (slot: 1 | 2) => {
    if (!comments[slot]) return alert("Isi komentar!");
    setSubmitting(true);
    await saveSETeacherComment(enrollment.id, slot, comments[slot]);
    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh]"
       >
          <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <h3 className="text-xl font-black italic uppercase tracking-tight">Komentar Rapor SE</h3>
             <button onClick={onClose} className="text-gray-400"><Plus className="rotate-45" size={24} /></button>
          </div>

          <div className="p-10 space-y-12">
             {enrollment.choices.map(choice => {
                const sa = assessments.find(a => a.choiceSlot === choice.slot);
                return (
                  <div key={choice.slot} className="space-y-6">
                     <div className="flex items-center justify-between">
                        <h4 className="text-lg font-black uppercase italic text-gray-900">{choice.activityName}</h4>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full">Siswa Berhasil: {sa?.goalAchievement}</span>
                     </div>

                     {sa ? (
                       <div className="bg-gray-50 p-8 rounded-3xl grid grid-cols-2 gap-8">
                          <SAItem label="Pencapaian Target" value={sa.goalAchievementNote} />
                          <SAItem label="Pelajaran yang Didapat" value={sa.learnings} />
                       </div>
                     ) : (
                       <div className="p-10 text-center bg-amber-50 rounded-3xl border border-amber-100 text-amber-600 font-bold text-xs">
                          Siswa belum mengisi self-assessment untuk slot ini.
                       </div>
                     )}

                     <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Komentar Guru (Untuk Rapor)</label>
                        <textarea 
                          placeholder="Tulis ringkasan progres dan pencapaian siswa untuk rapor..."
                          value={comments[choice.slot] || choice.teacherComment || ''}
                          onChange={e => setComments({...comments, [choice.slot]: e.target.value})}
                          className="w-full h-32 p-6 bg-white border border-gray-100 rounded-[2rem] font-bold focus:ring-2 focus:ring-blue-600 resize-none"
                        />
                        <button 
                          disabled={submitting || !sa}
                          onClick={() => handleSave(choice.slot)}
                          className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 disabled:opacity-30"
                        >
                           Simpan Komentar
                        </button>
                     </div>
                  </div>
                );
             })}
          </div>
       </motion.div>
    </div>
  );
}

function SAItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
       <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">{label}</p>
       <p className="text-xs font-medium text-gray-700 italic">"{value}"</p>
    </div>
  );
}
