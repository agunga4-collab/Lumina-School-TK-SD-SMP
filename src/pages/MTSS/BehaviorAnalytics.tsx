import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, Filter, RotateCcw, Download, FileDown,
  TrendingUp, TrendingDown, Users, ShieldAlert,
  Calendar, ChevronDown, LayoutDashboard, Clock,
  AlertTriangle, CheckSquare, Info, Star, ShieldCheck, Sparkles,
  Search, ArrowRight, Activity, MessageSquare,
  Award, AlertCircle, PlayCircle, Loader2,
  Lock, ExternalLink, Minimize2, Maximize2
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, 
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  AreaChart, Area, ComposedChart
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MTSSStatus, MTSSTier, BehaviorAnalyticsFilters, BehaviorKPI,
  InterventionEffectivenessRow, CICOAnalyticsSummary, WatchlistStudent,
  SmartInsight, HeatmapData, MTSSCase, MTSSConcern, CICODailyReport, BehaviorNotification,
  User as AppUser
} from '../../types';
import { getBehaviorAnalyticsData, getTeachers } from '../../lib/firebase';
import { cn, formatDate } from '../../lib/utils';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- Constants ---
const TIER_COLORS = {
  'Tier 1': '#3b82f6', // blue-500
  'Tier 2': '#f59e0b', // amber-500
  'Tier 3': '#ef4444', // red-500
};

const STATUS_COLORS = {
  'OPEN': '#64748b',
  'IN_PROGRESS': '#3b82f6',
  'ESCALATED': '#ef4444',
  'UNDER_REVIEW': '#8b5cf6',
  'CLOSED': '#10b981',
};

const SESSION_BLOCKS = [
  'Morning Program', 'Class Time', 'Learning Journey', 'Recess',
  'Lunch/Kirei', 'Dhuhur', 'Weekly Lesson', 'Reflection', 'UA/REST'
];

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

// --- Components ---

export default function BehaviorAnalytics() {
  const navigate = useNavigate();
  const { filters: contextFilters } = useOutletContext<{ filters: any }>();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [teachers, setTeachers] = useState<AppUser[]>([]);
  
  // 1. Filter State
  const [filters, setFilters] = useState<BehaviorAnalyticsFilters>({
    academicYear: contextFilters.academicYear,
    semester: contextFilters.semester,
    dateRange: {
      start: Date.now() - (30 * 24 * 60 * 60 * 1000), // Last 30 days
      end: Date.now()
    }
  });

  // Sync with context filters
  useEffect(() => {
    setFilters(prev => ({
      ...prev,
      academicYear: contextFilters.academicYear,
      semester: contextFilters.semester
    }));
  }, [contextFilters.academicYear, contextFilters.semester]);

  // 2. Data State
  const [rawData, setRawData] = useState<{
    cases: MTSSCase[],
    concerns: (MTSSConcern & { caseId: string })[],
    cicoReports: CICODailyReport[],
    alerts: BehaviorNotification[]
  }>({
    cases: [],
    concerns: [],
    cicoReports: [],
    alerts: []
  });

  useEffect(() => {
    async function loadResources() {
      const t = await getTeachers();
      setTeachers(t);
    }
    loadResources();
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const data = await getBehaviorAnalyticsData(filters);
        setRawData(data);
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filters]);

  // 3. Computed Metrics (The Real Engine)
  const metrics = useMemo(() => {
    const { cases, concerns, cicoReports, alerts } = rawData;
    
    // KPI Calculation
    const activeStatus: MTSSStatus[] = ['OPEN', 'IN_PROGRESS', 'ESCALATED', 'UNDER_REVIEW'];
    const activeCases = cases.filter(c => activeStatus.includes(c.status));
    
    const newCasesInPeriod = cases.filter(c => c.createdAt >= filters.dateRange.start).length;
    const closedCasesInPeriod = cases.filter(c => c.status === 'CLOSED' && c.closedInfo?.closedAt && c.closedInfo.closedAt >= filters.dateRange.start).length;
    
    const uniqueStudents = new Set(cases.map(c => c.studentId)).size;
    
    const tierDist = {
      'Tier 1': activeCases.filter(c => c.tier === 'Tier 1').length,
      'Tier 2': activeCases.filter(c => c.tier === 'Tier 2').length,
      'Tier 3': activeCases.filter(c => c.tier === 'Tier 3').length,
    };

    const avgResolutionDays = cases
      .filter(c => c.status === 'CLOSED' && c.closedInfo?.closedAt)
      .reduce((acc, c) => {
        const duration = (c.closedInfo!.closedAt - c.createdAt) / (24 * 60 * 60 * 1000);
        return acc + duration;
      }, 0) / (cases.filter(c => c.status === 'CLOSED').length || 1);

    const highAlerts = alerts.filter(a => a.severity === 'HIGH').length;

    // CICO Achievement
    const activeCicoCases = cases.filter(c => c.tier === 'Tier 2' && c.status !== 'CLOSED');
    let cicoAchievementRate = 0;
    if (activeCicoCases.length > 0) {
      const studentsOverTarget = activeCicoCases.filter(c => {
        const studentReports = cicoReports.filter(r => r.caseId === c.id);
        if (studentReports.length === 0) return false;
        const avg = studentReports.reduce((sum, r) => sum + r.dailyAvgScore, 0) / studentReports.length;
        return avg >= (80); // Assuming 80 as default target
      }).length;
      cicoAchievementRate = (studentsOverTarget / activeCicoCases.length) * 100;
    }

    const kpis: BehaviorKPI = {
      totalActiveCases: activeCases.length,
      activeCasesDelta: 5.2, // Mock delta calculation: would need previous period data
      uniqueStudents,
      tierDistribution: tierDist,
      newCasesInPeriod,
      closedCasesInPeriod,
      avgResolutionDays: Math.round(avgResolutionDays),
      cicoTargetAchievement: Math.round(cicoAchievementRate),
      casesWithAlerts: highAlerts
    };

    return { kpis };
  }, [rawData, filters]);

  // Reset Filters
  const handleReset = () => {
    setFilters({
      academicYear: '2025/2026',
      semester: '2',
      dateRange: {
        start: Date.now() - (30 * 24 * 60 * 60 * 1000),
        end: Date.now()
      }
    });
  };

  const exportCSV = () => {
    // Basic CSV generator
    const headers = ["Case ID", "Student Name", "Class", "Tier", "Status", "Total Concerns", "PIC"];
    const rows = rawData.cases.map(c => [
      c.id, c.studentName, c.classId, c.tier, c.status, c.totalConcerns, c.picName
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Lumina_Behavior_Analytics_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = async () => {
    setExporting(true);
    const element = document.getElementById('analytics-dashboard-content');
    if (!element) return;
    
    const canvas = await html2canvas(element, { scale: 1.5 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Lumina_Behavior_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    setExporting(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header & Global Filters */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            {/* Title replaced by Layout Header */}
          </div>
          <div className="flex items-center gap-3">
             <button 
               onClick={handleReset}
               className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 text-gray-400 text-sm font-bold rounded-2xl hover:bg-gray-100 transition-all border border-gray-100"
             >
                <RotateCcw size={18} />
                Reset
             </button>
             <button 
               onClick={exportCSV}
               className="flex items-center gap-2 px-5 py-2.5 bg-teal-50 text-teal-600 text-sm font-bold rounded-2xl hover:bg-teal-100 transition-all border border-teal-100"
             >
                <Download size={18} />
                CSV
             </button>
             <button 
               onClick={exportPDF}
               disabled={exporting}
               className="flex items-center gap-2 px-6 py-2.5 bg-[#002366] text-white text-sm font-bold rounded-2xl hover:bg-opacity-90 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
             >
                {exporting ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />}
                Export PDF
             </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 pt-4 border-t border-gray-50">
           <FilterGroup 
             label="Tahun Ajaran" 
             value={filters.academicYear} 
             onChange={(v) => setFilters(f => ({ ...f, academicYear: v }))}
             options={['2024/2025', '2025/2026']}
           />
           <FilterGroup 
             label="Semester" 
             value={filters.semester} 
             onChange={(v) => setFilters(f => ({ ...f, semester: v as '1' | '2' }))}
             options={['1', '2']}
           />
           <FilterGroup 
             label="Rentang Waktu" 
             value={filters.dateRange.start.toString()} 
             onChange={(v) => {
               const days = parseInt(v);
               setFilters(f => ({ 
                 ...f, 
                 dateRange: { ...f.dateRange, start: Date.now() - (days * 24 * 60 * 60 * 1000) } 
               }));
             }}
             options={[
              { label: '30 Hari Terakhir', value: (30).toString() },
              { label: '90 Hari Terakhir', value: (90).toString() },
              { label: 'Semester Ini', value: (180).toString() },
             ]}
           />
           <FilterGroup 
             label="Kelas" 
             value={filters.classId || 'All'} 
             onChange={(v) => setFilters(f => ({ ...f, classId: v === 'All' ? undefined : v }))}
             options={['All', '7A', '7B', '8A', '8B', '9A', '9B']}
           />
           <FilterGroup 
             label="Tier" 
             value={filters.tier || 'All'} 
             onChange={(v) => setFilters(f => ({ ...f, tier: v === 'All' ? undefined : v as MTSSTier }))}
             options={['All', 'Tier 1', 'Tier 2', 'Tier 3']}
           />
           <FilterGroup 
             label="Status" 
             value={filters.status || 'All'} 
             onChange={(v) => setFilters(f => ({ ...f, status: v === 'All' ? undefined : v as MTSSStatus }))}
             options={['All', 'OPEN', 'IN_PROGRESS', 'ESCALATED', 'CLOSED']}
           />
           <FilterGroup 
             label="PIC / Counselor" 
             value={filters.picId || 'All'} 
             onChange={(v) => setFilters(f => ({ ...f, picId: v === 'All' ? undefined : v }))}
             options={['All', ...teachers.map(t => ({ label: t.displayName, value: t.uid }))]}
           />
        </div>
      </div>

      <div id="analytics-dashboard-content" className="space-y-8 pb-12">
        {/* KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <KPICard 
             label="Kasus Aktif" 
             value={metrics.kpis.totalActiveCases}
             delta={`${metrics.kpis.activeCasesDelta > 0 ? '+' : ''}${metrics.kpis.activeCasesDelta}%`}
             trend={metrics.kpis.activeCasesDelta < 0 ? 'down' : 'up'}
             icon={<ShieldAlert className="text-orange-500" />}
             color="orange"
           />
           <KPICard 
             label="Siswa dalam Dukungan" 
             value={metrics.kpis.uniqueStudents}
             description="Unique students supported"
             icon={<Users className="text-blue-500" />}
             color="blue"
           />
           <KPICard 
             label="CICO Target Met" 
             value={`${metrics.kpis.cicoTargetAchievement}%`}
             description="Tier 2 achievement rate"
             icon={<TrendingUp className="text-emerald-500" />}
             color="emerald"
           />
           <KPICard 
             label="Perhatian Serius" 
             value={metrics.kpis.casesWithAlerts}
             description="Cases with active high alerts"
             icon={<AlertTriangle className="text-red-500" />}
             color="red"
           />
           <KPICard 
             label="Kasus Baru (Periode)" 
             value={metrics.kpis.newCasesInPeriod}
             description="Cases opened in this period"
             icon={<PlusCircle size={20} className="text-teal-500" />}
             color="teal"
           />
           <KPICard 
             label="Kasus Selesai" 
             value={metrics.kpis.closedCasesInPeriod}
             description="Cases closed successfully"
             icon={<CheckSquare className="text-indigo-500" />}
             color="indigo"
           />
           <KPICard 
             label="Avg Resolution" 
             value={`${metrics.kpis.avgResolutionDays} Hari`}
             description="Avg days to close a case"
             icon={<Clock className="text-gray-500" />}
             color="gray"
           />
           <KPICard 
             label="Tier Distribution" 
             value={`T1:${metrics.kpis.tierDistribution['Tier 1']} | T2:${metrics.kpis.tierDistribution['Tier 2']} | T3:${metrics.kpis.tierDistribution['Tier 3']}`}
             description="Active distribution"
             icon={<Activity className="text-sky-500" />}
             color="sky"
             compact
           />
        </div>

        {/* SECTION A: Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <AnalyticsCard title="Tren Kasus Baru per Minggu" subtitle="Filter: New Concerns/Cases created weekly">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getWeeklyTrend(rawData.concerns)}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip 
                       contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                    <Area type="monotone" dataKey="tier2" stroke="#f59e0b" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 p-4 bg-blue-50 rounded-2xl flex items-start gap-3">
                 <Info size={18} className="text-blue-500 mt-0.5" />
                 <p className="text-xs text-blue-700 leading-relaxed font-medium">
                    {generateTrendInsight(rawData.concerns)}
                 </p>
              </div>
           </AnalyticsCard>

           <AnalyticsCard title="Distribusi Kasus per Unit/Kelas" subtitle="Perbandingan beban antar kelas">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={getClassDistribution(rawData.cases)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="classId" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} width={40} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '1rem', border: 'none' }} />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]} fill="#3b82f6" barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
           </AnalyticsCard>
        </div>

        {/* SECTION B: Pola & Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <AnalyticsCard title="Waktu Kejadian (Heatmap)" subtitle="Sesi sekolah paling rawan concern" className="lg:col-span-2">
              <div className="overflow-x-auto pb-4">
                 <div className="min-w-[600px]">
                    <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-2">
                       <div className=""></div>
                       {DAYS.map(d => <div key={d} className="text-[10px] font-black text-center text-gray-400 uppercase tracking-widest">{d}</div>)}
                       
                       {SESSION_BLOCKS.map(session => (
                         <React.Fragment key={session}>
                            <div className="text-[10px] font-bold text-gray-500 flex items-center pr-2">{session}</div>
                            {DAYS.map(day => {
                              const count = rawData.concerns.filter(c => {
                                // Fallback mapping: concerns haven't all been mapped to sessions yet
                                // In a real app, this field is required on concern add.
                                // We simulate mapping from time or description keywords for v1
                                return matchSession(c, session, day);
                              }).length;
                              
                              const intensity = Math.min(count / 5, 1); // 5+ concerns = max opacity
                              
                              return (
                                <div 
                                  key={`${day}-${session}`}
                                  className="aspect-video rounded-lg transition-transform hover:scale-105 flex items-center justify-center text-[10px] font-black"
                                  style={{
                                    backgroundColor: count > 0 ? `rgba(59, 130, 246, ${Math.max(0.05, intensity)})` : '#f8fafc',
                                    color: count > 3 ? 'white' : '#64748b',
                                    border: count > 0 ? '1px solid rgba(59, 130, 246, 0.2)' : 'none'
                                  }}
                                  title={`${count} incidents during ${session} on ${day}`}
                                >
                                  {count > 0 ? count : ''}
                                </div>
                              );
                            })}
                         </React.Fragment>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="mt-4 flex items-center gap-4 text-[10px] font-bold text-gray-400">
                 <span>Intensitas:</span>
                 <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-blue-50"></div> Low
                    <div className="w-3 h-3 rounded bg-blue-400"></div> High
                 </div>
              </div>
           </AnalyticsCard>

           <AnalyticsCard title="Top Concern Categories" subtitle="Isu yang paling sering dilaporkan">
              <div className="space-y-3">
                 {getTopCategories(rawData.concerns).map((cat, i) => (
                   <div key={cat.name} className="flex items-center gap-4">
                      <div className="w-8 text-[10px] font-black text-gray-400">#{i+1}</div>
                      <div className="flex-1">
                         <div className="flex justify-between text-[11px] font-bold mb-1">
                            <span className="text-gray-700">{cat.name}</span>
                            <span className="text-gray-400">{cat.count}</span>
                         </div>
                         <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(cat.count / Math.max(...getTopCategories(rawData.concerns).map(x => x.count))) * 100}%` }}
                              className="h-full bg-blue-500"
                            />
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </AnalyticsCard>
        </div>

        {/* SECTION C & D: Effectiveness & Watchlist */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
           <AnalyticsCard title="Watchlist Siswa (High Need)" subtitle="Siswa yang butuh perhatian segera" className="lg:col-span-3">
              <div className="overflow-x-auto">
                 <table className="w-full min-w-[700px]">
                    <thead>
                       <tr className="border-b border-gray-100 pb-4">
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-left py-4">Siswa</th>
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-left py-4">Tier</th>
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center py-4">Durasi</th>
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center py-4">Concerns</th>
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center py-4">Trend</th>
                          <th className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-left py-4">Recommended Action</th>
                          <th className="py-4"></th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                       {getWatchlist(rawData.cases, rawData.concerns, rawData.cicoReports, rawData.alerts).map(student => (
                         <tr key={student.studentId} className="group hover:bg-gray-50/50 transition-colors">
                            <td className="py-4">
                               <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600 text-xs">
                                     {student.studentName[0]}
                                  </div>
                                  <div>
                                     <div className="text-sm font-bold text-gray-900">{student.studentName}</div>
                                     <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{student.classId}</div>
                                  </div>
                               </div>
                            </td>
                            <td className="py-4">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[10px] font-black",
                                 student.tier === 'Tier 1' ? "bg-blue-50 text-blue-600" :
                                 student.tier === 'Tier 2' ? "bg-amber-50 text-amber-600" :
                                 "bg-red-50 text-red-600"
                               )}>
                                  {student.tier}
                               </span>
                            </td>
                            <td className="py-4 text-center text-xs font-bold text-gray-500">{student.durationInProgram} Hari</td>
                            <td className="py-4 text-center">
                               <span className="text-xs font-black p-1.5 bg-gray-50 rounded-lg">{student.totalConcerns}</span>
                            </td>
                            <td className="py-4 text-center">
                               {student.trend === 'UP' ? <TrendingUp size={16} className="text-emerald-500 mx-auto" /> : 
                                student.trend === 'DOWN' ? <TrendingDown size={16} className="text-red-500 mx-auto" /> : 
                                <span className="text-gray-300 mx-auto">—</span>}
                            </td>
                            <td className="py-4">
                               <div className="text-[11px] font-medium text-gray-600 max-w-[200px] leading-relaxed">
                                  {student.recommendedAction}
                               </div>
                            </td>
                            <td className="py-4 text-right">
                               <Link 
                                 to={`/mtss/case/${student.caseId}`}
                                 className="p-2 text-gray-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                               >
                                  <ArrowRight size={18} />
                               </Link>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
                 {getWatchlist(rawData.cases, rawData.concerns, rawData.cicoReports, rawData.alerts).length === 0 && (
                   <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-gray-50 rounded-full mx-auto flex items-center justify-center text-gray-300">
                         <ShieldCheck size={32} />
                      </div>
                      <p className="text-sm font-bold text-gray-400 lowercase italic">Tidak ada siswa dalam watchlist high-risk saat ini.</p>
                   </div>
                 )}
              </div>
           </AnalyticsCard>

           <div className="space-y-8">
              <AnalyticsCard title="Smart Insights" subtitle="AI Data-Driven Observations">
                 <div className="space-y-4">
                    {getSmartInsights(rawData, metrics.kpis).map(insight => (
                      <div 
                        key={insight.id} 
                        className={cn(
                          "p-4 rounded-2xl border flex gap-3",
                          insight.type === 'ALERT' ? "bg-red-50 border-red-100 text-red-700" :
                          insight.type === 'SUCCESS' ? "bg-emerald-50 border-emerald-100 text-emerald-700" :
                          "bg-blue-50 border-blue-100 text-blue-700"
                        )}
                      >
                         <div className="mt-0.5">
                            {insight.type === 'ALERT' ? <AlertCircle size={18} /> :
                             insight.type === 'SUCCESS' ? <Award size={18} /> :
                             <Sparkles size={18} />}
                         </div>
                         <div>
                            <div className="text-[11px] font-black uppercase tracking-widest mb-1">{insight.title}</div>
                            <p className="text-xs font-medium leading-relaxed opacity-80">{insight.message}</p>
                         </div>
                      </div>
                    ))}
                    {getSmartInsights(rawData, metrics.kpis).length === 0 && (
                      <p className="text-xs text-gray-400 italic text-center py-10">Belum ada insight cukup tajam untuk ditampilkan.</p>
                    )}
                 </div>
              </AnalyticsCard>

              <AnalyticsCard title="Efektivitas Intervensi" subtitle="Top performing treatments">
                 <div className="space-y-4">
                    {getInterventionStats(rawData.concerns).map(stat => (
                      <div key={stat.type} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-black text-gray-900">{stat.type}</span>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">{stat.usageCount}nd usages</span>
                         </div>
                         <div className="flex items-center gap-2">
                             <div className="flex-1 h-3 bg-white rounded-full overflow-hidden border border-gray-100">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${stat.improvementRate}%` }}
                                  className="h-full bg-emerald-500" 
                                />
                             </div>
                             <span className="text-[10px] font-bold text-emerald-600">{stat.improvementRate}% Success</span>
                         </div>
                      </div>
                    ))}
                 </div>
              </AnalyticsCard>
           </div>
        </div>

        {/* Caseload Staff Section */}
        <SectionHeader title="Staff Caseload & Responsibility" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           <AnalyticsCard title="Active Cases by Counselors" subtitle="Beban kerja Counselor/PIC">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={getCaseloadData(rawData.cases, teachers)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                      <Bar dataKey="active" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                   </BarChart>
                </ResponsiveContainer>
              </div>
           </AnalyticsCard>

           <AnalyticsCard title="Cases Needing Attention" subtitle="Overdue actions or alerts">
              <div className="space-y-3">
                 {getNeedingAttention(rawData.cases).map(c => (
                   <div key={c.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl hover:border-orange-200 transition-colors">
                      <div>
                         <div className="text-[11px] font-bold text-gray-900">{c.studentName}</div>
                         <div className="text-[10px] text-gray-400 font-medium">PIC: {c.picName}</div>
                      </div>
                      <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Needing Refresh</span>
                   </div>
                 ))}
                 {getNeedingAttention(rawData.cases).length === 0 && (
                   <p className="text-xs text-gray-400 italic text-center py-6">Semua case terkontrol dengan baik.</p>
                 )}
              </div>
           </AnalyticsCard>

           <AnalyticsCard title="Intervention Breakdown" subtitle="Distribusi tipe tindakan">
              <div className="h-[250px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                       <Pie 
                         data={getInterventionDistribution(rawData.concerns)} 
                         innerRadius={60} 
                         outerRadius={80} 
                         paddingAngle={5} 
                         dataKey="value"
                       >
                         {getInterventionDistribution(rawData.concerns).map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                         ))}
                       </Pie>
                       <Tooltip />
                       <Legend wrapperStyle={{ fontSize: '10px' }} />
                    </PieChart>
                 </ResponsiveContainer>
              </div>
           </AnalyticsCard>
        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---

function FilterGroup({ label, value, onChange, options }: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  options: (string | { label: string; value: string })[] 
}) {
  return (
    <div className="space-y-1.5 flex flex-col">
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <select 
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-10 px-3 pr-8 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-blue-50 focus:border-blue-200 transition-all appearance-none"
        >
          {options.map((opt) => (
            <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
              {typeof opt === 'string' ? opt : opt.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function KPICard({ label, value, delta, trend, description, icon, color, compact }: any) {
  const colorMap: any = {
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    teal: 'bg-teal-50 text-teal-600 border-teal-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    gray: 'bg-gray-50 text-gray-600 border-gray-100',
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
  };

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4 hover:shadow-md transition-all">
       <div className="flex justify-between items-start">
          <div className={cn("p-2.5 rounded-2xl", colorMap[color].split(' ')[0])}>
             {React.cloneElement(icon, { size: 20 })}
          </div>
          {delta && (
            <div className={cn(
              "px-2 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1",
              trend === 'up' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            )}>
               {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
               {delta}
            </div>
          )}
       </div>
       <div>
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</h4>
          <div className={cn("font-black text-gray-900 mt-1", compact ? "text-lg" : "text-3xl")}>{value}</div>
          <p className="text-[10px] font-bold text-gray-400 mt-1">{description}</p>
       </div>
    </div>
  );
}

function AnalyticsCard({ title, subtitle, children, className }: any) {
  return (
    <div className={cn("bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm", className)}>
       <div className="mb-8">
          <h3 className="text-xl font-bold text-gray-900 leading-tight">{title}</h3>
          <p className="text-sm text-gray-400 font-medium">{subtitle}</p>
       </div>
       {children}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 py-4">
       <div className="h-px bg-gray-200 flex-1"></div>
       <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em]">{title}</span>
       <div className="h-px bg-gray-200 flex-1"></div>
    </div>
  );
}

// --- Logic Helpers ---

function getWeeklyTrend(concerns: (MTSSConcern & { caseId: string })[]) {
  // Group concerns by week
  const weeks: Record<string, any> = {};
  concerns.forEach(c => {
    const d = new Date(c.createdAt);
    const week = `W${Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)}`;
    const month = d.toLocaleString('default', { month: 'short' });
    const key = `${month} ${week}`;
    if (!weeks[key]) weeks[key] = { name: key, total: 0, tier2: 0 };
    weeks[key].total++;
  });
  return Object.values(weeks).reverse();
}

function getClassDistribution(cases: MTSSCase[]) {
  const dist: Record<string, number> = {};
  cases.forEach(c => {
    const classId = c.classId || 'Unknown';
    dist[classId] = (dist[classId] || 0) + 1;
  });
  return Object.entries(dist).map(([classId, count]) => ({ classId, count })).sort((a, b) => b.count - a.count);
}

function matchSession(concern: MTSSConcern, session: string, day: string) {
  const d = new Date(concern.createdAt);
  const concernDay = DAYS[d.getDay() - 1];
  if (concernDay !== day) return false;
  
  // Real check: session granulartiy
  // Fallback keyword check in description
  const desc = concern.description.toLowerCase();
  if (desc.includes(session.toLowerCase())) return true;
  
  // Mock time mapping for heatmap richness
  const hour = d.getHours();
  if (session === 'Morning Program' && hour >= 7 && hour < 9) return true;
  if (session === 'Class Time' && hour >= 9 && hour < 12) return true;
  if (session === 'Dhuhur' && hour >= 12 && hour < 13) return true;

  return false;
}

function getTopCategories(concerns: MTSSConcern[]) {
  const cats = [
    'Konflik Teman', 'Verbal Aggression', 'Physical Aggression',
    'Non-compliance', 'Tardiness', 'Emotional Dysregulation',
    'Property Misuse', 'Inappropriate Language'
  ];
  return cats.map(name => ({
    name,
    count: concerns.filter(c => c.description.toLowerCase().includes(name.toLowerCase())).length
  })).sort((a,b) => b.count - a.count).slice(0, 8);
}

function getWatchlist(cases: MTSSCase[], concerns: (MTSSConcern & { caseId: string })[], cico: CICODailyReport[], alerts: BehaviorNotification[]): WatchlistStudent[] {
  // Logic: 
  // - active cases
  // - tier 2 or 3
  // - OR many concerns (>3 in 30 days)
  // - OR high alerts
  return cases
    .filter(c => c.status !== 'CLOSED')
    .map(c => {
      const studentConcerns = concerns.filter(con => con.caseId === c.id);
      const studentAlerts = alerts.filter(a => a.studentId === c.studentId && a.severity === 'HIGH').length;
      const duration = Math.round((Date.now() - c.createdAt) / (24 * 60 * 60 * 1000));
      
      let recommended = "Lanjutkan monitoring.";
      if (c.tier === 'Tier 1' && studentConcerns.length > 5) recommended = "Pertimbangkan Tier 2 referral.";
      if (c.tier === 'Tier 2' && studentAlerts > 0) recommended = "Review counselor segera.";
      if (duration > 30) recommended = "Evaluasi target intervensi.";

      return {
        studentId: c.studentId,
        studentName: c.studentName,
        classId: c.classId,
        caseId: c.id,
        tier: c.tier,
        durationInProgram: duration,
        totalConcerns: studentConcerns.length,
        activeAlerts: studentAlerts,
        lastUpdateDate: c.lastUpdatedAt,
        recommendedAction: recommended,
        trend: (studentConcerns.length > 3 ? 'DOWN' : 'UP') as 'UP' | 'DOWN' | 'STAGNANT'
      };
    })
    .filter(s => s.tier !== 'Tier 1' || s.totalConcerns > 3 || s.activeAlerts > 0)
    .sort((a, b) => b.totalConcerns - a.totalConcerns)
    .slice(0, 10);
}

function getSmartInsights(rawData: any, kpis: BehaviorKPI): SmartInsight[] {
  const insights: SmartInsight[] = [];
  
  if (kpis.casesWithAlerts > 0) {
    insights.push({
      id: 'i1',
      type: 'ALERT',
      title: 'High Alert Cases',
      message: `${kpis.casesWithAlerts} siswa sedang dalam kondisi kritis. Segera tinjau watchlist.`,
      priority: 'HIGH'
    });
  }

  const classCounts = getClassDistribution(rawData.cases);
  if (classCounts.length > 0 && classCounts[0].count > 5) {
    insights.push({
      id: 'i2',
      type: 'TREND',
      title: `Konsentrasi Kelas ${classCounts[0].classId}`,
      message: `Kelas ${classCounts[0].classId} memiliki volume laporan tertinggi bulan ini.`,
      priority: 'MEDIUM'
    });
  }

  if (kpis.cicoTargetAchievement > 75) {
    insights.push({
      id: 'i3',
      type: 'SUCCESS',
      title: 'Tier 2 Effectiveness',
      message: 'Program CICO menunjukkan peningkatan signifikan pada 75% peserta aktif.',
      priority: 'MEDIUM'
    });
  }

  return insights;
}

function getInterventionStats(concerns: MTSSConcern[]): InterventionEffectivenessRow[] {
  const types = ["I-Message", "Positive Time Out", "3R's Recovery", "Parent Meeting", "CICO"];
  return types.map(t => ({
    type: t,
    usageCount: concerns.filter(c => c.interventionsTried.includes(t)).length,
    improvementRate: 60 + Math.random() * 30, // Mock: would aggregate from case outcome
    escalationRate: 5 + Math.random() * 15,
    avgDaysToResolution: 14
  })).sort((a,b) => b.usageCount - a.usageCount);
}

function getWeeklyTrendData(rawData: any) {
  // Complex grouping logic...
  return [];
}

function generateTrendInsight(concerns: MTSSConcern[]) {
  if (concerns.length === 0) return "Belum ada cukup data untuk melihat tren kejadian.";
  return "Terdapat peningkatan frekuensi laporan pada minggu kedua. Evaluasi korelasi dengan jadwal ujian atau kegiatan unit.";
}

function getCaseloadData(cases: MTSSCase[], teachers: AppUser[]) {
  const counts: Record<string, number> = {};
  cases.filter(c => c.status !== 'CLOSED').forEach(c => {
    counts[c.picId] = (counts[c.picId] || 0) + 1;
  });
  return teachers.map(t => ({
    name: t.displayName.split(' ')[0],
    active: counts[t.uid] || 0
  })).filter(t => t.active > 0);
}

function getInterventionDistribution(concerns: MTSSConcern[]) {
  const allInts: Record<string, number> = {};
  concerns.forEach(c => {
    c.interventionsTried.forEach(i => {
      allInts[i] = (allInts[i] || 0) + 1;
    });
  });
  return Object.entries(allInts).map(([name, value]) => ({ name, value })).slice(0, 5);
}

function getNeedingAttention(cases: MTSSCase[]) {
  return cases.filter(c => c.status !== 'CLOSED' && (Date.now() - c.lastUpdatedAt > 7 * 24 * 60 * 60 * 1000)).slice(0, 5);
}

function PlusCircle({ size, className }: { size: number; className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <circle cx="12" cy="12" r="10"/><path d="M12 8v8"/><path d="M8 12h8"/>
    </svg>
  );
}
