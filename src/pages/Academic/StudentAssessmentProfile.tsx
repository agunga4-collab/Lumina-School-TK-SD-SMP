import * as React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, BookOpen, User, 
  Target, Calendar, Tag, CheckCircle2,
  AlertCircle, Loader2, Award, TrendingUp,
  Clock, Book, Sparkles, Smile, Footprints, Brain,
  LayoutGrid, List
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { getAssessments, getUserProfile } from '../../lib/firebase';
import { Assessment, User as AppUser, AssessmentScore } from '../../types';
import { cn } from '../../lib/utils';

const SCORE_LABELS: Record<NonNullable<AssessmentScore>, string> = {
  A: 'Achieved',
  D: 'Developing',
  B: 'Beginning'
};

const SCORE_COLORS: Record<NonNullable<AssessmentScore>, string> = {
  A: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  D: 'text-amber-600 bg-amber-50 border-amber-100',
  B: 'text-rose-600 bg-rose-50 border-rose-100'
};

interface StudentSubjectEvaluation {
  subject: string;
  evaluations: {
    goalCode: string;
    goalText: string;
    score: AssessmentScore;
    sessionLabel: string;
    date: number;
    notes?: string;
  }[];
}

export default function StudentAssessmentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [studentInfo, setStudentInfo] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!studentId) return;
      try {
        setLoading(true);
        // Get all assessments involving this student
        const all = await getAssessments();
        const relevant = all.filter(a => a.scores.some(s => s.studentId === studentId));
        setAssessments(relevant);

        // Try to get student name from any assessment
        const first = relevant.find(a => a.scores.some(s => s.studentId === studentId));
        if (first) {
           const studentScore = first.scores.find(s => s.studentId === studentId);
           setStudentInfo({ name: studentScore?.studentName, id: studentId });
        }
      } catch (error) {
        console.error("Error fetching student profile:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [studentId]);

  if (loading) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyusun Profil Akademik Siswa...</p>
     </div>
  );

  if (assessments.length === 0) return (
    <div className="py-40 text-center space-y-6">
       <AlertCircle size={64} className="text-gray-100 mx-auto" />
       <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter italic">Belum Ada Riwayat Nilai</h2>
       <button onClick={() => navigate('/academic/buku-nilai')} className="px-8 py-4 bg-gray-50 text-gray-400 rounded-3xl font-bold uppercase text-xs">Kembali ke Daftar</button>
    </div>
  );

  // Group evaluations by subject
  const subjectGroups: Record<string, StudentSubjectEvaluation> = {};

  assessments.forEach(a => {
    const studentScore = a.scores.find(s => s.studentId === studentId);
    if (!studentScore) return;

    a.goals.forEach(goal => {
      const gs = studentScore.goalScores.find(g => g.goalId === goal.goalId);
      if (!gs) return;

      const subjectKey = goal.subject || "Lainnya";
      if (!subjectGroups[subjectKey]) {
        subjectGroups[subjectKey] = { subject: subjectKey, evaluations: [] };
      }

      subjectGroups[subjectKey].evaluations.push({
        goalCode: goal.goalCode,
        goalText: goal.goalText,
        score: gs.score,
        sessionLabel: a.assessmentLabel,
        date: a.assessedAt,
        notes: gs.notes
      });
    });
  });

  // Sort evaluations by date (newest first)
  Object.values(subjectGroups).forEach(group => {
    group.evaluations.sort((a, b) => b.date - a.date);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 border-b-4 border-b-emerald-500 bg-white p-10 rounded-[3rem] shadow-sm">
        <div className="flex items-start gap-6">
           <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] flex items-center justify-center font-black text-3xl shadow-lg shadow-emerald-50 italic">
              {studentInfo?.name?.substring(0, 1)}
           </div>
           <div className="space-y-2">
              <div className="flex items-center gap-3">
                 <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest leading-none">
                    Student Evaluation Profile
                 </span>
                 <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Lumina Academic Hub</span>
              </div>
              <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-none">
                {studentInfo?.name}
              </h1>
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest tabular-nums">NIS: {studentId}</p>
           </div>
        </div>

        <div className="flex gap-4">
           <div className="text-right space-y-1">
              <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Total Mapel Terukur</p>
              <p className="text-2xl font-black text-emerald-600 tracking-wider">0{Object.keys(subjectGroups).length}</p>
           </div>
        </div>
      </div>

      {/* Evaluation List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         {Object.values(subjectGroups).sort((a, b) => a.subject.localeCompare(b.subject)).map((group) => (
           <div key={group.subject} className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-10 py-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                 <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest italic">{group.subject}</h3>
                 <span className="text-[10px] font-black text-emerald-500 uppercase">{group.evaluations.length} Data</span>
              </div>
              <div className="p-8 space-y-6">
                 {/* Group by LG to see progression? For now just list newest to oldest */}
                 <div className="space-y-4">
                    {group.evaluations.slice(0, 5).map((ev, idx) => (
                       <div key={idx} className="p-6 bg-white border border-gray-50 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-emerald-100 hover:bg-emerald-50/20 transition-all">
                          <div className="space-y-1 flex-1">
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{ev.goalCode}</span>
                                <span className="text-[9px] font-bold text-gray-300 uppercase tracking-widest">{ev.sessionLabel}</span>
                             </div>
                             <p className="text-[11px] font-bold text-gray-600 leading-relaxed font-mono italic">{ev.goalText.substring(0, 80)}...</p>
                          </div>
                          <div className={cn(
                            "px-4 py-2 rounded-xl text-[11px] font-black uppercase text-center min-w-[100px] border",
                            ev.score ? SCORE_COLORS[ev.score] : "bg-gray-100 text-gray-300"
                          )}>
                             {ev.score ? SCORE_LABELS[ev.score] : "No Score"}
                          </div>
                       </div>
                    ))}
                    {group.evaluations.length > 5 && (
                       <p className="text-center text-[10px] font-black text-gray-300 uppercase tracking-widest pt-2">+ {group.evaluations.length - 5} records more</p>
                    )}
                 </div>
              </div>
           </div>
         ))}
      </div>
    </div>
  );
}
