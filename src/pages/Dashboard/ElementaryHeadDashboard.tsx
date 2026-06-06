import * as React from 'react';
import { motion } from 'motion/react';
import { 
  Users, Clock, BookOpen, 
  AlertCircle, BarChart3,
  LayoutGrid, Activity, ChevronRight, ShieldCheck,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  collection, 
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function ElementaryHeadDashboard() {
  const [loading, setLoading] = React.useState(true);
  const [stats, setStats] = React.useState({
    avgAttendance: 0,
    lateRate: 0,
    literacyL4: 0,
    activeMTSS: 0
  });
  const [attendanceData, setAttendanceData] = React.useState<any[]>([]);
  const [literacyData, setLiteracyData] = React.useState<any[]>([]);
  const [studentHighlights, setStudentHighlights] = React.useState<any[]>([]);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. In a REAL app, we'd fetch from multiple collections.
        // For now, let's keep them empty unless data exists in Firestore
        // to satisfy the user's "should be empty" requirement.
        
        // Example dynamic fetching (keep it empty if no docs)
        const mtssSnap = await getDocs(query(collection(db, "juniorhigh_mtss_academic_cases"), where("status", "!=", "CLOSED")));
        
        // Initializing with zeros as requested
        setStats({
          avgAttendance: 0,
          lateRate: 0,
          literacyL4: 0,
          activeMTSS: mtssSnap.size
        });

        setAttendanceData([]);
        setLiteracyData([]);
        setStudentHighlights([]);

      } catch (error) {
        console.error("Error fetching elementary dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-full min-h-[400px] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Memuat data Dashboard SD...</p>
      </div>
    );
  }

  return (
    <div className="max-h-screen overflow-hidden flex flex-col space-y-6">
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard Kepala SD</h1>
          <p className="text-sm text-gray-500 font-medium">Monitoring Unit Lumina Elementary</p>
        </div>
        <div className="bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 flex items-center gap-2">
           <ShieldCheck className="text-emerald-600" size={18} />
           <span className="text-sm font-bold text-emerald-800">Sistem Berjalan Normal</span>
        </div>
      </header>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Rata-rata Kehadiran" value={`${stats.avgAttendance}%`} sub="Unit SD" icon={<Users className="text-blue-600" />} />
        <StatCard label="Tingkat Terlambat" value={`${stats.lateRate}%`} sub="Data harian" icon={<Clock className="text-orange-500" />} />
        <StatCard label="Literasi Mahir (L4)" value={`${stats.literacyL4} Siswa`} sub="Target capaian" icon={<BookOpen className="text-purple-600" />} />
        <StatCard label="Kasus MTSS Aktif" value={`${stats.activeMTSS} Kasus`} sub="Butuh perhatian" icon={<Activity className="text-red-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
        {/* Middle Column: Attendance per Class */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col space-y-4 overflow-hidden">
           <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 border-b border-gray-50 pb-3">
              <LayoutGrid size={16} className="text-blue-500" />
              Kehadiran per Kelas
           </h3>
           <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-3">
             {attendanceData.length > 0 ? attendanceData.map(c => (
               <div key={c.class} className="space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-gray-700">Kelas {c.class}</span>
                    <span className={cn("text-[10px] font-black", c.rate < 92 ? "text-red-500" : "text-emerald-600")}>{c.rate}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${c.rate}%` }}
                       className={cn("h-full rounded-full", c.rate < 92 ? "bg-red-500" : "bg-emerald-500")} 
                    />
                  </div>
               </div>
             )) : (
              <div className="h-40 flex items-center justify-center text-gray-400 text-xs font-medium italic border border-dashed rounded-2xl">
                Belum ada data kehadiran kelas
              </div>
             )}
           </div>
        </div>

        {/* Literacy Distribution */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col space-y-4">
           <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2 border-b border-gray-50 pb-3">
              <BarChart3 size={16} className="text-purple-500" />
              Distribusi Literasi (L4)
           </h3>
           <div className="flex-1 min-h-0">
              {literacyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={literacyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <YAxis hide />
                      <Tooltip />
                      <Bar dataKey="L4" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-xs font-medium italic border border-dashed rounded-2xl">
                  Data literasi kosong
                </div>
              )}
           </div>
        </div>

        {/* Highlights / Butuh Perhatian */}
        <div className="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col space-y-4 overflow-hidden">
           <div className="flex justify-between items-center border-b border-gray-50 pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                 <AlertCircle size={16} className="text-orange-500" />
                 Siswa Butuh Perhatian
              </h3>
              <span className="text-[10px] font-black text-gray-400">UNIT SD</span>
           </div>
           <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-2">
              {studentHighlights.length > 0 ? studentHighlights.map((s, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 hover:bg-white hover:shadow-md transition-all cursor-pointer group">
                   <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{s.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">Kelas {s.class}</p>
                      </div>
                      <ChevronRight size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                   </div>
                   <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[9px] font-black uppercase rounded">{s.issue}</span>
                      <span className="text-[9px] text-gray-500 font-medium italic truncate">{s.status}</span>
                   </div>
                </div>
              )) : (
                <div className="h-full min-h-[200px] flex items-center justify-center text-gray-400 text-xs font-medium italic border border-dashed rounded-2xl">
                  Tidak ada alert butuh perhatian
                </div>
              )}
           </div>
           <div className="pt-2">
              <button disabled className="w-full py-2 bg-gray-50 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed">
                Input Catatan Observasi
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-3">
       <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">{icon}</div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
       </div>
       <div>
          <p className="text-xl font-black text-gray-900">{value}</p>
          <p className="text-[10px] text-gray-500 font-medium">{sub}</p>
       </div>
    </div>
  );
}
