import * as React from 'react';
import { 
  Search, Filter, CheckCircle2, AlertCircle, Eye, 
  ChevronRight, MessageSquare, User, Calendar, Clock, Plus,
  FileText, ExternalLink, Maximize2
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
  const [revisionNotes, setRevisionNotes] = React.useState<Record<number, string>>({});
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);

  const handleApprove = async (slot: 1 | 2) => {
    setSubmitting(true);
    await approveSEEnrollment(enrollment.id, slot, profile?.email || 'System');
    setSubmitting(false);
    onSuccess();
  };

  const handleRevision = async (slot: 1 | 2) => {
    const note = revisionNotes[slot]?.trim();
    if (!note) return alert("Catatan revisi wajib diisi untuk menjelaskan alasan perbaikan!");
    setSubmitting(true);
    await requestSERevision(enrollment.id, slot, note);
    setSubmitting(false);
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" id="teacher-approval-modal">
       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />
       
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-3xl bg-white rounded-[3rem] shadow-2xl overflow-y-auto max-h-[90vh]"
       >
          <div className="p-10 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <h3 className="text-xl font-black italic uppercase tracking-tight">Review Rencana SE — {enrollment.studentName}</h3>
             <button onClick={onClose} className="text-gray-400"><Plus className="rotate-45" size={24} /></button>
          </div>

          <div className="p-10 space-y-12">
             {enrollment.choices.map(choice => {
               const currentStatus = choice.status || (
                 choice.approvalStatus === 'APPROVED' ? 'APPROVED' :
                 choice.approvalStatus === 'REVISION_NEEDED' ? 'REVISION_REQUIRED' : 'SUBMITTED'
               );

               return (
                 <div key={choice.slot} className="space-y-6 pb-8 border-b border-gray-100 last:border-b-0 last:pb-0" id={`review-slot-${choice.slot}`}>
                    <div className="flex items-center justify-between">
                       <div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Slot {choice.slot}</span>
                          <h4 className="text-lg font-black uppercase italic text-gray-900 mt-1">{choice.activityName}</h4>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full">
                            {choice.strand === 'Physical' ? 'Material/Physical' : choice.strand}
                          </span>
                          <span className={cn(
                            "px-3 py-1 text-[8px] font-black uppercase tracking-widest border rounded-full",
                            currentStatus === 'APPROVED' ? "bg-emerald-50 text-emerald-600 border-emerald-150" :
                            currentStatus === 'REVISION_REQUIRED' ? "bg-red-50 text-red-600 border-red-150" :
                            "bg-blue-50 text-blue-600 border-blue-150"
                          )}>
                            {currentStatus === 'APPROVED' ? 'Disetujui' : 
                             currentStatus === 'REVISION_REQUIRED' ? 'Perlu Revisi' : 
                             'Menunggu Verifikasi'}
                          </span>
                       </div>
                    </div>

                    {/* Form Attachments Gallery */}
                    <div className="space-y-3">
                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Bukti Form Pemilihan</label>
                       {choice.formAttachments && choice.formAttachments.length > 0 ? (
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                           {choice.formAttachments.map(file => {
                             const isImg = file.mimeType.startsWith('image/');
                             return (
                               <div key={file.id} className="bg-gray-50 border border-gray-100 p-3 rounded-2xl flex flex-col justify-between space-y-3 shadow-sm hover:shadow-md transition-all">
                                 {isImg ? (
                                   <div 
                                     onClick={() => setLightboxUrl(file.downloadUrl)}
                                     className="aspect-video w-full rounded-xl bg-gray-200 overflow-hidden relative cursor-zoom-in group"
                                   >
                                     <img 
                                       src={file.downloadUrl} 
                                       alt={file.fileName} 
                                       className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                       referrerPolicy="no-referrer"
                                     />
                                     <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                       <Maximize2 size={16} />
                                     </div>
                                   </div>
                                 ) : (
                                   <div className="aspect-video w-full rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center text-blue-600 space-y-1">
                                     <FileText size={24} />
                                     <span className="text-[9px] font-black uppercase tracking-wider">Dokumen PDF</span>
                                   </div>
                                 )}

                                 <div className="space-y-1">
                                   <p className="text-[10px] font-bold text-gray-800 truncate" title={file.fileName}>{file.fileName}</p>
                                   <p className="text-[8px] font-bold text-gray-400 uppercase">{(file.sizeBytes / 1024).toFixed(0)} KB</p>
                                 </div>

                                 <a 
                                   href={file.downloadUrl} 
                                   target="_blank" 
                                   rel="noreferrer referrer" 
                                   className="py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl text-[8px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 transition-all"
                                 >
                                   <ExternalLink size={10} /> Buka Tab Baru
                                 </a>
                               </div>
                             );
                           })}
                         </div>
                       ) : (
                         <div className="p-5 bg-yellow-50 border border-yellow-100 text-yellow-800 rounded-2xl text-xs font-semibold italic">
                           ⚠️ Belum ada file bukti form pemilihan yang diunggah oleh siswa.
                         </div>
                       )}
                    </div>

                    {/* Legacy details (if present) */}
                    {(choice.finalTarget || choice.equipment) && (
                      <div className="grid grid-cols-2 gap-8 bg-gray-50 p-6 rounded-3xl">
                         <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Target Akhir (Rencana Lama)</label>
                            <p className="text-xs font-bold italic">"{choice.finalTarget}"</p>
                         </div>
                         <div className="space-y-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Perlengkapan (Rencana Lama)</label>
                            <p className="text-xs font-bold italic">"{choice.equipment}"</p>
                         </div>
                      </div>
                    )}

                    {/* Revision input & controls */}
                    {choice.approvalStatus === 'PENDING' && (
                      <div className="space-y-4 pt-4 border-t border-gray-50">
                         <textarea 
                           placeholder="Masukan catatan revisi wajib di sini (alasan kenapa rencana ditolak atau minta diperbaiki)..."
                           value={revisionNotes[choice.slot] || ''}
                           onChange={e => setRevisionNotes(prev => ({ ...prev, [choice.slot]: e.target.value }))}
                           className="w-full h-24 p-6 bg-gray-50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-red-500 resize-none text-sm text-gray-800"
                           id={`textarea-revision-${choice.slot}`}
                         />
                         <div className="flex gap-4">
                            <button 
                               disabled={submitting}
                               onClick={() => handleRevision(choice.slot)}
                               className="flex-1 py-4 border-2 border-red-500 text-red-500 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-red-50 transition-colors disabled:opacity-45"
                               id={`btn-reject-${choice.slot}`}
                            >
                               Minta Revisi (Wajib Catatan)
                            </button>
                            <button 
                               disabled={submitting}
                               onClick={() => handleApprove(choice.slot)}
                               className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-colors disabled:opacity-45"
                               id={`btn-approve-${choice.slot}`}
                            >
                               Setujui Pilihan
                            </button>
                         </div>
                      </div>
                    )}

                    {/* Saved revision note if revision required */}
                    {currentStatus === 'REVISION_REQUIRED' && (choice.revisionNote || choice.approvalNote) && (
                      <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium">
                        <strong>Catatan Revisi Terkirim:</strong> "{choice.revisionNote || choice.approvalNote}"
                      </div>
                    )}

                    {/* Verified/Approved By info */}
                    {currentStatus === 'APPROVED' && (choice.approvedBy || choice.verifiedByName) && (
                      <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-700 font-medium flex items-center gap-2">
                        <CheckCircle2 size={16} />
                        <span>Disetujui oleh <strong>{choice.verifiedByName || choice.approvedBy}</strong> pada {choice.verifiedAt || choice.approvedAt ? new Date(choice.verifiedAt || (choice.approvedAt as number)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                      </div>
                    )}
                 </div>
               );
             })}
          </div>
       </motion.div>

       {/* Lightbox Modal */}
       <AnimatePresence>
         {lightboxUrl && (
           <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               onClick={() => setLightboxUrl(null)} 
               className="absolute inset-0 bg-black/85 backdrop-blur-sm" 
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }} 
               animate={{ opacity: 1, scale: 1 }} 
               exit={{ opacity: 0, scale: 0.9 }} 
               className="relative max-w-4xl max-h-[90vh] z-10 flex flex-col items-center"
             >
               <img 
                 src={lightboxUrl} 
                 alt="Evidence form preview" 
                 className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
                 referrerPolicy="no-referrer"
               />
               <button 
                 onClick={() => setLightboxUrl(null)} 
                 className="mt-4 px-6 py-2.5 bg-white text-gray-900 rounded-full text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-colors"
               >
                 Tutup Preview
               </button>
             </motion.div>
           </div>
         )}
       </AnimatePresence>
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
