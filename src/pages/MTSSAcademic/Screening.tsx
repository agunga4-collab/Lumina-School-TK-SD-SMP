import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  TrendingDown, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronRight,
  UserPlus,
  BookOpen,
  Calculator,
  Languages,
  ExternalLink,
  Brain,
  LayoutGrid,
  Users,
  Target,
  Clock,
  ArrowRight,
  Plus,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  getStudents, 
  getMTSSAcademicCases, 
  getMTSSAcademicTimeline,
  getLiteracyProgress,
  createDraftMTSSCaseFromScreening
} from '../../lib/firebase';
import { 
  Student, 
  MTSSAcademicCase, 
  MTSSAcademicScreeningResult, 
  ClassScreeningSummary,
  MTSSAcademicTimelinePhase
} from '../../types';
import { buildScreeningResult, aggregateClassSummaries } from '../../services/mtssAcademicScreeningService';
import { format, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';

export default function Screening() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const { filters } = useOutletContext<{ filters: any }>();
  const [activeView, setActiveView] = useState<'BY_CLASS' | 'BY_STUDENT'>('BY_STUDENT');
  const [domain, setDomain] = useState<'BI' | 'ENG' | 'NUM'>('NUM');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  
  const [students, setStudents] = useState<Student[]>([]);
  const [cases, setCases] = useState<MTSSAcademicCase[]>([]);
  const [timeline, setTimeline] = useState<MTSSAcademicTimelinePhase[]>([]);
  const [screeningResults, setScreeningResults] = useState<MTSSAcademicScreeningResult[]>([]);
  const [classSummaries, setClassSummaries] = useState<ClassScreeningSummary[]>([]);

  useEffect(() => {
    fetchData();
  }, [currentUser, domain, filters.academicYear, filters.semester]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { academicYear, semester } = filters;
      const [allStudents, allCases, literacyData, allPhases] = await Promise.all([
        getStudents(),
        getMTSSAcademicCases({ academicYear }),
        getLiteracyProgress(),
        getMTSSAcademicTimeline('JUNIOR_HIGH', academicYear, semester)
      ]);

      setStudents(allStudents);
      setCases(allCases);
      setTimeline(allPhases);

      // BUILD SCREENING RESULTS
      const results = allStudents.map(student => {
        // Find if student has teacher referral in existing cases or notes
        const referral = { flagged: false };
        return buildScreeningResult(student, domain, literacyData, allCases, referral);
      });

      setScreeningResults(results.sort((a, b) => {
        const riskOrder = { 'HIGH': 3, 'MODERATE': 2, 'LOW': 1 };
        return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
      }));

      // AGGREGATE CLASS SUMMARIES
      const summaries = aggregateClassSummaries(results, allStudents);
      setClassSummaries(summaries);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const activePhase = timeline.find(p => isWithinInterval(Date.now(), { start: p.startDate, end: p.endDate }));

  const filteredResults = screeningResults.filter(r => 
    r.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.className.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateCase = async (result: MTSSAcademicScreeningResult) => {
    setProcessing(result.id);
    try {
      const caseId = await createDraftMTSSCaseFromScreening(result, `Screening candidate for ${domain}`);
      toast.success('Draft MTSS Case created successfully');
      navigate(`/junior-high/academic/mtss/cases/${caseId}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to create MTSS Case');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Phase Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Domain: {domain === 'NUM' ? 'Numeracy' : domain === 'BI' ? 'Literacy (BI)' : 'Literacy (ENG)'}</span>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 whitespace-nowrap">
                <Clock size={12} />
                {activePhase ? `Phase: ${activePhase.title}` : 'No active phase'}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
           <button 
             onClick={() => setDomain('NUM')}
             className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${domain === 'NUM' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
              Numeracy
           </button>
           <button 
             onClick={() => setDomain('BI')}
             className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${domain === 'BI' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
           >
              Literacy
           </button>
        </div>
      </div>

      {/* Sub Header Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2 border-b border-slate-100">
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/overview')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Overview
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/cases')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Cases
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/screening')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-900 text-white shadow-lg shadow-slate-200"
        >
          Screening
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/alerts')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Alerts
        </button>
        <button 
          onClick={() => navigate('/junior-high/academic/mtss/timeline')}
          className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all font-bold"
        >
          Timeline
        </button>
      </div>

      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <StatsCard 
           label="Total Students" 
           value={students.length} 
           icon={Users} 
           color="blue"
         />
         <StatsCard 
           label="Tier 2 Candidates" 
           value={screeningResults.filter(r => r.recommendedAction === 'RECOMMEND_TIER2').length} 
           icon={TrendingDown} 
           color="rose"
           subtitle="Pending Referral"
         />
         <StatsCard 
           label="Discussion Needed" 
           value={screeningResults.filter(r => r.recommendedAction === 'CONSIDER_TIER2_DISCUSSION').length} 
           icon={Brain} 
           color="amber"
           subtitle="Moderate Gaps"
         />
         <StatsCard 
           label="Active Support" 
           value={cases.filter(c => c.status !== 'CLOSED').length} 
           icon={CheckCircle2} 
           color="emerald"
           subtitle="Tier 2/3 Cases"
         />
      </div>

      {/* Main Dashboard Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        {/* Sub-nav & Search */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/30">
           <div className="flex p-1 bg-slate-200/50 rounded-2xl w-full md:w-auto">
              <button 
                onClick={() => setActiveView('BY_STUDENT')}
                className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeView === 'BY_STUDENT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                 By Student
              </button>
              <button 
                onClick={() => setActiveView('BY_CLASS')}
                className={`flex-1 md:flex-none px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeView === 'BY_CLASS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                 By Class
              </button>
           </div>

           <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder={activeView === 'BY_STUDENT' ? "Find student..." : "Search classes..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all"
              />
           </div>
        </div>

        {loading ? (
          <div className="p-32 text-center">
            <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Processing Risk Indices...</p>
          </div>
        ) : (
          <div className="p-0">
             <AnimatePresence mode="wait">
                {activeView === 'BY_STUDENT' ? (
                  <div key="student-view">
                    <StudentListView results={filteredResults} onAction={handleCreateCase} processing={processing} />
                  </div>
                ) : (
                  <div key="class-view">
                    <ClassListView summaries={classSummaries} />
                  </div>
                )}
             </AnimatePresence>
          </div>
        )}
      </div>

      {/* SOP Reference Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="bg-slate-900 p-8 rounded-[40px] text-white overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-8 text-white opacity-10">
               <Info size={120} />
            </div>
            <h3 className="text-xl font-black mb-4 flex items-center gap-3">
               SOP: 20% Threshold Rule
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed mb-6 font-medium italic">
               "Rata-rata siswa per kelas yang direkomendasikan ke Tier 2 sebaiknya tidak lebih dari 20% jumlah siswa di kelas. Jika lebih, guru perlu melakukan diagnosa & asesmen tambahan di Tier 1."
            </p>
            <div className="flex items-center gap-3">
               <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">SOP MTSS Lazuardi</div>
               <div className="px-3 py-1 bg-indigo-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest">Surgical Strategy</div>
            </div>
         </div>

         <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
               <h3 className="text-xl font-black text-slate-800 mb-2">Intervention Planning</h3>
               <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                  Tier 2 intervention covers 8 sessions over 4 weeks. Ideal launch is Month 3 of the semester based on Initial Meeting results.
               </p>
            </div>
            <button className="flex items-center gap-2 text-indigo-600 font-black uppercase tracking-widest text-xs hover:gap-4 transition-all">
               View Recommended Materials <ArrowRight size={16} />
            </button>
         </div>
      </div>
    </div>
  );
}

function StatsCard({ label, value, icon: Icon, color, subtitle }: any) {
  const colors: any = {
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
  };

  return (
    <div className={`p-6 rounded-3xl border ${colors[color]} shadow-sm`}>
      <div className="flex items-start justify-between mb-2">
         <div className="p-2.5 bg-white/60 rounded-2xl shadow-sm backdrop-blur-sm">
            <Icon size={22} />
         </div>
      </div>
      <div>
         <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
         <h4 className="text-3xl font-black tracking-tight">{value}</h4>
         {subtitle && <p className="text-[10px] font-bold mt-1 opacity-50 uppercase">{subtitle}</p>}
      </div>
    </div>
  );
}

interface StudentListViewProps {
  results: MTSSAcademicScreeningResult[];
  onAction: (r: MTSSAcademicScreeningResult) => void;
  processing: string | null;
}

function StudentListView({ results, onAction, processing }: StudentListViewProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="overflow-x-auto"
    >
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Student & Class</th>
            <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Risk Level</th>
            <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Performance trend</th>
            <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Recommended Action</th>
            <th className="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Draft Case</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
           {results.map((r) => (
             <tr key={r.id} className="hover:bg-indigo-50/30 transition-all group">
                <td className="px-8 py-5">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:text-indigo-600 transition-colors">
                         {r.studentName.charAt(0)}
                      </div>
                      <div>
                         <p className="text-sm font-black text-slate-800">{r.studentName}</p>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{r.className}</p>
                      </div>
                   </div>
                </td>
                <td className="px-8 py-5">
                   <div className="flex flex-col gap-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest w-fit ${
                        r.riskLevel === 'HIGH' ? 'bg-rose-600 text-white' : 
                        r.riskLevel === 'MODERATE' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                         {r.riskLevel} Risk
                      </span>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                         {r.riskFlags.map(f => (
                           <span key={f} className="text-[8px] font-bold text-slate-400 bg-white border border-slate-100 px-1.5 py-0.5 rounded-lg uppercase whitespace-nowrap">
                              {f.split('_').join(' ')}
                           </span>
                         ))}
                      </div>
                   </div>
                </td>
                <td className="px-8 py-5">
                   <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${
                        r.recentTrend === 'IMPROVING' ? 'bg-emerald-50 text-emerald-600' :
                        r.recentTrend === 'DECLINING' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                         {r.recentTrend === 'IMPROVING' ? <TrendingDown size={18} className="rotate-180" /> : 
                          r.recentTrend === 'DECLINING' ? <TrendingDown size={18} /> : <AlertTriangle size={18} />}
                      </div>
                      <div className="flex flex-col">
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">AVG Score</span>
                         <span className="text-sm font-black text-slate-700">{Math.round(r.averageScore || 0)}%</span>
                      </div>
                   </div>
                </td>
                <td className="px-8 py-5">
                   <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">
                         {r.recommendedAction.split('_').join(' ')}
                      </span>
                      <p className="text-[9px] font-medium text-slate-400 leading-tight">
                         {r.recommendedAction === 'RECOMMEND_TIER2' || r.recommendedAction === 'CONSIDER_TIER3_REVIEW' ? 'Candidate for support cycle' : 'Monitor during Tier 1 lessons'}
                      </p>
                   </div>
                </td>
                <td className="px-8 py-5 text-right">
                   <button 
                     disabled={!!processing}
                     onClick={() => onAction(r)}
                     className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                   >
                      {processing === r.id ? <div className="w-5 h-5 border-2 border-indigo-600 border-t-white rounded-full animate-spin" /> : <Plus size={20} />}
                   </button>
                </td>
             </tr>
           ))}
        </tbody>
      </table>
    </motion.div>
  );
}

interface ClassListViewProps {
  summaries: ClassScreeningSummary[];
}

function ClassListView({ summaries }: ClassListViewProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6"
    >
       {summaries.map((s) => (
         <div key={s.classId} className={`p-6 rounded-[32px] border ${s.exceedsRecommendedThreshold ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-100'} transition-all shadow-sm group hover:scale-[1.02]`}>
            <div className="flex items-start justify-between mb-6">
               <div className={`p-3 rounded-2xl ${s.exceedsRecommendedThreshold ? 'bg-white text-rose-600 shadow-sm' : 'bg-indigo-50 text-indigo-600'}`}>
                  <LayoutGrid size={24} />
               </div>
               {s.exceedsRecommendedThreshold && (
                 <div className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest animate-pulse">
                    Alert: {s.tier2CandidatePercentage.toFixed(0)}%
                 </div>
               )}
            </div>
            <h4 className="text-xl font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tighter">{s.className}</h4>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6">{s.totalStudents} Students</p>
            
            <div className="space-y-4">
               <div>
                  <div className="flex justify-between text-[10px] font-black uppercase mb-1.5">
                     <span className="text-slate-400">Tier 2 Candidates</span>
                     <span className={s.exceedsRecommendedThreshold ? 'text-rose-600' : 'text-indigo-600'}>{s.tier2CandidateCount} Students</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(s.tier2CandidatePercentage, 100)}%` }}
                        className={`h-full ${s.exceedsRecommendedThreshold ? 'bg-rose-500' : 'bg-indigo-600'}`}
                     />
                  </div>
               </div>

               {s.exceedsRecommendedThreshold && (
                 <div className="p-3 bg-white/60 rounded-2xl border border-rose-100 flex items-start gap-3">
                    <AlertTriangle size={14} className="text-rose-600 mt-0.5 shrink-0" />
                    <p className="text-[9px] font-bold text-rose-700 leading-relaxed uppercase">
                       Exceeds 20% SOP threshold. Recommendation: Additional diagnosis needed in Tier 1.
                    </p>
                 </div>
               )}
            </div>
         </div>
       ))}
    </motion.div>
  );
}
