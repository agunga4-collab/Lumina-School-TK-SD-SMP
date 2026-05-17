import * as React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, Edit2, BookOpen, User, 
  Target, Info, Calendar, Tag, CheckCircle2,
  Users, BarChart3, PieChart, Download, Share2,
  Clock, AlertCircle, Loader2, Smile, Sparkles, Footprints, Brain
} from 'lucide-react';
import { useOutletContext, useNavigate, useParams, Link } from 'react-router-dom';
import { getAssessmentById, getLXDById } from '../../lib/firebase';
import { Assessment, User as AppUser, LXD, AssessmentScore } from '../../types';
import { cn } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as ReTooltip, ResponsiveContainer, Legend as ReLegend, Cell
} from 'recharts';

const SCORE_LABELS: Record<NonNullable<AssessmentScore>, string> = {
  A: 'Achieved',
  D: 'Developing',
  B: 'Beginning'
};

const SCORE_COLORS: any = {
  A: '#10b981', // Emerald 500
  D: '#fbbf24', // Amber 400
  B: '#ef4444'  // Rose 500
};

export default function AssessmentDetail() {
  const { currentUser } = useOutletContext<{ currentUser: AppUser }>();
  const { id } = useParams();
  const navigate = useNavigate();
  const [assessment, setAssessment] = React.useState<Assessment | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await getAssessmentById(id);
        setAssessment(data);
      } catch (error) {
        console.error("Error fetching assessment:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return (
     <div className="py-40 text-center">
        <Loader2 size={40} className="text-blue-100 animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Menyajikan Detail Penilaian...</p>
     </div>
  );

  if (!assessment) return (
    <div className="py-40 text-center space-y-6">
       <AlertCircle size={64} className="text-gray-100 mx-auto" />
       <h2 className="text-2xl font-black text-gray-300 uppercase tracking-tighter italic">Sesi Tidak Ditemukan</h2>
       <button onClick={() => navigate('/academic/buku-nilai')} className="px-8 py-4 bg-gray-50 text-gray-400 rounded-3xl font-bold uppercase text-xs">Kembali ke Daftar</button>
    </div>
  );

  // Calculate statistics per LG
  const lgStats = assessment.goals.map(goal => {
    const counts = { A: 0, D: 0, B: 0, null: 0, numeric: 0 };
    let totalNumeric = 0;
    let numericCount = 0;

    assessment.scores.forEach(s => {
      const gs = s.goalScores[goal.goalId];
      if (gs?.score === 'A') counts.A++;
      else if (gs?.score === 'D') counts.D++;
      else if (gs?.score === 'B') counts.B++;
      else if (typeof gs?.score === 'number') {
        counts.numeric++;
        totalNumeric += gs.score;
        numericCount++;
      } else {
        counts.null++;
      }
    });

    return {
      goalCode: goal.goalCode,
      goalId: goal.goalId,
      achieved: counts.A,
      developing: counts.D,
      beginning: counts.B,
      missing: counts.null,
      avgNumeric: numericCount > 0 ? (totalNumeric / numericCount).toFixed(1) : null
    };
  });

  const chartData = lgStats.map(s => ({
    name: s.goalCode,
    Achieved: s.achieved,
    Developing: s.developing,
    Beginning: s.beginning
  }));

  const canEdit = currentUser.role === 'SUPER_ADMIN' || assessment.assessedBy === currentUser.email;

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
        <div className="flex items-start gap-6">
           <button 
             onClick={() => navigate('/academic/buku-nilai')}
             className="p-4 bg-white rounded-3xl border border-gray-100 shadow-sm hover:scale-105 active:scale-95 transition-all text-gray-400"
           >
              <ChevronLeft size={24} />
           </button>
           <div className="space-y-2">
              <div className="flex items-center gap-3">
                 <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest leading-none">
                    Session Records
                 </span>
                 <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{assessment.academicYear} • Sem {assessment.semester}</span>
              </div>
              <h1 className="text-4xl font-black tracking-tighter italic uppercase text-gray-900 leading-[1.1]">
                {assessment.assessmentLabel} <br/>
                <span className="text-blue-600">LXD: {assessment.lxdTitle}</span>
              </h1>
              <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                 <div className="flex items-center gap-2">
                    <User size={14} className="text-blue-400" /> {assessment.assessedBy}
                 </div>
                 <span>•</span>
                 <div className="flex items-center gap-2">
                    <Calendar size={14} /> {new Date(assessment.assessedAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                 </div>
              </div>
           </div>
        </div>

        <div className="flex gap-2">
           {canEdit && (
              <Link 
                to={`/academic/lxd/assess/edit/${assessment.id}`}
                className="flex items-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-blue-100"
              >
                 <Edit2 size={16} /> Edit Penilaian
              </Link>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         {/* Sidebar Summary */}
         <div className="space-y-8">
            <div className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <PieChart size={16} /> Statistics
               </h3>
               
               <div className="space-y-6">
                  {lgStats.map((stat) => (
                    <div key={stat.goalId} className="space-y-3">
                       <div className="flex justify-between items-end">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{stat.goalCode} Capaian</span>
                          <span className="text-[10px] font-bold text-gray-400 tabular-nums">Total {assessment.scores.length} Siswa</span>
                       </div>
                       {assessment.scoringMode === 'ABD' ? (
                         <>
                           <div className="h-4 w-full bg-gray-50 rounded-full flex overflow-hidden">
                              <div style={{ width: `${(stat.achieved / assessment.scores.length) * 100}%` }} className="bg-emerald-500" title="Achieved" />
                              <div style={{ width: `${(stat.developing / assessment.scores.length) * 100}%` }} className="bg-amber-400" title="Developing" />
                              <div style={{ width: `${(stat.beginning / assessment.scores.length) * 100}%` }} className="bg-rose-500" title="Beginning" />
                           </div>
                           <div className="flex gap-4">
                              <LegendItem color="bg-emerald-500" label="A" value={stat.achieved} />
                              <LegendItem color="bg-amber-400" label="D" value={stat.developing} />
                              <LegendItem color="bg-rose-500" label="B" value={stat.beginning} />
                           </div>
                         </>
                       ) : (
                         <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                               <span>Rata-rata Kelas</span>
                               <span>{stat.avgNumeric || '0'} / 100</span>
                            </div>
                            <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden">
                               <div 
                                 style={{ width: `${stat.avgNumeric || 0}%` }} 
                                 className={cn(
                                   "h-full transition-all",
                                   Number(stat.avgNumeric) >= 75 ? "bg-emerald-500" : Number(stat.avgNumeric) >= 50 ? "bg-amber-400" : "bg-rose-500"
                                 )} 
                               />
                            </div>
                         </div>
                       )}
                    </div>
                  ))}
               </div>
            </div>

            <div className="p-8 bg-[#002366] text-white rounded-[2.5rem] shadow-xl shadow-blue-100 space-y-6">
               <h3 className="text-[10px] font-black text-blue-200 uppercase tracking-[0.3em]">Quick Info</h3>
               <div className="space-y-4">
                  <DetailItem label="Class" value={assessment.classId} />
                  <DetailItem label="Subject" value={assessment.subject} />
                  <DetailItem label="Total Goals" value={assessment.goals.length.toString()} />
               </div>
            </div>
         </div>

         {/* Main Content */}
         <div className="lg:col-span-2 space-y-10">
            {/* Visual Overview */}
            <div className="p-10 bg-white rounded-[3rem] border border-gray-100 shadow-sm space-y-10">
               <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-3">
                     <BarChart3 size={20} className="text-blue-500" /> Comparison Chart
                  </h3>
               </div>
               
               <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} />
                      <ReTooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                      <ReLegend wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 900, letterSpacing: '0.1em' }} />
                      <Bar dataKey="Achieved" fill={SCORE_COLORS.A} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Developing" fill={SCORE_COLORS.D} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Beginning" fill={SCORE_COLORS.B} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Students Table */}
            <div className="space-y-6">
               <div className="flex items-center gap-4">
                  <div className="w-1.5 h-6 bg-blue-600 rounded-full" />
                  <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Student Record Detail</h2>
               </div>

               <div className="bg-white rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-50 overflow-hidden">
                  <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr className="bg-gray-50/50">
                              <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">Siswa</th>
                              {assessment.goals.map((goal) => (
                                <th key={goal.goalId} className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 text-center">
                                   {goal.goalCode}
                                </th>
                              ))}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                           {assessment.scores.map((score) => (
                              <tr key={score.studentId} className="group hover:bg-gray-50/30 transition-all">
                                 <td className="px-8 py-6">
                                    <div className="space-y-0.5">
                                       <p className="text-xs font-black text-gray-900 uppercase tracking-wider">{score.studentName}</p>
                                       <p className="text-[9px] font-bold text-gray-400 tabular-nums uppercase">{score.studentId}</p>
                                    </div>
                                 </td>
                                 {assessment.goals.map((goal) => {
                                   const gs = score.goalScores[goal.goalId];
                                   const s = gs?.score;
                                   return (
                                     <td key={goal.goalId} className="px-8 py-6 text-center">
                                        {s !== null && s !== undefined ? (
                                           <div className="inline-flex flex-col items-center gap-1">
                                              <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-black text-white shadow-lg",
                                                typeof s === 'number' 
                                                  ? (s >= 75 ? "bg-emerald-500 shadow-emerald-100" : s >= 50 ? "bg-amber-400 shadow-amber-100" : "bg-rose-500 shadow-rose-100")
                                                  : (s === 'A' ? "bg-emerald-500 shadow-emerald-100" : s === 'D' ? "bg-amber-400 shadow-amber-100" : "bg-rose-500 shadow-rose-100")
                                              )}>
                                                 {s}
                                              </div>
                                              <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">
                                                {typeof s === 'number' ? 'Score' : SCORE_LABELS[s]}
                                              </span>
                                           </div>
                                        ) : (
                                           <span className="text-[10px] font-black text-gray-200">N/A</span>
                                        )}
                                     </td>
                                   );
                                 })}
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string, label: string, value: number }) {
   return (
      <div className="flex items-center gap-2">
         <div className={cn("w-2 h-2 rounded-full", color)} />
         <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}: {value}</span>
      </div>
   );
}

function DetailItem({ label, value }: { label: string, value: string }) {
   return (
      <div className="space-y-1">
         <p className="text-[9px] font-black text-blue-300 uppercase tracking-widest leading-none mb-1">{label}</p>
         <p className="text-sm font-black text-white uppercase tracking-wider">{value}</p>
      </div>
   );
}
