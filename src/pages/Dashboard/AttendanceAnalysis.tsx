import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import { 
  Calendar, Users, Clock, AlertTriangle, CheckCircle2, TrendingUp, 
  ChevronRight, Filter, Search, Loader2, UserX, Info, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  collection, query, where, getDocs, orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AttendanceStatus, AttendanceRecord, Class, UnitType } from '../../types';
import { cn } from '../../lib/utils';
import { useAcademicYear } from '../../context/AcademicYearContext';

interface AttendanceAnalysisProps {
  unitId: UnitType;
}

export default function AttendanceAnalysis({ unitId }: AttendanceAnalysisProps) {
  const { activeYear } = useAcademicYear();
  const [viewMode, setViewMode] = React.useState<'RANGE' | 'MONTHLY'>('RANGE');
  const [loading, setLoading] = React.useState(true);
  const [selectedMonth, setSelectedMonth] = React.useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = React.useState(new Date().getFullYear());
  
  const [filters, setFilters] = React.useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    classId: 'ALL',
    level: 'ALL'
  });

  // Effect to update date filters when month/year changes in monthly mode
  React.useEffect(() => {
    if (viewMode === 'MONTHLY') {
      const firstDay = new Date(selectedYear, selectedMonth, 1);
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0);
      
      // Adjust to local ISO date string
      const startStr = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      const endStr = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
      
      setFilters(prev => ({
        ...prev,
        startDate: startStr,
        endDate: endStr
      }));
    }
  }, [viewMode, selectedMonth, selectedYear]);

  const [classes, setClasses] = React.useState<Class[]>([]);
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [kpis, setKpis] = React.useState({
    attendanceRate: 0,
    punctualityRate: 0,
    absentToday: 0,
    lateToday: 0,
    highRiskCount: 0,
    deltaRate: 5 // mock delta
  });

  const [trendData, setTrendData] = React.useState<any[]>([]);
  const [classRankings, setClassRankings] = React.useState<any[]>([]);
  const [highRiskStudents, setHighRiskStudents] = React.useState<any[]>([]);

  // Fetch initial classes
  React.useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(collection(db, 'classes'), where('unitId', '==', unitId));
        const snap = await getDocs(q);
        const filtered = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Class))
          .filter(c => c.academicYear === activeYear && c.status !== 'archived');
        setClasses(filtered);
      } catch (err) {
        console.error("Error fetching classes:", err);
      }
    };
    fetchClasses();
  }, [unitId, activeYear]);

  // Fetch and Process Data
  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let q = query(
          collection(db, 'attendance_records'),
          where('date', '>=', filters.startDate),
          where('date', '<=', filters.endDate)
        );

        const snap = await getDocs(q);
        let allRecords = snap.docs.map(d => d.data() as AttendanceRecord);

        // Filter by Class if not ALL
        // We need to know which class belongs to which unit if they aren't filtered in query
        const unitClassIds = classes.map(c => c.id);
        allRecords = allRecords.filter(r => unitClassIds.includes(r.classId));

        if (filters.classId !== 'ALL') {
          allRecords = allRecords.filter(r => r.classId === filters.classId);
        }

        // Process KPIs
        const total = allRecords.length;
        const presentCount = allRecords.filter(r => r.status === 'HADIR' || r.status === 'LATE').length;
        const puntualCount = allRecords.filter(r => r.status === 'HADIR').length;
        const lateCount = allRecords.filter(r => r.status === 'LATE').length;
        const today = new Date().toISOString().split('T')[0];
        const absentTodayCount = allRecords.filter(r => r.date === today && (r.status === 'ALPA' || r.status === 'SAKIT' || r.status === 'IZIN')).length;
        const lateTodayCount = allRecords.filter(r => r.date === today && r.status === 'LATE').length;

        setKpis({
          attendanceRate: total > 0 ? Math.round((presentCount / total) * 100) : 0,
          punctualityRate: presentCount > 0 ? Math.round((puntualCount / presentCount) * 100) : 0,
          absentToday: absentTodayCount,
          lateToday: lateTodayCount,
          highRiskCount: calculateHighRiskCount(allRecords),
          deltaRate: 2.5
        });

        // Process Trend Data (Group by Day)
        const dayMap: Record<string, { date: string, present: number, total: number }> = {};
        allRecords.forEach(r => {
          if (!dayMap[r.date]) dayMap[r.date] = { date: r.date, present: 0, total: 0 };
          dayMap[r.date].total++;
          if (r.status === 'HADIR' || r.status === 'LATE') dayMap[r.date].present++;
        });
        const trend = Object.values(dayMap)
          .sort((a,b) => a.date.localeCompare(b.date))
          .map(d => ({
            name: new Date(d.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
            rate: Math.round((d.present / d.total) * 100)
          }));
        setTrendData(trend);

        // Process Class Rankings
        const classMap: Record<string, { name: string, present: number, total: number }> = {};
        allRecords.forEach(r => {
          const className = classes.find(c => c.id === r.classId)?.name || r.classId;
          if (!classMap[r.classId]) classMap[r.classId] = { name: className, present: 0, total: 0 };
          classMap[r.classId].total++;
          if (r.status === 'HADIR' || r.status === 'LATE') classMap[r.classId].present++;
        });
        const rankings = Object.values(classMap)
          .map(c => ({
            name: c.name,
            rate: Math.round((c.present / c.total) * 100),
            total: c.total
          }))
          .sort((a,b) => b.rate - a.rate);
        setClassRankings(rankings);

        // Process High Risk Students
        const studentMap: Record<string, { id: string, name: string, classId: string, absent: number, total: number, consecutive: number, lastStatus: string }> = {};
        // First sort by date to calculate consecutive
        const sortedRecords = [...allRecords].sort((a, b) => a.date.localeCompare(b.date));
        
        sortedRecords.forEach(r => {
          if (!studentMap[r.studentId]) {
            studentMap[r.studentId] = { 
              id: r.studentId, 
              name: r.studentName, 
              classId: r.classId, 
              absent: 0, 
              total: 0, 
              consecutive: 0, 
              lastStatus: '' 
            };
          }
          studentMap[r.studentId].total++;
          if (r.status === 'ALPA' || r.status === 'SAKIT' || r.status === 'IZIN') {
            studentMap[r.studentId].absent++;
            if (studentMap[r.studentId].lastStatus === 'ABSENT') {
               studentMap[r.studentId].consecutive++;
            } else {
               studentMap[r.studentId].consecutive = 1;
            }
            studentMap[r.studentId].lastStatus = 'ABSENT';
          } else {
            studentMap[r.studentId].consecutive = 0;
            studentMap[r.studentId].lastStatus = 'PRESENT';
          }
        });

        const watchlist = Object.values(studentMap)
          .map(s => ({
            ...s,
            className: classes.find(c => c.id === s.classId)?.name || s.classId,
            rate: Math.round(((s.total - s.absent) / s.total) * 100)
          }))
          .filter(s => s.rate < 90 || s.consecutive >= 3 || s.absent >= 5)
          .sort((a, b) => a.rate - b.rate)
          .slice(0, 10);
        setHighRiskStudents(watchlist);

      } catch (err) {
        console.error("Error fetching analysis data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters, classes, unitId]);

  const calculateHighRiskCount = (allRecords: AttendanceRecord[]) => {
    const studentAbsences: Record<string, number> = {};
    const studentTotal: Record<string, number> = {};
    allRecords.forEach(r => {
      if (!studentAbsences[r.studentId]) studentAbsences[r.studentId] = 0;
      if (!studentTotal[r.studentId]) studentTotal[r.studentId] = 0;
      studentTotal[r.studentId]++;
      if (r.status === 'ALPA') studentAbsences[r.studentId]++;
    });
    return Object.keys(studentAbsences).filter(id => (studentAbsences[id] / studentTotal[id]) > 0.1 || studentAbsences[id] >= 3).length;
  };

  if (loading && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Menganalisis Data Kehadiran...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Filter Section */}
      <section className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
        {/* View Mode Toggle */}
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
           <button 
             onClick={() => setViewMode('RANGE')}
             className={cn(
               "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
               viewMode === 'RANGE' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
             )}
           >
             Rentang Tanggal
           </button>
           <button 
             onClick={() => setViewMode('MONTHLY')}
             className={cn(
               "px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
               viewMode === 'MONTHLY' ? "bg-white text-blue-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
             )}
           >
             Analisis Bulanan
           </button>
        </div>

        {viewMode === 'RANGE' ? (
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
            <Calendar size={16} className="text-gray-400" />
            <input 
              type="date" 
              value={filters.startDate}
              onChange={e => setFilters({...filters, startDate: e.target.value})}
              className="bg-transparent border-none outline-none text-xs font-bold text-gray-700" 
            />
            <span className="text-gray-300 text-xs">s/d</span>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={e => setFilters({...filters, endDate: e.target.value})}
              className="bg-transparent border-none outline-none text-xs font-bold text-gray-700" 
            />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
              <Calendar size={16} className="text-gray-400" />
              <select 
                value={selectedMonth}
                onChange={e => setSelectedMonth(parseInt(e.target.value))}
                className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 cursor-pointer"
              >
                {['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'].map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
              <select 
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value))}
                className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 cursor-pointer"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
          <Users size={16} className="text-gray-400" />
          <select 
            value={filters.classId}
            onChange={e => setFilters({...filters, classId: e.target.value})}
            className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 cursor-pointer"
          >
            <option value="ALL">Semua Kelas</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <button 
          onClick={() => {/* Potentially refresh or export */}}
          className="ml-auto flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 transition-all"
        >
          <TrendingUp size={14} />
          Generate Insight
        </button>
      </section>

      {/* KPI Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          title="Attendance Rate" 
          value={`${kpis.attendanceRate}%`} 
          subtitle="Target: 95%"
          icon={<CheckCircle2 className="text-emerald-500" />}
          trend={kpis.deltaRate}
        />
        <KPICard 
          title="Punctuality" 
          value={`${kpis.punctualityRate}%`} 
          subtitle="Tepat Waktu"
          icon={<Clock className="text-blue-500" />}
        />
        <KPICard 
          title="Absen Hari Ini" 
          value={kpis.absentToday.toString()} 
          subtitle="Siswa"
          icon={<UserX className="text-red-500" />}
          color="bg-red-50"
        />
        <KPICard 
          title="Terlambat Hari Ini" 
          value={kpis.lateToday.toString()} 
          subtitle="Siswa"
          icon={<Clock className="text-orange-500" />}
          color="bg-orange-50"
        />
        <KPICard 
          title="Siswa High Risk" 
          value={kpis.highRiskCount.toString()} 
          subtitle="Butuh Perhatian"
          icon={<AlertTriangle className="text-red-600" />}
          color="bg-red-100"
          isUrgent
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Analysis */}
        <div className="lg:col-span-2 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-black italic uppercase tracking-tighter text-blue-600 flex items-center gap-2">
              <TrendingUp size={18} />
              Tren Kehadiran Unit
            </h3>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full">
              Harian • {filters.startDate} - {filters.endDate}
            </div>
          </div>
          <div className="h-[240px] w-full">
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 600}} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fontSize: 10, fill: '#9ca3af', fontWeight: 600}}
                    domain={[0, 100]}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="rate" 
                    stroke="#2563eb" 
                    strokeWidth={3} 
                    dot={{fill: '#2563eb', strokeWidth: 2, r: 4}}
                    activeDot={{r: 6, fill: '#1e40af'}} 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 font-medium italic text-xs">
                Tidak ada data tren untuk periode ini
              </div>
            )}
          </div>
        </div>

        {/* Class Ranking */}
        <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
           <h3 className="font-black italic uppercase tracking-tighter text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-purple-500" />
              Ranking Kehadiran Kelas
           </h3>
           <div className="space-y-3">
              {classRankings.map((c, i) => (
                <div key={c.name} className="flex flex-col gap-1.5">
                   <div className="flex justify-between items-center px-1">
                      <span className="text-xs font-bold text-gray-700">{c.name}</span>
                      <span className={cn(
                        "text-xs font-black",
                        c.rate >= 95 ? "text-emerald-600" : c.rate >= 90 ? "text-blue-600" : "text-red-500"
                      )}>{c.rate}%</span>
                   </div>
                   <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${c.rate}%` }}
                        className={cn(
                          "h-full rounded-full transition-all duration-1000",
                          c.rate >= 95 ? "bg-emerald-500" : c.rate >= 90 ? "bg-blue-500" : "bg-red-500"
                        )}
                      />
                   </div>
                </div>
              ))}
              {classRankings.length === 0 && (
                <div className="py-12 text-center text-gray-400 text-xs italic">Belum ada data kelas</div>
              )}
           </div>
        </div>
      </div>

      {/* Student Highlights / Watchlist */}
      <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
         <div className="flex justify-between items-end">
            <div>
               <h3 className="text-2xl font-black text-gray-900 tracking-tighter italic uppercase underline decoration-red-500 decoration-4">Siswa Butuh Perhatian</h3>
               <p className="text-sm text-gray-500 font-medium mt-1">Status Kehadiran & Pola Absensi yang Perlu Tindak Lanjut</p>
            </div>
            <div className="flex items-center gap-3">
               <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full uppercase tracking-widest border border-gray-100">
                  <Info size={12} />
                  Kriteria: Rate {'<'} 90% | Alpa {'>'} 5 Hari
               </div>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left">
               <thead>
                  <tr className="border-b border-gray-100">
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Siswa & Kelas</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Attendance %</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Absen (Alpa/Sakit)</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Berurutan</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Alasan Highlight</th>
                     <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Aksi</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-gray-50">
                  {highRiskStudents.map((s, i) => (
                    <tr key={s.id} className="group hover:bg-red-50/30 transition-all">
                       <td className="py-4">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center font-black italic shadow-sm group-hover:scale-110 transition-transform">
                                {s.name[0]}
                             </div>
                             <div>
                                <p className="text-sm font-bold text-gray-900 leading-tight">{s.name}</p>
                                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{s.className}</p>
                             </div>
                          </div>
                       </td>
                       <td className="py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-xs font-black",
                            s.rate < 85 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                          )}>{s.rate}%</span>
                       </td>
                       <td className="py-4 font-bold text-gray-600 text-sm">
                          {s.absent} Hari
                       </td>
                       <td className="py-4">
                          {s.consecutive >= 3 ? (
                            <span className="text-xs font-black text-red-600 animate-pulse">{s.consecutive} Hari</span>
                          ) : (
                            <span className="text-xs font-medium text-gray-400">{s.consecutive} Hari</span>
                          )}
                       </td>
                       <td className="py-4">
                          <div className="flex flex-wrap gap-1">
                             {s.rate < 90 && <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[9px] font-bold rounded-md border border-red-100 uppercase tracking-tighter">Low Rate</span>}
                             {s.consecutive >= 3 && <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[9px] font-bold rounded-md border border-orange-100 uppercase tracking-tighter">Consecutive</span>}
                             {s.absent >= 5 && <span className="px-2 py-0.5 bg-purple-50 text-purple-600 text-[9px] font-bold rounded-md border border-purple-100 uppercase tracking-tighter">Chronic Absence</span>}
                          </div>
                       </td>
                       <td className="py-4 text-right">
                          <button className="p-2 text-gray-300 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                             <ChevronRight size={20} />
                          </button>
                       </td>
                    </tr>
                  ))}
                  {highRiskStudents.length === 0 && (
                    <tr>
                       <td colSpan={6} className="py-12 text-center text-gray-400 text-sm italic font-medium">
                          Semua siswa terpantau memiliki kehadiran yang baik ( {'>'} 90% )
                       </td>
                    </tr>
                  )}
               </tbody>
            </table>
         </div>
      </section>
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, trend, color, isUrgent }: any) {
  return (
    <div className={cn(
      "p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all",
      color || "bg-white",
      isUrgent && "border-red-200"
    )}>
      {isUrgent && (
        <div className="absolute top-0 right-0 p-2">
           <div className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
        </div>
      )}
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
           {icon}
        </div>
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-lg",
            trend > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          )}>
            {trend > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{title}</p>
        <h4 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-1">{value}</h4>
        <p className="text-[10px] font-bold text-gray-500 italic opacity-80">{subtitle}</p>
      </div>
    </div>
  );
}
