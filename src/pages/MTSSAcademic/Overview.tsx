import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { 
  Users, 
  Target, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar,
  Filter,
  RefreshCw,
  Search,
  BookOpen,
  PieChart as PieChartIcon,
  TrendingUp,
  FileCheck,
  ChevronRight,
  LayoutDashboard,
  GraduationCap,
  Clock,
  Activity,
  FileText,
  Settings
} from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { 
  MTSSAcademicAnalyticsFilters,
  MTSSAcademicExecutiveOverview,
  MTSSAcademicGradeSummary,
  MTSSAcademicDomainSummary,
  MTSSAcademicProgressSummary,
  MTSSAcademicComplianceSummary,
  MTSSAcademicOutcomeTrendPoint,
  MTSSAcademicDomain,
  MTSSAcademicTier,
  MTSSAcademicStatus,
  User
} from '../../types';
import { 
  getMTSSAcademicExecutiveOverview,
  getMTSSAcademicGradeSummary,
  getMTSSAcademicDomainAnalysis,
  getMTSSAcademicProgressSummary,
  getMTSSAcademicComplianceOverview,
  getMTSSAcademicOutcomeTrends,
  getMTSSAcademicCrossModuleInsights
} from '../../services/mtssAcademicAnalyticsService';

import DiagnosticsPanel from './components/DiagnosticsPanel';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const MTSSAcademicOverview: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, filters: contextFilters } = useOutletContext<{ currentUser: User, filters: any }>();
  const [activeTab, setActiveTab] = useState<'EXECUTIVE' | 'GRADE' | 'DOMAIN' | 'PROGRESS' | 'COMPLIANCE' | 'TRENDS' | 'DIAGNOSTICS'>('EXECUTIVE');
  const [loading, setLoading] = useState(true);
  
  const filters = contextFilters as MTSSAcademicAnalyticsFilters;
  
  const isPrivileged = currentUser?.role && [
    'SUPER_ADMIN', 'SUPER ADMIN', 'HEAD_UNIT', 'HEAD UNIT', 'HEAD_JUNIOR', 'HEAD JUNIOR', 'PRINCIPAL', 'VICE_PRINCIPAL', 'COORDINATOR', 'ADMIN'
  ].includes(currentUser.role.toUpperCase().replace(/_/g, ' '));
  
  // Also check with underscores just in case
  const isSuperAdmin = currentUser?.role && currentUser.role.toUpperCase().replace(/\s/g, '_') === 'SUPER_ADMIN';
  const finalPrivileged = isPrivileged || isSuperAdmin;
  
  const [execData, setExecData] = useState<MTSSAcademicExecutiveOverview | null>(null);
  const [gradeData, setGradeData] = useState<MTSSAcademicGradeSummary[]>([]);
  const [domainData, setDomainData] = useState<MTSSAcademicDomainSummary[]>([]);
  const [progressData, setProgressData] = useState<MTSSAcademicProgressSummary | null>(null);
  const [complianceData, setComplianceData] = useState<MTSSAcademicComplianceSummary | null>(null);
  const [trendsData, setTrendsData] = useState<MTSSAcademicOutcomeTrendPoint[]>([]);
  const [crossModuleData, setCrossModuleData] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [exec, grades, domains, progress, compliance, trends, crossModule] = await Promise.all([
        getMTSSAcademicExecutiveOverview(filters),
        getMTSSAcademicGradeSummary(filters),
        getMTSSAcademicDomainAnalysis(filters),
        getMTSSAcademicProgressSummary(filters),
        getMTSSAcademicComplianceOverview(filters),
        getMTSSAcademicOutcomeTrends(filters),
        getMTSSAcademicCrossModuleInsights(filters)
      ]);

      setExecData(exec);
      setGradeData(grades);
      setDomainData(domains);
      setProgressData(progress);
      setComplianceData(compliance);
      setTrendsData(trends);
      setCrossModuleData(crossModule);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Integrated Analytics Dashboard */}
         {/* Executive Overview KPI Cards */}
         <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
           <StatCard 
             label="Total Case Aktif" 
             value={execData?.totalActiveCases || 0} 
             icon={<Target size={24} />} 
             color="blue"
             description="Case yang sedang berjalan intervensi"
           />
           <StatCard 
             label="Tier 2 Aktif" 
             value={execData?.tier2Active || 0} 
             icon={<Layers size={24} />} 
             color="emerald"
             description="Intervensi kelompok / terfokus"
           />
           <StatCard 
             label="Review Minggu Ini" 
             value={execData?.reviewsDueThisWeek || 0} 
             icon={<Calendar size={24} />} 
             color="amber"
             description="Perlu monitoring / evaluasi rutin"
           />
           <StatCard 
             label="Perlu Tindak Lanjut" 
             value={execData?.followUpRequired || 0} 
             icon={<AlertTriangle size={24} />} 
             color="rose"
             description="Alert aktif yang membutuhkan aksi"
           />
        </div>

        {/* Sub Navigation Segmented Control */}
        <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex gap-2 mb-8 inline-flex">
           {[
             { id: 'EXECUTIVE', label: 'Ringkasan Eksekutif' },
             { id: 'GRADE', label: 'Tampilan Angkatan' },
             { id: 'DOMAIN', label: 'Analisis Domain' },
             { id: 'PROGRESS', label: 'Progress Pelaksanaan' },
             { id: 'COMPLIANCE', label: 'Kepatuhan SOP' },
             { id: 'TRENDS', label: 'Tren Hasil' },
             ...(finalPrivileged ? [{ id: 'DIAGNOSTICS', label: 'Diagnostics' }] : [])
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                 activeTab === tab.id 
                 ? 'bg-slate-900 text-white shadow-md' 
                 : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
               }`}
             >
               {tab.label}
             </button>
           ))}
        </div>

        {/* Content Sections */}
        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            {activeTab === 'EXECUTIVE' && (
              <motion.div 
                key="exec"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                {/* Cases Success Rate / Outcomes Pie */}
                <div className="md:col-span-1 bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-b border-slate-50 pb-4">Distribusi Hasil Intervensi</h3>
                   <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie
                             data={[
                               { name: 'Selesai (Kembali T1)', value: execData?.successfullyClosed || 0 },
                               { name: 'Aktif Tier 2', value: execData?.tier2Active || 0 },
                               { name: 'Aktif Tier 3', value: execData?.tier3Active || 0 },
                             ]}
                             cx="50%"
                             cy="50%"
                             innerRadius={60}
                             outerRadius={80}
                             paddingAngle={5}
                             dataKey="value"
                           >
                             {COLORS.map((entry, index) => (
                               <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                             ))}
                           </Pie>
                           <Tooltip 
                             contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                             itemStyle={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}
                           />
                         </PieChart>
                      </ResponsiveContainer>
                   </div>
                   <div className="space-y-2 mt-4">
                      <LegendItem color={COLORS[0]} label="Kembali ke Tier 1" value={execData?.successfullyClosed || 0} />
                      <LegendItem color={COLORS[1]} label="Masih Aktif T2" value={execData?.tier2Active || 0} />
                      <LegendItem color={COLORS[2]} label="Masih Aktif T3" value={execData?.tier3Active || 0} />
                   </div>
                </div>

                {/* Progress Status Bar Chart */}
                <div className="md:col-span-2 bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6 border-b border-slate-50 pb-4">Status Pelaksanaan Intervensi</h3>
                   <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={[
                           { name: 'On Track', value: progressData?.onTrack || 0, fill: '#10b981' },
                           { name: 'Perlu Review', value: progressData?.needsReview || 0, fill: '#f59e0b' },
                           { name: 'Perlu Tindakan', value: progressData?.actionNeeded || 0, fill: '#ef4444' }
                         ]}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis 
                             dataKey="name" 
                             axisLine={false} 
                             tickLine={false} 
                             tick={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }} 
                           />
                           <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                           <Tooltip 
                             cursor={{ fill: '#f8fafc' }}
                             contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                           />
                           <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60} />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                   <div className="grid grid-cols-3 gap-4 mt-8">
                      <div className="text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">On Track</p>
                        <p className="text-lg font-black text-emerald-600">{progressData?.onTrack || 0}</p>
                      </div>
                      <div className="text-center border-x border-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Needs Review</p>
                        <p className="text-lg font-black text-amber-500">{progressData?.needsReview || 0}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Action Needed</p>
                        <p className="text-lg font-black text-rose-600">{progressData?.actionNeeded || 0}</p>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'EXECUTIVE' && crossModuleData && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6"
              >
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                   <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                      <Clock size={24} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Attendance Flag</p>
                      <p className="text-xl font-black text-slate-900">{crossModuleData.casesWithAttendanceConcern} Cases</p>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                   <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                      <Activity size={24} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Active Behavior</p>
                      <p className="text-xl font-black text-slate-900">{crossModuleData.casesWithActiveBehaviorSupport} Cases</p>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                   <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                      <FileText size={24} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Rapor Aligned</p>
                      <p className="text-xl font-black text-slate-900">{crossModuleData.casesWithAlignedRaporConcern} Cases</p>
                   </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
                   <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                      <TrendingUp size={24} />
                   </div>
                   <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Academic Gain</p>
                      <p className="text-xl font-black text-slate-900">{crossModuleData.casesWithPositiveAssessmentTrend} Cases</p>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'GRADE' && (
              <motion.div 
                key="grade"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                   <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Distribusi Case per Angkatan</h3>
                   <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={gradeData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                           <XAxis dataKey="grade" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 800 }} />
                           <YAxis axisLine={false} tickLine={false} />
                           <Tooltip contentStyle={{ borderRadius: '16px', border: 'none' }} />
                           <Legend />
                           <Bar dataKey="totalCases" name="Total Case" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {gradeData.map(grade => (
                     <div key={grade.grade} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                           <h4 className="font-black text-slate-900">Grade {grade.grade}</h4>
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{grade.totalCases} Cases</span>
                        </div>
                        <div className="space-y-4">
                           <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Dominant Domain</p>
                              {Object.entries(grade.domainDistribution).map(([domain, count]) => (
                                <div key={domain} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                                   <span className="text-[10px] font-bold text-slate-600">{domain}</span>
                                   <span className="text-[10px] font-black text-slate-900">{count}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'DOMAIN' && (
              <motion.div 
                key="domain"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                {domainData.map(domain => (
                  <div key={domain.domain} className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 hover:shadow-md transition-all group">
                     <div className="flex items-center gap-3 mb-6">
                        <div className={`p-2 rounded-xl bg-slate-900 text-white`}>
                           <BookOpen size={18} />
                        </div>
                        <h4 className="font-black text-slate-900 uppercase tracking-tight">{domain.domain.replace('_', ' ')}</h4>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 p-3 rounded-2xl">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aktif</p>
                           <p className="text-xl font-black text-slate-900">{domain.activeCount}</p>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-2xl">
                           <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Closed</p>
                           <p className="text-xl font-black text-emerald-700">{domain.closedCount}</p>
                        </div>
                     </div>

                     <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                           <span className="text-slate-500 font-medium tracking-tight">Escalated to Tier 3</span>
                           <span className="font-black text-slate-900">{domain.escalatedToTier3}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                           <div 
                             className="bg-slate-900 h-full"
                             style={{ width: `${(domain.activeCount / domain.totalCases) * 100}%` }}
                           />
                        </div>
                     </div>
                  </div>
                ))}
              </motion.div>
            )}

            {activeTab === 'COMPLIANCE' && (
              <motion.div 
                key="compliance"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   <ComplianceMeter label="Initial Meeting" current={complianceData?.initialMeetingComplete || 0} total={complianceData?.totalCases || 1} />
                   <ComplianceMeter label="Parent Commitment" current={complianceData?.parentCommitmentSent || 0} total={complianceData?.totalCases || 1} />
                   <ComplianceMeter label="Evaluation Completed" current={complianceData?.evaluationCompleted || 0} total={complianceData?.totalCases || 1} />
                   <ComplianceMeter label="Parent Communication" current={complianceData?.parentCommunicationRecorded || 0} total={complianceData?.totalCases || 1} />
                </div>

                <div className="bg-rose-50 border-2 border-rose-100 rounded-[32px] p-6 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 text-rose-200 opacity-20 pointer-events-none">
                      <AlertTriangle size={80} />
                   </div>
                   <h3 className="text-sm font-black text-rose-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                     <AlertTriangle size={18} />
                     Area yang Perlu Perhatian (SOP Flags)
                   </h3>
                   <p className="text-xs text-rose-700 font-medium mb-6">Berdasarkan ringkasan alert aktif yang memerlukan tindak lanjut segera oleh tim MTSS.</p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-50">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Initial Meetings</p>
                        <p className="text-xl font-black text-rose-700">{complianceData ? complianceData.totalCases - complianceData.initialMeetingComplete : 0} Pending</p>
                      </div>
                      <div className="bg-white p-4 rounded-2xl shadow-sm border border-rose-50">
                        <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Evaluations</p>
                        <p className="text-xl font-black text-rose-700">{complianceData ? complianceData.totalCases - complianceData.evaluationCompleted : 0} Overdue</p>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'TRENDS' && (
              <motion.div 
                key="trends"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100"
              >
                <div className="flex items-center justify-between mb-8">
                   <div>
                     <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Tren Hasil Evaluasi & Keputusan Strategy</h3>
                     <p className="text-xs text-slate-500 font-medium">Distribusi keputusan tim MTSS setelah siklus intervensi selesai</p>
                   </div>
                   <div className="flex gap-4">
                      <LegendItemSimple color="#3b82f6" label="Continue" />
                      <LegendItemSimple color="#f59e0b" label="Revise" />
                      <LegendItemSimple color="#10b981" label="Close" />
                      <LegendItemSimple color="#ef4444" label="Escalate" />
                   </div>
                </div>
                
                <div className="h-96">
                   <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendsData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="continue" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="revise" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="close" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="escalate" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                   </ResponsiveContainer>
                </div>
              </motion.div>
            )}

            {activeTab === 'DIAGNOSTICS' && <DiagnosticsPanel />}
          </AnimatePresence>
        </div>

        {/* Action Needed Preview (Alerts Recap) */}
        {execData && execData.followUpRequired > 0 && (
          <div className="mt-12 bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Perlu Tindak Lanjut Segera</h2>
                  <p className="text-sm text-slate-500 font-medium">Alerts aktif yang membutuhkan respon dari tim MTSS</p>
                </div>
                <button 
                  onClick={() => navigate('/junior-high/academic/mtss/alerts')}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-slate-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                >
                  Lihat Semua Alerts
                  <ChevronRight size={14} />
                </button>
             </div>
             
             <div className="space-y-3">
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                         <AlertTriangle size={20} />
                      </div>
                      <div>
                         <p className="text-sm font-black text-slate-900 uppercase tracking-tight">Peringatan SOP Kritikal</p>
                         <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Terdapat {execData.followUpRequired} alert yang belum terselesaikan.</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-2 px-3 py-1 bg-rose-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest">
                      Action Required
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; icon: React.ReactNode; color: string; description: string }> = ({ label, value, icon, color, description }) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 shadow-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 shadow-emerald-100',
    amber: 'bg-amber-50 text-amber-600 shadow-amber-100',
    rose: 'bg-rose-50 text-rose-600 shadow-rose-100'
  };

  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 hover:shadow-md transition-shadow group relative overflow-hidden">
      <div className={`absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform`}>
         {icon}
      </div>
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-lg ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h4 className="text-3xl font-black text-slate-900 tracking-tight">{value}</h4>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Unit</span>
      </div>
      <p className="mt-2 text-[10px] text-slate-400 font-medium leading-tight">{description}</p>
    </div>
  );
};

const LegendItem: React.FC<{ color: string; label: string; value: number }> = ({ color, label, value }) => (
  <div className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors">
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{label}</span>
    </div>
    <span className="text-[10px] font-black text-slate-900">{value}</span>
  </div>
);

const LegendItemSimple: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
  </div>
);

const ComplianceMeter: React.FC<{ label: string; current: number; total: number }> = ({ label, current, total }) => {
  const percentage = Math.round((current / (total || 1)) * 100);
  
  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{label}</p>
      <div className="flex items-center justify-center mb-4 relative">
         <div className="w-24 h-24 rounded-full border-8 border-slate-50 flex items-center justify-center">
            <p className="text-xl font-black text-slate-900">{percentage}%</p>
         </div>
         <svg className="absolute w-24 h-24 -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              fill="transparent"
              stroke={percentage > 80 ? '#10b981' : percentage > 50 ? '#f59e0b' : '#ef4444'}
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - percentage / 100)}
              strokeLinecap="round"
            />
         </svg>
      </div>
      <div className="flex items-center justify-between">
         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{current} / {total}</span>
         {percentage >= 90 && (
           <div className="text-emerald-500">
             <CheckCircle2 size={16} />
           </div>
         )}
      </div>
    </div>
  );
};

export default MTSSAcademicOverview;
