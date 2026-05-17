import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Calendar as CalendarIcon, TrendingUp, Target, 
  Plus, CheckCircle2, AlertCircle, Save, Settings, 
  MessageSquare, User, Clock, ChevronRight, BarChart3,
  Edit2, Trash2, LayoutGrid, ListChecks, Info, 
  ArrowRight, Download, Filter, Star, ShieldCheck,
  History, CalendarDays, Activity
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine, AreaChart, Area
} from 'recharts';
import { formatDate, cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { 
  db, getCICOGoalConfig, saveCICOGoalConfig, 
  getCICODailyReports, saveCICODailyReport,
  getCICOWeeklyReflections, saveCICOWeeklyReflection
} from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { 
  MTSSCase, CICOGoal, CICOScore, CICOSessionData, 
  CICODailyReport, CICOWeeklyReflection, CICOGoalConfig 
} from '../../types';

const LAZUARDI_SESSIONS = [
  { id: '1', name: 'Class Time', time: '07:30–08:10' },
  { id: '2', name: 'RAM/Teen Talk', time: '08:10–08:40' },
  { id: '3', name: 'Learning Journey', time: '08:40–10:40' },
  { id: '4', name: 'Recess Time', time: '10:10–10:40' },
  { id: '5', name: 'Weekly Lesson/SE', time: '10:40–11:40' },
  { id: '6', name: 'Daily Reflection', time: '11:40–12:20' },
  { id: '7', name: 'Lunch & Kirei', time: '12:20–12:45' },
  { id: '8', name: 'Dhuhur Prayer', time: '12:45–13:25' },
  { id: '9', name: 'UA/REST', time: '13:25–14:35' },
];

const DEFAULT_GOALS: CICOGoal[] = [
  { id: 'g1', label: 'Constructive Criticism' },
  { id: 'g2', label: 'Cooperative' },
  { id: 'g3', label: 'Respect Others' },
  { id: 'g4', label: 'Being More Mature' },
];

export default function CICOTracker() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [mtssCase, setMtssCase] = React.useState<MTSSCase | null>(null);
  const [goalConfig, setGoalConfig] = React.useState<CICOGoalConfig | null>(null);
  const [dailyReports, setDailyReports] = React.useState<CICODailyReport[]>([]);
  const [reflections, setReflections] = React.useState<CICOWeeklyReflection[]>([]);
  
  const [activeTab, setActiveTab] = React.useState<'dashboard' | 'input' | 'reflections' | 'config'>('dashboard');
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = React.useState(true);
  
  // Input State for Daily Report
  const [dailyForm, setDailyForm] = React.useState<Omit<CICODailyReport, 'id' | 'createdAt' | 'updatedAt'>>({
    caseId: caseId || '',
    studentId: '',
    date: selectedDate,
    sessions: LAZUARDI_SESSIONS.map(s => ({
      sessionId: s.id,
      sessionName: s.name,
      scores: DEFAULT_GOALS.map(g => ({ goalId: g.id, score: null })),
      teacherName: ''
    })),
    goals: DEFAULT_GOALS,
    dayAverage: 0,
    totalPossible: 0,
    totalEarned: 0,
    percentage: 0
  });

  // Reflection State
  const [reflectionForm, setReflectionForm] = React.useState({
    studentPositives: '',
    studentPlans: '',
    teacherNotes: ''
  });

  React.useEffect(() => {
    const fetchData = async () => {
      if (!caseId) return;
      try {
        const caseSnap = await getDoc(doc(db, 'behaviorCases', caseId));
        if (caseSnap.exists()) {
          const cData = { id: caseSnap.id, ...caseSnap.data() } as MTSSCase;
          setMtssCase(cData);
          
          const config = await getCICOGoalConfig(caseId);
          setGoalConfig(config);
          
          const reports = await getCICODailyReports(caseId);
          setDailyReports(reports);
          
          const refs = await getCICOWeeklyReflections(caseId);
          setReflections(refs);

          // Update daily form if a report exists for the selected date
          const existingReport = reports.find(r => r.date === selectedDate);
          if (existingReport) {
            setDailyForm(existingReport);
          } else {
            const currentGoals = config?.goals || DEFAULT_GOALS;
            setDailyForm(prev => ({
              ...prev,
              studentId: cData.studentId,
              date: selectedDate,
              goals: currentGoals,
              sessions: LAZUARDI_SESSIONS.map(s => ({
                sessionId: s.id,
                sessionName: s.name,
                scores: currentGoals.map(g => ({ goalId: g.id, score: null })),
                teacherName: ''
              }))
            }));
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [caseId, selectedDate]);

  const handleScoreClick = (sessionId: string, goalId: string, score: 1 | 2 | 3) => {
    setDailyForm(prev => {
      const newSessions = prev.sessions.map(s => {
        if (s.sessionId === sessionId) {
          const newScores = s.scores.map(sc => {
            if (sc.goalId === goalId) return { ...sc, score: sc.score === score ? null : score };
            return sc;
          });
          return { ...s, scores: newScores, teacherName: s.teacherName || profile?.displayName || '' };
        }
        return s;
      });

      // Calculate stats
      let earned = 0;
      let possible = 0;
      newSessions.forEach(s => {
        s.scores.forEach(sc => {
          if (sc.score !== null) {
            earned += sc.score;
            possible += 3;
          }
        });
      });

      return {
        ...prev,
        sessions: newSessions,
        totalEarned: earned,
        totalPossible: possible,
        percentage: possible > 0 ? (earned / possible) * 100 : 0,
        dayAverage: possible > 0 ? (earned / (possible / 3)) : 0
      };
    });
  };

  const handleSaveDaily = async () => {
    if (!caseId) return;
    try {
      await saveCICODailyReport(dailyForm);
      const reports = await getCICODailyReports(caseId);
      setDailyReports(reports);
      alert("Laporan harian berhasil disimpan!");
    } catch (err) {
      console.error(err);
    }
  };

  const getCalendarNodes = () => {
    const today = new Date();
    const nodes = [];
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const report = dailyReports.find(r => r.date === dateStr);
      nodes.push({ date: dateStr, day: i, report });
    }
    return nodes;
  };

  const chartData = dailyReports
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14) // Last 2 weeks
    .map(r => ({
      date: formatDate(r.date),
      percentage: Math.round(r.percentage),
      average: Number(r.dayAverage.toFixed(1))
    }));

  const isCounselor = profile?.role === 'BK_MENTOR' || profile?.role === 'SUPER_ADMIN' || profile?.role === 'HEAD_JUNIOR';
  const isTeacher = profile?.role === 'TEACHER';
  const isParent = profile?.role === 'PARENT';

  if (loading) return (
    <div className="h-[60vh] flex flex-col items-center justify-center space-y-4">
      <Activity className="animate-pulse text-blue-600" size={48} />
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Loading Tracker Modules</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-24 space-y-10 group/page">
      {/* Header Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <button
          onClick={() => navigate(`/mtss/case/${caseId}`)}
          className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900 transition-all group"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
            <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          </div>
          Back to Case
        </button>
        
        <div className="flex items-center gap-6">
           <div className="text-right hidden md:block">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">CICO Daily Progress Report</p>
              <p className="text-xl font-black italic uppercase text-blue-900 tracking-tighter">{mtssCase?.studentName}</p>
           </div>
           <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl border border-gray-200">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={cn("px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'dashboard' ? "bg-white text-blue-600 shadow-md" : "text-gray-400 hover:text-gray-600")}
              >
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('input')}
                className={cn("px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'input' ? "bg-white text-blue-600 shadow-md" : "text-gray-400 hover:text-gray-600")}
              >
                DPR Input
              </button>
              <button 
                onClick={() => setActiveTab('reflections')}
                className={cn("px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'reflections' ? "bg-white text-blue-600 shadow-md" : "text-gray-400 hover:text-gray-600")}
              >
                Reflections
              </button>
              {isCounselor && (
                <button 
                  onClick={() => setActiveTab('config')}
                  className={cn("p-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", activeTab === 'config' ? "bg-white text-blue-600 shadow-md" : "text-gray-400 hover:text-gray-600")}
                >
                  <Settings size={16} />
                </button>
              )}
           </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
               {/* Percentage Card */}
               <div className="bg-[#002366] rounded-[3.5rem] p-10 text-white shadow-3xl relative overflow-hidden group/card shadow-blue-900/20">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover/card:scale-110 transition-transform">
                     <TrendingUp size={120} />
                  </div>
                  <div className="relative z-10 space-y-8">
                     <div className="flex items-center gap-4">
                        <div className="p-4 bg-white/10 rounded-2xl ring-1 ring-white/20 shadow-inner">
                           <Target size={24} className="text-blue-300" />
                        </div>
                        <div>
                           <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300/60 leading-none">Overall Progress</p>
                           <p className="text-sm font-black uppercase italic tracking-tighter mt-1">Tier 2 Target Status</p>
                        </div>
                     </div>
                     <div className="flex items-baseline gap-2">
                        <span className="text-7xl font-black italic tracking-tighter">
                          {dailyReports.length > 0 ? Math.round(dailyReports.reduce((acc, r) => acc + r.percentage, 0) / dailyReports.length) : 0}%
                        </span>
                        <p className="text-xs font-black uppercase text-blue-300/40 tracking-widest leading-loose">Success Rate</p>
                     </div>
                     <div className="space-y-2">
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden border border-white/10 shadow-inner">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${dailyReports.length > 0 ? (dailyReports.reduce((acc, r) => acc + r.percentage, 0) / dailyReports.length) : 0}%` }}
                             className="h-full bg-gradient-to-r from-blue-400 to-emerald-400"
                           />
                        </div>
                        <p className="text-[9px] font-black text-blue-300/40 uppercase tracking-widest text-center">Threshold: {goalConfig?.targetPercentage || 80}% for consistency</p>
                     </div>
                  </div>
               </div>

               {/* Consistency Stat */}
               <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-2xl flex flex-col justify-between group/stat">
                  <div className="space-y-6">
                     <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Consistency Drill</p>
                        <ShieldCheck className="text-emerald-500" size={20} />
                     </div>
                     <div className="space-y-2">
                        <p className="text-3xl font-black text-gray-900 italic tracking-tighter uppercase leading-none">Strongest Segment</p>
                        <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl inline-block">Morning Sessions (84%)</p>
                     </div>
                  </div>
                  <div className="pt-8 border-t border-gray-50 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <Clock size={14} className="text-blue-500" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Least Consistent: Dhuhur Prayer</span>
                     </div>
                     <ArrowRight size={16} className="text-gray-300 group-hover:translate-x-1 transition-transform" />
                  </div>
               </div>

               {/* Calendar Color Legend */}
               <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-2xl flex flex-col items-center justify-center space-y-8">
                  <div className="text-center space-y-2">
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Calendar Heatmap Legend</p>
                     <h4 className="text-xs font-black uppercase italic tracking-tighter text-blue-900">Score-Based Indicators</h4>
                  </div>
                  <div className="flex flex-col gap-4 w-full px-4">
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Great Day (&gt;2.5 Avg)</span>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-xl bg-amber-400 shadow-lg shadow-amber-400/20" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Needs Support (1.5–2.5)</span>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-xl bg-rose-500 shadow-lg shadow-rose-500/20" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">Rough Day (&lt;1.5 Avg)</span>
                     </div>
                  </div>
               </div>
            </div>

            {/* Visual Analytics Hub */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
               {/* Calendar Track */}
               <div className="lg:col-span-1 bg-white rounded-[4rem] p-12 border border-gray-100 shadow-2xl space-y-10">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <CalendarDays className="text-blue-600" size={24} />
                        <h3 className="text-lg font-black uppercase italic tracking-tighter text-gray-900 leading-none">
                           {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}
                        </h3>
                     </div>
                     <div className="flex gap-2">
                        <button className="p-2 hover:bg-gray-50 rounded-lg transition-all">< ChevronLeft size={16} /></button>
                        <button className="p-2 hover:bg-gray-50 rounded-lg transition-all">< ChevronRight size={16} /></button>
                     </div>
                  </div>

                  <div className="grid grid-cols-7 gap-3">
                     {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                       <div key={d} className="text-center text-[9px] font-black uppercase text-gray-300 tracking-widest mb-2">{d}</div>
                     ))}
                     {getCalendarNodes().map((node, i) => (
                       <button
                         key={i}
                         onClick={() => {
                            setSelectedDate(node.date);
                            setActiveTab('input');
                         }}
                         className={cn(
                           "aspect-square rounded-2xl flex items-center justify-center text-[11px] font-black transition-all hover:scale-110 relative group/day",
                           node.report ? (
                             node.report.dayAverage > 2.5 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" :
                             node.report.dayAverage >= 1.5 ? "bg-amber-400 text-white shadow-lg shadow-amber-400/20" :
                             "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                           ) : "bg-gray-50 text-gray-300 border border-gray-100"
                         )}
                       >
                         {node.day}
                         {node.report && (
                           <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full border-2 border-emerald-500 scale-0 group-hover/day:scale-100 transition-transform" />
                         )}
                       </button>
                     ))}
                  </div>

                  <div className="p-6 bg-blue-50 rounded-[2.5rem] border border-blue-100/50 flex items-center justify-between">
                    <div>
                        <p className="text-[9px] font-black uppercase text-blue-400 tracking-widest">Active Cycle</p>
                        <p className="text-sm font-black italic tracking-tighter text-blue-900 uppercase">Week 3 of 8</p>
                    </div>
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/30">
                       Analyze Period
                    </button>
                  </div>
               </div>

               {/* Line Chart Progress */}
               <div className="lg:col-span-2 bg-white rounded-[4rem] p-12 border border-gray-100 shadow-2xl space-y-10 relative overflow-hidden group/graph">
                  <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover/graph:rotate-12 transition-transform duration-1000">
                     <TrendingUp size={240} />
                  </div>
                  <div className="flex items-center justify-between relative z-10">
                     <div className="flex items-center gap-5">
                        <div className="w-14 h-14 bg-gray-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                           <BarChart3 size={28} />
                        </div>
                        <div>
                           <h3 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Progress Trend</h3>
                           <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">14-Day Performance Velocity</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-3">
                        <select className="bg-gray-50 border-none text-[10px] font-black uppercase tracking-widest px-6 py-3 rounded-xl outline-none shadow-sm cursor-pointer hover:bg-white transition-all">
                           <option>Last 14 Days</option>
                           <option>Last 30 Days</option>
                           <option>This Semester</option>
                        </select>
                        <button className="p-3 bg-gray-900 text-white rounded-xl shadow-xl hover:scale-110 transition-transform">
                           <Download size={18} />
                        </button>
                     </div>
                  </div>

                  <div className="h-80 w-full relative z-10 pt-4">
                     {chartData.length > 0 ? (
                       <ResponsiveContainer width="100%" height="100%">
                         <AreaChart data={chartData}>
                           <defs>
                             <linearGradient id="colorPct" x1="0" y1="0" x2="0" y2="1">
                               <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                               <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                             </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis 
                             dataKey="date" 
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} 
                             dy={15}
                           />
                           <YAxis 
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fontSize: 10, fontWeight: 900, fill: '#94a3b8' }} 
                             domain={[0, 100]}
                             dx={-10}
                           />
                           <Tooltip 
                             content={({ active, payload }) => {
                               if (active && payload && payload.length) {
                                 return (
                                   <div className="bg-gray-900 text-white p-4 rounded-2xl border border-white/10 shadow-3xl">
                                      <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest pb-1">{payload[0].payload.date}</p>
                                      <p className="text-xl font-black italic tracking-tighter">{payload[0].value}% Score</p>
                                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Avg Score: {payload[0].payload.average}/3</p>
                                   </div>
                                 );
                               }
                               return null;
                             }}
                           />
                           <ReferenceLine y={goalConfig?.targetPercentage || 80} stroke="#cbd5e1" strokeDasharray="5 5" label={{ value: 'Target', position: 'right', fill: '#cbd5e1', fontSize: 10, fontWeight: 900 }} />
                           <Area 
                             type="monotone" 
                             dataKey="percentage" 
                             stroke="#2563eb" 
                             strokeWidth={6} 
                             fillOpacity={1} 
                             fill="url(#colorPct)" 
                             dot={{ r: 6, fill: '#fff', stroke: '#2563eb', strokeWidth: 4 }}
                             activeDot={{ r: 10, fill: '#2563eb', stroke: '#fff', strokeWidth: 4 }}
                           />
                         </AreaChart>
                       </ResponsiveContainer>
                     ) : (
                       <div className="h-full flex flex-col items-center justify-center space-y-4 bg-gray-50 rounded-[3rem] border border-gray-100">
                          <BarChart3 className="text-gray-200" size={60} />
                          <p className="text-sm font-black italic tracking-tighter text-gray-300 uppercase">Insufficient Data to Map Trends</p>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'input' && (
          <motion.div 
            key="input"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
          >
            {/* Input Meta Header */}
            <div className="bg-white rounded-[3.5rem] p-10 border border-gray-100 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-[1.5rem] flex items-center justify-center shadow-inner">
                     <CalendarIcon size={32} />
                  </div>
                  <div>
                     <h3 className="text-2xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Daily Entry</h3>
                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Select date to modify scores</p>
                  </div>
                  <div className="h-12 w-[1px] bg-gray-100 mx-2 hidden md:block" />
                  <input 
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-gray-50 px-6 py-3 rounded-xl border border-transparent focus:bg-white focus:border-blue-300 outline-none text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                  />
               </div>

               <div className="flex items-center gap-10">
                  <div className="text-right">
                     <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Today's Progress</p>
                     <div className="flex items-baseline justify-end gap-2 text-blue-600">
                        <span className="text-4xl font-black italic tracking-tighter leading-none">{Math.round(dailyForm.percentage)}%</span>
                        <span className="text-xs font-black uppercase tracking-widest">Score</span>
                     </div>
                  </div>
                  <button 
                    onClick={handleSaveDaily}
                    className="bg-[#002366] text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center gap-3 overflow-hidden group/save"
                  >
                     <div className="group-hover/save:-translate-y-12 transition-transform duration-500 flex flex-col items-center">
                        <div className="flex items-center gap-3">
                           <Save size={18} /> Simpan Laporan
                        </div>
                        <div className="flex items-center gap-3 absolute translate-y-12">
                           <CheckCircle2 size={18} /> Update Data
                        </div>
                     </div>
                  </button>
               </div>
            </div>

            {/* Main Scoring Grid */}
            <div className="bg-white rounded-[4rem] border border-gray-100 shadow-3xl overflow-hidden relative group/grid">
               <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                     <thead>
                        <tr className="bg-gray-50/50">
                           <th className="px-10 py-8 border-b border-gray-100">
                              <div className="flex items-center gap-3">
                                 <LayoutGrid size={16} className="text-gray-400" />
                                 <span className="text-[11px] font-black italic tracking-tighter uppercase text-gray-500">Session Name</span>
                              </div>
                           </th>
                           {dailyForm.goals.map(goal => (
                              <th key={goal.id} className="px-6 py-8 border-b border-gray-100 text-center">
                                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-900 mb-1">{goal.label}</p>
                                 <p className="text-[8px] font-bold text-gray-400 tracking-widest leading-none">Individual Target</p>
                              </th>
                           ))}
                           <th className="px-10 py-8 border-b border-gray-100">
                              <div className="flex items-center gap-3">
                                 <User size={16} className="text-gray-400" />
                                 <span className="text-[11px] font-black italic tracking-tighter uppercase text-gray-500">Educator</span>
                              </div>
                           </th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50">
                        {dailyForm.sessions.map((session, sIdx) => (
                           <tr key={session.sessionId} className="group/row hover:bg-gray-50/30 transition-colors">
                              <td className="px-10 py-8">
                                 <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1 italic">Phase {session.sessionId}</span>
                                    <span className="text-sm font-black text-gray-900 italic tracking-tighter uppercase leading-none">{session.sessionName}</span>
                                    <div className="flex items-center gap-2 mt-2 text-gray-300 group-hover/row:text-gray-400 transition-colors">
                                       <Clock size={10} />
                                       <span className="text-[8px] font-bold uppercase tracking-widest">{LAZUARDI_SESSIONS.find(s=>s.id === session.sessionId)?.time}</span>
                                    </div>
                                 </div>
                              </td>
                              {dailyForm.goals.map(goal => {
                                 const currentScore = session.scores.find(sc => sc.goalId === goal.id)?.score;
                                 return (
                                    <td key={goal.id} className="px-4 py-8">
                                       <div className="flex items-center justify-center gap-1.5 p-1 bg-gray-100/50 rounded-2xl w-fit mx-auto border border-gray-100 shadow-inner group-hover/row:bg-white/50 transition-all">
                                          {[1, 2, 3].map(score => (
                                             <button
                                               key={score}
                                               onClick={() => handleScoreClick(session.sessionId, goal.id, score as 1|2|3)}
                                               className={cn(
                                                 "w-10 h-10 rounded-xl text-[11px] font-black transition-all transform hover:scale-110",
                                                 currentScore === score ? (
                                                   score === 3 ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" :
                                                   score === 2 ? "bg-amber-400 text-white shadow-lg shadow-amber-400/20" :
                                                   "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                                                 ) : "text-gray-300 hover:text-gray-500"
                                               )}
                                             >
                                               {score}
                                             </button>
                                          ))}
                                       </div>
                                    </td>
                                 );
                              })}
                              <td className="px-10 py-8">
                                 <div className="flex flex-col gap-1">
                                    <input 
                                      type="text"
                                      placeholder="Nama Guru..."
                                      value={session.teacherName}
                                      onChange={(e) => {
                                        const newSessions = [...dailyForm.sessions];
                                        newSessions[sIdx].teacherName = e.target.value;
                                        setDailyForm(prev => ({ ...prev, sessions: newSessions }));
                                      }}
                                      className="bg-transparent border-none outline-none text-[11px] font-black uppercase text-gray-900 placeholder:text-gray-200 placeholder:font-black tracking-widest focus:text-blue-600 transition-colors"
                                    />
                                    <div className="h-[1px] w-full bg-gray-100" />
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>

            {/* Instruction Context Footer */}
            <div className="bg-[#001033] rounded-[3rem] p-10 text-white flex flex-col md:flex-row items-center justify-between gap-10">
               <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-blue-300 shadow-inner ring-1 ring-white/20">
                     <Info size={28} />
                  </div>
                  <div>
                     <p className="text-xs font-black uppercase italic tracking-tighter text-blue-300 leading-none">Scoring Guide</p>
                     <p className="text-[10px] text-blue-100/50 uppercase tracking-widest mt-1.5 max-w-sm font-bold">
                        3 = 0-1 reminder (excellent) | 2 = 2 reminders | 1 = 3+ reminders (intensive support needed).
                     </p>
                  </div>
               </div>
               <div className="flex flex-wrap gap-4">
                  <div className="px-6 py-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Self Regulated</span>
                  </div>
                  <div className="px-6 py-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-amber-400 shadow-lg shadow-amber-400/40" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Moderate</span>
                  </div>
                  <div className="px-6 py-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
                     <div className="w-3 h-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/40" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Intensive</span>
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'reflections' && (
          <motion.div 
            key="reflections"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-10"
          >
            {/* Week Selection Context */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
               <div className="md:col-span-1 space-y-6">
                  <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-2xl space-y-8">
                     <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shadow-inner">
                           <History size={20} />
                        </div>
                        <h4 className="text-sm font-black italic tracking-tighter uppercase text-gray-900 leading-none">Weekly Cycles</h4>
                     </div>
                     <div className="space-y-3">
                        {['20 Apr', '13 Apr', '06 Apr', '30 Mar'].map((date, i) => (
                           <button 
                             key={i}
                             className={cn(
                               "w-full px-6 py-5 rounded-[2rem] text-left transition-all border flex items-center justify-between group",
                               i === 0 ? "bg-purple-600 text-white border-purple-600 shadow-xl" : "bg-white text-gray-400 border-gray-100 hover:border-purple-100 hover:bg-purple-50 hover:text-purple-600 shadow-sm"
                             )}
                           >
                              <div className="flex flex-col">
                                 <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Week {4-i} Plan</span>
                                 <span className="text-xs font-black italic tracking-tighter uppercase whitespace-nowrap">Monday, {date}</span>
                              </div>
                              <ChevronRight size={16} className={cn("transition-transform group-hover:translate-x-1", i === 0 ? "text-white/40" : "text-gray-300")} />
                           </button>
                        ))}
                     </div>
                  </div>

                  <div className="bg-emerald-50 rounded-[3rem] p-10 border border-emerald-100 shadow-xl space-y-4">
                     <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-md">
                        <CheckCircle2 size={24} />
                     </div>
                     <div>
                        <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-800">CICO Mastery</h5>
                        <p className="text-2xl font-black italic tracking-tighter text-emerald-950 uppercase mt-1">Consistency!</p>
                     </div>
                     <p className="text-[10px] font-medium text-emerald-700 italic leading-relaxed pt-2">
                        Reflection is key to the Positive Discipline approach at SMP Lazuardi.
                     </p>
                  </div>
               </div>

               <div className="md:col-span-3 space-y-10">
                  {/* Student Portion */}
                  <div className="bg-white rounded-[4rem] p-12 border border-gray-100 shadow-3xl space-y-12 relative overflow-hidden group/student">
                     <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover/student:scale-125 transition-transform duration-1000">
                        <User size={180} />
                     </div>
                     <div className="flex items-center gap-6 relative z-10">
                        <div className="w-20 h-20 rounded-[1.5rem] bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner ring-4 ring-amber-50">
                           <MessageSquare size={36} />
                        </div>
                        <div>
                           <h3 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">Student Reflection</h3>
                           <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-1">To be filled by: {mtssCase?.studentName}</p>
                        </div>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                        <div className="space-y-4">
                           <label className="text-[10px] font-black uppercase text-gray-400 tracking-[0.3em] ml-2">Progress/Something Positive I did</label>
                           <textarea
                             rows={5}
                             placeholder="Apa hal baik yang kamu lakukan minggu ini?"
                             className="w-full px-8 py-6 rounded-[2.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-amber-300 outline-none transition-all font-bold text-sm italic leading-relaxed text-gray-700 shadow-inner"
                           />
                        </div>
                        <div className="space-y-4">
                           <label className="text-[10px] font-black uppercase text-gray-400 tracking-[0.3em] ml-2">My Plan for Next Week</label>
                           <textarea
                             rows={5}
                             placeholder="Apa yang ingin kamu tingkatkan senin depan?"
                             className="w-full px-8 py-6 rounded-[2.5rem] bg-gray-50 border border-transparent focus:bg-white focus:border-amber-300 outline-none transition-all font-bold text-sm italic leading-relaxed text-gray-700 shadow-inner"
                           />
                        </div>
                     </div>
                     <div className="flex justify-end pt-4 relative z-10">
                        <button className="bg-gray-900 text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center gap-3">
                           <Save size={18} /> Submit Reflection
                        </button>
                     </div>
                  </div>

                  {/* Teacher Portion */}
                  <div className="bg-gray-900 rounded-[4rem] p-12 text-white shadow-3xl space-y-12 relative overflow-hidden group/teacher">
                     <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none group-hover/teacher:rotate-12 transition-transform duration-1000">
                        <ShieldCheck size={180} />
                     </div>
                     <div className="flex items-center gap-6 relative z-10">
                        <div className="w-20 h-20 rounded-[1.5rem] bg-blue-500/20 text-blue-400 flex items-center justify-center shadow-inner ring-4 ring-blue-500/10">
                           <ListChecks size={36} />
                        </div>
                        <div>
                           <h3 className="text-3xl font-black italic tracking-tighter uppercase text-white leading-none">Teacher Findings</h3>
                           <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mt-1 italic tracking-tighter">Educator Clinical Notes</p>
                        </div>
                     </div>

                     <div className="space-y-6 relative z-10">
                        <label className="text-[10px] font-black uppercase text-white/30 tracking-[0.3em] ml-4">Weekly Behavior Evaluation & Recommendation</label>
                        <textarea
                          rows={4}
                          placeholder="Berikan umpan balik terhadap progres siswa..."
                          className="w-full px-10 py-8 rounded-[3rem] bg-white/5 border border-white/10 focus:bg-white/10 focus:border-blue-500 outline-none transition-all font-bold text-sm italic leading-relaxed text-blue-50/80 shadow-3xl"
                        />
                        <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-4">
                           <div className="flex items-center gap-6">
                              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-xs font-black uppercase tracking-tighter text-blue-300">
                                 {profile?.displayName?.slice(0,2)}
                              </div>
                              <div className="flex flex-col">
                                 <span className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-1">Evaluator</span>
                                 <span className="text-sm font-black italic tracking-tighter text-blue-300 uppercase">{profile?.displayName}</span>
                              </div>
                           </div>
                           <button className="w-full md:w-auto bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3">
                              <Save size={18} /> Finalize Weekly Case
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'config' && (
          <motion.div 
            key="config"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto space-y-10"
          >
             <div className="bg-white rounded-[4rem] p-16 border border-gray-100 shadow-3xl space-y-12 relative overflow-hidden group/config">
                <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none group-hover/config:scale-125 transition-transform duration-1000">
                   <Settings size={200} />
                </div>
                <div className="flex items-center gap-6 relative z-10">
                   <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-inner">
                      <Settings size={36} />
                   </div>
                   <div>
                      <h3 className="text-3xl font-black italic tracking-tighter uppercase text-gray-900 leading-none">CICO Policy Configuration</h3>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Customize goals to behavioral contract</p>
                   </div>
                </div>

                <div className="space-y-10 relative z-10">
                   <div className="space-y-6">
                      <h4 className="text-sm font-black uppercase text-blue-900 tracking-widest italic tracking-tighter flex items-center gap-3">
                         <Star size={16} className="text-blue-600" />
                         Active Behavioral Goals (Max 4)
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         {[0, 1, 2, 3].map(idx => (
                            <div key={idx} className="space-y-2 group/input">
                               <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest ml-2">Goal Position {idx + 1}</label>
                               <div className="relative">
                                  <input 
                                    type="text"
                                    value={goalConfig?.goals[idx]?.label || ''}
                                    onChange={(e) => {
                                       const newGoals = [...(goalConfig?.goals || DEFAULT_GOALS)];
                                       newGoals[idx] = { id: `g${idx+1}`, label: e.target.value };
                                       setGoalConfig(prev => ({ 
                                          caseId: caseId || '', 
                                          goals: newGoals, 
                                          targetPercentage: prev?.targetPercentage || 80,
                                          updatedAt: Date.now()
                                       }));
                                    }}
                                    placeholder="Enter behavior goal..."
                                    className="w-full px-8 py-5 rounded-2xl bg-gray-50 border border-transparent focus:bg-white focus:border-blue-300 outline-none transition-all font-black text-[13px] uppercase tracking-tighter shadow-sm"
                                  />
                                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2 opacity-0 group-hover/input:opacity-100 transition-opacity">
                                     <button className="p-2 text-gray-300 hover:text-blue-600 transition-colors"><Edit2 size={14} /></button>
                                     <button className="p-2 text-gray-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>

                   <div className="space-y-6 pt-10 border-t border-gray-50">
                      <h4 className="text-sm font-black uppercase text-blue-900 tracking-widest italic tracking-tighter flex items-center gap-3">
                         <Target size={16} className="text-blue-600" />
                         Target Benchmarking
                      </h4>
                      <div className="flex flex-col md:flex-row items-center gap-12">
                         <div className="w-full md:w-3/5 space-y-4">
                            <div className="flex justify-between items-baseline">
                               <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Target Percentage Score</p>
                               <span className="text-3xl font-black italic tracking-tighter text-blue-600">{goalConfig?.targetPercentage || 80}%</span>
                            </div>
                            <input 
                              type="range"
                              min="50"
                              max="100"
                              step="5"
                              value={goalConfig?.targetPercentage || 80}
                              onChange={(e) => setGoalConfig(prev => ({ 
                                 caseId: caseId || '', 
                                 goals: prev?.goals || DEFAULT_GOALS, 
                                 targetPercentage: parseInt(e.target.value),
                                 updatedAt: Date.now()
                              }))}
                              className="w-full h-3 bg-gray-100 rounded-full appearance-none cursor-pointer accent-blue-600"
                            />
                            <div className="flex justify-between text-[8px] font-black text-gray-300 uppercase tracking-widest">
                               <span>50% (Base)</span>
                               <span>75% (Standard)</span>
                               <span>100% (Perfect)</span>
                            </div>
                         </div>
                         <div className="flex-1 p-8 bg-blue-50 rounded-[3rem] border border-blue-100 flex items-center gap-5">
                            <AlertCircle className="text-blue-600 shrink-0" size={24} />
                            <p className="text-[10px] font-bold text-blue-700 leading-relaxed uppercase tracking-widest italic">
                               Score 80% is the standard Lazuardi benchmark for Tier 2 graduation readiness.
                            </p>
                         </div>
                      </div>
                   </div>

                   <div className="pt-10 flex flex-col md:flex-row justify-between items-center gap-8">
                      <div className="flex items-center gap-4">
                         <div className="p-3 bg-gray-50 text-gray-400 rounded-xl">
                            <History size={20} />
                         </div>
                         <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Last Modified Config</p>
                            <p className="text-xs font-black text-gray-900 uppercase italic tracking-tighter">{goalConfig?.updatedAt ? formatDate(goalConfig.updatedAt.toString()) : 'Never'}</p>
                         </div>
                      </div>
                      <button 
                        onClick={async () => {
                           if (goalConfig) {
                              await saveCICOGoalConfig(goalConfig);
                              alert("Konfigurasi CICO berhasil disimpan!");
                           }
                        }}
                        className="w-full md:w-auto bg-[#002366] text-white px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3"
                      >
                         <Save size={18} /> Apply New Strategy
                      </button>
                   </div>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
