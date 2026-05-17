import * as React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Search, Filter, BookOpen, 
  Target, Info, Calendar, Tag, CheckCircle2,
  Users, BarChart3, PieChart, Download, Share2,
  Clock, AlertCircle, Loader2, Smile, Sparkles, Footprints, Brain,
  ChevronRight
} from 'lucide-react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { getAssessments, getClasses, getStudentsByClass } from '../../lib/firebase';
import { Assessment, User as AppUser, Class, Student, AssessmentGoal } from '../../types';
import { cn } from '../../lib/utils';

export default function ClassRecap() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const navigate = useNavigate();
  
  const [classes, setClasses] = React.useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = React.useState('');
  const [academicYear, setAcademicYear] = React.useState('2025-2026');
  const [semester, setSemester] = React.useState<'1' | '2'>('1');
  
  const [students, setStudents] = React.useState<Student[]>([]);
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [initialLoad, setInitialLoad] = React.useState(true);

  // Fetch Classes
  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const data = await getClasses();
        setClasses(data.filter(c => c.status === 'active'));
      } catch (error) {
        console.error("Error fetching classes:", error);
      } finally {
        setInitialLoad(false);
      }
    };
    fetchClasses();
  }, []);

  const handleFetchRecap = async () => {
    if (!selectedClassId) return;
    setLoading(true);
    try {
      const [fetchedStudents, fetchedAssessments] = await Promise.all([
        getStudentsByClass(selectedClassId, academicYear),
        getAssessments({
          classId: selectedClassId,
          academicYear,
          semester
        })
      ]);
      setStudents(fetchedStudents);
      setAssessments(fetchedAssessments);
    } catch (error) {
      console.error("Error fetching recap data:", error);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (selectedClassId) {
      handleFetchRecap();
    }
  }, [selectedClassId, academicYear, semester]);

  // Extract all unique LGs from assessments
  const allGoals: AssessmentGoal[] = [];
  const goalMap = new Map<string, AssessmentGoal & { teacherName?: string }>();

  assessments.forEach(a => {
    a.goals.forEach(g => {
      if (!goalMap.has(g.goalId)) {
        goalMap.set(g.goalId, { ...g, teacherName: a.assessedBy });
      }
    });
  });

  const sortedGoals = Array.from(goalMap.values()).sort((a, b) => a.goalCode.localeCompare(b.goalCode));

  // Get Latest Score for Student + Goal
  const getLatestScore = (studentId: string, goalId: string) => {
    // Sort assessments by date descending
    const sorted = [...assessments].sort((a, b) => b.assessedAt - a.assessedAt);
    for (const a of sorted) {
      const studentScore = a.scores.find(s => s.studentId === studentId);
      if (studentScore && studentScore.goalScores[goalId]) {
        const gs = studentScore.goalScores[goalId];
        if (gs.score !== null) return gs;
      }
    }
    return null;
  };

  const getScoreColor = (score: string | number | null) => {
    if (score === null || score === undefined) return 'bg-gray-50 text-gray-200';
    if (score === 'A') return 'bg-emerald-500 text-white';
    if (score === 'D') return 'bg-amber-400 text-white';
    if (score === 'B') return 'bg-rose-500 text-white';
    if (typeof score === 'number') {
      if (score >= 75) return 'bg-emerald-500 text-white';
      if (score >= 50) return 'bg-amber-400 text-white';
      return 'bg-rose-500 text-white';
    }
    return 'bg-gray-50';
  };

  if (initialLoad) return (
    <div className="py-40 text-center">
       <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
       <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyiapkan Rekap Kelas...</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="flex items-start gap-6">
           <button 
             onClick={() => navigate('/academic/buku-nilai')}
             className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={24} />
           </button>
           <div className="space-y-1">
              <h1 className="text-4xl font-black tracking-tight italic uppercase text-gray-900 leading-none">
                 Rekap <span className="text-blue-600">Kelas</span>
              </h1>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Ringkasan Capaian Learning Goals per Rombel</p>
           </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-wrap items-end gap-6">
         <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Pilih Kelas</label>
            <select 
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-48 bg-gray-50 border border-transparent px-6 py-4 rounded-[1.5rem] text-xs font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none"
            >
              <option value="">Pilih Kelas...</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
         </div>

         <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tahun Ajaran</label>
            <select 
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-40 bg-gray-50 border border-transparent px-6 py-4 rounded-[1.5rem] text-xs font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none"
            >
              <option value="2024-2025">2024-2025</option>
              <option value="2025-2026">2025-2026</option>
            </select>
         </div>

         <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Semester</label>
            <select 
              value={semester}
              onChange={(e) => setSemester(e.target.value as '1' | '2')}
              className="w-32 bg-gray-50 border border-transparent px-6 py-4 rounded-[1.5rem] text-xs font-bold focus:bg-white focus:border-blue-100 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none"
            >
              <option value="1">1 (Ganjil)</option>
              <option value="2">2 (Genap)</option>
            </select>
         </div>

         <button 
           onClick={handleFetchRecap}
           disabled={loading || !selectedClassId}
           className="px-8 py-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center gap-2 mb-0.5 ml-auto"
         >
           {loading ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
           Refresh Data
         </button>
      </div>

      {/* Recap Table */}
      {selectedClassId ? (
        <div className="bg-white rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-50 overflow-hidden relative">
           {loading && (
             <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
                <Loader2 size={40} className="text-blue-500 animate-spin" />
             </div>
           )}
           
           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                 <thead>
                    <tr className="bg-gray-50/50">
                       <th className="sticky left-0 bg-gray-50/50 z-30 px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 min-w-[200px]">Siswa</th>
                       {sortedGoals.map((lg) => (
                         <th key={lg.goalId} className="px-4 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center min-w-[80px]">
                            <div className="group relative flex flex-col gap-1 items-center cursor-help">
                               <span className="text-blue-600 font-black">{lg.goalCode}</span>
                               <span className="text-[8px] font-bold text-gray-300 truncate max-w-[60px]">{lg.subject}</span>
                               {/* Tooltip */}
                               <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-64 p-4 bg-gray-900 text-white rounded-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-40 text-[9px] font-bold leading-relaxed shadow-xl text-left">
                                  <p className="border-b border-white/10 pb-2 mb-2 font-black uppercase tracking-widest text-blue-300">{lg.goalCode} - {lg.subject}</p>
                                  {lg.goalText}
                                  <p className="mt-2 pt-2 border-t border-white/10 text-[8px] italic text-gray-400">Guru: {lg.teacherName}</p>
                               </div>
                            </div>
                         </th>
                       ))}
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50">
                    {students.map((student) => (
                       <tr key={student.id} className="group hover:bg-gray-50/30 transition-all">
                          <td className="sticky left-0 bg-white group-hover:bg-gray-50/30 z-20 px-8 py-6 border-r border-gray-50">
                             <div className="flex flex-col gap-1">
                                <p className="text-xs font-black text-gray-900 uppercase tracking-wider">{student.name}</p>
                                <p className="text-[9px] font-bold text-gray-300 tabular-nums uppercase">{student.id}</p>
                             </div>
                          </td>
                          {sortedGoals.map((lg) => {
                            const latestScore = getLatestScore(student.id, lg.goalId);
                            return (
                              <td key={lg.goalId} className="px-2 py-4">
                                 <div className="flex items-center justify-center">
                                    <div className={cn(
                                       "w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black shadow-sm group/cell relative",
                                       getScoreColor(latestScore?.score)
                                    )}>
                                       {latestScore?.score ?? '-'}
                                       {/* Detail Tooltip inside cell */}
                                       {latestScore && (
                                         <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 p-3 bg-gray-900 text-white rounded-xl opacity-0 invisible group-hover/cell:opacity-100 group-hover/cell:visible transition-all z-50 text-[8px] font-bold shadow-xl">
                                            <p className="text-blue-300 mb-1 capitalize">Mode: {latestScore.scoringMode}</p>
                                            <p className="line-clamp-2 italic mb-1">"{latestScore.notes || 'No notes'}"</p>
                                            <div className="flex justify-between text-[7px] text-gray-400 mt-2 pt-2 border-t border-white/10 uppercase">
                                              <span>{latestScore.scoredBy.split('@')[0]}</span>
                                              <span>{new Date(latestScore.scoredAt).toLocaleDateString()}</span>
                                            </div>
                                         </div>
                                       )}
                                    </div>
                                 </div>
                              </td>
                            );
                          })}
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      ) : (
        <div className="bg-white p-20 rounded-[3rem] border border-gray-100 shadow-sm text-center space-y-6">
           <div className="w-20 h-20 bg-blue-50 rounded-[2rem] mx-auto flex items-center justify-center text-blue-500">
              <Users size={40} />
           </div>
           <div className="max-w-xs mx-auto">
              <h3 className="text-lg font-black text-gray-900 uppercase italic">Pilih Kelas</h3>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2 leading-relaxed">Pilih rombongan belajar untuk melihat rekapitulasi nilai per Learning Goals.</p>
           </div>
        </div>
      )}

      {/* Statistics Section (Bottom) */}
      {selectedClassId && assessments.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3 italic">
                 <BarChart3 size={20} className="text-blue-500" /> Distribusi Capaian (ABD)
              </h3>
              <div className="space-y-6 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                 {sortedGoals.filter(lg => {
                   const firstScore = assessments.find(a => a.scores.some(s => s.goalScores[lg.goalId]))?.scores.find(s => s.goalScores[lg.goalId])?.goalScores[lg.goalId];
                   return firstScore?.scoringMode === 'ABD';
                 }).map(lg => {
                    const stats = { A: 0, D: 0, B: 0, total: 0 };
                    students.forEach(s => {
                      const score = getLatestScore(s.id, lg.goalId)?.score;
                      if (score === 'A') stats.A++;
                      else if (score === 'D') stats.D++;
                      else if (score === 'B') stats.B++;
                      if (['A', 'D', 'B'].includes(score as string)) stats.total++;
                    });
                    
                    if (stats.total === 0) return null;

                    return (
                      <div key={lg.goalId} className="space-y-2">
                         <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{lg.goalCode} ({lg.subject})</span>
                            <span className="text-[10px] font-bold text-gray-400">{stats.total} entries</span>
                         </div>
                         <div className="h-3 w-full bg-gray-50 rounded-full flex overflow-hidden">
                            <div style={{ width: `${(stats.A / stats.total) * 100}%` }} className="bg-emerald-500" />
                            <div style={{ width: `${(stats.D / stats.total) * 100}%` }} className="bg-amber-400" />
                            <div style={{ width: `${(stats.B / stats.total) * 100}%` }} className="bg-rose-500" />
                         </div>
                      </div>
                    );
                 })}
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3 italic">
                 <Target size={20} className="text-blue-500" /> Rata-rata Kuantitatif (Numeric)
              </h3>
              <div className="space-y-6 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                 {sortedGoals.filter(lg => {
                    const firstScore = assessments.find(a => a.scores.some(s => s.goalScores[lg.goalId]))?.scores.find(s => s.goalScores[lg.goalId])?.goalScores[lg.goalId];
                    return firstScore?.scoringMode === 'NUMERIC';
                 }).map(lg => {
                    let total = 0;
                    let count = 0;
                    students.forEach(s => {
                      const score = getLatestScore(s.id, lg.goalId)?.score;
                      if (typeof score === 'number') {
                        total += score;
                        count++;
                      }
                    });
                    
                    if (count === 0) return null;
                    const avg = (total / count);

                    return (
                      <div key={lg.goalId} className="space-y-2">
                         <div className="flex justify-between items-end">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{lg.goalCode} ({lg.subject})</span>
                            <span className={cn(
                              "text-[10px] font-black uppercase",
                              avg >= 75 ? "text-emerald-500" : avg >= 50 ? "text-amber-400" : "text-rose-500"
                            )}>AVG: {avg.toFixed(1)}</span>
                         </div>
                         <div className="h-3 w-full bg-gray-50 rounded-full overflow-hidden">
                            <div 
                              style={{ width: `${avg}%` }} 
                              className={cn(
                                "h-full transition-all",
                                avg >= 75 ? "bg-emerald-500" : avg >= 50 ? "bg-amber-400" : "bg-rose-500"
                              )} 
                            />
                         </div>
                      </div>
                    );
                 })}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
