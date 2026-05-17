import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, ChevronRight, FilePlus, 
  Settings, Users, CheckCircle2, 
  Loader2, AlertCircle, Info, Sparkles
} from 'lucide-react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  getStudentsByClass, getAssessmentsForReport, 
  addReportCard, getReportConfig 
} from '../../../lib/firebase';
import { 
  ReportCard, ReportCardType, User as AppUser, 
  Student, Assessment, StudentReport 
} from '../../../types';
import { cn } from '../../../lib/utils';

const STEPS = [
  { id: 1, title: 'Konfigurasi', icon: <Settings size={18} /> },
  { id: 2, title: 'Validasi Siswa', icon: <Users size={18} /> },
  { id: 3, title: 'Inisialisasi', icon: <Sparkles size={18} /> }
];

const REPORT_TYPES: { value: ReportCardType; label: string; desc: string }[] = [
  { value: 'MONTHLY', label: 'Monthly Report', desc: 'Laporan progres bulanan siswa' },
  { value: 'MIDTERM', label: 'Mid-Term Report', desc: 'Rapor tengah semester' },
  { value: 'END_TERM_LAZUARDI', label: 'End Term (Profile Portfolio)', desc: 'Student Profile Portfolio & Rapor Diknas' }
];

export default function ReportCreate() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();
  
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Form State
  const [type, setType] = React.useState<ReportCardType>('MONTHLY');
  const [academicYear, setAcademicYear] = React.useState('2025/2026');
  const [semester, setSemester] = React.useState<"1" | "2">("1");
  const [classId, setClassId] = React.useState('');
  const [period, setPeriod] = React.useState('');

  // Loaded Data
  const [students, setStudents] = React.useState<Student[]>([]);
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);

  const handleFetchInitialData = async () => {
    if (!classId || !period) {
      alert("Harap lengkapi konfigurasi dasar");
      return;
    }
    
    setLoading(true);
    try {
      const [fetchedStudents, fetchedAssessments] = await Promise.all([
        getStudentsByClass(classId, academicYear),
        getAssessmentsForReport(classId, academicYear, semester)
      ]);

      if (fetchedStudents.length === 0) {
        throw new Error("Tidak ada siswa ditemukan di kelas " + classId);
      }

      setStudents(fetchedStudents);
      setAssessments(fetchedAssessments);
      setStep(2);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitializeReport = async () => {
    setSaving(true);
    try {
      const config = await getReportConfig(currentUser.unitId);
      
      const studentReports: StudentReport[] = students.map(student => {
        const subjectScores: any = {};
        
        // Group assessment scores by subject
        assessments.forEach(ass => {
          const studentScore = ass.scores.find(s => s.studentId === student.id);
          if (studentScore) {
            if (!subjectScores[ass.subject]) {
              subjectScores[ass.subject] = {
                lxdType: ass.lxdType,
                scores: []
              };
            }
            
            ass.goals.forEach(goal => {
              const gs = studentScore.goalScores.find(g => g.goalId === goal.goalId);
              subjectScores[ass.subject].scores.push({
                goalId: goal.goalId,
                goalCode: goal.goalCode,
                goalText: goal.goalText,
                score: gs?.score || null
              });
            });
          }
        });

        return {
          studentId: student.id,
          studentName: student.name,
          nisn: student.nisn || '',
          spiritualHealth: {
            lgId: config?.spiritualHealthLGId || '',
            lgText: 'Spiritual Health Assessment',
            remark: ''
          },
          subjectScores,
          numericScores: {},
          selfExplorationReflection: '',
          selfExplorationComment: '',
          clubScores: [],
          extracurricular: [],
          graduationStatus: null,
          reportStatus: 'DRAFT'
        };
      });

      const reportData: Omit<ReportCard, 'id' | 'createdAt' | 'updatedAt'> = {
        type: type,
        unitId: currentUser.unitId as any,
        classId,
        academicYear,
        semester,
        period,
        homeroomTeacherId: currentUser.email || '',
        homeroomComment: '',
        isEndTerm: type === 'END_TERM_LAZUARDI',
        studentReports,
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        approvedBy: null,
        publishedAt: null,
        createdBy: currentUser.email || ''
      };

      const reportId = await addReportCard(reportData);
      navigate(`/academic/rapor/${reportId}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      <div className="flex items-start gap-6">
        <button 
          onClick={() => navigate('/academic/rapor')} 
          className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
            New <span className="text-blue-600">Session</span>
          </h1>
          <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Inisialisasi Rapor Siswa</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-3xl border border-gray-100 shadow-sm w-fit">
        {STEPS.map((s, idx) => (
          <React.Fragment key={s.id}>
            <div className={cn(
              "flex items-center gap-3 transition-all",
              step === s.id ? "text-blue-600 scale-105" : step > s.id ? "text-emerald-500" : "text-gray-300"
            )}>
              <div className={cn(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                step === s.id ? "bg-blue-600 text-white shadow-lg" : step > s.id ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
              )}>
                {s.icon}
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">{s.title}</span>
            </div>
            {idx < STEPS.length - 1 && <div className="w-8 h-0.5 bg-gray-100 mx-2" />}
          </React.Fragment>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
               <div className="space-y-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Tipe Rapor</h3>
                  <div className="space-y-4">
                     {REPORT_TYPES.map(rt => (
                       <button
                         key={rt.value}
                         onClick={() => setType(rt.value)}
                         className={cn(
                           "w-full p-6 rounded-[2rem] border-2 text-left transition-all flex flex-col gap-1",
                           type === rt.value ? "bg-blue-50 border-blue-200" : "bg-white border-gray-50 hover:border-gray-100"
                         )}
                       >
                         <span className={cn(
                           "text-xs font-black uppercase tracking-widest",
                           type === rt.value ? "text-blue-600" : "text-gray-900"
                         )}>{rt.label}</span>
                         <span className="text-[10px] font-bold text-gray-400">{rt.desc}</span>
                       </button>
                     ))}
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-gray-50">
                  <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Academic Year</label>
                        <select 
                          value={academicYear}
                          onChange={(e) => setAcademicYear(e.target.value)}
                          className="w-full bg-gray-50 border border-transparent px-5 py-4 rounded-2xl text-[11px] font-black outline-none"
                        >
                           <option>2024/2025</option>
                           <option>2025/2026</option>
                        </select>
                     </div>
                     <div className="space-y-2">
                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Semester</label>
                        <select 
                           value={semester}
                           onChange={(e) => setSemester(e.target.value as "1" | "2")}
                           className="w-full bg-gray-50 border border-transparent px-5 py-4 rounded-2xl text-[11px] font-black outline-none"
                        >
                           <option value="1">Semester 1</option>
                           <option value="2">Semester 2</option>
                        </select>
                     </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Class</label>
                     <input 
                        type="text"
                        placeholder="Contoh: 7-A"
                        value={classId}
                        onChange={(e) => setClassId(e.target.value)}
                        className="w-full bg-gray-50 border border-transparent px-5 py-4 rounded-2xl text-[11px] font-black outline-none"
                     />
                  </div>

                  <div className="space-y-2">
                     <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Period Name</label>
                     <input 
                        type="text"
                        placeholder="Contoh: Monthly 2 atau Semester 1 Review"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="w-full bg-gray-50 border border-transparent px-5 py-4 rounded-2xl text-[11px] font-black outline-none"
                     />
                  </div>
               </div>

               <button 
                  onClick={handleFetchInitialData}
                  disabled={loading}
                  className="w-full bg-gray-900 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-600 disabled:opacity-50 transition-all shadow-xl shadow-gray-100 flex items-center justify-center gap-3"
               >
                  {loading ? <Loader2 className="animate-spin" size={18} /> : "Validate Data Siswa"}
                  <ChevronRight size={18} />
               </button>
            </div>

            <div className="space-y-8">
               <div className="bg-blue-600 text-white p-10 rounded-[3rem] shadow-xl shadow-blue-100 flex flex-col justify-between h-full relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
                  <div className="relative space-y-6">
                     <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                        <Info className="text-white" />
                     </div>
                     <div className="space-y-2">
                        <h4 className="text-xl font-black uppercase italic tracking-tighter">Automatic Pull</h4>
                        <p className="text-xs text-blue-100 font-bold leading-relaxed opacity-80">
                           Sistem akan otomatis mengambil daftar siswa yang terdaftar di kelas pilihan Anda, serta menarik seluruh nilai Learning Goal dari Modul Asesmen yang sudah terbit.
                        </p>
                     </div>
                  </div>
                  <div className="relative pt-8 flex items-center gap-1.5 overflow-hidden">
                     {[1,2,3,4,5,6].map(i => <div key={i} className="flex-1 h-1 bg-white/20 rounded-full" />)}
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
               <div className="flex items-center justify-between">
                  <div className="space-y-1">
                     <h3 className="text-lg font-black text-gray-900 uppercase italic tracking-tighter">Konfirmasi Data Inisialisasi</h3>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total {students.length} Siswa | {assessments.length} Record Penilaian</p>
                  </div>
                  <button 
                    onClick={() => setStep(1)}
                    className="text-[10px] font-black text-blue-600 uppercase tracking-widest underline underline-offset-4"
                  > Ubah Konfigurasi </button>
               </div>

               <div className="max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {students.map(s => (
                       <div key={s.id} className="p-4 bg-gray-50 rounded-2xl flex items-center gap-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-blue-600 shadow-sm">{s.name[0]}</div>
                          <div className="space-y-0.5">
                             <p className="text-[11px] font-black text-gray-900 uppercase">{s.name}</p>
                             <p className="text-[9px] font-bold text-gray-400 tabular-nums uppercase">NIS: {s.id}</p>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="pt-6 border-t border-gray-50">
                  <button 
                     onClick={handleInitializeReport}
                     disabled={saving}
                     className="w-full bg-emerald-500 text-white py-5 rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-600 disabled:opacity-50 transition-all shadow-xl shadow-emerald-50 flex items-center justify-center gap-3"
                  >
                     {saving ? <Loader2 className="animate-spin" size={18} /> : "Terbitkan Draft Rapor"}
                     <CheckCircle2 size={18} />
                  </button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
