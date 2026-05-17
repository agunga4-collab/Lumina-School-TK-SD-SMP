import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, ChevronRight, Save, User, 
  Target, Info, AlertCircle, CheckCircle2, 
  CheckCircle, HelpCircle, BookOpen, Search,
  Filter, Tag, Calendar, LayoutGrid, List,
  MessageSquare, Loader2, Sparkles, Smile, Footprints, Brain
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { 
  getLXDList, getStudentsByClass, getLearningGoalsByIds, 
  addAssessment, getAssessmentById, updateAssessment 
} from '../../lib/firebase';
import { 
  LXD, Student, LearningGoal, User as AppUser, 
  Assessment, AssessmentGoal, AssessmentStudentScore,
  AssessmentScore, ScoringMode
} from '../../types';
import { cn } from '../../lib/utils';

const STEPS = [
  { id: 1, title: 'Pilih LXD', icon: <BookOpen size={18} /> },
  { id: 2, title: 'Konfigurasi', icon: <Info size={18} /> },
  { id: 3, title: 'Input Nilai', icon: <Target size={18} /> }
];

const SCORE_LABELS: Record<string, string> = {
  A: 'Achieved',
  D: 'Developing',
  B: 'Beginning'
};

const SCORE_COLORS: Record<string, string> = {
  A: 'bg-emerald-500 text-white shadow-emerald-200',
  D: 'bg-amber-400 text-white shadow-amber-200',
  B: 'bg-rose-500 text-white shadow-rose-200'
};

const SCORE_BG_LIGHT: Record<NonNullable<AssessmentScore>, string> = {
  A: 'bg-emerald-50 border-emerald-100',
  D: 'bg-amber-50 border-amber-100',
  B: 'bg-rose-50 border-rose-100'
};

export default function AssessmentForm() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [step, setStep] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Form Data
  const [lxds, setLxds] = React.useState<LXD[]>([]);
  const [selectedLXD, setSelectedLXD] = React.useState<LXD | null>(null);
  const [assessmentLabel, setAssessmentLabel] = React.useState('');
  const [selectedClassId, setSelectedClassId] = React.useState('');
  const [scoringMode, setScoringMode] = React.useState<ScoringMode>('ABD');
  const [students, setStudents] = React.useState<Student[]>([]);
  const [lgs, setLgs] = React.useState<LearningGoal[]>([]);
  const [scores, setScores] = React.useState<AssessmentStudentScore[]>([]);

  // Filtering LXD
  const [lxSearch, setLxSearch] = React.useState('');

  const isEdit = !!id;

  // Initial Load
  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isEdit) {
          const assessment = await getAssessmentById(id);
          if (assessment) {
            setAssessmentLabel(assessment.assessmentLabel);
            setSelectedClassId(assessment.classId);
            setScoringMode(assessment.scoringMode || 'ABD');
            setScores(assessment.scores);
            // We need to fetch the LXD too
            const lx = await (await import('../../lib/firebase')).getLXDById(assessment.lxdId);
            setSelectedLXD(lx);
            
            // Set Step directly to evaluation if editing? 
            // Or allow re-config? Let's go to step 3.
            setStep(3);
            
            // Fetch students and goals
            const [fetchedStudents, fetchedLgs] = await Promise.all([
              getStudentsByClass(assessment.classId, assessment.academicYear),
              getLearningGoalsByIds(assessment.goals.map(g => g.goalId))
            ]);
            setStudents(fetchedStudents);
            setLgs(fetchedLgs);
          }
        } else {
          const publishedLxds = await getLXDList({ 
            status: 'PUBLISHED',
            unitId: currentUser.unitId 
          });
          setLxds(publishedLxds);
        }
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isEdit, currentUser.unitId]);

  // Handle step transitions
  const goToStep2 = async (lxd: LXD) => {
    setSelectedLXD(lxd);
    setAssessmentLabel(`Asesmen ${new Date().toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })}`);
    
    // For single-class LXD, auto-detect class
    if (lxd.classId) setSelectedClassId(lxd.classId);
    else if (lxd.classIds && lxd.classIds.length === 1) setSelectedClassId(lxd.classIds[0]);

    setStep(2);
  };

  const goToStep3 = async () => {
    if (!selectedLXD || !selectedClassId || !assessmentLabel) {
      alert("Harap lengkapi semua informasi sesi.");
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch Students
      const fetchedStudents = await getStudentsByClass(selectedClassId, selectedLXD.academicYear);
      if (fetchedStudents.length === 0) {
        throw new Error("Tidak ada siswa ditemukan di kelas " + selectedClassId);
      }
      setStudents(fetchedStudents);

      // 2. Fetch Learning Goals
      const goalIds = selectedLXD.type === 'LEARNING_JOURNEY' 
        ? (selectedLXD.linkedGoals as { goalId: string; subject: string }[]).map(g => g.goalId)
        : (selectedLXD.linkedGoals as string[]);
      
      const fetchedLgs = await getLearningGoalsByIds(goalIds);
      setLgs(fetchedLgs);

      // 3. Initialize Scores if not editing
      if (!isEdit) {
        const initialScores: AssessmentStudentScore[] = fetchedStudents.map(student => {
          const goalScores: Record<string, any> = {};
          fetchedLgs.forEach(lg => {
            goalScores[lg.id] = {
              score: null,
              scoringMode: scoringMode,
              notes: '',
              scoredBy: currentUser.email,
              scoredAt: Date.now()
            };
          });
          return {
            studentId: student.id,
            studentName: student.name,
            goalScores
          };
        });
        setScores(initialScores);
      }

      setStep(3);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateScore = (studentId: string, goalId: string, score: AssessmentScore) => {
    setScores(prev => prev.map(s => {
      if (s.studentId !== studentId) return s;
      const currentGoalScore = s.goalScores[goalId] || {};
      return {
        ...s,
        goalScores: {
          ...s.goalScores,
          [goalId]: {
            ...currentGoalScore,
            score,
            scoredAt: Date.now(),
            scoredBy: currentUser.email,
            scoringMode: scoringMode
          }
        }
      };
    }));
  };

  const updateNote = (studentId: string, goalId: string, notes: string) => {
    setScores(prev => prev.map(s => {
      if (s.studentId !== studentId) return s;
      const currentGoalScore = s.goalScores[goalId] || {};
      return {
        ...s,
        goalScores: {
          ...s.goalScores,
          [goalId]: { 
            ...currentGoalScore, 
            notes,
            scoredAt: Date.now(),
            scoredBy: currentUser.email,
            scoringMode: scoringMode
          }
        }
      };
    }));
  };

  const fillAllWithDefault = (score: AssessmentScore) => {
    setScores(prev => prev.map(s => {
      const newGoalScores = { ...s.goalScores };
      Object.keys(newGoalScores).forEach(gid => {
        newGoalScores[gid] = {
          ...newGoalScores[gid],
          score,
          scoredAt: Date.now(),
          scoredBy: currentUser.email,
          scoringMode: scoringMode
        };
      });
      return { ...s, goalScores: newGoalScores };
    }));
  };

  const handleSave = async () => {
    if (!selectedLXD || !currentUser.email) return;
    
    setSaving(true);
    try {
      const assessmentGoals: AssessmentGoal[] = lgs.map(lg => {
        let subj = selectedLXD.subject || "";
        if (selectedLXD.type === 'LEARNING_JOURNEY') {
          const linked = (selectedLXD.linkedGoals as any[]).find(link => link.goalId === lg.id);
          if (linked) subj = linked.subject;
        }
        return {
          goalId: lg.id,
          goalCode: lg.code,
          goalText: lg.goalText,
          subject: subj
        };
      });

      const data = {
        lxdId: selectedLXD.id,
        lxdType: selectedLXD.type,
        lxdTitle: selectedLXD.title,
        classId: selectedClassId,
        unitId: selectedLXD.unitId,
        subject: selectedLXD.type === 'LEARNING_JOURNEY' ? 'Learning Journey' : (selectedLXD.subject || ''),
        academicYear: selectedLXD.academicYear,
        semester: selectedLXD.semester,
        assessmentLabel,
        scoringMode,
        assessedBy: currentUser.email,
        goals: assessmentGoals,
        scores
      };

      if (isEdit && id) {
        await updateAssessment(id, data as Partial<Assessment>);
      } else {
        await addAssessment(data as any);
      }
      
      navigate('/academic/buku-nilai');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredLxds = lxds.filter(lx => 
    lx.title.toLowerCase().includes(lxSearch.toLowerCase()) || 
    lx.subject?.toLowerCase().includes(lxSearch.toLowerCase())
  );

  if (loading && step === 1) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyiapkan Form Penilaian...</p>
     </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="flex items-start gap-6">
           <button 
             onClick={() => {
               if (step > 1) setStep(step - 1);
               else navigate('/academic/buku-nilai');
             }} 
             className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={24} />
           </button>
           <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tight italic uppercase text-gray-900 leading-none">
                 {isEdit ? 'Koreksi' : 'Sesi'} <span className="text-blue-600">Penilaian</span>
              </h1>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">{selectedLXD ? selectedLXD.title : 'Pilih LXD untuk memulai penilaian'}</p>
           </div>
        </div>

        {/* Multi-step indicator */}
        <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-3xl border border-gray-100 shadow-sm">
           {STEPS.map((s, idx) => (
             <React.Fragment key={s.id}>
                <div className={cn(
                  "flex items-center gap-3 transition-all",
                  step === s.id ? "text-blue-600 scale-105" : step > s.id ? "text-emerald-500" : "text-gray-300 pointer-events-none"
                )}>
                   <div className={cn(
                     "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                     step === s.id ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : step > s.id ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"
                   )}>
                      {step > s.id ? <CheckCircle size={16} /> : s.icon}
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest hidden md:block">{s.title}</span>
                </div>
                {idx < STEPS.length - 1 && <div className="w-8 h-0.5 bg-gray-100 mx-2" />}
             </React.Fragment>
           ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <div className="relative group max-w-xl">
                 <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-blue-500 transition-colors" size={20} />
                 <input 
                   type="text"
                   placeholder="Cari LXD yang ingin dinilai..."
                   value={lxSearch}
                   onChange={(e) => setLxSearch(e.target.value)}
                   className="w-full bg-gray-50/50 border border-transparent pl-16 pr-8 py-5 rounded-[2rem] text-sm font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all"
                 />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredLxds.length > 0 ? (
                   filteredLxds.map(lx => (
                     <button
                       key={lx.id}
                       onClick={() => goToStep2(lx)}
                       className="group p-8 bg-white border border-gray-100 rounded-[2.5rem] text-left hover:border-blue-200 hover:shadow-xl hover:shadow-blue-50 transition-all flex flex-col justify-between gap-6"
                     >
                        <div className="space-y-4">
                           <div className="flex items-center justify-between">
                              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black uppercase tracking-widest">{lx.type.replace('_', ' ')}</span>
                              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{lx.academicYear}</span>
                           </div>
                           <h3 className="text-lg font-black text-gray-900 group-hover:text-blue-600 leading-tight uppercase italic transition-colors">
                              {lx.title}
                           </h3>
                           <div className="flex flex-wrap gap-2 text-[10px] font-bold text-gray-400">
                              <span>Grade {lx.grade || lx.grades?.join(', ')}</span>
                              <span>•</span>
                              <span>Sem {lx.semester}</span>
                           </div>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                           <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{lx.subject || 'LJ Interdisciplinary'}</span>
                           <ChevronRight size={18} className="text-gray-200 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                        </div>
                     </button>
                   ))
                ) : (
                  <div className="col-span-full py-20 text-center space-y-4">
                     <AlertCircle size={48} className="text-gray-100 mx-auto" />
                     <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Belum ada LXD Published di unit Anda</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && selectedLXD && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <div className="md:col-span-2 bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
               <div className="space-y-6">
                  <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-3">
                     <CheckCircle2 size={16} className="text-blue-500" /> Konfigurasi Sesi Penilaian
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Label Sesi</label>
                        <input 
                           type="text"
                           placeholder="Contoh: Asesmen Formatif 1"
                           value={assessmentLabel}
                           onChange={(e) => setAssessmentLabel(e.target.value)}
                           className="w-full bg-gray-50 border border-transparent px-8 py-5 rounded-[2rem] text-sm font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all"
                        />
                     </div>
                     <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Kelas yang Dinilai</label>
                        <select 
                           value={selectedClassId}
                           onChange={(e) => setSelectedClassId(e.target.value)}
                           className="w-full bg-gray-50 border border-transparent px-8 py-5 rounded-[2rem] text-sm font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none"
                        >
                           <option value="">Pilih Kelas...</option>
                           {(selectedLXD.classId ? [selectedLXD.classId] : (selectedLXD.classIds || [])).map(c => (
                             <option key={c} value={c}>{c}</option>
                           ))}
                        </select>
                     </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mode Penilaian</label>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setScoringMode('ABD')}
                        className={cn(
                          "flex-1 p-6 rounded-[2rem] border-2 transition-all text-left",
                          scoringMode === 'ABD' 
                            ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100" 
                            : "bg-gray-50 border-transparent hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                           <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", scoringMode === 'ABD' ? "bg-blue-500 text-white" : "bg-gray-200")}>
                             {scoringMode === 'ABD' && <CheckCircle size={14} />}
                           </div>
                           <p className="font-black text-gray-900 uppercase italic">Kualitatif (ABD)</p>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">A (Achieved), D (Developing), B (Beginning)</p>
                      </button>

                      <button
                        onClick={() => setScoringMode('NUMERIC')}
                        className={cn(
                          "flex-1 p-6 rounded-[2rem] border-2 transition-all text-left",
                          scoringMode === 'NUMERIC' 
                            ? "bg-blue-50 border-blue-500 shadow-lg shadow-blue-100" 
                            : "bg-gray-50 border-transparent hover:border-gray-200"
                        )}
                      >
                        <div className="flex items-center gap-3 mb-2">
                           <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", scoringMode === 'NUMERIC' ? "bg-blue-500 text-white" : "bg-gray-200")}>
                             {scoringMode === 'NUMERIC' && <CheckCircle size={14} />}
                           </div>
                           <p className="font-black text-gray-900 uppercase italic">Kuantitatif (Numeric)</p>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Input nilai angka 0 - 100</p>
                      </button>
                    </div>
                  </div>
               </div>

               <div className="pt-10 border-t border-gray-50 flex justify-end">
                  <button 
                    onClick={goToStep3}
                    className="group flex items-center gap-3 bg-gray-900 text-white px-10 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-100"
                  >
                    Lanjutkan ke Input Nilai
                    <ChevronRight size={18} />
                  </button>
               </div>
            </div>

            <div className="bg-blue-50/50 p-10 rounded-[3rem] border border-blue-100 space-y-6">
               <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">Ringkasan LXD</h3>
               <div className="space-y-4">
                  <SummaryItem label="Tahun Akademik" value={selectedLXD.academicYear} />
                  <SummaryItem label="Semester" value={selectedLXD.semester} />
                  <SummaryItem label="Mata Pelajaran" value={selectedLXD.subject || "Learning Journey"} />
                  <SummaryItem label="Tipe LXD" value={selectedLXD.type.replace('_', ' ')} />
               </div>
               <div className="pt-6 border-t border-blue-100/50">
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest leading-relaxed italic">
                     Pastikan kelas yang dipilih memiliki enrollment siswa di tahun akademik {selectedLXD.academicYear}.
                  </p>
               </div>
            </div>
          </motion.div>
        )}

        {step === 3 && selectedLXD && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-10"
          >
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm border-b-4 border-b-blue-500">
               <div className="flex items-center gap-8">
                  <div className="space-y-1">
                     <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-none">Kelas</p>
                     <p className="text-lg font-black text-gray-900 uppercase italic leading-none">{selectedClassId}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="space-y-1">
                     <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-none">Total Siswa</p>
                     <p className="text-lg font-black text-gray-900 uppercase leading-none">{students.length}</p>
                  </div>
                  <div className="w-px h-8 bg-gray-100" />
                  <div className="space-y-1">
                     <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest leading-none">Penilaian</p>
                     <p className="text-lg font-black text-blue-600 uppercase leading-none italic">{assessmentLabel}</p>
                  </div>
               </div>

               <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mr-2">Cepat: </span>
                  <button 
                    onClick={() => fillAllWithDefault('A')}
                    className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all"
                  > Set All Achieved </button>
                  <button 
                    onClick={() => fillAllWithDefault('D')}
                    className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-400 hover:text-white transition-all"
                  > Set All Developing </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 disabled:opacity-50 transition-all ml-4"
                  >
                     {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                     Simpan Nilai
                  </button>
               </div>
            </div>

            {/* Evaluation Grid */}
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-50 overflow-hidden relative">
               <div className="overflow-x-auto overflow-y-visible">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                     <thead>
                        <tr className="bg-gray-50/50">
                           <th className="sticky left-0 bg-gray-50/50 z-20 px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 min-w-[200px]">Nama Siswa</th>
                           {lgs.map((lg) => (
                             <th key={lg.id} className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <div className="group relative flex flex-col gap-1 items-center cursor-help">
                                   <span className="text-blue-600 font-black">{lg.code}</span>
                                   <span className="text-[8px] font-bold text-gray-300 truncate max-w-[100px]">{lg.subject}</span>
                                   {/* Tooltip */}
                                   <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 p-4 bg-gray-900 text-white rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-40 text-[9px] font-bold leading-relaxed shadow-xl">
                                      {lg.goalText}
                                   </div>
                                </div>
                             </th>
                           ))}
                           <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">Notes</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {students.map((student) => (
                           <tr key={student.id} className="group hover:bg-gray-50/50 transition-all">
                              <td className="sticky left-0 bg-white group-hover:bg-gray-50/50 z-10 px-8 py-6 border-r border-gray-50">
                                 <div className="flex flex-col gap-1">
                                    <p className="text-xs font-black text-gray-900 uppercase tracking-wider">{student.name}</p>
                                    <p className="text-[9px] font-bold text-gray-300 tabular-nums uppercase">{student.id}</p>
                                 </div>
                              </td>
                              {lgs.map((lg) => {
                                const currentScoreObj = scores.find(s => s.studentId === student.id)?.goalScores[lg.id];
                                return (
                                  <td key={lg.id} className="px-4 py-6">
                                     {scoringMode === 'ABD' ? (
                                       <div className="flex items-center justify-center gap-2 bg-gray-50/50 p-2 rounded-2xl">
                                          {(['A', 'D', 'B'] as AssessmentScore[]).map((s) => (
                                             <button 
                                               key={s as string}
                                               onClick={() => updateScore(student.id, lg.id, (currentScoreObj?.score === s ? null : s) as AssessmentScore)}
                                               className={cn(
                                                 "w-10 h-10 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm",
                                                 currentScoreObj?.score === s ? SCORE_COLORS[s as string] : "bg-white text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                                               )}
                                             >
                                                {s as string}
                                             </button>
                                          ))}
                                       </div>
                                     ) : (
                                       <div className="flex items-center justify-center">
                                         <input 
                                           type="number"
                                           min="0"
                                           max="100"
                                           placeholder="0-100"
                                           value={currentScoreObj?.score ?? ''}
                                           onChange={(e) => {
                                             const val = e.target.value === '' ? null : Number(e.target.value);
                                             updateScore(student.id, lg.id, val);
                                           }}
                                           className="w-20 text-center bg-gray-50 border border-transparent px-3 py-3 rounded-xl text-xs font-black focus:bg-white focus:border-blue-200 outline-none transition-all"
                                         />
                                       </div>
                                     )}
                                  </td>
                                );
                              })}
                              <td className="px-8 py-6 text-center">
                                 <button 
                                   onClick={() => {
                                      const studentScore = scores.find(s => s.studentId === student.id);
                                      const firstGid = lgs[0].id;
                                      const existingNote = studentScore?.goalScores[firstGid]?.notes || '';
                                      const note = prompt("Catatan untuk " + student.name, existingNote);
                                      if (note !== null) updateNote(student.id, firstGid, note);
                                   }}
                                   className={cn(
                                     "p-3 rounded-xl border border-gray-100 transition-all",
                                     Object.values(scores.find(s => s.studentId === student.id)?.goalScores || {}).some((gs: any) => gs.notes) 
                                       ? "bg-blue-50 text-blue-500 border-blue-100" 
                                       : "bg-white text-gray-300 hover:bg-gray-50"
                                   )}
                                 >
                                    <MessageSquare size={16} />
                                 </button>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>

            <div className="flex justify-between items-center bg-[#002366] text-white p-10 rounded-[3rem] shadow-xl shadow-blue-100 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
               <div className="relative space-y-2">
                  <h4 className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em]">Evaluation Complete?</h4>
                  <p className="text-xl font-bold italic">Simpan sesi ini untuk merangkum capaian akademik siswa.</p>
               </div>
               <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="relative group flex items-center gap-3 bg-white text-blue-900 px-10 py-5 rounded-[2rem] font-black uppercase text-xs tracking-widest hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all shadow-xl"
               >
                  {saving ? "Menyimpan..." : "Simpan Permanen"}
                  <Save size={18} />
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string, value: string }) {
   return (
      <div className="space-y-1">
         <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest leading-none">{label}</p>
         <p className="text-sm font-black text-blue-900 uppercase tracking-wider">{value}</p>
      </div>
   );
}
