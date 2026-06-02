import * as React from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend as RechartsLegend
} from 'recharts';
import { 
  Users, Heart, Palette, Star, AlertCircle, 
  Calendar, Bell, TrendingUp, Activity, Sparkles, 
  Smile, Frown, Meh, Angry, BarChart3
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { DEFAULT_STUDENTS } from '../../lib/kindergartenWeeklyReport';

export default function KindergartenHeadDashboard() {
  const stats = React.useMemo(() => {
    // 1. Fetch checklists
    const savedChecklist = localStorage.getItem('kg_checklist_records');
    let totalChecklistSlots = 0;
    let presentCount = 0;
    let happyCount = 0;
    let okCount = 0;
    let sadCount = 0;
    let angryCount = 0;

    const alertMap: Record<string, { studentId: string; name: string; reasons: string[]; lastSeen: string }> = {};

    if (savedChecklist) {
      try {
        const records = JSON.parse(savedChecklist);
        
        // Sort keys descending to get most recent records for alerts
        const sortedDates = Object.keys(records).sort((a,b) => b.localeCompare(a));
        const latestDates = sortedDates.slice(0, 5); // check last 5 active checklist days
        
        Object.entries(records).forEach(([dateStr, studentMap]: [string, any]) => {
          Object.entries(studentMap).forEach(([studentId, status]: [string, any]) => {
            const student = DEFAULT_STUDENTS.find(s => s.id === studentId);
            if (!student) return;

            totalChecklistSlots++;
            if (status.attendance === 'PRESENT') {
              presentCount++;
              if (status.emotion === 'HAPPY') {
                happyCount++;
              } else if (status.emotion === 'OK') {
                okCount++;
              } else if (status.emotion === 'SAD') {
                sadCount++;
                if (latestDates.includes(dateStr)) {
                  if (!alertMap[studentId]) {
                    alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
                  }
                  alertMap[studentId].reasons.push(`Kurang bersemangat (Sedih) pada ${dateStr}`);
                }
              } else if (status.emotion === 'ANGRY') {
                angryCount++;
                if (latestDates.includes(dateStr)) {
                  if (!alertMap[studentId]) {
                    alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
                  }
                  alertMap[studentId].reasons.push(`Tampak marah / kesal pada ${dateStr}`);
                }
              }
            } else if (status.attendance && ['SICK', 'PERMISSION', 'NO_NEWS'].includes(status.attendance)) {
              if (latestDates.includes(dateStr)) {
                if (!alertMap[studentId]) {
                  alertMap[studentId] = { studentId, name: student.name, reasons: [], lastSeen: dateStr };
                }
                const statusLabel = status.attendance === 'SICK' ? 'Sakit' : status.attendance === 'PERMISSION' ? 'Izin' : 'Tanpa Kabar';
                alertMap[studentId].reasons.push(`Absen (${statusLabel}) pada ${dateStr}`);
              }
            }
          });
        });
      } catch (e) {
        console.error(e);
      }
    }

    const attendanceRate = totalChecklistSlots > 0 ? Math.round((presentCount / totalChecklistSlots) * 100) : 0;
    const totalPresentWithEmotions = happyCount + okCount + sadCount + angryCount;
    const happinessIndex = totalPresentWithEmotions > 0 ? Math.round(((happyCount + okCount) / totalPresentWithEmotions) * 100) : 0;

    // 2. Fetch observations
    let totalGradingsCount = 0;
    let bshOrBsbCount = 0;
    let totalSentraSessions = 0;
    
    const domainSummary: Record<string, { total: number; bshBsb: number }> = {
      AGAMA_BUDI_PEKERTI: { total: 0, bshBsb: 0 },
      SOSIAL_EMOSIONAL: { total: 0, bshBsb: 0 },
      BAHASA: { total: 0, bshBsb: 0 },
      KOGNITIF: { total: 0, bshBsb: 0 },
      FISIK_MOTORIK: { total: 0, bshBsb: 0 },
      SENI: { total: 0, bshBsb: 0 }
    };

    const sentraCounts: Record<string, number> = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('kg_obs_hist_')) {
        try {
          const payload = JSON.parse(localStorage.getItem(key) || '{}');
          if (payload && payload.observations) {
            totalSentraSessions++;
            const domain = payload.selectedDomain || '';
            const activity = payload.selectedActivity || 'Lainnya';
            sentraCounts[activity] = (sentraCounts[activity] || 0) + 1;
            
            Object.values(payload.observations).forEach((obs: any) => {
              if (obs && obs.grading && obs.grading !== 'ABSENT' && obs.grading !== 'NOT_PARTICIPATING') {
                totalGradingsCount++;
                const isGood = obs.grading === 'BSH' || obs.grading === 'BSB';
                if (isGood) {
                  bshOrBsbCount++;
                }

                if (domainSummary[domain]) {
                  domainSummary[domain].total++;
                  if (isGood) {
                    domainSummary[domain].bshBsb++;
                  }
                }
              }
            });
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    const progressRate = totalGradingsCount > 0 ? Math.round((bshOrBsbCount / totalGradingsCount) * 100) : 0;

    // Build emotional distribution database
    const totalEmotionRecorded = happyCount + okCount + sadCount + angryCount;
    const emotionChartData = [
      { name: 'Happy', value: happyCount, percent: totalEmotionRecorded > 0 ? Math.round((happyCount / totalEmotionRecorded) * 100) : 0, color: '#10b981' }, // emerald
      { name: 'OK', value: okCount, percent: totalEmotionRecorded > 0 ? Math.round((okCount / totalEmotionRecorded) * 100) : 0, color: '#f59e0b' },    // amber
      { name: 'Sad', value: sadCount, percent: totalEmotionRecorded > 0 ? Math.round((sadCount / totalEmotionRecorded) * 100) : 0, color: '#3b82f6' },   // blue
      { name: 'Angry', value: angryCount, percent: totalEmotionRecorded > 0 ? Math.round((angryCount / totalEmotionRecorded) * 100) : 0, color: '#ef4444' } // red
    ].filter(item => item.value > 0);

    const fallbackEmotions = [
      { name: 'Happy', value: 0, percent: 0, color: '#10b981' },
      { name: 'OK', value: 0, percent: 0, color: '#f59e0b' },
      { name: 'Sad', value: 0, percent: 0, color: '#3b82f6' },
      { name: 'Angry', value: 0, percent: 0, color: '#ef4444' }
    ];

    const displayEmotionsList = totalEmotionRecorded > 0 
      ? [
          { name: 'Happy', value: happyCount, percent: Math.round((happyCount / totalEmotionRecorded) * 100) },
          { name: 'OK', value: okCount, percent: Math.round((okCount / totalEmotionRecorded) * 100) },
          { name: 'Sad', value: sadCount, percent: Math.round((sadCount / totalEmotionRecorded) * 100) },
          { name: 'Angry', value: angryCount, percent: Math.round((angryCount / totalEmotionRecorded) * 100) }
        ]
      : [
          { name: 'Happy', value: 0, percent: 0 },
          { name: 'OK', value: 0, percent: 0 },
          { name: 'Sad', value: 0, percent: 0 },
          { name: 'Angry', value: 0, percent: 0 }
        ];

    // Build domain level details
    const domainLabels: Record<string, string> = {
      AGAMA_BUDI_PEKERTI: 'Agama',
      SOSIAL_EMOSIONAL: 'SEL',
      BAHASA: 'Bahasa',
      KOGNITIF: 'Kognitif',
      FISIK_MOTORIK: 'Motorik',
      SENI: 'Seni'
    };

    const domainChartData = Object.entries(domainSummary).map(([domainId, counts]) => {
      const pct = counts.total > 0 ? Math.round((counts.bshBsb / counts.total) * 100) : 0;
      return {
        name: domainLabels[domainId] || domainId,
        progres: pct,
        total: counts.total
      };
    });

    const activeAlerts = Object.values(alertMap).map(a => ({
      ...a,
      reasons: Array.from(new Set(a.reasons))
    }));

    // Find custom top Sentra activity
    let topSentraName = 'Belum Ada';
    let topSentraCount = 0;
    Object.entries(sentraCounts).forEach(([name, count]) => {
      if (count > topSentraCount) {
        topSentraCount = count;
        topSentraName = name;
      }
    });

    return {
      attendanceRate,
      happinessIndex,
      progressRate,
      currSentraCount: totalSentraSessions,
      emotionChartData,
      domainChartData,
      alerts: activeAlerts,
      topSentraName,
      topSentraCount,
      hasChecklistData: totalChecklistSlots > 0,
      hasObservationData: totalGradingsCount > 0,
      displayEmotionsList
    };
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
           <span className="text-[10px] font-black tracking-widest uppercase text-emerald-800">Unit Lumina Kindergarten</span>
           <h1 className="text-2xl font-black text-gray-900 tracking-tight italic">Dashboard Kepala TK</h1>
           <p className="text-gray-500 font-medium tracking-tight text-xs">Akses Monitoring Statistik Kehadiran, Emosi, dan Progres Domain Real-Time</p>
        </div>
        <div className="flex bg-white p-2 rounded-2xl shadow-sm border border-gray-100 items-center">
           <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold border border-emerald-100">
              <Calendar size={14} />
              {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(new Date())}
           </div>
        </div>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <StatCard 
          label="Kehadiran Siswa" 
          value={stats.hasChecklistData ? `${stats.attendanceRate}%` : "0%"} 
          detail={stats.hasChecklistData ? "Berdasarkan checklist aktif" : "Belum diisi guru"} 
          icon={<Users className="text-blue-500" />} 
        />
        <StatCard 
          label="Indeks Bahagia" 
          value={stats.hasChecklistData ? `${stats.happinessIndex}%` : "0%"} 
          detail={stats.hasChecklistData ? "Status perasaan gembira/OK" : "Tidak ada emosi masuk"} 
          icon={<Heart className="text-rose-500" />} 
        />
        <StatCard 
          label="Progres BSH / BSB" 
          value={stats.hasObservationData ? `${stats.progressRate}%` : "0%"} 
          detail={stats.hasObservationData ? "Target tuntas tercapai" : "Belum ada observasi"} 
          icon={<Star className="text-amber-500" />} 
        />
        <StatCard 
          label="Sesi Sentra Aktif" 
          value={String(stats.currSentraCount)} 
          detail={stats.currSentraCount > 0 ? `Sentra teraktif: ${stats.topSentraName}` : "Belum ada evaluasi"} 
          icon={<Palette className="text-purple-500" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Emotional Distribution */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6 flex flex-col justify-between">
           <div className="space-y-4">
             <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4 text-xs tracking-wider uppercase">
                <Activity size={16} className="text-emerald-500" />
                Distribusi Emosi Anak
             </h3>
             {stats.hasChecklistData ? (
                <div className="h-48 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.emotionChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {stats.emotionChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value, name, props) => [`Jumlah: ${value} (${props.payload.percent}%)`, name]}
                        contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                     <span className="text-xs text-gray-400 font-bold uppercase tracking-widest text-[9px]">Indeks Bahagia</span>
                     <span className="text-xl font-black text-emerald-600">{stats.happinessIndex}%</span>
                  </div>
                </div>
             ) : (
                <div className="h-48 flex flex-col items-center justify-center border border-dashed border-gray-100 rounded-3xl">
                   <Activity className="text-gray-200 mb-2" size={36} />
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Belum Ada Pengisian Hari Ini</p>
                </div>
             )}
           </div>

           <div className="grid grid-cols-2 gap-3 pt-2">
              {stats.displayEmotionsList.map(item => (
                <div key={item.name} className={cn(
                  "flex items-center gap-2 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100",
                  !stats.hasChecklistData && "opacity-45"
                )}>
                   {getEmotionIcon(item.name)}
                   <div className="flex flex-col min-w-0">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{item.name}</span>
                      <span className="text-xs font-black text-gray-900 leading-tight">{item.percent}%</span>
                   </div>
                </div>
              ))}
           </div>
        </div>

        {/* Domain Distribution */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6 flex flex-col justify-between">
           <h3 className="font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-4 text-xs uppercase tracking-wider">
              <TrendingUp size={16} className="text-emerald-500" />
              Progres Capaian BSH/BSB per Domain (%)
           </h3>
           
           {stats.hasObservationData ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.domainChartData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      formatter={(value) => [`Tuntas BSH/BSB: ${value}%`]}
                      contentStyle={{ borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }} 
                    />
                    <Bar dataKey="progres" fill="#10b981" radius={[8, 8, 0, 0]} barSize={28}>
                      {stats.domainChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.progres > 70 ? '#10b981' : entry.progres > 40 ? '#f59e0b' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
           ) : (
              <div className="h-64 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-[2.5rem] py-12">
                 <TrendingUp className="text-gray-200 mb-2" size={48} />
                 <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Belum Ada Progres Domain</p>
                 <span className="text-[10px] text-gray-400 italic font-medium mt-1">Tambahkan evaluasi grading di menu Observation Data</span>
              </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Child Highlights (Contextual alert feed from real records) */}
        <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 space-y-6">
           <div className="flex justify-between items-center bg-amber-50 p-4 rounded-2xl border border-amber-100">
              <h3 className="font-bold text-amber-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                 <Bell size={14} />
                 Anak Butuh Perhatian Guru & Orangtua
              </h3>
              <Sparkles size={14} className="text-amber-500" />
           </div>

           <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {stats.alerts.length > 0 ? (
                stats.alerts.map((alt, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-red-50/40 p-3 rounded-xl border border-red-100/60 leading-tight">
                    <div className="p-1 rounded-lg bg-red-100 text-red-700 font-black text-[10px] mt-0.5">ALERT</div>
                    <div className="space-y-1">
                      <div className="font-extrabold text-xs text-gray-900 uppercase">{alt.name}</div>
                      <div className="text-[11px] text-gray-600 font-medium space-y-0.5">
                        {alt.reasons.map((r, i) => (
                          <div key={i} className="flex items-center gap-1.5 list-disc">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-40 flex flex-col items-center justify-center border border-dashed border-gray-150 rounded-3xl opacity-80">
                   <Smile size={32} className="text-emerald-500 mb-2" />
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Seluruh Anak Terpantau Sehat & Bahagia ✨</p>
                   <span className="text-[9px] text-gray-400 italic text-center px-4 mt-0.5">Tidak ada laporan sakit atau mood negatif akhir-akhir ini</span>
                </div>
              )}
           </div>
        </div>

        {/* Sentra Activity Highlights */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-emerald-100/40 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
           <div className="absolute top-0 right-0 p-10 opacity-10">
              <BarChart3 size={120} />
           </div>
           
           <div className="space-y-4 relative z-10 w-full">
              <h3 className="font-bold text-[10px] bg-white/20 w-fit px-3 py-1 rounded-full uppercase tracking-widest">Rekap Sentra Mingguan</h3>
              {stats.hasObservationData ? (
                <div className="space-y-2 py-4 border-l border-white/20 pl-4 border-dashed rounded-none my-2">
                   <div className="text-xl font-black">{stats.currSentraCount} Sesi Guru Terdaftar</div>
                   <p className="text-xs text-emerald-100/90 font-medium leading-relaxed">
                     Sesi terbanyak berada pada sentra <span className="font-bold text-white underline">{stats.topSentraName}</span> (dengan jumlah {stats.topSentraCount} sesi evaluasi). Kelompok bermain aktif mengobservasi tumbuh kembang anak secara multi-domain.
                   </p>
                </div>
              ) : (
                <div className="space-y-1 py-8 border border-white/10 border-dashed rounded-2xl text-center">
                   <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest">Belum Ada Sesi Pembelajaran Terbuka</p>
                </div>
              )}
           </div>

           <div className="relative z-10 pt-2">
              <div className="text-[9px] text-emerald-100 opacity-70 font-bold uppercase tracking-widest italic">
                Unit Pengawas Mutu Lumina Kindergarten
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 space-y-4 hover:shadow-md transition-shadow">
       <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-gray-50 rounded-2xl flex items-center justify-center shadow-inner border border-white">
             {icon}
          </div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">{label}</p>
       </div>
       <div>
          <p className="text-2xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
          <p className="text-[9.5px] text-gray-500 font-bold italic opacity-80 mt-1.5 truncate">{detail}</p>
       </div>
    </div>
  );
}

function getEmotionIcon(name: string) {
   switch(name) {
      case 'Happy': return <Smile size={16} className="text-[#10b981]" />;
      case 'OK': return <Meh size={16} className="text-[#f59e0b]" />;
      case 'Sad': return <Frown size={16} className="text-[#3b82f6]" />;
      case 'Angry': return <Angry size={16} className="text-[#ef4444]" />;
      default: return null;
   }
}
