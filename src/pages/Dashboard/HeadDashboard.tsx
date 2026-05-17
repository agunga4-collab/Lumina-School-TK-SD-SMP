import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  AlertTriangle, CheckCircle, Clock, ChevronRight, 
  ShieldAlert, Activity, LayoutGrid, Timer,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MTSSAcademicCase, MTSSAcademicAlert } from '../../types';

export default function HeadDashboard() {
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
    <div className="max-h-screen overflow-hidden flex flex-col space-y-4">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard Kepala Sekolah</h1>
          <p className="text-sm text-gray-500 font-medium">Ringkasan MTSS & Perilaku Unit Junior High</p>
        </div>
        <div className="flex gap-3">
          <Link 
            to="/mtss/cases" 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-100"
          >
            Lihat Semua Kasus
            <ChevronRight size={16} />
          </Link>
        </div>
      </header>

      {/* Ringkasan MTSS Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kasus per Tier</p>
            <div className="flex gap-3 mt-1">
              <span className="text-sm font-bold text-green-600">T1: {stats.t1}</span>
              <span className="text-sm font-bold text-yellow-600">T2: {stats.t2}</span>
              <span className="text-sm font-bold text-red-600">T3: {stats.t3}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status Aktif</p>
            <div className="flex gap-3 mt-1">
              <span className="text-sm font-bold text-blue-600">OPEN: {stats.open}</span>
              <span className="text-sm font-bold text-orange-600">REVIEW: {stats.review}</span>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selesai Bulan Ini</p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">{stats.completedMonth} Kasus</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
        {/* Left Column: Trend & Snapshot */}
        <div className="space-y-4 overflow-hidden flex flex-col">
          {/* Trend Chart */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-1 flex flex-col min-h-0">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-4">
              <Activity size={16} className="text-blue-500" />
              Tren Kasus Per Minggu
            </h3>
            <div className="flex-1 min-h-0">
              {trendData.some(d => d.kasus > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{ borderRadius: '8px', border: 'none', borderBottom: '1px solid #f3f4f6' }} />
                    <Bar dataKey="kasus" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-xs font-medium">
                  Belum ada data tren kasus mingguan
                </div>
              )}
            </div>
          </div>

          {/* Snapshot Kelas */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 max-h-[160px] overflow-y-auto">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 mb-3">
              <LayoutGrid size={16} className="text-purple-500" />
              Snapshot Kasus Per Kelas
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {classSnapshot.length > 0 ? classSnapshot.map(c => (
                <div key={c.class} className="bg-gray-50 p-2 rounded-xl text-center border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400">{c.class}</p>
                  <p className="text-sm font-bold text-gray-800">{c.cases}</p>
                </div>
              )) : (
                <div className="col-span-5 text-center py-4 text-gray-400 text-xs italic font-medium">
                  Tidak ada kasus aktif di kelas manapun
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Highlights Overdue */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <Timer size={16} className="text-red-500" />
              Highlight: Belum Selesai {'>'} 2 Minggu
            </h3>
            {overdueHighlights.length > 0 && (
              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full uppercase">Urgent</span>
            )}
          </div>
          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {overdueHighlights.length > 0 ? overdueHighlights.map((h, idx) => (
              <motion.div 
                key={h.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2 group hover:bg-white hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{h.name}</p>
                    <p className="text-[10px] text-gray-400 font-medium">Oleh: {h.reporter}</p>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-black uppercase",
                    h.tier === 'Tier 3' ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                  )}>
                    {h.tier}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-red-600 pt-1">
                  <Clock size={12} />
                  <span className="text-[11px] font-bold">Terbuka selama {h.duration}</span>
                </div>
                <Link 
                  to={`/mtss/cases/${h.id}`}
                  className="block w-full mt-2 py-1.5 text-center text-[10px] font-bold text-blue-600 bg-white border border-blue-50 rounded-lg hover:bg-blue-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                >
                  Lihat Detail Kasus
                </Link>
              </motion.div>
            )) : (
              <div className="h-40 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-gray-400 text-[10px] font-medium italic">
                Semua kasus berjalan sesuai timeline
              </div>
            )}
          </div>
          
          {alerts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-50">
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-center gap-3 bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <AlertTriangle size={16} className="text-blue-600 shrink-0" />
                    <p className="text-[10px] text-blue-800 leading-tight">
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
  );
}
