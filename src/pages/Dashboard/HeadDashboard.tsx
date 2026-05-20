import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  AlertTriangle, CheckCircle, Clock, ChevronRight, 
  ShieldAlert, Activity, LayoutGrid, Timer,
  Loader2, BarChart3, Users
} from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MTSSAcademicCase, MTSSAcademicAlert, UnitType } from '../../types';
import AttendanceAnalysis from './AttendanceAnalysis';

export default function HeadDashboard() {
  const { activeUnit } = useOutletContext<{ activeUnit: UnitType }>();
  const [activeTab, setActiveTab] = React.useState<'MTSS' | 'ATTENDANCE'>('MTSS');
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    t1: 0, t2: 0, t3: 0,
    open: 0, review: 0,
    completedMonth: 0
  });
  const [trendData, setTrendData] = React.useState<any[]>([]);
  const [classSnapshot, setClassSnapshot] = React.useState<any[]>([]);
  const [overdueHighlights, setOverdueHighlights] = React.useState<any[]>([]);
  const [alerts, setAlerts] = React.useState<MTSSAcademicAlert[]>([]);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const CASES_COLLECTION = 'mtssAcademicCases';
        const ALERTS_COLLECTION = 'mtssAcademicAlerts';
        
        // 1. Fetch All Cases for summary
        const allCasesSnap = await getDocs(collection(db, CASES_COLLECTION));
        const allCases = allCasesSnap.docs.map(d => d.data() as MTSSAcademicCase);
        
        // 2. Summary counts
        const activeCases = allCases.filter(c => c.status !== 'CLOSED');
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        
        setStats({
          t1: allCases.filter(c => c.currentTier === 'Tier 1').length,
          t2: allCases.filter(c => c.currentTier === 'Tier 2').length,
          t3: allCases.filter(c => c.currentTier === 'Tier 3').length,
          open: activeCases.filter(c => c.status === 'ACTIVE').length,
          review: activeCases.filter(c => c.status === 'UNDER_REVIEW' || c.status === 'SCREENING').length,
          completedMonth: allCases.filter(c => c.status === 'CLOSED' && (c.updatedAt || 0) >= startOfMonth).length
        });

        // 3. Class Snapshot logic
        const classCount: Record<string, number> = {};
        activeCases.forEach(c => {
          if (c.className) {
            classCount[c.className] = (classCount[c.className] || 0) + 1;
          }
        });
        const snapshot = Object.entries(classCount)
          .map(([className, count]) => ({ class: className, cases: count }))
          .sort((a, b) => b.cases - a.cases)
          .slice(0, 5);
        setClassSnapshot(snapshot);

        // 4. Overdue Highlights (> 14 days)
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const overdue = activeCases
          .filter(c => (c.createdAt || 0) < twoWeeksAgo)
          .map(c => ({
            id: c.id,
            name: c.studentName || 'Siswa',
            tier: c.currentTier,
            duration: `${Math.floor((Date.now() - (c.createdAt || 0)) / (24 * 60 * 60 * 1000))} hari`,
            reporter: c.createdBy?.split('@')[0] || 'Guru'
          }))
          .slice(0, 5);
        setOverdueHighlights(overdue);

        // 5. Trend data (last 4 weeks)
        const weeks: any[] = [];
        for (let i = 3; i >= 0; i--) {
          const wStart = Date.now() - ((i + 1) * 7 * 24 * 60 * 60 * 1000);
          const wEnd = Date.now() - (i * 7 * 24 * 60 * 60 * 1000);
          const count = allCases.filter(c => (c.createdAt || 0) >= wStart && (c.createdAt || 0) < wEnd).length;
          weeks.push({ name: `Mgu ${4-i}`, kasus: count });
        }
        setTrendData(weeks);

        // 6. Active Alerts
        const alertsSnap = await getDocs(
          query(collection(db, ALERTS_COLLECTION), where('status', '==', 'OPEN'), limit(3))
        );
        setAlerts(alertsSnap.docs.map(d => ({ id: d.id, ...d.data() } as MTSSAcademicAlert)));

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-full min-h-[400px] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Memuat data MTSS...</p>
      </div>
    );
  }

  return (
    <div className="max-h-screen overflow-hidden flex flex-col space-y-6">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter italic uppercase">Analisis Unit</h1>
          <p className="text-sm text-gray-500 font-medium">Pusat Kendali & Insight Strategis Unit {activeUnit?.replace('_', ' ')}</p>
        </div>
        
        <div className="flex bg-gray-100 p-1.5 rounded-[1.25rem] border border-gray-200">
           <TabButton 
            active={activeTab === 'MTSS'} 
            onClick={() => setActiveTab('MTSS')} 
            label="Eskalasi Akademik" 
            icon={<ShieldAlert size={14} />} 
           />
           <TabButton 
            active={activeTab === 'ATTENDANCE'} 
            onClick={() => setActiveTab('ATTENDANCE')} 
            label="Analisis Kehadiran" 
            icon={<Clock size={14} />} 
           />
        </div>

        {activeTab === 'MTSS' && (
          <div className="flex gap-3">
            <Link 
              to="/mtss/cases" 
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-100 italic"
            >
              Semua Kasus
              <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {activeTab === 'MTSS' ? (
          <div className="space-y-6 pb-20">
            {/* Ringkasan MTSS Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 shadow-inner">
                  <ShieldAlert size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Kasus per Tier</p>
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-emerald-600 leading-none">T1: {stats.t1}</span>
                    </div>
                    <div className="flex flex-col border-l border-gray-100 pl-4">
                      <span className="text-sm font-black text-yellow-600 leading-none">T2: {stats.t2}</span>
                    </div>
                    <div className="flex flex-col border-l border-gray-100 pl-4">
                      <span className="text-sm font-black text-red-600 leading-none">T3: {stats.t3}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner">
                  <Activity size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status Aktif</p>
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-black text-blue-600 leading-none">OPEN: {stats.open}</span>
                    </div>
                    <div className="flex flex-col border-l border-gray-100 pl-4">
                      <span className="text-sm font-black text-orange-600 leading-none">REVIEW: {stats.review}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-5 hover:shadow-md transition-shadow">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shadow-inner">
                  <CheckCircle size={28} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Selesai Bulan Ini</p>
                  <p className="text-2xl font-black text-gray-900 tracking-tight leading-none italic">{stats.completedMonth} <span className="text-xs text-gray-400 uppercase font-bold not-italic">Kasus</span></p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* Left Column: Trend & Snapshot */}
              <div className="space-y-6 flex flex-col">
                {/* Trend Chart */}
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 flex-1 flex flex-col min-h-[300px]">
                  <h3 className="font-black italic uppercase tracking-tighter text-blue-600 text-lg flex items-center gap-2 mb-6">
                    <Activity size={20} />
                    Tren Kasus Per Minggu
                  </h3>
                  <div className="flex-1 min-h-0">
                    {trendData.some(d => d.kasus > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 'bold' }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 'bold' }} />
                          <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                          <Bar dataKey="kasus" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs font-bold gap-3">
                        <Activity size={32} className="opacity-20" />
                        Belum ada data tren kasus mingguan
                      </div>
                    )}
                  </div>
                </div>

                {/* Snapshot Kelas */}
                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="font-black italic uppercase tracking-tighter text-purple-600 text-lg flex items-center gap-2 mb-6">
                    <LayoutGrid size={20} />
                    Snapshot Kasus Per Kelas
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {classSnapshot.length > 0 ? classSnapshot.map(c => (
                      <div key={c.class} className="bg-gray-50/50 p-4 rounded-2xl text-center border border-gray-50 group hover:border-purple-200 hover:bg-white transition-all">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{c.class}</p>
                        <p className="text-xl font-black text-gray-800">{c.cases}</p>
                      </div>
                    )) : (
                      <div className="col-span-5 text-center py-6 text-gray-400 text-xs italic font-bold uppercase tracking-widest opacity-50">
                        Tidak ada kasus aktif di kelas manapun
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Highlights Overdue */}
              <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black italic uppercase tracking-tighter text-red-600 text-lg flex items-center gap-2">
                    <Timer size={20} />
                    Highlight: Belum Selesai {'>'} 2 Minggu
                  </h3>
                  {overdueHighlights.length > 0 && (
                    <span className="px-3 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-full uppercase tracking-widest animate-pulse">Urgent</span>
                  )}
                </div>
                <div className="space-y-4 flex-1">
                  {overdueHighlights.length > 0 ? overdueHighlights.map((h, idx) => (
                    <motion.div 
                      key={h.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="p-5 rounded-3xl bg-gray-50/50 border border-transparent space-y-3 group hover:bg-white hover:shadow-xl hover:border-red-100 transition-all cursor-pointer overflow-hidden relative"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-black text-gray-900 text-base italic tracking-tight">{h.name}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Oleh: {h.reporter}</p>
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest",
                          h.tier === 'Tier 3' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                        )}>
                          {h.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-red-600">
                        <Clock size={14} />
                        <span className="text-xs font-black uppercase italic">Terbuka selama {h.duration}</span>
                      </div>
                      <Link 
                        to={`/mtss/cases/${h.id}`}
                        className="block w-full py-2 bg-[#002366] text-white rounded-xl text-center text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0"
                      >
                        Buka Detail Kasus
                      </Link>
                    </motion.div>
                  )) : (
                    <div className="h-60 bg-gray-50/30 rounded-[2.5rem] border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 text-[10px] font-bold uppercase tracking-widest gap-4">
                      <CheckCircle size={40} className="opacity-10" />
                      Semua kasus berjalan sesuai timeline
                    </div>
                  )}
                </div>
                
                {alerts.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-50">
                    <div className="space-y-3">
                      {alerts.map(alert => (
                        <div key={alert.id} className="flex items-center gap-4 bg-blue-50/50 p-4 rounded-2xl border border-blue-50 group hover:bg-blue-50 transition-colors">
                          <div className="p-2 bg-white rounded-xl text-blue-600 shadow-sm shrink-0">
                            <AlertTriangle size={18} />
                          </div>
                          <p className="text-[11px] text-blue-900 font-bold leading-normal">
                            {alert.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <AttendanceAnalysis unitId={activeUnit} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-[1rem] text-xs font-black transition-all uppercase tracking-widest",
        active 
          ? "bg-white text-[#002366] shadow-sm italic" 
          : "text-gray-400 hover:text-gray-600 hover:bg-white/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
