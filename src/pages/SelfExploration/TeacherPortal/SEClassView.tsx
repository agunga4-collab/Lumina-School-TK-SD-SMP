import * as React from 'react';
import { 
  Search, Filter, CheckCircle2, AlertCircle, Eye, 
  ChevronRight, MessageSquare, User, Calendar, Clock, Plus,
  FileText, ExternalLink, Maximize2, Sparkles, UploadCloud,
  Trash2, Save, Send, Loader2, Lock
} from 'lucide-react';
import { 
  getSEPeriods, getSEEnrollmentsByClass, approveSEEnrollment, 
  requestSERevision, saveSETeacherComment, getSESelfAssessments,
  getActiveStudents,
  getSEActivities,
  saveSEEnrollment,
  db
} from '../../../lib/firebase';
import { SEPeriod, SEEnrollment, SEChoice, SESelfAssessment } from '../../../types';
import { useAuth } from '../../../context/AuthContext';
import { useAcademicYear } from '../../../context/AcademicYearContext';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { collection, getDocs, query, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const getChoiceStatusLabel = (status?: string, approvalStatus?: string) => {
  const s = status || (
    approvalStatus === 'APPROVED' ? 'APPROVED' :
    approvalStatus === 'REVISION_NEEDED' ? 'REVISION_REQUIRED' : 'SUBMITTED'
  );
  if (s === 'APPROVED') return 'Disetujui';
  if (s === 'REVISION_REQUIRED' || s === 'REVISION_NEEDED') return 'Butuh Revisi';
  return 'Menunggu Verifikasi';
};

export default function SEClassView() {
  const { classId } = useParams();
  const { profile } = useAuth();
  const { activeYear } = useAcademicYear();
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
    setLoading(true);
    try {
      // Get Classes with local filter on activeYear & unitId === 'JUNIOR_HIGH' & status === 'active'
      const q = query(collection(db, 'classes'), where('unitId', '==', 'JUNIOR_HIGH'));
      const cSnap = await getDocs(q);
      const filteredClasses = cSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((c: any) => c.academicYear === activeYear && c.status === 'active')
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setClasses(filteredClasses);

      // Get Active Period for active academic year
      const periods = await getSEPeriods('JUNIOR_HIGH');
      const active = periods?.find(p => p.academicYear === activeYear && p.isActive) || 
                     periods?.find(p => p.academicYear === activeYear) || null;
      setActivePeriod(active);

      if (active && currentClassId) {
        // 1. Get active students roster in the selected class for active academic year
        const roster = await getActiveStudents(currentClassId, activeYear);
        
        // 2. Get existing seEnrollments for the active period from seEnrollments collection
        const seSnap = await getDocs(query(
          collection(db, 'seEnrollments'), 
          where('periodId', '==', active.id)
        ));
        const seEnrollments = seSnap.docs.map(d => ({ id: d.id, ...d.data() } as SEEnrollment));

        // 3. Merge them
        const mergedEnrollments = (roster || []).map(student => {
          const found = (seEnrollments || []).find(se => se.studentId === student.id);
          if (found) {
            return {
              ...found,
              studentName: student.name, // ensure latest name
              classId: currentClassId // ensure mapped correctly to current class view
            };
          }

          return {
            id: `temp-${student.id}`,
            studentId: student.id,
            studentName: student.name,
            classId: currentClassId,
            grade: Number(student.grade || 7) as any,
            periodId: active.id,
            academicYear: activeYear,
            semester: active.semester || '1',
            periodNumber: active.periodNumber || 1,
            choices: [],
            status: 'Belum Memilih' as any,
            createdAt: Date.now(),
            updatedAt: Date.now()
          } as SEEnrollment;
        });

        setEnrollments(mergedEnrollments);
      } else {
        setEnrollments([]);
      }
    } catch (err) {
      console.error("Error fetching initial SE class view data:", err);
    } finally {
      setLoading(false);
    }
  }, [currentClassId, activeYear]);

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
           <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded-full text-[10px] font-black text-blue-700 uppercase tracking-wider">
             <Calendar size={12} />
             Tahun Ajaran Aktif: {activeYear}
           </div>
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
      ) : enrollments.length === 0 ? (
         <div className="p-20 bg-gray-50 rounded-[3rem] border-2 border-dashed border-gray-200 text-center">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest leading-relaxed">
              Belum ada data Self Exploration pada kelas ini untuk Tahun Ajaran {activeYear}.
            </p>
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
                       enroll.status === 'Belum Memilih' ? "bg-rose-50 text-rose-600 border border-rose-100" :
                       "bg-amber-50 text-amber-600"
                     )}>
                        {enroll.status}
                     </span>
                  </div>

                  <div className="space-y-3">
                     {(() => {
                        const slotsToDisplay = enroll.grade === 9 ? [1] : [1, 2];
                        return slotsToDisplay.map(slotNum => {
                           const c = enroll.choices?.find(x => x.slot === slotNum);
                           if (c) {
                              const choiceStatus = getChoiceStatusLabel(c.status, c.approvalStatus);
                              const hasAttachment = c.formAttachments && c.formAttachments.length > 0;
                              return (
                                 <div key={slotNum} className="p-4 bg-gray-50 rounded-2xl flex items-center justify-between gap-3 group">
                                    <div className="space-y-0.5 flex-1 min-w-0">
                                       <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Slot {slotNum}</span>
                                          <span className="text-[8px] font-bold text-gray-400 uppercase">•</span>
                                          <span className="text-[8px] font-black uppercase text-gray-500 tracking-wider">{c.strand === 'Physical' ? 'Material/Physical' : c.strand}</span>
                                       </div>
                                       <p className="text-[10px] font-bold text-gray-900 uppercase italic truncate" title={c.activityName || c.customActivity || ''}>
                                          {c.activityName || c.customActivity || '-'}
                                       </p>
                                       {hasAttachment && (
                                          <div className="flex items-center gap-1 mt-1 text-[8px] font-black text-blue-600 uppercase tracking-wider">
                                             <FileText size={10} />
                                             <span>Bukti Form Terlampir ({c.formAttachments!.length})</span>
                                          </div>
                                       )}
                                    </div>
                                    <span className={cn(
                                       "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider whitespace-nowrap",
                                       choiceStatus === 'Disetujui' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                       choiceStatus === 'Butuh Revisi' ? "bg-red-50 text-red-600 border border-red-100" :
                                       choiceStatus === 'Menunggu Verifikasi' ? "bg-blue-50 text-blue-600 border border-blue-100 animate-pulse" :
                                       "bg-gray-100 text-gray-500 border border-gray-200"
                                    )}>
                                       {choiceStatus}
                                    </span>
                                 </div>
                              );
                           } else {
                              return (
                                 <div key={slotNum} className="p-4 bg-gray-50/50 border border-dashed border-gray-200 rounded-2xl flex items-center justify-between group py-5">
                                    <div className="space-y-0.5">
                                       <span className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Slot {slotNum}</span>
                                       <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider italic">Belum Memilih</p>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-gray-50 text-gray-400 border border-gray-100 whitespace-nowrap">
                                       Belum Memilih
                                    </span>
                                 </div>
                              );
                           }
                        });
                     })()}
                  </div>

                  <div className="flex flex-col gap-2 pt-4 border-t border-gray-50">
                     <button 
                        onClick={() => handleOpenApproval(enroll)}
                        className={cn(
                          "w-full py-3 rounded-xl font-black uppercase text-[9px] tracking-widest transition-all",
                          enroll.status === 'Belum Memilih' 
                            ? "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200" 
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100"
                        )}
                     >
                        {enroll.status === 'Belum Memilih' ? "Bantu Buat Rencana" : "Review Rencana"}
                     </button>
                     {needsComment && (
                        <button 
                           onClick={() => handleOpenComment(enroll)}
                           className="w-full py-3 bg-emerald-500 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-emerald-600 shadow-lg shadow-emerald-100"
                        >
                           Isi Komentar Rapor
                        </button>
                     )}
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
  const [activeTab, setActiveTab] = React.useState<'choices' | 'weekly'>('choices');
  const [submitting, setSubmitting] = React.useState(false);
  const [revisionNotes, setRevisionNotes] = React.useState<Record<number, string>>({});
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  
  // Tab 1 state (Interactive choices)
  const [localChoices, setLocalChoices] = React.useState<any[]>([]);
  const [activities, setActivities] = React.useState<any[]>([]);
  const [uploadingSlot, setUploadingSlot] = React.useState<Record<number, boolean>>({});

  // Tab 2 state (17 week plans)
  const [plansDoc, setPlansDoc] = React.useState<any | null>(null);
  const [selectedPlanSlot, setSelectedPlanSlot] = React.useState<number>(1);
  const [scanningPlan, setScanningPlan] = React.useState(false);
  const [scanConfidence, setScanConfidence] = React.useState<'high' | 'medium' | 'low' | null>(null);
  const [resetModalPlanIndex, setResetModalPlanIndex] = React.useState<number | null>(null);
  const [confirmText, setConfirmText] = React.useState("");

  const MANDATED_WEEKS: Record<number, string> = {
    1: "Goal Setting & Plan Alignment",
    2: "Pre-assessment",
    8: "Mid-Term Evaluation",
    15: "Self Assessment",
    16: "Exhibition Prep",
    17: "Exhibition & Reflection"
  };

  const createDefaultWeeks = () => {
    return Array.from({ length: 17 }, (_, i) => {
      const weekNum = i + 1;
      return {
        weekNumber: weekNum,
        studentTarget: MANDATED_WEEKS[weekNum] || "",
        supervisorNotes: ""
      };
    });
  };

  const handleResetPlan = async (planIndex: number) => {
    if (!plansDoc || !enrollment) return;

    try {
      let roleName: "siswa" | "guru" | "admin" = "guru";
      if (profile?.role === 'SUPER_ADMIN' || profile?.role === 'ADMIN') {
        roleName = "admin";
      }

      const deletedByObj = {
        uid: profile?.uid || 'unknown',
        name: profile?.displayName || profile?.email || 'Unknown',
        role: roleName
      };

      const updatedPlans = plansDoc.plans.map((p: any) => {
        if (p.planIndex === planIndex) {
          return {
            ...p,
            objective: "",
            currentLevel: "",
            weeks: createDefaultWeeks(),
            status: "draft",
            photoUrl: null,
            driveFileId: null,
            photoFileName: null,
            scanConfidence: null,
            deletedBy: deletedByObj,
            deletedAt: serverTimestamp()
          };
        }
        return p;
      });

      const updatedDoc = {
        ...plansDoc,
        plans: updatedPlans,
        updatedAt: Date.now()
      };

      const planRef = doc(db, 'selfExploration', enrollment.studentId, 'plans', enrollment.periodId);
      await setDoc(planRef, updatedDoc, { merge: true });

      setPlansDoc(updatedDoc);
      alert("Rencana berhasil di-reset.");
    } catch (err: any) {
      console.error(err);
      alert("Gagal mereset rencana: " + err.message);
    }
  };

  const isStaff = React.useMemo(() => {
    if (!profile) return false;
    return profile.role === 'SUPER_ADMIN' || profile.role === 'HEAD_JUNIOR' || profile.unitId === 'JUNIOR_HIGH';
  }, [profile]);

  // Load activities and local state
  React.useEffect(() => {
    // 1. Fetch activities for Junior High
    getSEActivities('JUNIOR_HIGH').then(res => {
      if (res) setActivities(res);
    });

    // 2. Initialize local choices state
    const slots = enrollment.grade === 9 ? [1] : [1, 2];
    const initialChoices = slots.map(slotNum => {
      const existing = enrollment.choices?.find(c => c.slot === slotNum);
      if (existing) {
        return {
          slot: slotNum,
          strand: existing.strand || 'Physical',
          activityId: existing.activityId || '',
          activityName: existing.activityName || '',
          customActivity: existing.customActivity || '',
          status: existing.status || 'DRAFT',
          approvalStatus: existing.approvalStatus || 'PENDING',
          formAttachments: existing.formAttachments || [],
          revisionNote: existing.revisionNote || existing.approvalNote || '',
          approvedBy: existing.approvedBy || '',
          approvedAt: existing.approvedAt || null,
          verifiedByName: existing.verifiedByName || '',
          verifiedAt: existing.verifiedAt || null
        };
      }
      return {
        slot: slotNum,
        strand: 'Physical',
        activityId: '',
        activityName: '',
        customActivity: '',
        status: 'DRAFT',
        approvalStatus: 'PENDING',
        formAttachments: [],
        revisionNote: '',
        approvedBy: '',
        approvedAt: null,
        verifiedByName: '',
        verifiedAt: null
      };
    });
    setLocalChoices(initialChoices);

    // 3. Fetch weekly plan doc
    const planRef = doc(db, 'selfExploration', enrollment.studentId, 'plans', enrollment.periodId);
    getDoc(planRef).then(snap => {
      if (snap.exists()) {
        setPlansDoc(snap.data());
      } else {
        // Initialize blank templates
        const defaultDoc = {
          studentId: enrollment.studentId,
          periodId: enrollment.periodId,
          plans: slots.map(slotNum => ({
            planIndex: slotNum,
            strand: enrollment.choices?.find(c => c.slot === slotNum)?.strand || 'Physical',
            activityName: enrollment.choices?.find(c => c.slot === slotNum)?.activityName || '',
            weeks: Array.from({ length: 17 }, (_, i) => {
              const weekNum = i + 1;
              return {
                weekNumber: weekNum,
                studentTarget: MANDATED_WEEKS[weekNum] || '',
                supervisorNotes: ''
              };
            }),
            status: 'draft'
          })),
          updatedAt: Date.now()
        };
        setPlansDoc(defaultDoc);
      }
    });
  }, [enrollment]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  // Upload Choice Evidence (Tab 1)
  const handleChoiceAttachmentUpload = async (slot: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isStaff) {
      alert("Mode Read-Only: Anda tidak memiliki akses untuk mengunggah file.");
      return;
    }
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentChoice = localChoices.find(c => c.slot === slot);
    const attachments = currentChoice?.formAttachments || [];
    if (attachments.length + files.length > 3) {
      alert("Maksimal 3 file bukti yang dapat diunggah per slot.");
      return;
    }

    setUploadingSlot(prev => ({ ...prev, [slot]: true }));

    try {
      const newAttachments = [...attachments];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 5 * 1024 * 1024) {
          alert(`File "${file.name}" melebihi batas 5MB.`);
          continue;
        }

        const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowed.includes(file.type)) {
          alert(`Format "${file.name}" tidak didukung. Gunakan JPG, PNG, atau PDF.`);
          continue;
        }

        const fileId = Date.now() + "_" + Math.random().toString(36).substr(2, 9);
        const base64 = await fileToBase64(file);

        const res = await fetch("/api/self-exploration/upload-attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            base64File: base64,
            fileName: `${enrollment.studentId}_slot${slot}_${fileId}_${file.name}`,
            mimeType: file.type
          })
        });

        if (!res.ok) throw new Error("Gagal mengunggah ke server.");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Gagal.");

        newAttachments.push({
          id: fileId,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          driveFileId: data.driveFileId,
          downloadUrl: data.downloadUrl,
          uploadedAt: Date.now(),
          uploadedByUid: profile?.uid || 'guru'
        });
      }

      setLocalChoices(prev => prev.map(c => c.slot === slot ? { ...c, formAttachments: newAttachments } : c));
    } catch (err: any) {
      console.error(err);
      alert("Upload gagal: " + err.message);
    } finally {
      setUploadingSlot(prev => ({ ...prev, [slot]: false }));
    }
  };

  // Delete choice attachment
  const handleDeleteChoiceAttachment = (slot: number, fileId: string) => {
    if (!isStaff) return;
    if (confirm("Hapus file bukti ini?")) {
      setLocalChoices(prev => prev.map(c => c.slot === slot ? {
        ...c,
        formAttachments: c.formAttachments.filter((f: any) => f.id !== fileId)
      } : c));
    }
  };

  // Save Choice details (Tab 1)
  const handleSaveChoiceDetails = async (slot: number) => {
    if (!isStaff) {
      alert("Mode Read-Only: Anda tidak memiliki izin untuk menyimpan perubahan.");
      return;
    }
    const targetChoice = localChoices.find(c => c.slot === slot);
    if (!targetChoice) return;

    if (!targetChoice.strand) return alert("Pilih Strand!");
    if (!targetChoice.activityId && !targetChoice.customActivity) {
      return alert("Pilih Aktivitas atau tulis Aktivitas Kustom!");
    }

    setSubmitting(true);
    try {
      // Resolve activity name
      let actName = targetChoice.activityName;
      if (targetChoice.activityId && targetChoice.activityId !== 'custom') {
        const found = activities.find(a => a.id === targetChoice.activityId);
        if (found) actName = found.name;
      } else {
        actName = targetChoice.customActivity;
      }

      const finalChoice = {
        ...targetChoice,
        activityName: actName,
        status: targetChoice.status || 'SUBMITTED',
        approvalStatus: targetChoice.approvalStatus || 'PENDING',
        lastEditedBy: profile?.displayName || profile?.email || 'Guru',
        lastEditedAt: Date.now()
      };

      // update inside enrollment choices array
      const existingChoices = enrollment.choices || [];
      let updatedChoices = [...existingChoices];
      const existIdx = updatedChoices.findIndex(c => c.slot === slot);
      if (existIdx !== -1) {
        updatedChoices[existIdx] = { ...updatedChoices[existIdx], ...finalChoice };
      } else {
        updatedChoices.push(finalChoice as any);
      }

      // Check if the student enrollment has status set to Belum Memilih, update to draft/submitted
      let parentStatus = (enrollment.status as any) === 'Belum Memilih' ? 'DRAFT' : enrollment.status;

      await saveSEEnrollment({
        ...enrollment,
        choices: updatedChoices,
        status: parentStatus as any
      });

      alert("Pilihan aktivitas & bukti berhasil disimpan!");
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert("Gagal menyimpan: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Approve slot
  const handleApprove = async (slot: 1 | 2) => {
    setSubmitting(true);
    await approveSEEnrollment(enrollment.id, slot, profile?.email || 'System');
    setSubmitting(false);
    onSuccess();
  };

  // Request revision
  const handleRevision = async (slot: 1 | 2) => {
    const note = revisionNotes[slot]?.trim();
    if (!note) return alert("Catatan revisi wajib diisi untuk menjelaskan alasan perbaikan!");
    setSubmitting(true);
    await requestSERevision(enrollment.id, slot, note);
    setSubmitting(false);
    onSuccess();
  };

  // Scan Weekly Targets Handwritten Table (Tab 2)
  const handleScanWeeklyPlan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isStaff) {
      alert("Mode Read-Only: Anda tidak memiliki akses scan.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file || !plansDoc) return;

    setScanningPlan(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/self-exploration/scan-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64Image: base64,
          studentId: enrollment.studentId,
          periodId: enrollment.periodId,
          planIndex: selectedPlanSlot
        })
      });

      if (!res.ok) throw new Error("Gagal melakukan scan AI.");
      const scanData = await res.json();
      if (!scanData.success || !scanData.weeks) {
        throw new Error(scanData.error || "Gagal menginterpretasikan tabel.");
      }

      setScanConfidence(scanData.confidence || 'high');

      // Merge scanned data with mandated weeks
      const cleanWeeks = Array.from({ length: 17 }, (_, idx) => {
        const wNum = idx + 1;
        const scanItem = scanData.weeks.find((sw: any) => sw.weekNumber === wNum);
        return {
          weekNumber: wNum,
          studentTarget: MANDATED_WEEKS[wNum] || (scanItem ? scanItem.studentTarget || "" : ""),
          supervisorNotes: ""
        };
      });

      // Update in local plans state
      const updatedPlans = plansDoc.plans.map((p: any) => {
        if (p.planIndex === selectedPlanSlot) {
          return {
            ...p,
            driveFileId: scanData.driveFileId,
            scanConfidence: scanData.confidence || 'high',
            weeks: cleanWeeks
          };
        }
        return p;
      });

      setPlansDoc({ ...plansDoc, plans: updatedPlans });
      alert("Scan AI berhasil diselesaikan! Harap review hasil transkripsi.");
    } catch (err: any) {
      console.error(err);
      alert("Scan Gagal: " + err.message);
    } finally {
      setScanningPlan(false);
    }
  };

  // Save 17-week plans targets (Tab 2)
  const handleSaveWeeklyPlans = async () => {
    if (!isStaff) {
      alert("Mode Read-Only: Anda tidak memiliki akses untuk menyimpan.");
      return;
    }
    if (!plansDoc) return;

    setSubmitting(true);
    try {
      // Add audit trail inside the active plans array index
      const updatedPlans = plansDoc.plans.map((p: any) => {
        if (p.planIndex === selectedPlanSlot) {
          return {
            ...p,
            lastEditedBy: {
              uid: profile?.uid,
              name: profile?.displayName || profile?.email,
              role: "guru"
            },
            lastEditedAt: Date.now()
          };
        }
        return p;
      });

      const updatedDoc = {
        ...plansDoc,
        plans: updatedPlans,
        updatedAt: Date.now()
      };

      const planRef = doc(db, 'selfExploration', enrollment.studentId, 'plans', enrollment.periodId);
      await setDoc(planRef, updatedDoc, { merge: true });

      // Ensure that enrollment's choices match the weekly plan's strand & activity
      // by keeping them in sync if choices exist
      const activePlan = updatedPlans.find((p: any) => p.planIndex === selectedPlanSlot);
      if (activePlan) {
        const localChoice = localChoices.find(c => c.slot === selectedPlanSlot);
        if (localChoice) {
          const syncChoices = enrollment.choices.map(c => c.slot === selectedPlanSlot ? {
            ...c,
            strand: activePlan.strand || c.strand,
            activityName: activePlan.activityName || c.activityName
          } : c);
          await saveSEEnrollment({
            ...enrollment,
            choices: syncChoices
          });
        }
      }

      setPlansDoc(updatedDoc);
      alert("Rencana mingguan berhasil disimpan!");
      onSuccess();
    } catch (err: any) {
      console.error(err);
      alert("Simpan rencana mingguan gagal: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle target text edit in table
  const handleWeeklyTargetChange = (weekNum: number, value: string) => {
    if (!plansDoc) return;
    const updatedPlans = plansDoc.plans.map((p: any) => {
      if (p.planIndex === selectedPlanSlot) {
        return {
          ...p,
          weeks: p.weeks.map((w: any) => w.weekNumber === weekNum ? { ...w, studentTarget: value } : w)
        };
      }
      return p;
    });
    setPlansDoc({ ...plansDoc, plans: updatedPlans });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" id="teacher-approval-modal">
       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />
       
       <motion.div 
         initial={{ opacity: 0, scale: 0.95, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         exit={{ opacity: 0, scale: 0.95, y: 20 }}
         className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[92vh] flex flex-col"
       >
          {/* Header */}
          <div className="p-8 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
             <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Portal Guru SE</span>
                <h3 className="text-xl font-black italic uppercase tracking-tight mt-0.5">Rencana SE — {enrollment.studentName}</h3>
             </div>
             <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100">
                <Plus className="rotate-45" size={24} />
             </button>
          </div>

          {/* Access Banner */}
          {!isStaff && (
             <div className="bg-amber-50 border-b border-amber-100 px-8 py-3.5 text-xs text-amber-800 font-bold flex items-center gap-2">
                <Lock size={14} />
                <span>Mode Read-Only: Hanya staf Junior High dan Admin yang dapat mengedit rencana, melakukan scan, atau mengunggah bukti.</span>
             </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex border-b border-gray-100 px-8 bg-white gap-4">
             <button 
                onClick={() => setActiveTab('choices')}
                className={cn(
                  "py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                  activeTab === 'choices' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
                )}
             >
                Pilihan & Bukti Aktivitas
             </button>
             <button 
                onClick={() => setActiveTab('weekly')}
                className={cn(
                  "py-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                  activeTab === 'weekly' ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"
                )}
             >
                Rencana 17 Minggu & Scan AI
             </button>
          </div>

          {/* Content Area */}
          <div className="p-8 space-y-10 overflow-y-auto flex-1 max-h-[65vh]">
             {activeTab === 'choices' ? (
                // TAB 1: Choices and Evidence List
                <div className="space-y-10">
                   {localChoices.map(choice => {
                      const currentStatus = choice.status || (
                        choice.approvalStatus === 'APPROVED' ? 'APPROVED' :
                        choice.approvalStatus === 'REVISION_NEEDED' ? 'REVISION_REQUIRED' : 'SUBMITTED'
                      );

                      const filteredActs = activities.filter(a => a.strand === choice.strand && a.isActive);

                      return (
                        <div key={choice.slot} className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100 space-y-6">
                           <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
                              <div>
                                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Slot {choice.slot}</span>
                                 <h4 className="text-md font-black uppercase italic text-gray-800 mt-0.5">
                                    {choice.activityName || "Belum Memilih Aktivitas"}
                                 </h4>
                              </div>
                              <div className="flex items-center gap-3">
                                 <span className={cn(
                                   "px-3 py-1.5 text-[8px] font-black uppercase tracking-widest border rounded-full",
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

                           {/* Interactive Form for Teachers to edit plans */}
                           {isStaff && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                 <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Pilih Strand</label>
                                    <select 
                                       value={choice.strand}
                                       onChange={e => setLocalChoices(prev => prev.map(c => c.slot === choice.slot ? { ...c, strand: e.target.value, activityId: '' } : c))}
                                       className="w-full px-4 h-11 rounded-xl border-gray-200 font-bold text-xs focus:ring-2 focus:ring-blue-600 uppercase tracking-wider"
                                    >
                                       <option value="Physical">Material/Physical</option>
                                       <option value="Imaginal">Imaginal</option>
                                       <option value="Logical">Logical</option>
                                       <option value="Social">Social</option>
                                       <option value="Environmental">Environmental</option>
                                       <option value="Global_Citizen">Global Citizen</option>
                                    </select>
                                 </div>

                                 <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Pilih Aktivitas</label>
                                    <select 
                                       value={choice.activityId || (choice.customActivity ? 'custom' : '')}
                                       onChange={e => {
                                          const val = e.target.value;
                                          setLocalChoices(prev => prev.map(c => c.slot === choice.slot ? { 
                                             ...c, 
                                             activityId: val === 'custom' ? 'custom' : val,
                                             customActivity: val === 'custom' ? c.customActivity : ''
                                          } : c));
                                       }}
                                       className="w-full px-4 h-11 rounded-xl border-gray-200 font-bold text-xs focus:ring-2 focus:ring-blue-600"
                                    >
                                       <option value="">-- Pilih Aktivitas --</option>
                                       {filteredActs.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                       <option value="custom">Tulis Sendiri (Custom)</option>
                                    </select>
                                 </div>

                                 {(choice.activityId === 'custom' || !choice.activityId) && (
                                    <div className="space-y-2 md:col-span-2">
                                       <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Aktivitas Custom (Ketik Manual)</label>
                                       <input 
                                          type="text"
                                          value={choice.customActivity || ''}
                                          onChange={e => setLocalChoices(prev => prev.map(c => c.slot === choice.slot ? { ...c, customActivity: e.target.value } : c))}
                                          placeholder="Ketik nama aktivitas mandiri..."
                                          className="w-full px-4 h-11 rounded-xl border-gray-200 font-bold text-xs focus:ring-2 focus:ring-blue-600"
                                       />
                                    </div>
                                 )}
                              </div>
                           )}

                           {/* Bukti Form Gallery */}
                           <div className="space-y-3">
                              <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Bukti Form Pemilihan</label>
                              {choice.formAttachments && choice.formAttachments.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                  {choice.formAttachments.map((file: any) => {
                                    const isImg = file.mimeType?.startsWith('image/');
                                    return (
                                      <div key={file.id} className="bg-white border border-gray-200 p-3 rounded-2xl flex flex-col justify-between space-y-3 shadow-sm hover:shadow-md transition-all relative group">
                                        {isStaff && (
                                           <button 
                                              onClick={() => handleDeleteChoiceAttachment(choice.slot, file.id)}
                                              className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors z-10"
                                              title="Hapus file"
                                           >
                                              <Trash2 size={12} />
                                           </button>
                                        )}

                                        {isImg ? (
                                          <div 
                                            onClick={() => setLightboxUrl(file.downloadUrl)}
                                            className="aspect-video w-full rounded-xl bg-gray-100 overflow-hidden relative cursor-zoom-in"
                                          >
                                            <img 
                                              src={file.downloadUrl} 
                                              alt={file.fileName} 
                                              className="w-full h-full object-cover"
                                              referrerPolicy="no-referrer"
                                            />
                                            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                              <Maximize2 size={16} />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="aspect-video w-full rounded-xl bg-blue-50 border border-blue-100 flex flex-col items-center justify-center text-blue-600 space-y-1">
                                            <FileText size={24} />
                                            <span className="text-[9px] font-black uppercase tracking-wider">PDF</span>
                                          </div>
                                        )}

                                        <div className="space-y-1">
                                          <p className="text-[10px] font-bold text-gray-800 truncate" title={file.fileName}>{file.fileName}</p>
                                          <p className="text-[8px] font-bold text-gray-400 uppercase">{(file.sizeBytes / 1024).toFixed(0)} KB</p>
                                        </div>

                                        <a 
                                          href={file.downloadUrl} 
                                          target="_blank" 
                                          rel="noreferrer" 
                                          className="py-2 bg-gray-50 border border-gray-100 hover:bg-gray-100 text-gray-600 rounded-xl text-[8px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-1 transition-all"
                                        >
                                          <ExternalLink size={10} /> Tab Baru
                                        </a>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="p-4 bg-amber-50/40 border border-dashed border-amber-100 text-amber-800 rounded-2xl text-[10px] font-bold uppercase tracking-wider italic">
                                  Belum ada file bukti yang terlampir.
                                </div>
                              )}

                              {/* Upload buttons for teacher (tab 1 evidence) */}
                              {isStaff && (
                                 <div className="flex gap-3 pt-2">
                                    <label className="cursor-pointer flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold uppercase text-[9px] tracking-wider hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-sm">
                                       <UploadCloud size={14} /> Ambil Foto (Kamera)
                                       <input 
                                          type="file" 
                                          accept="image/*" 
                                          capture="environment" 
                                          onChange={e => handleChoiceAttachmentUpload(choice.slot, e)} 
                                          className="hidden" 
                                       />
                                    </label>
                                    <label className="cursor-pointer flex-1 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold uppercase text-[9px] tracking-wider hover:bg-gray-50 flex items-center justify-center gap-1.5 shadow-sm">
                                       <Plus size={14} /> Unggah dari Galeri
                                       <input 
                                          type="file" 
                                          accept="image/*,application/pdf" 
                                          multiple
                                          onChange={e => handleChoiceAttachmentUpload(choice.slot, e)} 
                                          className="hidden" 
                                       />
                                    </label>
                                    {uploadingSlot[choice.slot] && (
                                       <div className="flex items-center text-[10px] text-blue-600 font-bold uppercase tracking-wider gap-1 animate-pulse">
                                          <Loader2 className="animate-spin" size={14} /> Mengunggah...
                                       </div>
                                    )}
                                 </div>
                              )}
                           </div>

                           {/* Interactive modification / Audit Trail */}
                           {isStaff && (
                              <div className="flex justify-end pt-3">
                                 <button
                                    onClick={() => handleSaveChoiceDetails(choice.slot)}
                                    disabled={submitting}
                                    className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-gray-800 flex items-center gap-1.5 disabled:opacity-40"
                                 >
                                    <Save size={12} /> Simpan Rencana & Bukti
                                 </button>
                              </div>
                           )}

                           {/* Revision input & approval buttons */}
                           {choice.approvalStatus === 'PENDING' && isStaff && (
                             <div className="space-y-4 pt-4 border-t border-gray-100">
                                <textarea 
                                  placeholder="Masukan catatan revisi wajib di sini jika menolak rencana siswa..."
                                  value={revisionNotes[choice.slot] || ''}
                                  onChange={e => setRevisionNotes(prev => ({ ...prev, [choice.slot]: e.target.value }))}
                                  className="w-full h-20 p-4 bg-gray-100/50 rounded-2xl border-none font-bold focus:ring-2 focus:ring-red-500 resize-none text-xs text-gray-800 placeholder-gray-400"
                                />
                                <div className="flex gap-4">
                                   <button 
                                      disabled={submitting}
                                      onClick={() => handleRevision(choice.slot)}
                                      className="flex-1 py-3.5 border-2 border-red-500 text-red-500 rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-red-50 transition-colors disabled:opacity-45"
                                   >
                                      Minta Revisi
                                   </button>
                                   <button 
                                      disabled={submitting}
                                      onClick={() => handleApprove(choice.slot)}
                                      className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-100 transition-colors disabled:opacity-45"
                                   >
                                      Setujui Pilihan
                                   </button>
                                </div>
                             </div>
                           )}

                           {/* Revision info */}
                           {currentStatus === 'REVISION_REQUIRED' && (choice.revisionNote || choice.approvalNote) && (
                             <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-xs text-red-600 font-medium leading-relaxed">
                               <strong>Catatan Revisi Terkirim:</strong> "{choice.revisionNote || choice.approvalNote}"
                             </div>
                           )}

                           {/* Verified By Info */}
                           {currentStatus === 'APPROVED' && (choice.approvedBy || choice.verifiedByName) && (
                             <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs text-emerald-700 font-medium flex items-center gap-2 leading-relaxed">
                               <CheckCircle2 size={16} />
                               <span>Disetujui oleh <strong>{choice.verifiedByName || choice.approvedBy}</strong> {choice.verifiedAt || choice.approvedAt ? `pada ${new Date(choice.verifiedAt || (choice.approvedAt as number)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                             </div>
                           )}

                           {/* Audit trail display */}
                           {choice.lastEditedBy && (
                              <div className="text-[8px] font-black uppercase tracking-widest text-gray-400 text-right pt-2">
                                 Terakhir diubah oleh {choice.lastEditedBy} pada {new Date(choice.lastEditedAt!).toLocaleString('id-ID')}
                              </div>
                           )}
                        </div>
                      );
                   })}
                </div>
             ) : (
                // TAB 2: Weekly Rencana & AI Scan
                <div className="space-y-8">
                   {/* Slot Selection for Plan (Grade 7/8 only) */}
                   {enrollment.grade !== 9 && (
                      <div className="flex bg-gray-100/50 p-1.5 rounded-2xl gap-2 w-fit">
                         <button 
                            onClick={() => setSelectedPlanSlot(1)}
                            className={cn(
                              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                              selectedPlanSlot === 1 ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                            )}
                         >
                            Weekly Plan Slot 1
                         </button>
                         <button 
                            onClick={() => setSelectedPlanSlot(2)}
                            className={cn(
                              "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                              selectedPlanSlot === 2 ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                            )}
                         >
                            Weekly Plan Slot 2
                         </button>
                      </div>
                   )}

                   {/* AI Scan handwritten Table Option */}
                   {isStaff && (
                      <div className="p-8 bg-blue-50/40 rounded-3xl border border-blue-100 space-y-4">
                         <div className="flex items-start gap-3">
                            <Sparkles className="text-blue-600 mt-1 shrink-0" size={20} />
                            <div>
                               <h4 className="text-xs font-black uppercase tracking-wider text-blue-900">Scan Rencana Tulisan Tangan AI</h4>
                               <p className="text-[10px] font-medium text-blue-700/80 leading-relaxed mt-1">
                                  Bantu siswa mengunggah foto tabel rencana mingguan mereka. Sistem AI Vision akan membaca tulisan tangan siswa dan mentranskripsinya otomatis ke baris tabel di bawah.
                               </p>
                            </div>
                         </div>

                         <div className="flex flex-col sm:flex-row gap-3 pt-2 items-center">
                            <label className="cursor-pointer flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold uppercase text-[9px] tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-blue-100 w-full">
                               <UploadCloud size={14} /> Ambil Foto Rencana (Kamera)
                               <input 
                                  type="file" 
                                  accept="image/*" 
                                  capture="environment" 
                                  onChange={handleScanWeeklyPlan} 
                                  className="hidden" 
                               />
                            </label>
                            <label className="cursor-pointer flex-1 py-3 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-bold uppercase text-[9px] tracking-wider flex items-center justify-center gap-1.5 shadow-sm w-full">
                               <Plus size={14} /> Unggah Rencana dari Galeri
                               <input 
                                  type="file" 
                                  accept="image/*" 
                                  onChange={handleScanWeeklyPlan} 
                                  className="hidden" 
                               />
                            </label>
                         </div>

                         {scanningPlan && (
                            <div className="flex items-center text-[10px] text-blue-600 font-bold uppercase tracking-wider gap-1.5 justify-center py-2 animate-pulse">
                               <Loader2 className="animate-spin" size={14} /> AI sedang menganalisis & mentranskrip tabel rencana mingguan...
                            </div>
                         )}
                      </div>
                   )}

                   {/* Preview Dokumen Terunggah */}
                    {plansDoc && (() => {
                       const activePlan = plansDoc.plans?.find((p: any) => p.planIndex === selectedPlanSlot);
                       if (activePlan && (activePlan.driveFileId || activePlan.photoUrl)) {
                          return (
                             <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4 mb-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Preview Dokumen Terunggah</p>
                                <div className="relative aspect-video max-h-64 rounded-2xl overflow-hidden border border-gray-200 bg-white">
                                   <img 
                                      src={activePlan.driveFileId ? `/api/self-exploration/plan-photo/${activePlan.driveFileId}` : activePlan.photoUrl!} 
                                      alt="Scanned plan physical table" 
                                      className="w-full h-full object-cover cursor-zoom-in"
                                      onClick={() => setLightboxUrl(activePlan.driveFileId ? `/api/self-exploration/plan-photo/${activePlan.driveFileId}` : activePlan.photoUrl!)}
                                      referrerPolicy="no-referrer"
                                   />
                                </div>
                                <div className="flex items-center justify-between">
                                   <div className="flex items-center gap-2">
                                      <CheckCircle2 size={16} className="text-emerald-500" />
                                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Berhasil Diunggah</span>
                                   </div>
                                   {isStaff && (
                                      <button
                                         type="button"
                                         onClick={async () => {
                                            if (confirm("Hapus foto dari tampilan Plan? File asli tetap tersimpan sebagai arsip di Google Drive, tetapi tidak lagi tampil di aplikasi.")) {
                                               try {
                                                  const updatedPlans = plansDoc.plans.map((p: any) => {
                                                     if (p.planIndex === selectedPlanSlot) {
                                                        return { 
                                                           ...p, 
                                                           photoUrl: null, 
                                                           driveFileId: null, 
                                                           photoFileName: null,
                                                           scanConfidence: null,
                                                           photoHiddenAt: Date.now(),
                                                           photoHiddenBy: {
                                                              uid: profile?.uid || 'unknown',
                                                              name: profile?.displayName || profile?.email || 'Unknown',
                                                              role: "guru"
                                                           }
                                                        };
                                                     }
                                                     return p;
                                                  });
                                                  const updatedDoc = {
                                                     ...plansDoc,
                                                     plans: updatedPlans,
                                                     updatedAt: Date.now()
                                                  };
                                                  const planRef = doc(db, 'selfExploration', enrollment.studentId, 'plans', enrollment.periodId);
                                                  await setDoc(planRef, updatedDoc, { merge: true });
                                                  setPlansDoc(updatedDoc);
                                                  alert("Foto berhasil dihapus dari tampilan.");
                                               } catch (err: any) {
                                                  console.error(err);
                                                  alert("Gagal menghapus foto: " + err.message);
                                               }
                                            }
                                         }}
                                         className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all"
                                      >
                                         <Trash2 size={12} /> Hapus Foto
                                      </button>
                                   )}
                                </div>
                             </div>
                          );
                       }
                       return null;
                    })()}

                    {/* Weekly Table Editor */}
                   {plansDoc ? (
                      <div className="space-y-4">
                         <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wider text-gray-400">Transkripsi Target 17 Minggu</h4>
                            <div className="flex items-center gap-3">
                               {isStaff && (
                                  <button 
                                     type="button"
                                     onClick={() => setResetModalPlanIndex(selectedPlanSlot)}
                                     className="px-4 py-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-xl font-black uppercase text-[9px] tracking-widest flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                                  >
                                     <Trash2 size={12} /> Hapus Rencana Ini
                                  </button>
                               )}
                               {isStaff && (
                                  <button 
                                     onClick={handleSaveWeeklyPlans}
                                     disabled={submitting}
                                     className="px-5 py-2 bg-gray-900 text-white hover:bg-gray-800 rounded-xl font-black uppercase text-[9px] tracking-widest flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                                  >
                                     <Save size={12} /> Simpan Rencana Mingguan
                                  </button>
                               )}
                            </div>
                         </div>

                         {/* Weeks List */}
                         <div className="border border-gray-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                            <div className="overflow-x-auto">
                               <table className="w-full text-left border-collapse">
                                  <thead>
                                     <tr className="bg-gray-50 border-b border-gray-100 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                        <th className="py-3 px-4 text-center w-20">Minggu</th>
                                        <th className="py-3 px-6">Target Pembelajaran Siswa</th>
                                     </tr>
                                  </thead>
                                  <tbody>
                                     {plansDoc.plans?.find((p: any) => p.planIndex === selectedPlanSlot)?.weeks?.map((w: any) => {
                                        const isMandated = !!MANDATED_WEEKS[w.weekNumber];
                                        return (
                                           <tr key={w.weekNumber} className={cn("border-b border-gray-50 last:border-0", isMandated && "bg-amber-50/10")}>
                                              <td className="py-3.5 px-4 text-center border-r border-gray-50/50">
                                                 <div className={cn(
                                                    "w-9 h-9 rounded-xl flex items-center justify-center font-black mx-auto text-xs",
                                                    isMandated ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                                                 )}>
                                                    W{w.weekNumber}
                                                 </div>
                                              </td>
                                              <td className="py-3.5 px-6">
                                                 {isMandated ? (
                                                    <div className="flex items-center justify-between">
                                                       <span className="text-xs font-bold text-gray-800">{w.studentTarget}</span>
                                                       <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded">Mandated</span>
                                                    </div>
                                                 ) : (
                                                    <input 
                                                       type="text"
                                                       value={w.studentTarget || ''}
                                                       disabled={!isStaff}
                                                       onChange={e => handleWeeklyTargetChange(w.weekNumber, e.target.value)}
                                                       placeholder="Ketik target pembelajaran minggu ini..."
                                                       className="w-full px-3 py-2 border-0 bg-transparent font-medium text-xs text-gray-800 focus:bg-gray-50 focus:ring-0 rounded-lg transition-all"
                                                    />
                                                 )}
                                              </td>
                                           </tr>
                                        );
                                     })}
                                  </tbody>
                               </table>
                            </div>
                         </div>
                      </div>
                   ) : (
                      <div className="py-12 text-center text-gray-400">
                         <Loader2 className="animate-spin inline-block mb-2" size={24} />
                         <p className="text-xs font-bold uppercase tracking-widest">Memuat rencana mingguan...</p>
                      </div>
                   )}
                </div>
             )}
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

       {/* Reset Plan Confirmation Modal */}
       <AnimatePresence>
         {resetModalPlanIndex !== null && (
           <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               onClick={() => {
                 setResetModalPlanIndex(null);
                 setConfirmText("");
               }} 
               className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} 
               animate={{ opacity: 1, scale: 1 }} 
               exit={{ opacity: 0, scale: 0.95 }} 
               className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-8 z-10 border border-gray-100"
             >
               <div className="text-center space-y-4">
                 <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                   <Trash2 size={28} />
                 </div>
                 <h3 className="text-lg font-black italic uppercase text-gray-900 tracking-tight">Hapus Rencana Mingguan</h3>
                 <p className="text-xs text-gray-500 font-medium leading-relaxed">
                   Apakah Anda yakin ingin menghapus/mereset seluruh rencana mingguan ini? Tindakan ini akan mengosongkan semua target mingguan dan foto terunggah. Pilihan aktivitas siswa akan tetap dipertahankan.
                 </p>
                 
                 <div className="space-y-2 text-left pt-2">
                   <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                     Ketik "HAPUS" untuk konfirmasi:
                   </label>
                   <input 
                     type="text" 
                     value={confirmText}
                     onChange={(e) => setConfirmText(e.target.value)}
                     placeholder="Ketik HAPUS"
                     className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 text-center placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-red-500 transition-all"
                   />
                 </div>

                 <div className="flex gap-4 pt-4">
                   <button 
                     onClick={() => {
                       setResetModalPlanIndex(null);
                       setConfirmText("");
                     }}
                     className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                   >
                     Batal
                   </button>
                   <button 
                     disabled={confirmText !== "HAPUS"}
                     onClick={async () => {
                       if (resetModalPlanIndex !== null) {
                         await handleResetPlan(resetModalPlanIndex);
                         setResetModalPlanIndex(null);
                         setConfirmText("");
                       }
                     }}
                     className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-40 disabled:hover:bg-red-600 shadow-lg shadow-red-100"
                   >
                     Ya, Hapus Rencana
                   </button>
                 </div>
               </div>
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
