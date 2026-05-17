import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, ChevronRight, Save, 
  Send, CheckCircle2, User, Users, 
  MessageSquare, Star, BookOpen, 
  Trophy, TrendingUp, Loader2, 
  AlertCircle, Info, Smile, Sparkles, Brain, Eye
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { 
  getReportCardById, updateReportCard, getReportConfig, 
  sendNotification, db 
} from '../../../lib/firebase';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { ReportCard, StudentReport, User as AppUser, ReportConfig, SEEnrollment } from '../../../types';
import { cn } from '../../../lib/utils';

import { toast } from 'sonner';

import StudentSearch from '../../../components/StudentSearch';

const SCORE_LABELS = { A: 'Achieved', D: 'Developing', B: 'Beginning' };

export default function ReportInput() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [report, setReport] = React.useState<ReportCard | null>(null);
  const [currentStudentIndex, setCurrentStudentIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [config, setConfig] = React.useState<ReportConfig | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const [data, conf] = await Promise.all([
          getReportCardById(id),
          getReportConfig(currentUser.unitId)
        ]);
        setReport(data);
        setConfig(conf);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, currentUser.unitId]);

  if (loading) return (
    <div className="py-40 text-center">
      <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
      <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyiapkan Form Input Rapor...</p>
    </div>
  );

  if (!report) return (
    <div className="py-40 text-center space-y-4">
      <AlertCircle size={48} className="text-gray-100 mx-auto" />
      <h2 className="text-2xl font-black text-gray-900 uppercase italic">Rapor Tidak Ditemukan</h2>
      <button onClick={() => navigate('/academic/rapor')} className="text-blue-600 font-bold uppercase text-xs">Kembali ke Daftar</button>
    </div>
  );

  const currentStudent = report.studentReports[currentStudentIndex];

  const updateStudentField = (field: keyof StudentReport, value: any) => {
    setReport(prev => {
      if (!prev) return null;
      const newStudents = [...prev.studentReports];
      newStudents[currentStudentIndex] = { ...newStudents[currentStudentIndex], [field]: value };
      return { ...prev, studentReports: newStudents };
    });
  };

  const updateSubjectComment = (subject: string, comment: string) => {
    const newSubjectScores = { ...currentStudent.subjectScores };
    newSubjectScores[subject] = { ...newSubjectScores[subject], subjectComment: comment };
    updateStudentField('subjectScores', newSubjectScores);
  };

  const updateNumericScore = (subject: string, score: number) => {
    const newNumericScores = { ...currentStudent.numericScores, [subject]: score };
    updateStudentField('numericScores', newNumericScores);
  };

  const handleSave = async (statusOverride?: ReportCard['status'], rejectionNote?: string) => {
    setSaving(true);
    try {
      const updates: Partial<ReportCard> = {
        studentReports: report.studentReports,
        homeroomComment: report.homeroomComment,
        status: statusOverride || report.status
      };
      
      if (statusOverride === 'SUBMITTED') {
        updates.submittedAt = Date.now();
        updates.submittedBy = currentUser.email;

        // Notify Head Units
        const headUnitsSnap = await getDocs(query(collection(db, 'users'), where('unitId', 'in', [report.unitId, 'SUPER_ADMIN_UNIT']), where('role', 'in', ['HEAD_UNIT', 'SUPER_ADMIN'])));
        headUnitsSnap.docs.forEach(d => {
          const userData = d.data();
          if (userData.email) {
            sendNotification({
              userId: userData.email,
              type: 'REPORT_SUBMITTED',
              message: `Rapor ${report.classId} (${report.period}) menunggu approval.`,
              link: `/academic/rapor/${report.id}`
            });
          }
        });
      } else if (statusOverride === 'APPROVED') {
        updates.approvedAt = Date.now();
        updates.approvedBy = currentUser.email;

        // Notify Homeroom Teacher
        sendNotification({
          userId: report.homeroomTeacherId,
          type: 'REPORT_APPROVED',
          message: `Rapor ${report.classId} (${report.period}) telah disetujui.`,
          link: `/academic/rapor/${report.id}`
        });
      } else if (statusOverride === 'DRAFT' && rejectionNote) {
        // Rejection logic (returning to draft from submitted)
        sendNotification({
          userId: report.homeroomTeacherId,
          type: 'REPORT_REJECTED',
          message: `Rapor ${report.classId} (${report.period}) dikembalikan: ${rejectionNote}`,
          link: `/academic/rapor/${report.id}`
        });
      }

      await updateReportCard(report.id, updates);
      if (statusOverride) navigate('/academic/rapor');
      else alert("Draft Berhasil Disimpan");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isHomeroom = report.homeroomTeacherId === currentUser.email;
  const isHeadUnit = currentUser.role === 'HEAD_UNIT' || currentUser.role === 'SUPER_ADMIN';

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header & Student Progress */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm border-b-4 border-b-blue-600">
        <div className="flex items-start gap-6">
          <button onClick={() => navigate('/academic/rapor')} className="p-4 bg-gray-50 rounded-2xl text-gray-400 hover:text-blue-600 transition-all">
            <ChevronLeft size={24} />
          </button>
          <div className="space-y-1">
            <h1 className="text-3xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
              Input <span className="text-blue-600">Rapor</span>
            </h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{report.period} • {report.type.replace('_', ' ')}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
           {report.status === 'DRAFT' && (
             <button 
               onClick={() => handleSave('SUBMITTED')}
               disabled={saving}
               className="flex items-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
             >
                <Send size={16} /> Submit to Head Unit
             </button>
           )}
           {report.status === 'SUBMITTED' && isHeadUnit && (
             <div className="flex gap-3">
               <button 
                 onClick={() => handleSave('APPROVED')}
                 disabled={saving}
                 className="flex items-center gap-3 bg-emerald-500 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-50"
               >
                  <CheckCircle2 size={16} /> Approve
               </button>
               <button 
                 onClick={() => {
                   const note = prompt("Catatan penolakan:");
                   if (note) handleSave('DRAFT', note);
                 }}
                 disabled={saving}
                 className="flex items-center gap-3 bg-red-500 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-red-600 transition-all shadow-xl shadow-red-50"
               >
                  <AlertCircle size={16} /> Return
               </button>
             </div>
           )}
           <button 
             onClick={() => navigate(`/academic/rapor/${report.id}/preview`)}
             className="flex items-center gap-3 bg-white text-gray-900 border border-gray-100 px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-gray-50 transition-all shadow-sm"
           >
              <Eye size={16} /> Preview HTML
           </button>
           <button 
             onClick={() => handleSave()}
             disabled={saving}
             className="flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-gray-800 transition-all"
           >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
              Simpan Draft
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 h-full">
         {/* Sidebar Navigator */}
         <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
               <Users size={14} /> Student List
            </h3>

            <StudentSearch 
               placeholder="Loncat ke siswa..."
               onSelect={(student) => {
                  const idx = report.studentReports.findIndex(s => s.studentId === student.id || s.studentName === student.name);
                  if (idx !== -1) {
                     setCurrentStudentIndex(idx);
                  } else {
                     toast.error("Siswa tidak ditemukan dalam sesi rapor ini");
                  }
               }}
            />

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
               {report.studentReports.map((s, idx) => (
                 <button
                   key={idx}
                   onClick={() => setCurrentStudentIndex(idx)}
                   className={cn(
                     "w-full p-4 rounded-2xl flex items-center gap-3 text-left transition-all",
                     currentStudentIndex === idx ? "bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-100" : "hover:bg-gray-50 text-gray-500"
                   )}
                 >
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px]",
                      currentStudentIndex === idx ? "bg-blue-600 text-white" : "bg-gray-100"
                    )}>{s.studentName[0]}</div>
                    <span className="text-[11px] font-black uppercase truncate">{s.studentName}</span>
                 </button>
               ))}
            </div>
         </div>

         {/* Main Content */}
         <div className="lg:col-span-3 space-y-10">
            {/* Student Header */}
            <div className="bg-gray-900 text-white p-10 rounded-[3rem] shadow-xl flex items-center justify-between relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
               <div className="flex items-center gap-8 relative">
                  <div className="w-16 h-16 bg-white/10 rounded-[1.5rem] flex items-center justify-center font-black text-3xl italic text-blue-400">
                     {currentStudent.studentName[0]}
                  </div>
                  <div className="space-y-1">
                     <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em]">{currentStudent.studentId}</p>
                     <h2 className="text-3xl font-black uppercase italic tracking-tighter">{currentStudent.studentName}</h2>
                  </div>
               </div>
               <div className="flex flex-col items-end gap-2 relative">
                  <span className="px-4 py-1.5 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-200">Class {report.classId}</span>
                  <p className="text-[9px] font-bold text-gray-400 italic">Progress: {currentStudentIndex + 1} / {report.studentReports.length}</p>
               </div>
            </div>

            {/* Input Sections */}
            <div className="grid grid-cols-1 gap-10">
               {/* Spiritual Health & Home Teacher */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                        <Smile size={18} className="text-emerald-500" /> Spiritual Health Remark
                     </h3>
                     <div className="space-y-2">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{currentStudent.spiritualHealth.lgText}</p>
                        <textarea 
                           className="w-full h-32 bg-gray-50 border-none rounded-2xl p-6 text-xs font-bold focus:ring-4 focus:ring-emerald-50 focus:bg-white outline-none transition-all resize-none"
                           placeholder="Tuliskam catatan perkembangan spiritual siswa..."
                           value={currentStudent.spiritualHealth.remark}
                           onChange={(e) => {
                             const sh = { ...currentStudent.spiritualHealth, remark: e.target.value };
                             updateStudentField('spiritualHealth', sh);
                           }}
                        />
                     </div>
                  </div>

                  <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                        <MessageSquare size={18} className="text-blue-500" /> General Comments
                     </h3>
                     <textarea 
                        className="w-full h-40 bg-gray-50 border-none rounded-2xl p-6 text-xs font-bold focus:ring-4 focus:ring-blue-50 focus:bg-white outline-none transition-all resize-none"
                        placeholder="Narasi catatan wali kelas untuk Monthly/Midterm report..."
                        value={report.homeroomComment}
                        onChange={(e) => setReport(prev => prev ? { ...prev, homeroomComment: e.target.value } : null)}
                     />
                  </div>
               </div>

               {/* Learning Goals - Read Only */}
               <div className="p-10 bg-white rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
                  <div className="flex items-center justify-between">
                     <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                        <BookOpen size={18} className="text-blue-500" /> Subject Evaluations
                     </h3>
                     <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Data dari Modul Asesmen</span>
                  </div>

                  <div className="space-y-10">
                     {Object.entries(currentStudent.subjectScores).map(([subject, anyData]) => {
                       const data = anyData as { lxdType: string; scores: { goalId: string; goalCode: string; goalText: string; score: string | null }[]; subjectComment?: string };
                       return (
                       <div key={subject} className="space-y-6 border-l-4 border-l-blue-100 pl-8">
                          <div className="flex items-center justify-between">
                             <h4 className="text-sm font-black text-gray-900 uppercase italic">{subject}</h4>
                             {report.isEndTerm && (
                               <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-2">
                                     <span className="text-[9px] font-black text-gray-400 uppercase">Numeric:</span>
                                     <input 
                                       type="number"
                                       className="w-16 h-8 bg-gray-50 border border-gray-100 rounded-lg text-center text-[11px] font-black"
                                       value={currentStudent.numericScores[subject] || ''}
                                       onFocus={(e) => e.target.select()}
                                       onChange={(e) => updateNumericScore(subject, parseInt(e.target.value))}
                                     />
                                  </div>
                               </div>
                             )}
                          </div>
                          
                          <div className="space-y-3">
                             {data.scores.map((s, idx) => (
                               <div key={idx} className="flex items-center justify-between p-4 bg-gray-50/50 rounded-2xl group hover:bg-white hover:shadow-sm transition-all">
                                  <div className="flex-1 space-y-0.5">
                                     <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-blue-500 uppercase">{s.goalCode}</span>
                                     </div>
                                     <p className="text-[10px] font-bold text-gray-600 line-clamp-2 pr-10">{s.goalText}</p>
                                  </div>
                                  <div className={cn(
                                    "w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black text-white shadow-sm",
                                    s.score === 'A' ? "bg-emerald-500" : s.score === 'D' ? "bg-amber-400" : s.score === 'B' ? "bg-rose-500" : "bg-gray-200"
                                  )}>
                                     {s.score || '-'}
                                  </div>
                               </div>
                             ))}
                          </div>

                          {report.isEndTerm && (
                            <div className="space-y-2 mt-4">
                               <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Subject Narrative / Comment</label>
                               <textarea 
                                  className="w-full h-24 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-[11px] font-bold outline-none transition-all resize-none"
                                  placeholder={`Tulis narasi untuk mapel ${subject}...`}
                                  value={data.subjectComment || ''}
                                  onChange={(e) => updateSubjectComment(subject, e.target.value)}
                               />
                            </div>
                          )}
                       </div>
                     )})}
                  </div>
               </div>

               {/* Attendance Controls */}
               <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                     <TrendingUp size={18} className="text-purple-500" /> Attendance Records
                  </h3>
                  <div className="grid grid-cols-3 gap-6">
                     <AttendanceInput 
                       label="Sakit (Sick)" 
                       value={currentStudent.attendance?.sick || 0}
                       onChange={(val) => updateStudentField('attendance', { ...currentStudent.attendance, sick: val })}
                     />
                     <AttendanceInput 
                       label="Izin (Excused)" 
                       value={currentStudent.attendance?.excused || 0}
                       onChange={(val) => updateStudentField('attendance', { ...currentStudent.attendance, excused: val })}
                     />
                     <AttendanceInput 
                       label="Alpa (Absent)" 
                       value={currentStudent.attendance?.absent || 0}
                       onChange={(val) => updateStudentField('attendance', { ...currentStudent.attendance, absent: val })}
                     />
                  </div>
               </div>

               {/* Self-Exploration Review (SMP Only) */}
               {report.unitId === 'JUNIOR_HIGH' && report.isEndTerm && (
                 <SelfExplorationReview 
                    studentId={currentStudent.studentId} 
                    periodId={report.period} // Need careful mapping here usually
                 />
               )}

               {/* Graduation (End Term Only, Head Unit Only) */}
               {report.isEndTerm && isHeadUnit && (
                 <div className="p-8 bg-rose-50 border-2 border-rose-100 rounded-[2.5rem] flex items-center justify-between">
                    <div className="space-y-1">
                       <h3 className="text-sm font-black text-rose-900 uppercase italic">Status Kelulusan / Kenaikan</h3>
                       <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Wajib diisi oleh Head Unit sebelum approval</p>
                    </div>
                    <div className="flex items-center bg-white p-2 rounded-2xl shadow-sm">
                       {['LULUS', 'TIDAK_LULUS'].map(st => (
                         <button
                           key={st}
                           onClick={() => updateStudentField('graduationStatus', st)}
                           className={cn(
                             "px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all",
                             currentStudent.graduationStatus === st 
                               ? (st === 'LULUS' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") 
                               : "text-gray-400"
                           )}
                         >
                           {st.replace('_', ' ')}
                         </button>
                       ))}
                    </div>
                 </div>
               )}
            </div>

            {/* Bottom Navigator */}
            <div className="flex items-center justify-between bg-gray-50 p-6 rounded-[2rem]">
               <button 
                 disabled={currentStudentIndex === 0}
                 onClick={() => setCurrentStudentIndex(prev => prev - 1)}
                 className="flex items-center gap-2 px-6 py-4 bg-white text-gray-400 rounded-xl font-black uppercase text-[10px] hover:text-blue-600 disabled:opacity-30 transition-all shadow-sm"
               >
                 <ChevronLeft size={16} /> Previous Student
               </button>
               <div className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
                 {currentStudentIndex + 1} / {report.studentReports.length} Checked
               </div>
               <button 
                 disabled={currentStudentIndex === report.studentReports.length - 1}
                 onClick={() => setCurrentStudentIndex(prev => prev + 1)}
                 className="flex items-center gap-2 px-6 py-4 bg-white text-gray-400 rounded-xl font-black uppercase text-[10px] hover:text-blue-600 disabled:opacity-30 transition-all shadow-sm"
               >
                 Next Student <ChevronRight size={16} />
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}

function SelfExplorationReview({ studentId, periodId }: { studentId: string, periodId: string }) {
  const [enrollment, setEnrollment] = React.useState<SEEnrollment | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchSE = async () => {
      // Find active period for semi-annual (SMP semesters have 2 periods)
      // Logic might need to be specific: if Rapor Sem 1, find sePeriods in that Sem.
      const pSnap = await getDocs(query(collection(db, 'sePeriods'), where('label', '==', periodId), limit(1)));
      if (!pSnap.empty) {
        const pId = pSnap.docs[0].id;
        const eSnap = await getDocs(query(collection(db, 'seEnrollments'), where('studentId', '==', studentId), where('periodId', '==', pId), limit(1)));
        if (!eSnap.empty) {
          setEnrollment({ id: eSnap.docs[0].id, ...eSnap.docs[0].data() } as SEEnrollment);
        }
      }
      setLoading(false);
    };
    fetchSE();
  }, [studentId, periodId]);

  if (loading) return null;
  if (!enrollment) return null;

  return (
    <div className="p-8 bg-blue-50 border border-blue-100 rounded-[2.5rem] space-y-6">
       <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-blue-900 uppercase tracking-widest flex items-center gap-3">
             <Sparkles size={18} /> Self-Exploration Summary
          </h3>
          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">SMP Lazuardi GCS</span>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {enrollment.choices.map(c => (
            <div key={c.slot} className="space-y-3 bg-white/50 p-6 rounded-2xl border border-blue-100/50">
               <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase text-blue-600">{c.strand}</p>
                  <p className="text-[10px] font-black text-gray-400">Slot {c.slot}</p>
               </div>
               <p className="text-sm font-black italic uppercase text-gray-900">{c.activityName}</p>
               <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase text-gray-400">Teacher Comment:</p>
                  <p className="text-[11px] font-medium text-gray-600 leading-relaxed italic">
                     {c.teacherComment || 'Belum ada komentar dari guru pengampu/homeroom.'}
                  </p>
               </div>
               <button 
                 onClick={() => {
                   // Copy to clipboard or prompt to insert
                   if (c.teacherComment) {
                     navigator.clipboard.writeText(c.teacherComment);
                     alert("Komentar disalin! Tempelkan di bagian General Comments atau Subject narasi jika perlu.");
                   }
                 }}
                 className="text-[10px] font-black uppercase text-blue-600 hover:underline"
               >
                  Salin Komentar
               </button>
            </div>
          ))}
       </div>
    </div>
  );
}

function AttendanceInput({ label, value, onChange }: { label: string, value: number, onChange: (val: number) => void }) {
  return (
    <div className="space-y-2">
       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
       <div className="flex items-center gap-3">
          <button 
            onClick={() => onChange(Math.max(0, value - 1))}
            className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all"
          >-</button>
          <input 
             type="number"
             className="w-16 h-10 bg-white border border-gray-100 rounded-xl text-center text-xs font-black outline-none"
             value={value}
             onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          />
          <button 
            onClick={() => onChange(value + 1)}
            className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all"
          >+</button>
       </div>
    </div>
  );
}
